import type { IslandCircle } from "./islands";
import type { MountFireSector } from "./shipVisualLayout";

/** Task 5 — vereinfachte Artillerie (Plan A: geplanter Einschlag, kein echtes Ballistik-Mesh auf dem Server). */

export const ARTILLERY_PRIMARY_COOLDOWN_MS = 500;

/** Basis-Flugzeit; leicht distanz-abhängig mit Cap (ms). */
export const ARTILLERY_FLIGHT_TIME_BASE_MS = 420;
export const ARTILLERY_FLIGHT_TIME_PER_UNIT_MS = 0.042;
export const ARTILLERY_FLIGHT_TIME_MAX_MS = 600;

export const ARTILLERY_SPLASH_RADIUS = 19;
export const ARTILLERY_DAMAGE = 11;
export const ARTILLERY_PLAYER_MAX_HP = 100;

/** Artillerie-Reichweite: innerhalb frei zielen, darüber auf Max-Range begrenzen. */
export const ARTILLERY_RANGE = 300;
export const ARTILLERY_MIN_RANGE = 0;
export const ARTILLERY_MAX_RANGE = ARTILLERY_RANGE;

/** Halber Feuerbogen relativ zum Bug — **±120°** je Seite ⇒ **240°** Gesamtsektor. */
export const ARTILLERY_ARC_HALF_ANGLE_RAD = (120 * Math.PI) / 180;

/** Zufällige Winkelstreuung ±5° (Radiant). */
export const ARTILLERY_SPREAD_HALF_ANGLE_RAD = (5 * Math.PI) / 180;

/** Zusätzliche Distanz-Streuung ±5% der tatsächlichen Feuerentfernung entlang des gewählten Strahls. */
export const ARTILLERY_SPREAD_DIST_FACTOR = 0.05;

export type ArtilleryFireResult =
  | {
      ok: true;
      landX: number;
      landZ: number;
      flightMs: number;
    }
  | { ok: false; reason: string };

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

