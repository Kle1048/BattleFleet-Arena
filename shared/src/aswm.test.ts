import assert from "node:assert/strict";
import { PlayerLifeState } from "./playerLife";
import {
  ASWM_ACQUIRE_HALF_ANGLE_RAD,
  pickAswmAcquisitionTarget,
  spawnAswmFromFireDirection,
  stepAswmMissile,
} from "./aswm";

{
  const t = pickAswmAcquisitionTarget(0, 0, 0, "a", [
    { id: "b", x: 0, z: 100, lifeState: PlayerLifeState.Alive },
  ]);
  assert.equal(t, "b");
}

{
  const t = pickAswmAcquisitionTarget(0, 0, 0, "a", [
    { id: "b", x: 300, z: 0, lifeState: PlayerLifeState.Alive },
  ]);
  assert.equal(t, null);
}

{
  const ang = 25 * (Math.PI / 180);
  const d = 180;
  const t = pickAswmAcquisitionTarget(0, 0, 0, "a", [
    {
      id: "b",
      x: Math.sin(ang) * d,
      z: Math.cos(ang) * d,
      lifeState: PlayerLifeState.Alive,
    },
  ]);
  assert.equal(t, "b");
}

{
  const ang = 40 * (Math.PI / 180);
  const d = 180;
  const t = pickAswmAcquisitionTarget(0, 0, 0, "a", [
    {
      id: "b",
      x: Math.sin(ang) * d,
      z: Math.cos(ang) * d,
      lifeState: PlayerLifeState.Alive,
    },
  ]);
  assert.equal(t, null);
}

{
  const t = pickAswmAcquisitionTarget(0, 0, 0, "a", [
    { id: "b", x: 0, z: 250, lifeState: PlayerLifeState.Alive },
  ]);
  assert.equal(t, null);
}

assert.ok(ASWM_ACQUIRE_HALF_ANGLE_RAD > 0.5 && ASWM_ACQUIRE_HALF_ANGLE_RAD < 0.55);

{
  const p = spawnAswmFromFireDirection(0, 0, 0, 100, 0);
  assert.ok(p.z > 15 && Math.abs(p.x) < 1e-5);
}

{
  const p = spawnAswmFromFireDirection(0, 0, 100, 0, 0);
  assert.ok(p.x > 15 && Math.abs(p.z) < 1);
}

{
  let x = 0;
  let z = 0;
  let headingRad = 0;
  for (let i = 0; i < 5; i++) {
    const s = stepAswmMissile(x, z, headingRad, 0.1, 100, 0);
    x = s.x;
    z = s.z;
    headingRad = s.headingRad;
  }
  assert.ok(x > 1);
}

console.log("aswm tests ok");
