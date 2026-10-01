import assert from "node:assert/strict";
import {
  RADAR_ESM_RANGE_WORLD,
  RADAR_PLAN_SVG_BLIP_RADIUS,
  RADAR_RANGE_WORLD,
  cockpitSsmRailTickLineNorthUp,
  esmLineTowardBlip,
  radarBlipNormalized,
  radarBlipNormalizedNorthUp,
  radarMapCenterMarkerOffsetNorthUp,
  ssmRailWorldDirectionFromBow,
} from "./radarHudMath";

{
  // Kurs 0: Bug +Z — Ziel direkt voraus
  const a = radarBlipNormalized(0, 0, 0, 0, 400, RADAR_RANGE_WORLD);
  assert.ok(a);
  assert.ok(Math.abs(a!.nx) < 0.02);
  assert.ok(Math.abs(a!.ny + 400 / RADAR_RANGE_WORLD) < 1e-9);
}

{
  // Steuerbord (+X): rechts auf dem Radar
  const b = radarBlipNormalized(0, 0, 0, 300, 0, RADAR_RANGE_WORLD);
  assert.ok(b);
  assert.ok(Math.abs(b!.nx - 300 / RADAR_RANGE_WORLD) < 1e-9);
  assert.ok(Math.abs(b!.ny) < 0.02);
}

{
  // Außerhalb Reichweite
  const c = radarBlipNormalized(0, 0, 0, 0, RADAR_RANGE_WORLD * 2, RADAR_RANGE_WORLD);
  assert.equal(c, null);
}

{
  // Display scale covers cruiser radar; ESM still uses the emitter-dependent range.
  assert.equal(RADAR_RANGE_WORLD,2000);
  assert.equal(RADAR_ESM_RANGE_WORLD,1600);
  assert.ok(radarBlipNormalized(0,0,0,0,1800,RADAR_RANGE_WORLD));
  assert.equal(radarBlipNormalized(0,0,0,0,1800,RADAR_ESM_RANGE_WORLD),null);
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
  assert.ok(Math.abs(n!.ny + 400/RADAR_RANGE_WORLD) < 1e-9);
}

{
  // Ost (+dx) → nx positiv
  const e = radarBlipNormalizedNorthUp(0, 0, 300, 0, RADAR_RANGE_WORLD);
  assert.ok(e);
  assert.ok(Math.abs(e!.nx - 300/RADAR_RANGE_WORLD) < 1e-9);
  assert.ok(Math.abs(e!.ny) < 0.02);
}

{
  // Kartenmitte (0,0) vom Schiff bei (100, -200): West (-nx) und Nord (-ny oben)
  const ctr = radarBlipNormalizedNorthUp(100, -200, 0, 0, RADAR_RANGE_WORLD);
  assert.ok(ctr);
  assert.ok(Math.abs(ctr!.nx + 100/RADAR_RANGE_WORLD) < 1e-9);
  assert.ok(Math.abs(ctr!.ny + 200/RADAR_RANGE_WORLD) < 1e-9);
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
  const far = radarMapCenterMarkerOffsetNorthUp(0, RADAR_RANGE_WORLD * 1.5, scale, RADAR_RANGE_WORLD);
  assert.ok(far);
  assert.ok(Math.abs(far!.mx) < 0.02);
  assert.ok(far!.my > 0);
  assert.ok(Math.abs(Math.hypot(far!.mx, far!.my) - scale) < 0.02);
}

{
  const d = ssmRailWorldDirectionFromBow(0, 0);
  assert.ok(Math.abs(d.ux) < 1e-9);
  assert.ok(Math.abs(d.uz - 1) < 1e-9);
  const tick = cockpitSsmRailTickLineNorthUp(0, 0, { rimPx: RADAR_PLAN_SVG_BLIP_RADIUS });
  const len = Math.hypot(tick.x2 - tick.x1, tick.y2 - tick.y1);
  assert.ok(len > 30 && len < 38);
  assert.ok(tick.y2 < 0);
}

{
  const d = ssmRailWorldDirectionFromBow(0, Math.PI / 2);
  assert.ok(d.ux > 0.99 && d.ux < 1.01);
  assert.ok(Math.abs(d.uz) < 1e-9);
}

console.log("radarHudMath tests ok");
