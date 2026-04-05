import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Server } from "@colyseus/core";
import { BattleRoom } from "./rooms/BattleRoom.js";

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
