import assert from "node:assert/strict";
import { getAuthoritativeShipHullProfile, mountSlotMuzzleWorld, computeSamPdInterceptTravelMs,
  type ShipClassId } from "@battlefleet/shared/rules";
import type { GameEventMap, GameEventSink } from "@battlefleet/shared/protocol";
import { testParticipants } from "../testParticipants.js";
import { ArtillerySystem } from "./ArtillerySystem.js";
import { AirDefenseSystem } from "./AirDefenseSystem.js";

for (const [shipClass, layer, slotId, dz] of [
  ["fac", "pd", "ciws_aft", -150],
  ["destroyer", "ciws", "ciws_fwd", 80],
  ["destroyer", "sam", "sam_aft", -400],
  ["cruiser", "sam", "sam_aft", -400],
] as const) {
  const participants = testParticipants("ship", "enemy");
  const player = participants.players.get("ship")!, row = participants.simulations.get("ship")!;
  player.shipClass = shipClass as ShipClassId;
  player.x = row.ship.x = 100; player.z = row.ship.z = 200;
  const profile = getAuthoritativeShipHullProfile(shipClass)!;
  const shots: GameEventMap["artyFired"][] = [], defenses: GameEventMap["airDefenseFire"][] = [];
  const events: GameEventSink = {
    broadcast(type, payload) {
      if (type === "artyFired") shots.push(payload as GameEventMap["artyFired"]);
      if (type === "airDefenseFire") defenses.push(payload as GameEventMap["airDefenseFire"]);
    }, send() {},
  };
  const env = { nowMs: () => 10000, random: () => .5 };
  const artillery = new ArtillerySystem(participants, { applyDamage() {} }, env, events, () => true, () => {});
  row.aimX = 110; row.aimZ = 400;
  artillery.fire("ship", row);
  assert.equal(shots.length, 1);
  const shot = shots[0]!;
  assert.equal(shot.slotId, "main_fwd");
  const muzzle = mountSlotMuzzleWorld(profile, shot.slotId, 100, 200, 0, { x: row.aimX, z: row.aimZ });
  assert.deepEqual([shot.fromX, shot.fromY, shot.fromZ], [muzzle.x, muzzle.y, muzzle.z]);
  const socket = profile.mountSlots.find(s => s.id === shot.slotId)!.socket.position;
  assert(Math.hypot(shot.fromX - player.x - socket.x, shot.fromZ - player.z - socket.z) > 1,
    "wire starts at barrel end, not the old socket or ship center");
  const defense = new AirDefenseSystem(participants, env, events, () => 3000);
  const missile = { missileId: 1, ownerId: "enemy", targetId: "ship", x: 100, z: 200 + dz,
    headingRad: dz < 0 ? 0 : Math.PI };
  defense.engage(missile, 10000);
  assert.equal(defenses.length, 1, `${shipClass}/${layer}`);
  const fire = defenses[0]!;
  assert.equal(fire.slotId, slotId); assert.equal(fire.layer, layer);
  const origin = mountSlotMuzzleWorld(profile, slotId, 100, 200, 0, missile);
  assert.deepEqual([fire.fromX, fire.fromY, fire.fromZ], [origin.x, origin.y, origin.z]);
  const flight = layer === "ciws" ? 0 : computeSamPdInterceptTravelMs(Math.hypot(missile.x - origin.x, missile.z - origin.z));
  assert.equal(defense["adPendingRollByMissileId"].get(1)!.rollReadyAtMs, 10000 + flight);
}
console.log("Real server fire events identify the occupied mount and generated muzzle; intercept travel starts there");
