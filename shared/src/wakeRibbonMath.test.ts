import assert from "node:assert/strict";
import {
  WAKE_RIBBON_REF_HALF_BEAM_X,
  WAKE_RIBBON_TUNED_BASE_HALF_WIDTH,
  normalizeXZ,
  spineTangentXZ,
  wakeRibbonBaseHalfWidthFromHitboxHalfBeamX,
  wakeRibbonSternLocalZFromHitbox,
  wakeRibbonSternLocalZOrFallback,
  xzPerpendicularFromTangent,
} from "./wakeRibbonMath.ts";

assert.deepEqual(normalizeXZ(3, 4), { x: 0.6, z: 0.8 });

const p = xzPerpendicularFromTangent(1, 0);
assert.ok(Math.abs(p.x - 0) < 1e-9 && Math.abs(p.z - 1) < 1e-9);

const pts = [
  { x: 0, z: 0 },
  { x: 0, z: 10 },
  { x: 10, z: 10 },
];
const tMid = spineTangentXZ(pts, 1);
assert.ok(tMid.x > 0.6 && tMid.z > 0.6);

const t0 = spineTangentXZ(pts, 0);
assert.ok(Math.abs(t0.x) < 1e-9 && t0.z > 0.99);

assert.equal(WAKE_RIBBON_REF_HALF_BEAM_X, 4);
assert.equal(
  wakeRibbonBaseHalfWidthFromHitboxHalfBeamX(4),
  WAKE_RIBBON_TUNED_BASE_HALF_WIDTH,
);
assert.ok(Math.abs(wakeRibbonBaseHalfWidthFromHitboxHalfBeamX(6) - 6.9) < 1e-9);
assert.ok(Math.abs(wakeRibbonBaseHalfWidthFromHitboxHalfBeamX(8.5) - 9.775) < 1e-9);
assert.equal(wakeRibbonBaseHalfWidthFromHitboxHalfBeamX(NaN), WAKE_RIBBON_TUNED_BASE_HALF_WIDTH);

assert.equal(
  wakeRibbonSternLocalZFromHitbox({ center: { z: 0 }, halfExtents: { z: 30 } }),
  -30,
);
assert.equal(
  wakeRibbonSternLocalZFromHitbox({ center: { z: 2 }, halfExtents: { z: 10 } }),
  -8,
);
assert.equal(wakeRibbonSternLocalZFromHitbox(undefined), null);
assert.equal(wakeRibbonSternLocalZOrFallback(undefined, -22), -22);
assert.equal(
  wakeRibbonSternLocalZOrFallback({ center: { z: 0 }, halfExtents: { z: 60 } }, -22),
  -60,
);

console.log("wakeRibbonMath tests ok");
