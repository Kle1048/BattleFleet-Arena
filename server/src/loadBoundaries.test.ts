import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { once } from "node:events";
import express from "express";
import WebSocket from "ws";
import { Room, getMessageBytes, Protocol } from "@colyseus/core";
import { LimitedTransport } from "./limitedTransport.js";
import { OriginCheckedServer } from "./serverSecurity.js";
import { RequestBudget } from "./loadLimits.js";

let now = 0, received = 0;
const server = createServer(express());
const requestBudget = new RequestBudget(() => now, 4096, true);
const game = new OriginCheckedServer({ greet: false, gracefullyShutdown: false,
  transport: new LimitedTransport({ server, verifyClient: info => requestBudget.allow(info.req) }),
}, new Set(), requestBudget);
class TestRoom extends Room {
  onCreate() { this.setPatchRate(null); this.onMessage("input", () => received++); }
}
game.define("limits_test", TestRoom);
await game.listen(0, "127.0.0.1");
const address = server.address(); assert(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
const sockets: WebSocket[] = [];
const post = (body: string) => fetch(base + "/matchmake/joinOrCreate/limits_test", {
  method: "POST", headers: { "content-type": "application/json" }, body,
});
async function connect(): Promise<WebSocket> {
  now += 1000;
  const response = await post("{}");
  const reservation = await response.json() as { sessionId: string; room: { processId: string; roomId: string } };
  assert(reservation.sessionId);
  const socket = new WebSocket(`${base.replace("http:", "ws:")}/${reservation.room.processId}/${reservation.room.roomId}?sessionId=${reservation.sessionId}`);
  sockets.push(socket);
  await once(socket, "open");
  socket.send(Buffer.from([Protocol.JOIN_ROOM]));
  return socket;
}
try {
  const unsupported = await fetch(base + "/matchmake/limits_test", { method: "PUT" });
  assert.equal(unsupported.status, 405); await unsupported.arrayBuffer();
  for (const body of ["null", "[]", "{", '"text"']) {
    const response = await post(body); assert.equal(response.status, 400); await response.arrayBuffer();
  }
  const tooLarge = await post(JSON.stringify({ text: "x".repeat(5000) }));
  assert.equal(tooLarge.status, 413); await tooLarge.arrayBuffer();
  // Transfer-Encoding: chunked must not bypass the byte limit.
  const chunked = await new Promise<number>(resolve => {
    const req = request(base + "/matchmake/joinOrCreate/limits_test", { method: "POST" }, res => {
      res.resume(); res.on("end", () => resolve(res.statusCode!));
    });
    req.on("error", error => { throw error; });
    req.write('{"text":"'); req.write("x".repeat(3000)); req.end("x".repeat(3000) + '"}');
  });
  assert.equal(chunked, 413);
  const slow = await new Promise<number>((resolve, reject) => {
    const req = request(base + "/matchmake/joinOrCreate/limits_test", { method: "POST" }, res => {
      res.resume(); res.on("end", () => { req.destroy(); resolve(res.statusCode!); });
    });
    req.on("error", reject); req.write("{"); // Never finish: must time out without a reservation.
  });
  assert.equal(slow, 408);
  const normal = await connect();
  normal.send(getMessageBytes.raw(Protocol.ROOM_DATA, "input", { primaryFire: true }));
  // A response to the ping gives the server a deterministic processing checkpoint.
  const pong = once(normal, "pong"); normal.ping(); await pong;
  assert.equal(received, 1, "normal game input still reaches Colyseus");
  const floodClosed = once(normal, "close");
  for (let i = 0; i < 300; i++) normal.send(getMessageBytes.raw(Protocol.ROOM_DATA, "input", {}));
  await floodClosed;
  assert(received <= 121, "raw budget stops decoding repeated input frames");
  const oversized = await connect();
  const oversizedClosed = once(oversized, "close");
  oversized.send(Buffer.alloc(5000));
  const [closeCode] = await oversizedClosed;
  assert.equal(closeCode, 1009, "ws rejects oversized messages before application decoding");
  let limited = false;
  for (let i = 0; i < 45; i++) {
    const response = await fetch(base + "/matchmake/limits_test", { headers: { "x-forwarded-for": `spoof-${i}` } });
    if (response.status === 429) {
      limited = true; assert.equal(response.headers.get("retry-after"), "1");
    }
    await response.arrayBuffer();
  }
  assert(limited, "matchmaking bypassing Express still has request limits");
  now += 60_001;
  for (let i = 0; i < 41; i++) {
    const response = await fetch(base + "/matchmake/limits_test", { headers: { "x-real-ip": "198.51.100.1" } });
    assert.equal(response.status === 429, i === 40);
    await response.arrayBuffer();
  }
  const otherPlayer = await fetch(base + "/matchmake/limits_test", { headers: { "x-real-ip": "198.51.100.2" } });
  assert.notEqual(otherPlayer.status, 429, "real HTTP clients behind loopback proxy have independent budgets");
  await otherPlayer.arrayBuffer();
} finally {
  for (const socket of sockets) if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
  await game.gracefullyShutdown(false);
}
console.log("real HTTP/WS: bounded JSON and chunked bodies, normal input, flood disconnect, payload and matchmaking limits ok");
