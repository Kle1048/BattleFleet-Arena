import type { Express, Request, Response } from "express";
import express from "express";
import { AtomicJsonFile } from "./persistence/atomicJsonFile.js";
import { WriteQueue } from "./persistence/WriteQueue.js";
import { StorageError } from "./persistence/storageErrors.js";
import { requestPeer, TokenBucket } from "./loadLimits.js";

const statuses = ["new", "triaged", "planned", "in-progress", "done", "rejected"] as const;
const categories = ["bug", "performance", "balance", "idea", "other"] as const;
const priorities = ["unrated", "low", "medium", "high"] as const;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const object = (x: unknown): Record<string, unknown> => x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {};
class FeedbackInputError extends Error {}
function text(x: unknown, min: number, max: number): string {
  if (typeof x !== "string" || x.trim().length < min || x.length > max) throw new FeedbackInputError("Invalid text");
  return x.trim();
}
function choice<T extends string>(x: unknown, options: readonly T[]): T {
  if (!options.includes(x as T)) throw new FeedbackInputError("Invalid choice");
  return x as T;
}
/** Client reports are untrusted, even when sent by our UI. Never store arbitrary JSON. */
export function feedbackDiagnostics(raw: unknown) {
  if (raw == null) return null;
  const src = object(raw), result: Record<string, unknown> = {};
  const label = (v: unknown) => typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v) ? v : null;
  const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v) ? v : null;
  for (const key of ["client", "server"]) {
    const input = object(src[key]);
    result[key] = { id: label(input.id), revision: label(input.revision), sourceHash: hash(input.sourceHash),
      configHash: hash(input.configHash), dirty: typeof input.dirty === "boolean" ? input.dirty : null };
  }
  const server = result.server as Record<string, unknown>, source = object(src.server);
  server.configRevision = Number.isSafeInteger(source.configRevision) && Number(source.configRevision) >= 0 ? source.configRevision : null;
  server.botStrategy = label(source.botStrategy);
  server.botArtifactHashes = Array.isArray(source.botArtifactHashes) ? source.botArtifactHashes.slice(0,16).map(hash).filter(Boolean) : [];
  result.roomId = label(src.roomId);
  for (const key of ["fps", "pingMs"]) result[key] = typeof src[key] === "number" && Number.isFinite(src[key]) && src[key] >= 0 ? Math.min(1e6, Math.round(src[key])) : null;
  const browser = object(src.browser);
  result.browser = { userAgent: typeof browser.userAgent === "string" ? browser.userAgent.slice(0,300) : null };
  for (const key of ["width", "height", "dpr"]) (result.browser as Record<string, unknown>)[key] = typeof browser[key] === "number" && Number.isFinite(browser[key]) && browser[key] > 0 ? Math.min(1e5, browser[key]) : null;
  return result;
}
function submission(raw: unknown) {
  const value = object(raw);
  if (typeof value.id !== "string" || !uuid.test(value.id)) throw new FeedbackInputError("Invalid id");
  const parsed = { id: value.id, category: choice(value.category, categories), title: text(value.title, 5, 120),
    description: text(value.description, 10, 2000), diagnostics: feedbackDiagnostics(value.diagnostics) };
  if (Buffer.byteLength(JSON.stringify(parsed)) > 10_000) throw new FeedbackInputError("Feedback too large");
  return parsed;
}
type Entry = ReturnType<typeof submission> & { createdAt: string; updatedAt: string; revision: number;
  status: typeof statuses[number]; priority: typeof priorities[number]; note: string };
type Document = { version: 1; rows: Entry[] };

