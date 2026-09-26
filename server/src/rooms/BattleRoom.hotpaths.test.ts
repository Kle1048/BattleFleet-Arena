import assert from "node:assert/strict";
import type { Client } from "@colyseus/core";
import { mkdtempSync, rmdirSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { DESTROYER_LIKE_MVP, getAuthoritativeShipHullProfile, getShipClassProfile, movementConfigForPlayer } from "@battlefleet/shared";

const dir = mkdtempSync(path.join(tmpdir(), "bfa-hotpaths-"));
process.env.BFA_DATA_DIR = dir;
const { BattleRoom } = await import("./BattleRoom.js");
const room = new BattleRoom();
room.autoDispose = false; room.setPatchRate(null);
const events: string[] = [];
const client = { sessionId: "human", send(type: string) { events.push(type); } } as unknown as Client;
try {
  room.onCreate(); room.setSimulationInterval();
  room.onJoin(client, { displayName: "Human" });
  const p = room.state.playerList.at(0)!;
  assert.equal(room["findPlayer"]("human"), p);
  assert.equal(room["clientsById"].get("human"), client);
  assert.equal(room["findPlayer"]("missing"), undefined);
  room["sendCollisionContact"]("human", "island");
  assert.deepEqual(events, ["collisionContact"]);
  const config = room["movementCfgForPlayer"](p);
  assert.equal(room["movementCfgForPlayer"](p), config);
  for (const [shipClass, level] of [["fac", 4], ["destroyer", 5], ["cruiser", 7]] as const) {
    p.shipClass = shipClass; p.level = level;
    const current = room["movementCfgForPlayer"](p);
    assert.notEqual(current, config);
    assert.deepEqual(current, movementConfigForPlayer(DESTROYER_LIKE_MVP, getShipClassProfile(shipClass), level,
      getAuthoritativeShipHullProfile(shipClass)?.movement ?? null));
    assert.equal(room["movementCfgForPlayer"](p), current);
  }
  room.restartRoundFromAdmin();
  assert.equal(room["findPlayer"]("human"), p);
  assert.deepEqual(room["movementCfgForPlayer"](p), config);
  room["spawnServerBot"]();
  const botId = [...room["serverBotIds"]][0]!;
  assert(room["findPlayer"](botId));
  assert(!room["clientsById"].has(botId));
  room["removeServerBot"](botId);
  assert(!room["findPlayer"](botId));
  room["physicsStep"](0.05);
  assert.equal(room["playersById"].size, room.state.playerList.length);
  room.onLeave(client);
  assert(!room["findPlayer"]("human")); assert(!room["clientsById"].has("human"));
  room["sendCollisionContact"]("human", "ship");
  assert.deepEqual(events, ["collisionContact"]);
  room.onJoin(client);
  assert.notEqual(room["findPlayer"]("human"), p);
  room.onDispose();
  assert.equal(room["playersById"].size, 0); assert.equal(room["clientsById"].size, 0);
} finally {
  room.setSimulationInterval(); room.setPatchRate(null); room.clock.clear(); room.clock.stop(); room.onDispose();
  rmdirSync(dir);
}
console.log("participant/client indexes and movement cache lifecycle tests ok");
