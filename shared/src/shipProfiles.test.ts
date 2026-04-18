import assert from "node:assert/strict";
import { SHIP_CLASS_FAC } from "./shipClass";
import { ASWM_MAGIC_RELOAD_MS } from "./aswm";
import { SHIP_CLASS_DESTROYER, SHIP_CLASS_CRUISER } from "./shipClass";
import {
  getAswmMagazineFromProfile,
  getAswmMagicReloadMsFromProfile,
  getAuthoritativeShipHullProfile,
  getShipHullProfileByClass,
  mergeShipHullVisualProfile,
  SHIP_HULL_PROFILE_BY_CLASS,
} from "./shipProfiles";

const base = SHIP_HULL_PROFILE_BY_CLASS[SHIP_CLASS_FAC];

assert.strictEqual(getAuthoritativeShipHullProfile(SHIP_CLASS_FAC), getShipHullProfileByClass(SHIP_CLASS_FAC));

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

{
  const m = getAswmMagazineFromProfile(base, SHIP_CLASS_FAC);
  assert.equal(m.port + m.starboard, 4);
  assert.equal(m.port, 2);
  assert.equal(m.starboard, 2);
}

{
  const fac = SHIP_HULL_PROFILE_BY_CLASS[SHIP_CLASS_FAC];
  assert.equal(getAswmMagicReloadMsFromProfile(fac), 20_000);
  const dd = SHIP_HULL_PROFILE_BY_CLASS[SHIP_CLASS_DESTROYER];
  const magDd = getAswmMagazineFromProfile(dd, SHIP_CLASS_DESTROYER);
  assert.equal(magDd.port, 4);
  assert.equal(magDd.starboard, 4);
  assert.equal(getAswmMagicReloadMsFromProfile(dd), 30_000);
  const cg = SHIP_HULL_PROFILE_BY_CLASS[SHIP_CLASS_CRUISER];
  const magCg = getAswmMagazineFromProfile(cg, SHIP_CLASS_CRUISER);
  assert.equal(magCg.port, 8);
  assert.equal(magCg.starboard, 8);
  assert.equal(getAswmMagicReloadMsFromProfile(cg), 40_000);
  assert.equal(getAswmMagicReloadMsFromProfile(undefined), ASWM_MAGIC_RELOAD_MS);
}

console.log("shipProfiles merge tests ok");
