import { createServer, type IncomingMessage } from "node:http";
import express from "express";
import { LimitedTransport } from "./limitedTransport.js";
import { RequestBudget, requestLimitMiddleware, MAX_SOCKET_CONNECTIONS } from "./loadLimits.js";
import { isAllowedOrigin, OriginCheckedServer, publicOriginMiddleware, readAllowedOrigins } from "./serverSecurity.js";
import { BattleRoom } from "./rooms/BattleRoom.js";
import { registerAdminPanel } from "./adminPanel.js";
import { topLeaderboard } from "./leaderboardStore.js";
import { storageLifecycle } from "./application/storageServices.js";
import { createShutdown } from "./application/shutdown.js";

const port = Number(process.env.PORT) || 2567;
/** z. B. `::` für IPv6; Standard IPv4 alle Interfaces (zuverlässig mit 127.0.0.1-Client). */
const listenHost = process.env.LISTEN_HOST ?? "0.0.0.0";

const app = express();
let shuttingDown = false;
app.use((_req, res, next) => {
  if (shuttingDown) { res.status(503).json({ error: "Server shutting down" }); return; }
  next();
});
app.disable("x-powered-by");
const allowedOrigins = readAllowedOrigins();
const requestBudget = new RequestBudget();
registerAdminPanel(app, {
  activeRoomSummaries: () => BattleRoom.activeRoomSummaries(),
  restartActiveRounds: () => BattleRoom.restartActiveRounds(),
});
app.use(publicOriginMiddleware(allowedOrigins));
app.use(requestLimitMiddleware(requestBudget));
app.use(express.json({ limit: "4kb" }));

app.get("/api/leaderboard", (req, res) => {
  const rawLimit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : NaN;
  const limit = Number.isFinite(rawLimit) ? rawLimit : 10;
  const rows = topLeaderboard(limit).map((r) => ({
    displayName: r.displayName,
    scoreTotal: r.scoreTotal,
    kills: r.kills,
    wins: r.wins,
    matches: r.matches,
    updatedAtMs: r.updatedAtMs,
  }));
  res.json({ rows });
});

const server = createServer(app);
server.maxConnections = MAX_SOCKET_CONNECTIONS + 128;
server.headersTimeout = 10_000;
server.requestTimeout = 10_000;
server.keepAliveTimeout = 5000;
const gameServer = new OriginCheckedServer({
  gracefullyShutdown: false,
  transport: new LimitedTransport({
    server,
    verifyClient: (info: { req: IncomingMessage }) => isAllowedOrigin(info.req.headers.origin, allowedOrigins) && requestBudget.allow(info.req),
  }),
}, allowedOrigins, requestBudget);

gameServer.define("battle", BattleRoom);

// Own the signal deadline: Colyseus 0.15 otherwise exits with 0 even when a
// shutdown hook throws. Stop rooms first, then drain their accepted results.
const drain = createShutdown(() => gameServer.gracefullyShutdown(false), () => storageLifecycle.close(5000),
  error => console.error("[server] shutdown failed", error));
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  const deadline = setTimeout(() => {
    console.error("[server] shutdown deadline exceeded; pending results may be lost");
    process.exit(1);
  }, 10_000);
  void drain().then(ok => {
    clearTimeout(deadline);
    process.exit(ok ? (process.exitCode ?? 0) : 1);
  });
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

gameServer
  .listen(port, listenHost)
  .then(() => {
    console.log(
      `[battlefleet] Colyseus http://${listenHost}:${port} (Raum „battle“; Client nutzt meist 127.0.0.1:${port})`,
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
