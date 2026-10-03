import assert from "node:assert/strict";
import type { Client } from "@colyseus/core";
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BattleState } from "@battlefleet/shared/protocol/schema";

const directory = mkdtempSync(path.join(tmpdir(), "bfa-adapter-"));
process.env.BFA_DATA_DIR = directory;
const { BattleRoom } = await import("./BattleRoom.js");
const { updateAdminConfig } = await import("../adminConfig.js");
await updateAdminConfig({ minRoomPlayers: 1 });
let now = 10000, seed = 42;
const room = new BattleRoom({ nowMs: () => now,
  random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32) });
const events: string[] = [];
const client = { sessionId: "human", send: (type: string) => { events.push(type); } } as unknown as Client;
room.broadcast = (type: string | number) => { events.push(String(type)); };
room.autoDispose = false; room.setPatchRate(null);
// This fixture has no matchmaker listing; network locking is covered separately.
const matchmakingTransitions: string[] = [];
room.lock = async () => { matchmakingTransitions.push("lock"); };
room.unlock = async () => { matchmakingTransitions.push("unlock"); };
const handlers = new Map<string, (client: Client, payload: unknown) => void>();
room.onMessage = ((type: string, callback: (client: Client, payload: unknown) => void) => {
  handlers.set(type, callback);
}) as typeof room.onMessage;
try {
  room.onCreate(); room.setSimulationInterval();
  room.onJoin(client, { displayName: "Human" });
  const game = room["simulation"], domain = game.findPlayer(client.sessionId)!;
  const replica = room.state.playerList.at(0)!;
  assert.notEqual(domain, replica);
  assert.deepEqual(replica.toJSON(), domain, "join is published before the operation returns");
  handlers.get("input")!(client, {
    throttle: 0.5, rudderInput: 0, aimX: domain.x + Math.sin(domain.headingRad) * 160,
    aimZ: domain.z + Math.cos(domain.headingRad) * 160, primaryFire: true, secondaryFire: true, aswmFireSide: "port",
    sessionId: "forged", hp: 999999, score: 999999,
  });
  assert.deepEqual(events, ["artyFired", "aswmFired"]);
  assert.equal(room.state.missileList.length, 1, "immediate input publishes membership before the tick");
  assert.notEqual(room.state.missileList.at(0), game.state.missileList.at(0));
  assert.notEqual(domain.hp, 999999); assert.equal(domain.score, 0);
  for (const malformed of [null, undefined, [], 123, "input"]) {
    assert.doesNotThrow(() => handlers.get("input")!(client, malformed));
  }
  const row = game.participants.simulations.get(client.sessionId)!;
  const previousAim = [row.aimX, row.aimZ];
  handlers.get("input")!(client, { throttle: Infinity, rudderInput: { valueOf: 1 },
    aimX: NaN, aimZ: Infinity, primaryFire: "true", radarActive: "false" });
  assert.equal(row.ship.throttle, 0); assert.equal(row.lastRudderInput, 0);
  assert.deepEqual([row.aimX, row.aimZ], previousAim);
  assert.equal(row.radarActive, true);
  now += 50; room["physicsStep"](0.05);
  assert.deepEqual(replica.toJSON(), domain, "step publishes all derived fields");
  const oldEnv = process.env.NODE_ENV, oldDebug = process.env.BFA_DEBUG_SHIP_SWITCH;
  try {
    process.env.NODE_ENV = "production"; delete process.env.BFA_DEBUG_SHIP_SWITCH;
    handlers.get("debugSetShipClass")!(client, { shipClass: "cruiser" });
    assert.equal(domain.shipClass, "fac", "production guard remains outside simulation");
    process.env.BFA_DEBUG_SHIP_SWITCH = "1";
    handlers.get("debugSetShipClass")!(client, { shipClass: "cruiser" });
    assert.equal(domain.shipClass, "cruiser"); assert.equal(replica.shipClass, "cruiser");
  } finally {
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
    if (oldDebug === undefined) delete process.env.BFA_DEBUG_SHIP_SWITCH; else process.env.BFA_DEBUG_SHIP_SWITCH = oldDebug;
  }
  room.restartRoundFromAdmin();
  assert.equal(room.state.playerList.at(0), replica, "reset preserves schema identity");
  assert.deepEqual(replica.toJSON(), domain);
  now = game["match"].endsAtMs;
  room["physicsStep"](0);
  assert.equal(room.state.matchPhase, "ended");
  handlers.get("playAgain")!(client, {});
  assert.equal(room.state.matchPhase, "running");
  assert.deepEqual(matchmakingTransitions, ["lock", "unlock"]);
  assert.equal(room.state.playerList.at(0), replica);
  assert.deepEqual(replica.toJSON(), domain, "player-triggered restart also publishes before returning");
  const decoded = new BattleState(); decoded.decode(room.state.encodeAll());
  assert.deepEqual(decoded.toJSON(), room.state.toJSON());
  room.onLeave(client);
  assert.equal(room.state.playerList.length, 0);
  assert.equal(room.state.missileList.length, 0);
  room.onJoin(client);
  assert.notEqual(room.state.playerList.at(0), replica, "rejoin creates a new schema lifetime");
} finally {
  room.setSimulationInterval(); room.setPatchRate(null); room.clock.clear(); room.clock.stop(); room.onDispose();
  await (await import("../application/storageServices.js")).storageLifecycle.flush();
  for (const name of readdirSync(directory)) unlinkSync(path.join(directory, name));
  rmdirSync(directory);
}
console.log("room operation/publication boundaries, event order, server identity and debug guard ok");
