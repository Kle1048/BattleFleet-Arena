import assert from "node:assert/strict";
import {
  RADAR_ESM_RANGE_WORLD,
  RADAR_RANGE_WORLD,
  esmLineTowardBlip,
  radarBlipNormalized,
  radarBlipNormalizedNorthUp,
  radarMapCenterMarkerOffsetNorthUp,
} from "./radarHudMath";

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
  // ESM-Reichweite = 2× Suchrad: zwischen 600 m und 1200 m nur mit ESM-Range
  const at900 = RADAR_RANGE_WORLD * 1.5;
  assert.equal(radarBlipNormalized(0, 0, 0, 0, at900, RADAR_RANGE_WORLD), null);
  assert.ok(radarBlipNormalized(0, 0, 0, 0, at900, RADAR_ESM_RANGE_WORLD));
  assert.equal(RADAR_ESM_RANGE_WORLD, RADAR_RANGE_WORLD * 2);
}

{
  const line = esmLineTowardBlip({ nx: 0, ny: -0.5 }, 10);
  assert.ok(Math.abs(line.x2) < 0.01 && line.y2 < 0);
  assert.ok(Math.abs(line.y2) > 9);
}

{
  // Nord-up: Ziel nördlich (+dz) → ny negativ (oben)
  const n = radarBlipNormalizedNorthUp(0, 0, 0, 400, RADAR_RANGE_WORLD);
  assert.ok(n);
  assert.ok(Math.abs(n!.nx) < 0.02);
  assert.ok(n!.ny < -0.62 && n!.ny > -0.72);
}

{
  // Ost (+dx) → nx positiv
  const e = radarBlipNormalizedNorthUp(0, 0, 300, 0, RADAR_RANGE_WORLD);
  assert.ok(e);
  assert.ok(e!.nx > 0.45);
  assert.ok(Math.abs(e!.ny) < 0.02);
}

{
  // Kartenmitte (0,0) vom Schiff bei (100, -200): West (-nx) und Nord (-ny oben)
  const ctr = radarBlipNormalizedNorthUp(100, -200, 0, 0, RADAR_RANGE_WORLD);
  assert.ok(ctr);
  assert.ok(ctr!.nx < -0.14 && ctr!.nx > -0.18);
  assert.ok(ctr!.ny < -0.3 && ctr!.ny > -0.36);
}

{
  // Bei heading 0 entspricht Nord-up dem Legacy-Blip für gleiche Weltpunkte
  const legacy = radarBlipNormalized(0, 0, 0, 300, 0, RADAR_RANGE_WORLD);
  const north = radarBlipNormalizedNorthUp(0, 0, 300, 0, RADAR_RANGE_WORLD);
  assert.ok(legacy && north);
  assert.ok(Math.abs(legacy!.nx - north!.nx) < 1e-9);
  assert.ok(Math.abs(legacy!.ny - north!.ny) < 1e-9);
}

{
  const scale = 46;
  // Innerhalb Reichweite: wie Blip × scale
  const inner = radarMapCenterMarkerOffsetNorthUp(100, -200, scale, RADAR_RANGE_WORLD);
  const blip = radarBlipNormalizedNorthUp(100, -200, 0, 0, RADAR_RANGE_WORLD);
  assert.ok(inner && blip);
  assert.ok(Math.abs(inner!.mx - blip!.nx * scale) < 1e-9);
  assert.ok(Math.abs(inner!.my - blip!.ny * scale) < 1e-9);
}

{
  const scale = 46;
  // Außerhalb Reichweite: Einheitsrichtung × scale (hier fast nur Nord)
  const far = radarMapCenterMarkerOffsetNorthUp(0, 900, scale, RADAR_RANGE_WORLD);
  assert.ok(far);
  assert.ok(Math.abs(far!.mx) < 0.02);
  assert.ok(far!.my > 0);
  assert.ok(Math.abs(Math.hypot(far!.mx, far!.my) - scale) < 0.02);
}

console.log("radarHudMath tests ok");
