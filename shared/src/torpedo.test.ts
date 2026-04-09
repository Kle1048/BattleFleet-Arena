import assert from "node:assert/strict";
import { spawnTorpedoFromFireDirection, stepTorpedoStraight } from "./torpedo";

{
  const p = spawnTorpedoFromFireDirection(55, 55, 155, 55, 0);
  assert.ok(p.z < 30 && Math.abs(p.x - 55) < 2);
}

{
  const p = spawnTorpedoFromFireDirection(0, 0, 0, 0, 1.2);
  assert.ok(Math.abs(p.headingRad - 1.2) < 0.01);
}

{
  const s = stepTorpedoStraight(0, 0, 0, 0.1);
  assert.ok(Math.abs(s.z) < 1e-5 && Math.abs(s.x) < 1e-5);
}

{
  const s = stepTorpedoStraight(0, 0, Math.PI / 2, 0.2);
  assert.ok(Math.abs(s.x) < 1e-5 && Math.abs(s.z) < 1e-5);
}

console.log("torpedo tests ok");
