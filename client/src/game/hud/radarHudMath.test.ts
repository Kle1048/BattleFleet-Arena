import assert from "node:assert/strict";
import { RADAR_RANGE_WORLD, esmLineTowardBlip, radarBlipNormalized } from "./radarHudMath";

{
  // Kurs 0: Bug +Z — Ziel direkt voraus
  const a = radarBlipNormalized(0, 0, 0, 0, 400, RADAR_RANGE_WORLD);
  assert.ok(a);
  assert.ok(Math.abs(a!.nx) < 0.02);
  assert.ok(a!.ny < -0.62 && a!.ny > -0.72);
}

{
  // Steuerbord (+X): rechts auf dem Radar
  const b = radarBlipNormalized(0, 0, 0, 300, 0, RADAR_RANGE_WORLD);
  assert.ok(b);
  assert.ok(b!.nx > 0.45);
  assert.ok(Math.abs(b!.ny) < 0.02);
}

{
  // Außerhalb Reichweite
  const c = radarBlipNormalized(0, 0, 0, 0, RADAR_RANGE_WORLD * 2, RADAR_RANGE_WORLD);
  assert.equal(c, null);
}

{
  const line = esmLineTowardBlip({ nx: 0, ny: -0.5 }, 10);
  assert.ok(Math.abs(line.x2) < 0.01 && line.y2 < 0);
  assert.ok(Math.abs(line.y2) > 9);
}

console.log("radarHudMath tests ok");
