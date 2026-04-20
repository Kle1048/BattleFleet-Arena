/**
 * Radar: **Nordgebunden** (+Welt-Z = Nord oben, +X = Ost rechts; SVG-y nach unten → `ny` negiert).
 * Legacy: `radarBlipNormalized` = schiffsgebunden (Bug oben) — nur noch für Tests/Referenz.
 */

/** Anzeige-Radius in Welt-Einheiten (Server XZ) — aktives Suchrad / Blips. */
export const RADAR_RANGE_WORLD = 600;

/**
 * Passive ESM — **Basis** für FAC (×1): Peilung bei eingeschaltetem Gegner-Radar.
 * Zerstörer ×1,5, Kreuzer ×2 — siehe `@battlefleet/shared` `esmDetectionRangeMul`.
 */
export const RADAR_ESM_RANGE_WORLD = RADAR_RANGE_WORLD * 2;

export type RadarBlipNorm = { nx: number; ny: number };

/**
 * Nord-up: Zielposition relativ zum eigenen Schiff in Weltkoordinaten.
 * `ny` negativ = Nord (+Z) zeigt auf dem Display nach oben.
 */
export function radarBlipNormalizedNorthUp(
  myX: number,
  myZ: number,
  otherX: number,
  otherZ: number,
  range: number = RADAR_RANGE_WORLD,
): RadarBlipNorm | null {
  const dx = otherX - myX;
  const dz = otherZ - myZ;
  const dist = Math.hypot(dx, dz);
  if (dist > range) return null;
  return { nx: dx / range, ny: -dz / range };
}

/**
 * Kartenmitte (0,0) auf dem Nord-Radar: innerhalb `range` wie Blip; sonst **am Rand**
 * in Richtung (0,0) (gleiche Skalierung wie Blips: `rimScale` ≈ Anzeigeradius).
 */
export function radarMapCenterMarkerOffsetNorthUp(
  myX: number,
  myZ: number,
  rimScale: number,
  range: number = RADAR_RANGE_WORLD,
): { mx: number; my: number } | null {
  const dx = -myX;
  const dz = -myZ;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-8) return null;
  if (dist <= range) {
    return { mx: (dx / range) * rimScale, my: (-dz / range) * rimScale };
  }
  const ux = dx / dist;
  const uy = -dz / dist;
  return { mx: ux * rimScale, my: uy * rimScale };
}

/** Normiert auf [-1, 1] im Kreis; ny zeigt nach „oben“ auf dem Display wenn vorwärts = Bug. */
export function radarBlipNormalized(
  myX: number,
  myZ: number,
  headingRad: number,
  otherX: number,
  otherZ: number,
  range: number = RADAR_RANGE_WORLD,
): RadarBlipNorm | null {
  const dx = otherX - myX;
  const dz = otherZ - myZ;
  const c = Math.cos(headingRad);
  const s = Math.sin(headingRad);
  const right = dx * c - dz * s;
  const forward = dx * s + dz * c;
  const dist = Math.hypot(right, forward);
  if (dist > range) return null;
  return { nx: right / range, ny: -forward / range };
}

/** ESM: Linie von Mitte zum Rand in Richtung eines Peilers (normiertes Blip). */
export const RADAR_ESM_RIM_RADIUS = 47;

export function esmLineTowardBlip(
  b: RadarBlipNorm,
  rimRadius: number = RADAR_ESM_RIM_RADIUS,
): { x1: number; y1: number; x2: number; y2: number } {
  const d = Math.hypot(b.nx, b.ny);
  if (d < 1e-8) return { x1: 0, y1: 0, x2: 0, y2: 0 };
  const ux = b.nx / d;
  const uy = b.ny / d;
  return { x1: 0, y1: 0, x2: ux * rimRadius, y2: uy * rimRadius };
}
