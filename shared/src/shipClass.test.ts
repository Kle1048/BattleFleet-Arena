import assert from "node:assert/strict";
import {
  SHIP_CLASS_CRUISER,
  SHIP_CLASS_DESTROYER,
  SHIP_CLASS_FAC,
  getShipClassProfile,
  normalizeShipClassId,
  shipClassBaseMaxHp,
} from "./shipClass";
import { ARTILLERY_PLAYER_MAX_HP } from "./artillery";

assert.equal(normalizeShipClassId(undefined), SHIP_CLASS_DESTROYER);
assert.equal(normalizeShipClassId("fac"), SHIP_CLASS_FAC);
assert.equal(normalizeShipClassId("CRUISER"), SHIP_CLASS_CRUISER);

const fac = getShipClassProfile(SHIP_CLASS_FAC);
assert.ok(fac.baseMaxHp < ARTILLERY_PLAYER_MAX_HP);
assert.ok(fac.artilleryArcHalfAngleRad > 0);
assert.ok(shipClassBaseMaxHp(SHIP_CLASS_CRUISER) > ARTILLERY_PLAYER_MAX_HP);

console.log("shipClass tests ok");
