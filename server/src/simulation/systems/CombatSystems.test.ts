import assert from "node:assert/strict";
import type { GameEventSink, GameEventMap, MissileValues, TorpedoValues, WreckValues } from "@battlefleet/shared/protocol";
import { ASWM_LIFETIME_MS, FEATURE_MINES_ENABLED, getAuthoritativeShipHullProfile, mountedMuzzleWorld } from "@battlefleet/shared/rules";
import type { MutableSequence } from "../CombatTypes.js";
import { testParticipants } from "../testParticipants.js";
import { AirDefenseSystem } from "./AirDefenseSystem.js";
import { ArtillerySystem } from "./ArtillerySystem.js";
import { MissileSystem } from "./MissileSystem.js";
import { MineSystem } from "./MineSystem.js";

function sequence<T>(): MutableSequence<T> {
  const items: T[] = [];
  return {
    get length() { return items.length; },
    at: index => items.at(index), push: item => items.push(item),
    deleteAt: index => items.splice(index, 1), [Symbol.iterator]: () => items[Symbol.iterator](),
  };
}
const participants = testParticipants("owner", "target");
const missiles = sequence<MissileValues>(), torpedoes = sequence<TorpedoValues>(), wrecks: WreckValues[] = [];
const owner = participants.players.get("owner")!, row = participants.simulations.get("owner")!;
const target = participants.players.get("target")!;
Object.assign(owner, { x: -1800, z: -1800, headingRad: 0 });
Object.assign(row.ship, { x: owner.x, z: owner.z, headingRad: 0 });
row.aimX = -1800; row.aimZ = -1640;
target.x = -1800; target.z = -1640;
const delivered: { recipient: string; type: string; payload: unknown }[] = [];
const events: GameEventSink = {
  broadcast: (type, payload) => { delivered.push({ recipient: "*", type, payload: structuredClone(payload) }); },
  send: (recipient, type, payload) => { delivered.push({ recipient, type, payload: structuredClone(payload) }); },
};
let now = 10000, combat = true;
const environment = { nowMs: () => now, random: () => 0.5 };
const damage: string[] = [];
const life = { applyDamage(id: string) { damage.push(id); } };
const defense = new AirDefenseSystem(participants, environment, events, () => 3000);
const mines = new MineSystem(participants, torpedoes, wrecks, life, environment, events, () => combat, () => 4000);
const rockets = new MissileSystem(participants, missiles, wrecks, life, defense, environment, events,
  () => combat, () => 4000);
const artillery = new ArtillerySystem(participants, life, environment, events,
  () => combat, (x, z) => mines.disarmAt(x, z));
artillery.fire(owner.id, row);
rockets.fire(owner.id, row, "port");
mines.fire(owner.id, row);
assert.equal(FEATURE_MINES_ENABLED, false);
assert.equal(torpedoes.length, 0);
assert.deepEqual(delivered.map(e => e.type), ["artyFired", "aswmFired"]);
assert.equal(missiles.length, 1);
const launch = delivered[1]!.payload as GameEventMap["aswmFired"];
assert.equal(launch.launcherId, "ssm_rail_port");
const launcher = getAuthoritativeShipHullProfile("fac")!.fixedSeaSkimmerLaunchers!.find(r => r.id === launch.launcherId)!;
const muzzle = mountedMuzzleWorld(launcher.socket, launcher.equipment!.modelId, row.ship.x, row.ship.z, row.ship.headingRad);
assert.deepEqual([launch.fromX, launch.fromY, launch.fromZ], [muzzle.x, muzzle.y, muzzle.z]);
assert.deepEqual([missiles.at(0)!.x, missiles.at(0)!.z], [muzzle.x, muzzle.z], "no hidden rail clearance offset");
artillery.fire(owner.id, row);
rockets.fire(owner.id, row, "port");
assert.equal(delivered.length, 2, "held fire respects deadlines without a room/tick");
const salvo = delivered[0]!.payload as { toX: number; toZ: number; flightMs: number };
target.x = salvo.toX; target.z = salvo.toZ;
artillery.resolveImpacts(now + salvo.flightMs - 1);
assert.equal(damage.length, 0);
artillery.resolveImpacts(now + salvo.flightMs);
assert.deepEqual(damage, ["target"]);
assert.equal(delivered.at(-1)!.type, "artyImpact");
artillery.resolveImpacts(now + salvo.flightMs);
assert.equal(damage.length, 1, "impact is consumed exactly once");

// Removal owns all missile bookkeeping, including defense reservations that outlive a frame.
const id = missiles.at(0)!.missileId;
defense["adPendingRollByMissileId"].set(id, { defenderId: target.id, layer: "sam", rollReadyAtMs: now + 1000 });
defense["adSoftkillAttemptedMissileDefender"].add(id + "|" + target.id);
defense["aswmSoftkillReacquireBlockByMissileId"].set(id, { defenderId: target.id, untilMs: now + 1000 });
rockets.removeOwner(owner.id);
assert.equal(missiles.length, 0);
assert.equal(rockets["missileSpawnedAt"].size, 0);
assert.equal(defense["adPendingRollByMissileId"].size, 0);
assert.equal(defense["adSoftkillAttemptedMissileDefender"].size, 0);
assert.equal(defense["aswmSoftkillReacquireBlockByMissileId"].size, 0);
now += 10000;
rockets.fire(owner.id, row, "starboard");
assert.equal(missiles.at(0)!.missileId, id + 1, "IDs are not reused after owner removal");
const eventsBeforeExpiry = delivered.length;
rockets.step(0, now + ASWM_LIFETIME_MS + 1);
assert.equal(missiles.length, 0);
assert.equal(delivered.length, eventsBeforeExpiry, "age expiry remains silent");
row.aswmReloadUntilMs = now + 100;
row.aswmRemainingPort = 0; row.aswmRemainingStarboard = 0;
rockets.reloadMagazines(now + 99);
assert.equal(row.aswmRemainingPort, 0);
rockets.reloadMagazines(now + 100);
assert(row.aswmRemainingPort > 0);
assert.deepEqual(delivered.at(-1), { recipient: owner.id, type: "aswmMagazineReloaded", payload: {} });
const count = delivered.length;
rockets.reloadMagazines(now + 100);
combat = false;
artillery.fire(owner.id, row); rockets.fire(owner.id, row);
assert.equal(delivered.length, count);
artillery.clear(); rockets.clear(); mines.clear(); defense.clear();
artillery.clear(); rockets.clear(); mines.clear(); defense.clear();
console.log("headless combat launch/impact timing, feature guard, release ownership and reload events ok");
