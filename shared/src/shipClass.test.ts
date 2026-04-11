import assert from "node:assert/strict";
import {
  SHIP_CLASS_CRUISER,
  SHIP_CLASS_DESTROYER,
  SHIP_CLASS_FAC,
  getShipClassProfile,
  normalizeShipClassId,
  shipClassBaseMaxHp,
  shipClassIdForProgressionLevel,
} from "./shipClass";
import { SHIP_HULL_PROFILE_BY_CLASS, getShipHullProfileByClass } from "./shipProfiles";
import { ARTILLERY_ARC_HALF_ANGLE_RAD, ARTILLERY_PLAYER_MAX_HP } from "./artillery";
import { DESTROYER_BASE_SPEED_KN, DESTROYER_LIKE_MVP, SPEED_FEEL_FACTOR } from "./shipMovement";

assert.equal(normalizeShipClassId(undefined), SHIP_CLASS_FAC);
assert.equal(normalizeShipClassId("fac"), SHIP_CLASS_FAC);
assert.equal(normalizeShipClassId("CRUISER"), SHIP_CLASS_CRUISER);

assert.equal(shipClassIdForProgressionLevel(1), SHIP_CLASS_FAC);
assert.equal(shipClassIdForProgressionLevel(4), SHIP_CLASS_FAC);
assert.equal(shipClassIdForProgressionLevel(5), SHIP_CLASS_DESTROYER);
assert.equal(shipClassIdForProgressionLevel(6), SHIP_CLASS_DESTROYER);
assert.equal(shipClassIdForProgressionLevel(7), SHIP_CLASS_CRUISER);
assert.equal(shipClassIdForProgressionLevel(10), SHIP_CLASS_CRUISER);

const fac = getShipClassProfile(SHIP_CLASS_FAC);
const dd = getShipClassProfile(SHIP_CLASS_DESTROYER);
const cg = getShipClassProfile(SHIP_CLASS_CRUISER);

assert.ok(fac.baseMaxHp < ARTILLERY_PLAYER_MAX_HP);
assert.ok(shipClassBaseMaxHp(SHIP_CLASS_CRUISER) > ARTILLERY_PLAYER_MAX_HP);
assert.equal(fac.artilleryArcHalfAngleRad, ARTILLERY_ARC_HALF_ANGLE_RAD);
assert.equal(dd.artilleryArcHalfAngleRad, ARTILLERY_ARC_HALF_ANGLE_RAD);
assert.equal(cg.artilleryArcHalfAngleRad, ARTILLERY_ARC_HALF_ANGLE_RAD);

assert.equal(DESTROYER_BASE_SPEED_KN, 26);
assert.equal(DESTROYER_LIKE_MVP.maxSpeed, DESTROYER_BASE_SPEED_KN * SPEED_FEEL_FACTOR);
assert.equal((DESTROYER_LIKE_MVP.maxSpeed * fac.movementSpeedMul) / SPEED_FEEL_FACTOR, 40);
assert.equal((DESTROYER_LIKE_MVP.maxSpeed * dd.movementSpeedMul) / SPEED_FEEL_FACTOR, 26);
assert.equal((DESTROYER_LIKE_MVP.maxSpeed * cg.movementSpeedMul) / SPEED_FEEL_FACTOR, 22);

for (const id of [SHIP_CLASS_FAC, SHIP_CLASS_DESTROYER, SHIP_CLASS_CRUISER] as const) {
  const sc = getShipClassProfile(id);
  const hull = getShipHullProfileByClass(id)!;
  assert.equal(hull.shipClassId, id);
  assert.equal(hull.movement.movementSpeedMul, sc.movementSpeedMul);
  assert.equal(hull.movement.turnRateMul, sc.turnRateMul);
  assert.equal(hull.movement.accelMul, sc.accelMul);
  assert.ok(hull.mountSlots.length >= 1);
  assert.ok(Object.keys(hull.defaultLoadout ?? {}).length >= 1);
}

assert.ok(SHIP_HULL_PROFILE_BY_CLASS[SHIP_CLASS_DESTROYER].fixedSeaSkimmerLaunchers?.length);
assert.equal(SHIP_HULL_PROFILE_BY_CLASS[SHIP_CLASS_FAC].fixedSeaSkimmerLaunchers?.length, 2);

console.log("shipClass tests ok");
