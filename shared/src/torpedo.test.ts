import assert from "node:assert/strict";
import { spawnTorpedoFromFireDirection, stepTorpedoStraight } from "./torpedo";

{
  const p = spawnTorpedoFromFireDirection(55, 55, 155, 55, 0);
  assert.ok(p.x > 80 && Math.abs(p.z - 55) < 2);
}

{
  const p = spawnTorpedoFromFireDirection(0, 0, 0, 0, 1.2);
  assert.ok(Math.abs(p.headingRad - 1.2) < 0.01);
}

{
  const s = stepTorpedoStraight(0, 0, 0, 0.1);
  assert.ok(s.z > 5 && Math.abs(s.x) < 1e-5);
}

{
  const s = stepTorpedoStraight(0, 0, Math.PI / 2, 0.2);
  assert.ok(s.x > 11 && Math.abs(s.z) < 1e-5);
}

console.log("torpedo tests ok");
