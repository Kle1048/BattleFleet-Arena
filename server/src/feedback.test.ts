import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express, { type Request } from "express";
import { FeedbackBudget, FeedbackStore, registerPublicFeedback } from "./feedback.js";
import { publicOriginMiddleware } from "./serverSecurity.js";

const dir = await mkdtemp(path.join(tmpdir(), "bfa-feedback-"));
process.env.BFA_DATA_DIR = dir;
const { registerAdminPanel } = await import("./adminPanel.js");
const { feedbackStore, storageLifecycle } = await import("./application/storageServices.js");
const token = "t".repeat(64);
const app = express();
registerAdminPanel(app, { activeRoomSummaries: () => [], restartActiveRounds: () => ({ rooms: 0, restarted: 0 }) }, token);
app.use(publicOriginMiddleware(new Set(["https://game.test"])));
registerPublicFeedback(app, feedbackStore, new FeedbackBudget(true));
app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(413).json({ error: "body rejected" }));
const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
const address = server.address(); assert(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
let peer = 0;
const request = (route: string, method = "GET", body?: unknown, admin = false, origin?: string) => fetch(base + route, {
  method, headers: { "content-type": "application/json", "x-real-ip": `192.0.2.${++peer}`,
    ...(admin ? { authorization: `Bearer ${token}` } : {}), ...(origin ? { origin } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const input = { id: randomUUID(), category: "bug", title: "<img src=x onerror=alert(1)>", description: "Reproduction: turret points in the wrong direction.",
  diagnostics: { client: { id: "development", token: "SECRET_MARKER" }, adminToken: "SECRET_MARKER", roomState: "SECRET_MARKER" } };
try {
  for (const [method, route] of [["GET", "/api/admin/feedback"], ["PATCH", `/api/admin/feedback/${input.id}`], ["DELETE", `/api/admin/feedback/${input.id}`]]) {
    assert.equal((await request(route!, method, method === "GET" ? undefined : {})).status, 401);
  }
  assert.equal((await request("/api/feedback", "POST", input, false, "https://evil.test")).status, 403);
  assert.equal((await request("/api/feedback", "POST", { ...input, title: "x" })).status, 400);
  assert.equal((await request("/api/feedback", "POST", { ...input, description: "x".repeat(13000) })).status, 413);
  const accepted = await request("/api/feedback", "POST", input, false, "https://game.test");
  assert.equal(accepted.status, 201); assert.deepEqual(await accepted.json(), { id: input.id });
  assert.equal((await request("/api/feedback", "POST", input)).status, 201);
  assert.equal((await request("/api/feedback", "POST", { ...input, title: "different report" })).status, 409);
  assert.equal((await request("/api/feedback")).status, 404, "no public read endpoint");
  const listed = await request("/api/admin/feedback", "GET", undefined, true);
  const inbox = await listed.json() as { total: number; rows: { status: string; title: string; revision: number }[] };
  assert.equal(inbox.total, 1); assert.equal(inbox.rows[0]!.status, "new");
  assert.equal(inbox.rows[0]!.title, input.title, "stored as text, admin renders with textContent");
  assert(!JSON.stringify(inbox).includes("SECRET_MARKER"));
  const patch = { expectedRevision: 0, status: "triaged", priority: "high", note: "Reproduced. Link a fix here." };
  assert.equal((await request(`/api/admin/feedback/${input.id}`, "PATCH", patch, true, "https://evil.test")).status, 403);
  assert.equal((await request(`/api/admin/feedback/${input.id}`, "PATCH", patch, true)).status, 200);
  assert.equal((await request(`/api/admin/feedback/${input.id}`, "PATCH", patch, true)).status, 409);
  assert.equal((await request(`/api/admin/feedback/${input.id}`, "PATCH", { ...patch, expectedRevision: 1, status: "unknown" }, true)).status, 400);
  const restored = new FeedbackStore(path.join(dir, "feedback.json")); await restored.load();
  assert.equal(restored.list().rows[0]!.status, "triaged");
  assert.equal(restored.list().rows[0]!.revision, 1);
  await restored.queue.close();
  assert.equal((await request(`/api/admin/feedback/${input.id}`, "DELETE", { expectedRevision: 1 }, true)).status, 200);
  assert.equal(feedbackStore.list().total, 0);
  assert(!String(await readFile(path.join(dir, "feedback.json"))).includes(input.id));
  let time = 0;
  const budget = new FeedbackBudget(false, () => time);
  const req = { socket: { remoteAddress: "127.0.0.1" }, headers: {} } as Request;
  assert(budget.allow(req)); assert(budget.allow(req)); assert(budget.allow(req)); assert(!budget.allow(req));
  req.headers["x-real-ip"] = "203.0.113.10";
  assert(!budget.allow(req), "untrusted forwarding cannot bypass budget");
  time += 60_001; assert(budget.allow(req));
  // A failed commit is not acknowledged or published to readers.
  const failing = new FeedbackStore(path.join(dir, "failure.json")); await failing.load();
  failing.file.save = async () => { throw new Error("disk unavailable"); };
  await assert.rejects(failing.add({ ...input, diagnostics: null })); assert.equal(failing.list().total, 0);
  await failing.queue.close();
} finally {
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  await storageLifecycle.close(); await rm(dir, { recursive: true, force: true });
}
console.log("feedback private boundaries, validation, sanitization, durable receipts, retry, triage conflict and rate budget ok");
