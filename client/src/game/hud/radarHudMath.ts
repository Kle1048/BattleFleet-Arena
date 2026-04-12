/**
 * Plan-Position relativ zum eigenen Bug: rechts = Steuerbord, vorne = Bug (SVG: y nach unten → -forward).
 */

/** Anzeige-Radius in Welt-Einheiten (Server XZ). */
export const RADAR_RANGE_WORLD = 600;

export type RadarBlipNorm = { nx: number; ny: number };

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
