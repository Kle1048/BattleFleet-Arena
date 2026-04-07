import assert from "node:assert/strict";
import {
  SHIP_CLASS_CRUISER,
  SHIP_CLASS_DESTROYER,
  SHIP_CLASS_FAC,
  getShipClassProfile,
  normalizeShipClassId,
  shipClassBaseMaxHp,
} from "./shipClass";
import { ARTILLERY_ARC_HALF_ANGLE_RAD, ARTILLERY_PLAYER_MAX_HP } from "./artillery";
import { DESTROYER_BASE_SPEED_KN, DESTROYER_LIKE_MVP, SPEED_FEEL_FACTOR } from "./shipMovement";

assert.equal(normalizeShipClassId(undefined), SHIP_CLASS_DESTROYER);
assert.equal(normalizeShipClassId("fac"), SHIP_CLASS_FAC);
assert.equal(normalizeShipClassId("CRUISER"), SHIP_CLASS_CRUISER);

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

console.log("shipClass tests ok");
