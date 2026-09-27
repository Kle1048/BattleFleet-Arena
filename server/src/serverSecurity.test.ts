import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import { once } from "node:events";
import express from "express";
import { Room } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import WebSocket from "ws";
import { isAllowedOrigin, OriginCheckedServer, publicOriginMiddleware, readAllowedOrigins } from "./serverSecurity.js";

assert.deepEqual([...readAllowedOrigins({ NODE_ENV: "production" })], []);
assert(readAllowedOrigins({}).has("http://localhost:5173"));
for (const invalid of ["*", "null", "https://example.com/", "https://example.com/path", "ftp://example.com"]) {
  assert.throws(() => readAllowedOrigins({ BFA_ALLOWED_ORIGINS: invalid }));
}
const allowed = readAllowedOrigins({ BFA_ALLOWED_ORIGINS: "https://game.example,http://127.0.0.1:5173" });
assert(isAllowedOrigin(undefined, allowed));
assert(!isAllowedOrigin("null", allowed));
assert(!isAllowedOrigin("https://game.example.attacker.example", allowed));
const app = express();
app.use(publicOriginMiddleware(allowed));
app.get("/api/leaderboard", (_req, res) => res.json({ rows: [] }));
const server = createServer(app);
const game = new OriginCheckedServer({
  greet: false, gracefullyShutdown: false,
  transport: new WebSocketTransport({
    server, verifyClient: (info: { req: IncomingMessage }) => isAllowedOrigin(info.req.headers.origin, allowed),
  }),
}, allowed);
class TestRoom extends Room { onCreate() { this.setPatchRate(null); } }
game.define("security_test", TestRoom);
await game.listen(0, "127.0.0.1");
const address = server.address();
assert(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
try {
  for (const route of ["/api/leaderboard", "/matchmake/security_test"]) {
    for (const method of ["GET", "OPTIONS"]) {
      const denied = await fetch(base + route, { method, headers: { origin: "https://attacker.example" } });
      assert.equal(denied.status, 403);
      assert(!denied.headers.has("access-control-allow-origin"));
      assert(!denied.headers.has("access-control-allow-credentials"));
      await denied.arrayBuffer();
      const accepted = await fetch(base + route, { method, headers: { origin: "https://game.example" } });
      assert(accepted.ok);
      assert.equal(accepted.headers.get("access-control-allow-origin"), "https://game.example");
      if (route.startsWith("/matchmake/")) assert.equal(accepted.headers.get("access-control-allow-credentials"), "true");
      await accepted.arrayBuffer();
    }
  }
  const deniedJoin = await fetch(`${base}/matchmake/joinOrCreate/security_test`, {
    method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" }, body: "{}",
  });
  assert.equal(deniedJoin.status, 403);
  assert(!deniedJoin.headers.has("access-control-allow-origin"));
  assert(!deniedJoin.headers.has("access-control-allow-credentials"));
  await deniedJoin.arrayBuffer();
  const join = await fetch(`${base}/matchmake/joinOrCreate/security_test`, {
    method: "POST", headers: { origin: "https://game.example", "content-type": "application/json" }, body: "{}",
  });
  const reservation = await join.json() as { room: { processId: string; roomId: string }; sessionId: string };
  // Colyseus browser HTTP always uses withCredentials; Node fetch does not enforce CORS.
  assert.equal(join.headers.get("access-control-allow-origin"), "https://game.example");
  assert.equal(join.headers.get("access-control-allow-credentials"), "true");
  const invalidJoin = await fetch(`${base}/matchmake/joinOrCreate/security_test`, {
    method: "POST", headers: { origin: "https://game.example", "content-type": "application/json" }, body: "null",
  });
  assert.equal(invalidJoin.status, 400);
  assert.equal(invalidJoin.headers.get("access-control-allow-origin"), "https://game.example");
  assert.equal(invalidJoin.headers.get("access-control-allow-credentials"), "true");
  await invalidJoin.arrayBuffer();
  assert(reservation.sessionId);
  const wsUrl = `${base.replace("http:", "ws:")}/${reservation.room.processId}/${reservation.room.roomId}?sessionId=${reservation.sessionId}`;
  const deniedSocket = new WebSocket(wsUrl, { origin: "https://attacker.example" });
  const [error] = await once(deniedSocket, "error");
  assert.match(String(error), /401/); // ws rejects verifyClient=false before upgrading.
  const socket = new WebSocket(wsUrl, { origin: "https://game.example" });
  await once(socket, "open");
  socket.close();
  await once(socket, "close");
} finally {
  await game.gracefullyShutdown(false);
}
console.log("HTTP, Colyseus matchmaking and WebSocket origin boundary tests ok");
