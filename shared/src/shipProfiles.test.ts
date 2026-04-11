import assert from "node:assert/strict";
import { SHIP_CLASS_FAC } from "./shipClass";
import { mergeShipHullVisualProfile, SHIP_HULL_PROFILE_BY_CLASS } from "./shipProfiles";

const base = SHIP_HULL_PROFILE_BY_CLASS[SHIP_CLASS_FAC];

const merged = mergeShipHullVisualProfile(base, {
  hullVisualScale: 1.5,
  movement: { movementSpeedMul: 2 },
  collisionHitbox: {
    center: { x: 0, y: 1, z: 0 },
    halfExtents: { x: 3, y: 2, z: 10 },
  },
});

assert.equal(merged.hullVisualScale, 1.5);
assert.equal(merged.movement?.movementSpeedMul, 2);
assert.equal(merged.movement?.turnRateMul, base.movement?.turnRateMul);
assert.equal(merged.collisionHitbox?.halfExtents.z, 10);
assert.equal(merged.profileId, base.profileId);

console.log("shipProfiles merge tests ok");
