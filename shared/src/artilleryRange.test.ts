import assert from "node:assert/strict";
import { ARTILLERY_RANGE, clampedLandPoint, tryComputeArtillerySalvo } from "./artillery";

{
  const land = clampedLandPoint(0, 0, 50, 0, 0, ARTILLERY_RANGE);
  assert.equal(Math.round(land.dist), 50);
  assert.equal(Math.round(land.x), 50);
  assert.equal(Math.round(land.z), 0);
}

{
  const land = clampedLandPoint(0, 0, 999, 0, 0, ARTILLERY_RANGE);
  assert.equal(Math.round(land.dist), ARTILLERY_RANGE);
  assert.equal(Math.round(land.x), ARTILLERY_RANGE);
  assert.equal(Math.round(land.z), 0);
}

{
  const salvo = tryComputeArtillerySalvo(0, 0, 0, 0, 200, () => 0.5);
  assert.equal(salvo.ok, true);
  if (salvo.ok) {
    const dist = Math.hypot(salvo.landX, salvo.landZ);
    assert.equal(Math.round(dist), 200);
  }
}

console.log("artilleryRange tests ok");