export class FeedbackStore {
  readonly queue = new WriteQueue(16);
  readonly file: AtomicJsonFile<Document>;
  private current: Document = { version: 1, rows: [] };
  constructor(file: string) {
    this.file = new AtomicJsonFile(file, {
      empty: () => ({ version: 1, rows: [] }),
      decode: raw => {
        const value = object(raw);
        if (value.version !== 1 || !Array.isArray(value.rows) || value.rows.length > 500) throw new Error("Invalid feedback store");
        const rows: Entry[] = value.rows.map(rawRow => {
          const row = object(rawRow), base = submission(row);
          if (!Number.isSafeInteger(row.revision) || Number(row.revision) < 0) throw new Error("Invalid revision");
          for (const key of ["createdAt", "updatedAt"]) if (typeof row[key] !== "string" || !Number.isFinite(Date.parse(row[key]))) throw new Error("Invalid date");
          return { ...base, revision: Number(row.revision), createdAt: row.createdAt as string, updatedAt: row.updatedAt as string,
            status: choice(row.status, statuses), priority: choice(row.priority, priorities), note: text(row.note, 0, 2000) };
        });
        if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("Duplicate feedback id");
        return { migrated: false, value: { version: 1, rows } };
      },
    }, undefined, 8 * 1024 * 1024);
  }
  async load() { this.current = await this.file.load(); }
  list(offset = 0) { return structuredClone({ total: this.current.rows.length, rows: this.current.rows.slice().reverse().slice(offset, offset + 25) }); }
  add(raw: unknown) {
    const input = submission(raw);
    return this.queue.run(async () => {
      const existing = this.current.rows.find(row => row.id === input.id);
      if (existing) {
        if (JSON.stringify(submission(existing)) !== JSON.stringify(input)) throw new StorageError("conflict", "Id already used");
        return input.id; // retry after lost acknowledgement; no private data returned
      }
      if (this.current.rows.length >= 500) throw new StorageError("capacity", "Feedback inbox full");
      const now = new Date().toISOString();
      const entry: Entry = { ...input, createdAt: now, updatedAt: now, revision: 0, status: "new", priority: "unrated", note: "" };
      const next: Document = { version: 1, rows: [...this.current.rows, entry] };
      await this.file.save(next); this.current = next;
      return input.id;
    });
  }
  update(id: string, raw: unknown, remove = false) {
    const body = object(raw);
    if (!uuid.test(id) || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) throw new FeedbackInputError("Invalid revision or id");
    const patch = remove ? null : { status: choice(body.status, statuses), priority: choice(body.priority, priorities), note: text(body.note, 0, 2000) };
    return this.queue.run(async () => {
      const entry = this.current.rows.find(row => row.id === id);
      if (!entry || entry.revision !== body.expectedRevision) throw new StorageError("conflict", "Feedback changed");
      const rows = this.current.rows.flatMap(row => row.id !== id ? [row] : patch ? [{ ...row, ...patch, revision: row.revision + 1, updatedAt: new Date().toISOString() }] : []);
      const next: Document = { version: 1, rows };
      await this.file.save(next); this.current = next;
    });
  }
}

/** Separate slow budget: 3 immediate reports/address, then one/minute; 30 globally/minute. */
export class FeedbackBudget {
  private peers = new Map<string, { bucket: TokenBucket; at: number }>();
  private total: TokenBucket;
  constructor(private trustProxy = false, private now = () => performance.now()) { this.total = new TokenBucket(.5, 10, now); }
  allow(req: Request) {
    const time = this.now();
    for (const [key, peer] of this.peers) if (time - peer.at > 300_000) this.peers.delete(key);
    if (!this.total.take()) return false;
    const key = requestPeer(req, this.trustProxy);
    let peer = this.peers.get(key);
    if (!peer) {
      if (this.peers.size >= 4096) return false;
      peer = { bucket: new TokenBucket(1/60, 3, this.now), at: time }; this.peers.set(key, peer);
    }
    peer.at = time; return peer.bucket.take();
  }
}
function route(action: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    void action(req, res).catch(error => {
      const code = error instanceof StorageError ? error.code : error instanceof FeedbackInputError ? "invalid" : "unavailable";
      res.status(code === "conflict" ? 409 : code === "invalid" ? 400 : 503).json({ error: code === "invalid" ? "Invalid feedback fields." : "Feedback unavailable or changed. Reload or retry later." });
    });
  };
}
/** Register after public origin/request guards, before the general 4KB parser. */
export function registerPublicFeedback(app: Express, store: FeedbackStore, budget: FeedbackBudget) {
  app.post("/api/feedback", (req, res, next) => {
    if (!budget.allow(req)) { res.setHeader("Retry-After", "60"); res.status(429).json({ error: "Please wait before sending more feedback." }); return; }
    if (!req.is("application/json")) { res.status(415).json({ error: "JSON required" }); return; }
    next();
  }, express.json({ limit: "12kb" }), route(async (req, res) => {
    const id = await store.add(req.body); res.status(201).json({ id });
  }));
}
/** Register only after the existing admin namespace guard. */
export function registerAdminFeedback(app: Express, store: FeedbackStore) {
  app.get("/api/admin/feedback", (req, res) => {
    const offset = Number(req.query.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 500) { res.status(400).json({ error: "Invalid offset" }); return; }
    res.json(store.list(offset));
  });
  app.patch("/api/admin/feedback/:id", route(async (req, res) => { await store.update(String(req.params.id), req.body); res.json({ ok: true }); }));
  app.delete("/api/admin/feedback/:id", route(async (req, res) => { await store.update(String(req.params.id), req.body, true); res.json({ ok: true }); }));
}
