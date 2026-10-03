import { performance } from "node:perf_hooks";
import { isIP } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RequestHandler } from "express";

/** All clocks are monotonic; client timestamps never replenish budgets. */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(private readonly rate: number, private readonly burst: number,
    private readonly now: () => number = () => performance.now()) {
    this.tokens = burst; this.last = now();
  }
  take(): boolean {
    const now = this.now();
    this.tokens = Math.min(this.burst, this.tokens + Math.max(0, now - this.last) * this.rate / 1000);
    this.last = Math.max(this.last, now);
    if (this.tokens < 1) return false;
    this.tokens--; return true;
  }
}

export function readMaxRooms(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.BFA_MAX_ROOMS ?? "4";
  if (!/^[1-9]\d*$/.test(raw) || Number(raw) > 64) throw new Error("BFA_MAX_ROOMS must be an integer from 1 to 64");
  return Number(raw);
}
export const MAX_ROOMS = readMaxRooms();
export const MAX_SOCKET_CONNECTIONS = MAX_ROOMS * 16;
export const MAX_MESSAGE_BYTES = 4096;
export const MAX_MATCHMAKE_BYTES = 4096;

export function readTrustLoopbackProxy(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.BFA_TRUST_LOOPBACK_PROXY ?? "0";
  if (value !== "0" && value !== "1") throw new Error("BFA_TRUST_LOOPBACK_PROXY must be 0 or 1");
  return value === "1";
}

function canonicalIp(value: string): string | undefined {
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6 || value.includes("%")) return undefined;
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  return canonical;
}

/** Only explicitly trusted loopback Nginx may supply its overwritten X-Real-IP.
 * Never use an arbitrary client-supplied forwarding chain. */
export function requestPeer(req: IncomingMessage, trustLoopback: boolean): string {
  const peer = req.socket.remoteAddress ?? "unknown";
  if (trustLoopback && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer)) {
    const raw = req.headers["x-real-ip"];
    const forwarded = typeof raw === "string" ? canonicalIp(raw) : undefined;
    if (forwarded) return forwarded;
  }
  return canonicalIp(peer) ?? peer;
}

/** Shared by HTTP and upgrade boundaries, bounded even under rotating addresses. */
export class RequestBudget {
  private readonly total: TokenBucket;
  private readonly peers = new Map<string, { bucket: TokenBucket; at: number }>();
  private nextSweep = 0;
  constructor(private readonly now: () => number = () => performance.now(), private readonly capacity = 4096,
    private readonly trustLoopbackProxy = false) {
    this.total = new TokenBucket(60, 120, now);
  }
  allow(req: IncomingMessage): boolean {
    const now = this.now();
    if (!this.total.take()) return false;
    if (now >= this.nextSweep) {
      for (const [key, peer] of this.peers) if (now - peer.at >= 60_000) this.peers.delete(key);
      this.nextSweep = now + 1000;
    }
    const key = requestPeer(req, this.trustLoopbackProxy);
    let peer = this.peers.get(key);
    if (!peer) {
      if (this.peers.size >= this.capacity) return false;
      peer = { bucket: new TokenBucket(10, 40, this.now), at: now };
      this.peers.set(key, peer);
    }
    peer.at = now;
    return peer.bucket.take();
  }
}

export function rejectOverload(res: ServerResponse): void {
  res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "1", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ code: 429, error: "Server request limit reached. Please retry later." }));
}
export function requestLimitMiddleware(budget: RequestBudget): RequestHandler {
  return (req, res, next) => { if (budget.allow(req)) next(); else rejectOverload(res); };
}

/** Body limit applies to chunked requests too, before JSON parsing/allocation. */
export function readMatchmakeBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    const finish = (error?: Error) => {
      clearTimeout(timer);
      req.removeListener("data", data); req.removeListener("end", end);
      req.removeListener("aborted", aborted); req.removeListener("error", failed);
      if (error) { chunks.length = 0; req.pause(); reject(error); }
    };
    const failed = (error: Error) => finish(error);
    const aborted = () => finish(new Error("Request aborted"));
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_MATCHMAKE_BYTES) finish(new Error("Request body too large"));
      else chunks.push(chunk);
    };
    const end = () => {
      finish();
      try {
        const body: unknown = JSON.parse(Buffer.concat(chunks).toString());
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
        resolve(body as Record<string, unknown>);
      } catch { reject(new Error("Invalid JSON object")); }
    };
    const timer = setTimeout(() => finish(new Error("Request body timeout")), 5000);
    req.on("data", data); req.once("end", end); req.once("aborted", aborted); req.once("error", failed);
  });
}
