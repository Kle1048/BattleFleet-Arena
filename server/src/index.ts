import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Server } from "@colyseus/core";
import { BattleRoom } from "./rooms/BattleRoom.js";
import { registerAdminPanel } from "./adminPanel.js";
import { topLeaderboard } from "./leaderboardStore.js";

const port = Number(process.env.PORT) || 2567;
/** z. B. `::` für IPv6; Standard IPv4 alle Interfaces (zuverlässig mit 127.0.0.1-Client). */
const listenHost = process.env.LISTEN_HOST ?? "0.0.0.0";

const app = express();
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
registerAdminPanel(app, {
  activeRoomSummaries: () => BattleRoom.activeRoomSummaries(),
  restartActiveRounds: () => BattleRoom.restartActiveRounds(),
});

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
const gameServer = new Server({
  transport: new WebSocketTransport({ server }),
});

gameServer.define("battle", BattleRoom);

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
