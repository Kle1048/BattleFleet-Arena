/**
 * Radar: **Nordgebunden** (+Welt-Z = Nord oben, +X = Ost rechts; SVG-y nach unten → `ny` negiert).
 * Legacy: `radarBlipNormalized` = schiffsgebunden (Bug oben) — nur noch für Tests/Referenz.
 */

/** Anzeige-Radius in Welt-Einheiten (Server XZ) — aktives Suchrad / Blips. */
export const RADAR_RANGE_WORLD = 600;

/** SVG-Skalierung für Plan-Radar-Blips/Linien (viewBox ±52; Kreis ~r47). */
export const RADAR_PLAN_SVG_BLIP_RADIUS = 46;

/** Mittelring des Plan-Radars (`cockpit-radar-ring-mid`, SVG r≈24) — Referenz für SSM-Rail-Ticks. */
export const RADAR_PLAN_SVG_MID_RING_RADIUS = 24;

/** SSM-Rail-Tick: Standardlänge knapp über den Mittelring hinaus (SVG-Pixel ab Mitte). */
const RADAR_SSM_RAIL_TICK_LEN_PX_DEFAULT =
  RADAR_PLAN_SVG_MID_RING_RADIUS * 1.38;

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
 * Wie `radarBlipNormalizedNorthUp`, aber Ziele **außerhalb** `range` erscheinen **am Rand**
 * in Peilrichtung (Einheitsvektor), damit z. B. feste Welt-Portale immer sichtbar sind.
 */
export function radarBlipNormalizedNorthUpClampedToRim(
  myX: number,
  myZ: number,
  otherX: number,
  otherZ: number,
  range: number = RADAR_RANGE_WORLD,
): RadarBlipNorm | null {
  const dx = otherX - myX;
  const dz = otherZ - myZ;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return null;
  if (dist <= range) {
    return { nx: dx / range, ny: -dz / range };
  }
  const ux = dx / dist;
  const uz = dz / dist;
  return { nx: ux, ny: -uz };
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

/**
 * Einheitsvektor in Welt-XZ entlang der festen SSM-Rail (Schiffslokal: +Z Bug, +X Steuerbord),
 * `launchYawRadFromBow` wie `FixedSeaSkimmerLauncherSpec` / `launcherYawRadFromBow`.
 */
export function ssmRailWorldDirectionFromBow(
  headingRad: number,
  launchYawRadFromBow: number,
): { ux: number; uz: number } {
  const lx = Math.sin(launchYawRadFromBow);
  const lz = Math.cos(launchYawRadFromBow);
  const c = Math.cos(headingRad);
  const s = Math.sin(headingRad);
  const ux = lx * c + lz * s;
  const uz = -lx * s + lz * c;
  const d = Math.hypot(ux, uz);
  if (d < 1e-8) return { ux: 0, uz: 1 };
  return { ux: ux / d, uz: uz / d };
}

/**
 * Tick-Linie auf dem **Nord-oben**-Plan-Radar (SVG: +y = Bild „oben“ = −Welt-Z).
 * Standardlänge: über den Mittelring (`RADAR_PLAN_SVG_MID_RING_RADIUS`) hinaus.
 */
export function cockpitSsmRailTickLineNorthUp(
  headingRad: number,
  launchYawRadFromBow: number,
  options?: { rimPx?: number; lengthFrac?: number; lengthPx?: number },
): { x1: number; y1: number; x2: number; y2: number } {
  const rimPx = options?.rimPx ?? RADAR_PLAN_SVG_BLIP_RADIUS;
  const lenPxOpt = options?.lengthPx;
  const len =
    typeof lenPxOpt === "number" && Number.isFinite(lenPxOpt) && lenPxOpt > 0
      ? lenPxOpt
      : options?.lengthFrac != null
        ? rimPx * options.lengthFrac
        : RADAR_SSM_RAIL_TICK_LEN_PX_DEFAULT;
  const { ux, uz } = ssmRailWorldDirectionFromBow(headingRad, launchYawRadFromBow);
  return { x1: 0, y1: 0, x2: ux * len, y2: -uz * len };
}