/** Öffentlich für Mount-Sektoren / Train-Klampen (Client + Tests). */
export function shortestAngleDelta(fromRad: number, toRad: number): number {
  let d = toRad - fromRad;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function wrapPi(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/**
 * Signed yaw vom Bug (0 = Bug, +π/2 = Steuerbord) zur Zielrichtung Schiff→(tx,tz).
 * Gleiche Konvention wie `isInForwardArc` / `forwardXZ`.
 */
export function aimDirectionYawFromBowRad(
  shipX: number,
  shipZ: number,
  headingRad: number,
  tx: number,
  tz: number,
): number | null {
  const dx = tx - shipX;
  const dz = tz - shipZ;
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return null;
  const ux = dx / len;
  const uz = dz / len;
  const f = forwardXZ(headingRad);
  const cross = ux * f.z - uz * f.x;
  const dot = Math.max(-1, Math.min(1, ux * f.x + uz * f.z));
  return Math.atan2(cross, dot);
}

/** Primitive Sektoren ohne `union`-Hülle — für `isYawWithin` / Zeichnen nach Flachlegen. */
export type PrimitiveMountFireSector = Extract<
  MountFireSector,
  { kind: "symmetric" } | { kind: "asymmetric" }
>;

/**
 * Löst verschachtelte `union`-Knoten auf; leere Unions ergeben `[]`.
 */
export function flattenMountFireSectorUnions(sector: MountFireSector): PrimitiveMountFireSector[] {
  if (sector.kind === "union") {
    const out: PrimitiveMountFireSector[] = [];
    for (const s of sector.sectors) {
      out.push(...flattenMountFireSectorUnions(s));
    }
    return out;
  }
  return [sector];
}

export function isYawWithinMountFireSector(yaw: number, sector: MountFireSector): boolean {
  const y = wrapPi(yaw);
  if (sector.kind === "union") {
    const flat = flattenMountFireSectorUnions(sector);
    return flat.length > 0 && flat.some((s) => isYawWithinMountFireSector(y, s));
  }
  if (sector.kind === "symmetric") {
    const c = sector.centerYawRadFromBow ?? 0;
    return Math.abs(shortestAngleDelta(c, y)) <= sector.halfAngleRadFromBow + 1e-4;
  }
  return isYawInAsymmetricInterval(y, sector.minYawRadFromBow, sector.maxYawRadFromBow);
}

function isYawInAsymmetricInterval(yaw: number, minY: number, maxY: number): boolean {
  const y = wrapPi(yaw);
  const lo = wrapPi(minY);
  const hi = wrapPi(maxY);
  if (lo <= hi) return y >= lo - 1e-4 && y <= hi + 1e-4;
  return y >= lo - 1e-4 || y <= hi + 1e-4;
}

/** Ziel-Richtung (Yaw vom Bug) in den Mount-Sektor klemmen — für Turm-Darstellung. */
export function clampYawToMountSector(yaw: number, sector: MountFireSector): number {
  const y = wrapPi(yaw);
  if (sector.kind === "union") {
    const flat = flattenMountFireSectorUnions(sector);
    if (flat.length === 0) return y;
    for (const s of flat) {
      if (isYawWithinMountFireSector(y, s)) return y;
    }
    let best = clampYawToMountSector(y, flat[0]!);
    let bestD = Math.abs(shortestAngleDelta(y, best));
    for (let i = 1; i < flat.length; i++) {
      const c = clampYawToMountSector(y, flat[i]!);
      const d = Math.abs(shortestAngleDelta(y, c));
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return wrapPi(best);
  }
  if (sector.kind === "symmetric") {
    const c = sector.centerYawRadFromBow ?? 0;
    const h = sector.halfAngleRadFromBow;
    const d = shortestAngleDelta(c, y);
    const dc = clamp(d, -h, h);
    return wrapPi(c + dc);
  }
  return clampYawToAsymmetricInterval(y, sector.minYawRadFromBow, sector.maxYawRadFromBow);
}

function clampYawToAsymmetricInterval(yaw: number, minY: number, maxY: number): number {
  if (isYawInAsymmetricInterval(yaw, minY, maxY)) return wrapPi(yaw);
  const y = wrapPi(yaw);
  const lo = wrapPi(minY);
  const hi = wrapPi(maxY);
  const dLo = Math.abs(shortestAngleDelta(lo, y));
  const dHi = Math.abs(shortestAngleDelta(hi, y));
  return dLo <= dHi ? lo : hi;
}

/** Bug zeigt wie `headingRad` nach +Z, seitliche Komponente = sin(h), vorwärts = cos(h). */
export function forwardXZ(headingRad: number): { x: number; z: number } {
  return { x: Math.sin(headingRad), z: Math.cos(headingRad) };
}

/**
 * Prüft, ob die Richtung Schiff → (tx,tz) innerhalb des vorderen Feuerbogens liegt
 * (Winkel zur Bug-Achse ≤ halfArc).
 */
export function isInForwardArc(
  shipX: number,
  shipZ: number,
  headingRad: number,
  tx: number,
  tz: number,
  halfArcRad: number,
): boolean {
  const dx = tx - shipX;
  const dz = tz - shipZ;
  if (dx * dx + dz * dz < 1e-6) return false;
  const dirX = dx / Math.hypot(dx, dz);
  const dirZ = dz / Math.hypot(dx, dz);
  const f = forwardXZ(headingRad);
  const dot = clamp(dirX * f.x + dirZ * f.z, -1, 1);
  const angle = Math.acos(dot);
  return angle <= halfArcRad + 1e-4;
}

/** Landepunkt: entlang Schiff→Aim, Distanz geklemmt. */
export function clampedLandPoint(
  shipX: number,
  shipZ: number,
  aimX: number,
  aimZ: number,
  minR: number,
  maxR: number,
): { x: number; z: number; dist: number } {
  let dx = aimX - shipX;
  let dz = aimZ - shipZ;
  let dist = Math.hypot(dx, dz);
  if (dist < 1e-6) {
    const f = forwardXZ(0);
    dx = f.x * minR;
    dz = f.z * minR;
    dist = minR;
  }
  dist = clamp(dist, minR, maxR);
  dx /= Math.hypot(aimX - shipX, aimZ - shipZ) || 1;
  dz /= Math.hypot(aimX - shipX, aimZ - shipZ) || 1;
  const hx = aimX - shipX;
  const hz = aimZ - shipZ;
  const hlen = Math.hypot(hx, hz) || 1;
  const ux = hx / hlen;
  const uz = hz / hlen;
  return {
    x: shipX + ux * dist,
    z: shipZ + uz * dist,
    dist,
  };
}

/** Rotiert (vx,vz) um `deltaRad` in der XZ-Ebene (positiv = wie positive Y-Rotation von oben). */
export function rotateXZ(vx: number, vz: number, deltaRad: number): { x: number; z: number } {
  const c = Math.cos(deltaRad);
  const s = Math.sin(deltaRad);
  return { x: vx * c - vz * s, z: vx * s + vz * c };
}

export function pointInAnyIsland(
  x: number,
  z: number,
  islands: readonly IslandCircle[],
): boolean {
  for (const is of islands) {
    const dx = x - is.x;
    const dz = z - is.z;
    if (dx * dx + dz * dz <= is.radius * is.radius) return true;
  }
  return false;
}

/** VFX-Klasse für Client: offenes Wasser, Schiffstreffer, Insel/Ufer. */
export type ArtilleryImpactVisualKind = "water" | "hit" | "island";

/** Abstand über dem Inselradius (noch im Wasser) für braunen Ufer-Splash. */
export const ARTILLERY_ISLAND_SHORE_SPLASH_BEYOND = 55;

/**
 * Server: Priorität **Treffer** > **Insel** (Uferzone oder Punkt in Insel) > **Wasser**.
 */
export function classifyArtilleryImpactVisual(
  landX: number,
  landZ: number,
  damagedAnyEnemy: boolean,
  islands: readonly IslandCircle[],
): ArtilleryImpactVisualKind {
  if (damagedAnyEnemy) return "hit";
  if (pointInAnyIsland(landX, landZ, islands)) return "island";
  for (const is of islands) {
    const d = Math.hypot(landX - is.x, landZ - is.z);
    if (d > is.radius && d <= is.radius + ARTILLERY_ISLAND_SHORE_SPLASH_BEYOND) {
      return "island";
    }
  }
  return "water";
}

/** Strecke A→B schneidet oder liegt innerhalb Kreis-Insel (Abstand Mittelpunkt zur Strecke ≤ r). */
export function segmentHitsIslandCircle(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  r: number,
): boolean {
  const abx = bx - ax;
  const abz = bz - az;
  const acx = cx - ax;
  const acz = cz - az;
  const abLenSq = abx * abx + abz * abz;
  if (abLenSq < 1e-12) {
    const dx = cx - ax;
    const dz = cz - az;
    return dx * dx + dz * dz <= r * r;
  }
  let t = (acx * abx + acz * abz) / abLenSq;
  t = clamp(t, 0, 1);
  const px = ax + t * abx;
  const pz = az + t * abz;
  const dx = cx - px;
  const dz = cz - pz;
  return dx * dx + dz * dz <= r * r;
}

export function lineOfSightBlockedByIslands(
  shipX: number,
  shipZ: number,
  landX: number,
  landZ: number,
  islands: readonly IslandCircle[],
): boolean {
  for (const is of islands) {
    if (segmentHitsIslandCircle(shipX, shipZ, landX, landZ, is.x, is.z, is.radius)) {
      return true;
    }
  }
  return false;
}

export function computeFlightMs(distance: number): number {
  const t =
    ARTILLERY_FLIGHT_TIME_BASE_MS +
    distance * ARTILLERY_FLIGHT_TIME_PER_UNIT_MS;
  return Math.round(clamp(t, ARTILLERY_FLIGHT_TIME_BASE_MS, ARTILLERY_FLIGHT_TIME_MAX_MS));
}

/**
 * Validiert Schuss und liefert Landepunkt + Flugzeit. `rng` = 0…1 für deterministische Tests optional.
 * Optional `originX`/`originZ`: Mündung (Schuss startet auf Strahl Mündung→Ziel); sonst Schiffsmittelpunkt.
 * `fireSector`: horizontaler Sektor relativ zum Bug (`MountFireSector` — symmetrisch mit optionalem Zentrum oder asymmetrisch).
 */
export function tryComputeArtillerySalvo(
  shipX: number,
  shipZ: number,
  headingRad: number,
  aimX: number,
  aimZ: number,
  rng: () => number = Math.random,
  fireSector: MountFireSector = {
    kind: "symmetric",
    halfAngleRadFromBow: ARTILLERY_ARC_HALF_ANGLE_RAD,
  },
  originX?: number,
  originZ?: number,
): ArtilleryFireResult {
  const yawAim = aimDirectionYawFromBowRad(shipX, shipZ, headingRad, aimX, aimZ);
  if (yawAim === null || !isYawWithinMountFireSector(yawAim, fireSector)) {
    return { ok: false, reason: "out_of_arc" };
  }

  const ox = originX ?? shipX;
  const oz = originZ ?? shipZ;

  const base = clampedLandPoint(ox, oz, aimX, aimZ, ARTILLERY_MIN_RANGE, ARTILLERY_MAX_RANGE);
  let vx = base.x - ox;
  let vz = base.z - oz;
  const baseLen = Math.hypot(vx, vz);
  if (baseLen < 1e-6) return { ok: false, reason: "bad_range" };
  vx /= baseLen;
  vz /= baseLen;

  const spreadAngle = (rng() * 2 - 1) * ARTILLERY_SPREAD_HALF_ANGLE_RAD;
  let dir = rotateXZ(vx, vz, spreadAngle);
  const spreadDistMax = baseLen * ARTILLERY_SPREAD_DIST_FACTOR;
  let dist = clamp(
    baseLen + (rng() * 2 - 1) * spreadDistMax,
    ARTILLERY_MIN_RANGE,
    ARTILLERY_MAX_RANGE,
  );

  let landX = ox + dir.x * dist;
  let landZ = oz + dir.z * dist;

  const f = forwardXZ(headingRad);
  const shotYaw = Math.atan2(dir.x * f.z - dir.z * f.x, dir.x * f.x + dir.z * f.z);
  if (!isYawWithinMountFireSector(shotYaw, fireSector)) {
    return { ok: false, reason: "spread_out_of_arc" };
  }

  return {
    ok: true,
    landX,
    landZ,
    flightMs: computeFlightMs(dist),
  };
}
