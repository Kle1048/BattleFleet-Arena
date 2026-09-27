import assert from "node:assert/strict";
import type { Client } from "@colyseus/core";
import { mkdtempSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const directory = mkdtempSync(path.join(tmpdir(), "bfa-limits-"));
process.env.BFA_DATA_DIR = directory;
process.env.BFA_MAX_ROOMS = "2";
const { BattleRoom } = await import("./BattleRoom.js");
const rooms: InstanceType<typeof BattleRoom>[] = [];
let now = 0;
const create = () => {
  const room = new BattleRoom(undefined, () => now); rooms.push(room);
  room.autoDispose = false; room.setPatchRate(null); return room;
};
try {
  const first = create(); first.onCreate(); first.setSimulationInterval();
  const second = create(); second.onCreate(); second.setSimulationInterval();
  const rejected = create();
  assert.throws(() => rejected.onCreate(), /capacity reached/);
  assert.equal(BattleRoom.activeRoomSummaries().length, 2);
  assert.equal(rejected["simulation"].state.playerList.length, 0, "rejected room never starts bot/simulation work");
  second.onDispose();
  const replacement = create(); replacement.onCreate(); replacement.setSimulationInterval();
  assert.equal(BattleRoom.activeRoomSummaries().length, 2, "released capacity is reusable");
  const client = { sessionId: "limited", send() {} } as unknown as Client;
  first.onJoin(client, { displayName: "Limits" });
  const input = first["onMessageHandlers"].input;
  const row = first["simulation"].participants.simulations.get(client.sessionId)!;
  for (let i = 0; i < 100; i++) input(client, { throttle: 0, rudderInput: 0, aimX: i });
  assert.equal(row.aimX, 11, "only the 12-message burst reaches simulation/publication");
  input({ sessionId: client.sessionId } as Client, { aimX: 999 });
  assert.equal(row.aimX, 11, "sessionId alone cannot impersonate a client");
  now = 50; input(client, { aimX: 123 });
  assert.equal(row.aimX, 123, "normal 20 Hz input recovers after a burst");
  first.onLeave(client);
  input(client, { aimX: 999 });
  assert.equal(first.state.playerList.length, 0, "late input cannot resurrect a departed client");
} finally {
  for (const room of rooms) {
    room.setSimulationInterval(); room.setPatchRate(null); room.clock.clear(); room.clock.stop(); room.onDispose();
  }
  rmdirSync(directory);
}
console.log("room capacity, failed-start cleanup, capacity reuse, per-client input budget and identity checks ok");
