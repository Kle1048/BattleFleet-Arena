import assert from "node:assert/strict";
import { decodeMatchEvent, decodePong } from "./matchEventDecoder";

const shot = { shellId: 3, ownerId: "me", fromX: 1, fromZ: 2, toX: 3, toZ: 4, flightMs: 800 };
assert.deepEqual(decodeMatchEvent("artyFired", shot), { type: "artyFired", payload: shot });
const decoded = decodeMatchEvent("artyFired", shot);
shot.fromX = 999;
assert(decoded?.type === "artyFired"); assert.equal(decoded.payload.fromX, 1, "event values are owned, not borrowed");
for (const field of ["shellId", "fromX", "fromZ", "toX", "toZ", "flightMs"]) {
  for (const bad of [NaN, Infinity, -Infinity, "4", {}, null, undefined]) {
    assert.equal(decodeMatchEvent("artyFired", { ...shot, [field]: bad }), null);
  }
}
assert.deepEqual(decodeMatchEvent("artyImpact", { shellId: 4, x: 5, z: 6, kind: "unknown" }),
  { type: "artyImpact", payload: { shellId: 4, x: 5, z: 6, kind: undefined } });
assert.deepEqual(decodeMatchEvent("aswmImpact", { x: 5, z: 6 }),
  { type: "aswmImpact", payload: { x: 5, z: 6, kind: "hit" } });
for (const type of ["aswmImpact", "torpedoImpact", "artyImpact"]) {
  assert.equal(decodeMatchEvent(type, { shellId: 4, x: Infinity, z: 6 }), null);
}
const defense = { x: "12", z: "34", weapon: "aswm", layer: "PD", defenderX: "7", defenderZ: "8", defenderId: "def", id: "42" };
const expected = { x: 12, z: 34, layer: "pd", defenderX: 7, defenderZ: 8, defenderId: "def", missileId: 42 };
for (const type of ["airDefenseFire", "airDefenseIntercept"]) {
  assert.deepEqual(decodeMatchEvent(type, defense), { type, payload: expected });
  assert.deepEqual(decodeMatchEvent(type, { ...defense, id: "invalid", missileId: "43" }),
    { type, payload: { ...expected, missileId: 43 } });
  assert.equal(decodeMatchEvent(type, { ...defense, x: " " }), null);
  assert.equal(decodeMatchEvent(type, { ...defense, layer: "other" }), null);
  assert.equal(decodeMatchEvent(type, { ...defense, weapon: "torpedo" }), null);
}
const poison = { toString() { assert.fail("wire decoder must not run conversion hooks"); } };
assert.equal(decodeMatchEvent(poison, defense), null);
assert.equal(decodeMatchEvent("airDefenseFire", { ...defense, layer: poison }), null);
assert.equal(decodeMatchEvent("airDefenseFire", { ...defense, x: poison }), null);
assert.equal(decodeMatchEvent("airDefenseFire", { ...defense, weapon: poison }), null);
assert.equal(decodePong({ clientTime: poison }), null);
assert.equal(decodePong({ clientTime: Infinity }), null);
assert.equal(decodePong({ clientTime: "123" }), 123);
assert.equal(decodePong({ clientTime: false }), 0);
assert.equal(decodePong({ clientTime: null }), 0);
assert.equal(decodePong({}), null);
for (const type of ["matchEnded", "matchRestarted", "input", "pong", "unknown"]) {
  assert.equal(decodeMatchEvent(type, shot), null, "state/control messages are not another source of FX");
}
for (const type of ["artyFired", "artyImpact", "aswmFired", "torpedoFired", "aswmImpact", "airDefenseFire", "collisionContact"]) {
  for (const payload of [null, undefined, [], "string", 5]) assert.equal(decodeMatchEvent(type, payload), null);
}
assert.deepEqual(decodeMatchEvent("softkillResult", null), { type: "softkillResult", payload: { success: false } });
assert.deepEqual(decodeMatchEvent("missileLockOn", null), { type: "missileLockOn" });
console.log("finite/owned presentation event decoding and legacy fallbacks ok");
