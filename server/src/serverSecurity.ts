import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RequestHandler } from "express";
import cors from "cors";
import { Server, type ServerOptions } from "@colyseus/core";

export function createAdminGuard(rawToken: string | undefined): RequestHandler {
  const token = rawToken?.trim();
  if (token && !/^[\x21-\x7e]{32,256}$/.test(token)) {
    throw new Error("BFA_ADMIN_TOKEN must contain 32–256 printable ASCII characters without spaces.");
  }
  const expected = token ? createHash("sha256").update(token).digest() : null;
  return (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!expected) {
      res.status(503).json({ error: "Admin access is disabled: configure BFA_ADMIN_TOKEN." });
      return;
    }
    // A proxy's socket/forwarding headers are never authentication credentials.
    const origin = req.get("origin");
    const host = req.get("host");
    if (origin && origin !== `http://${host}` && origin !== `https://${host}`) {
      res.status(403).json({ error: "Cross-origin admin access is not allowed." });
      return;
    }
    const authorization = req.get("authorization");
    // Do not fall back to a second credential when Authorization is malformed.
    const supplied = authorization !== undefined
      ? /^Bearer ([\x21-\x7e]{32,256})$/i.exec(authorization)?.[1]
      : req.get("x-admin-token");
    const actual = createHash("sha256").update(supplied ?? "").digest();
    if (!timingSafeEqual(actual, expected)) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="BattleFleet Admin"');
      res.status(401).json({ error: "A valid admin token is required." });
      return;
    }
    next();
  };
}

export function readAllowedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const defaults = env.NODE_ENV === "production" ? "" : "http://localhost:5173,http://127.0.0.1:5173";
  const origins = (env.BFA_ALLOWED_ORIGINS ?? defaults).split(",").map((s) => s.trim()).filter(Boolean);
  for (const origin of origins) {
    let valid = false;
    try {
      const url = new URL(origin);
      valid = (url.protocol === "http:" || url.protocol === "https:") && url.origin === origin;
    } catch { /* Invalid configuration fails closed at startup. */ }
    if (!valid) throw new Error("BFA_ALLOWED_ORIGINS must contain exact http(s) origins without paths or wildcards.");
  }
  return new Set(origins);
}

// CLI/native clients may omit Origin. This is a browser boundary, not player authentication.
export function isAllowedOrigin(origin: string | undefined, allowed: ReadonlySet<string>): boolean {
  return origin === undefined || allowed.has(origin);
}

export function publicOriginMiddleware(allowed: ReadonlySet<string>): RequestHandler {
  const applyCors = cors({ origin: [...allowed], credentials: false });
  return (req, res, next) => {
    if (!isAllowedOrigin(req.get("origin"), allowed)) {
      res.status(403).json({ error: "Origin not allowed." });
      return;
    }
    applyCors(req, res, next);
  };
}

/** Colyseus intercepts matchmaking before Express middleware. Guard that boundary too. */
export class OriginCheckedServer extends Server {
  constructor(options: ServerOptions, private readonly allowedOrigins: ReadonlySet<string>) {
    super(options);
  }

  protected override async handleMatchMakeRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("Vary", "Origin");
    if (!isAllowedOrigin(req.headers.origin, this.allowedOrigins)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Origin not allowed." }));
      return;
    }
    await super.handleMatchMakeRequest(req, res);
  }
}
