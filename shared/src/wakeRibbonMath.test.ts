import assert from "node:assert/strict";
import {
  normalizeXZ,
  spineTangentXZ,
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

console.log("wakeRibbonMath tests ok");
