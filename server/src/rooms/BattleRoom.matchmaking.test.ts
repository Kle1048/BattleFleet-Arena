import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker, type Client as ServerClient } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client } from "colyseus.js";
import { MATCH_PHASE_ENDED, MATCH_PHASE_RUNNING } from "@battlefleet/shared/rules";

const dataDir = mkdtempSync(path.join(tmpdir(), "bfa-round-matchmaking-"));
process.env.BFA_DATA_DIR = dataDir;
const { BattleRoom } = await import("./BattleRoom.js");
const { updateAdminConfig } = await import("../adminConfig.js");
const { storageLifecycle } = await import("../application/storageServices.js");
await updateAdminConfig({ minRoomPlayers: 1 });
let now = 1_800_000_000_000;
let retentionMs = 30_000;
class TestBattleRoom extends BattleRoom {
  protected override get resultRetentionMs() { return retentionMs; }
  constructor() { super({ nowMs: () => now, random: () => 0.5 }); }
  onCreate() { super.onCreate(); this.maxClients = 2; this.setSimulationInterval(); }
  finish() {
    now = this["simulation"]["match"].endsAtMs;
    this["physicsStep"](0);
  }
}
const http = createServer();
const game = new Server({ greet: false, gracefullyShutdown: false,
  transport: new WebSocketTransport({ server: http }) });
game.define("round_test", TestBattleRoom);
await game.listen(0, "127.0.0.1");
const address = http.address();
assert(address && typeof address === "object");
const client = new Client(`http://127.0.0.1:${address.port}`);
async function eventually(check: () => boolean | Promise<boolean>) {
  for (let attempt = 0; attempt < 500; attempt++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail("Room lifecycle did not settle");
}
try {
  const first = await client.joinOrCreate("round_test", { displayName: "first" });
  const waiting = await client.joinOrCreate("round_test", { displayName: "waiting" });
  first.onMessage("*", () => {});
  waiting.onMessage("*", () => {});
  assert.equal(first.roomId, waiting.roomId);
  const oldRoom = matchMaker.getRoomById(first.roomId) as TestBattleRoom;
  // Exercise Colyseus's automatic unlock-on-leave path for full rooms too.
  assert.equal(oldRoom.locked, true);
  oldRoom.finish();
  await eventually(async () => (await matchMaker.query({ roomId: oldRoom.roomId }))[0]?.locked === true);
  assert.equal(oldRoom.state.matchPhase, MATCH_PHASE_ENDED);
  await first.leave();
  await eventually(() => oldRoom.clients.length === 1);
  assert.equal(oldRoom.locked, true, "Continue must not reopen an ended room");
  const next = await client.joinOrCreate("round_test", { displayName: "first" });
  next.onMessage("*", () => {});
  assert.notEqual(next.roomId, waiting.roomId, "new session must get a fresh round");
  const nextRoom = matchMaker.getRoomById(next.roomId) as TestBattleRoom;
  assert.equal(nextRoom.state.matchPhase, MATCH_PHASE_RUNNING);
  assert.equal(oldRoom.state.matchPhase, MATCH_PHASE_ENDED, "waiting player's results remain available");
  assert.throws(() => oldRoom.onJoin({ sessionId: "late-seat" } as ServerClient), /round has ended/);
  assert(!oldRoom.state.playerList.some(p => p.id === "late-seat"));
  await next.leave();
  oldRoom.restartRoundFromAdmin();
  await eventually(async () => (await matchMaker.query({ roomId: oldRoom.roomId }))[0]?.locked === false);
  const rejoined = await client.joinOrCreate("round_test", { displayName: "first" });
  rejoined.onMessage("*", () => {});
  assert.equal(rejoined.roomId, waiting.roomId, "an explicitly restarted round accepts players again");
  assert.equal(oldRoom.state.matchPhase, MATCH_PHASE_RUNNING);
  await rejoined.leave();
  await waiting.leave();
  await eventually(() => !matchMaker.getRoomById(oldRoom.roomId));
  // Four abandoned result screens must eventually free the entire capacity.
  retentionMs = 2000;
  const abandoned: string[] = [];
  const closed: number[] = [];
  for (let i = 0; i < 4; i++) {
    const connection = await client.joinOrCreate("round_test", { displayName: "waiting" });
    connection.onMessage("*", () => {});
    connection.onLeave(code => closed.push(code));
    abandoned.push(connection.roomId);
    (matchMaker.getRoomById(connection.roomId) as TestBattleRoom).finish();
  }
  await assert.rejects(client.joinOrCreate("round_test"), /capacity/);
  await eventually(() => abandoned.every(id => !matchMaker.getRoomById(id)));
  await eventually(() => closed.length === 4);
  assert.deepEqual(closed, [4001, 4001, 4001, 4001]);
  const fresh = await client.joinOrCreate("round_test");
  fresh.onMessage("*", () => {});
  assert.equal((matchMaker.getRoomById(fresh.roomId) as TestBattleRoom).state.matchPhase, MATCH_PHASE_RUNNING);
  retentionMs = 50;
  const restarted = matchMaker.getRoomById(fresh.roomId) as TestBattleRoom;
  restarted.finish();
  restarted.restartRoundFromAdmin();
  await new Promise(resolve => setTimeout(resolve, 90));
  assert.equal(matchMaker.getRoomById(fresh.roomId), restarted, "restart cancels the old result expiry");
  assert.equal(restarted.clients.length, 1);
  await fresh.leave();
} finally {
  await game.gracefullyShutdown(false);
  await storageLifecycle.flush();
  for (const name of readdirSync(dataDir)) unlinkSync(path.join(dataDir, name));
  rmdirSync(dataDir);
}
console.log("multiplayer Continue, ended-room exclusion and explicit restart matchmaking ok");
