import assert from "node:assert/strict";
import { spawnTorpedoFromFireDirection, stepTorpedoStraight, TORPEDO_SPAWN_FORWARD } from "./torpedo";

{
  /** Mine: Heck entlang Bug (+Z), `TORPEDO_SPAWN_FORWARD` (negativ) von der Schiffsposition. */
  const p = spawnTorpedoFromFireDirection(55, 55, 155, 55, 0);
  assert.ok(Math.abs(p.x - 55) < 1e-6 && Math.abs(p.z - (55 + TORPEDO_SPAWN_FORWARD)) < 1e-6);
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
