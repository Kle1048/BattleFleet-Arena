import { pointInAnyIsland } from "./artillery";
import type { IslandPolygon } from "./islandPolygonGeometry";
import { minDistSqPointToPolygonBoundary, pointInConvexPolygon } from "./islandPolygonGeometry";
import { SHIP_ISLAND_COLLISION_RADIUS } from "./islands";
import { isInsideOperationalArea } from "./mapBounds";
import { isInSeaControlZone } from "./seaControl";

export const RESPAWN_PICK_ATTEMPTS = 96;
/** Breite des Spawn-Rings am AO-Rand (von außen nach innen). */
export const RESPAWN_RIM_THICKNESS = 220;
export const RESPAWN_AO_EDGE_INSET = 95;

function pointAwayFromIslands(
  x: number,
  z: number,
  islands: readonly IslandPolygon[],
  margin: number,
): boolean {
  for (const is of islands) {
    if (pointInConvexPolygon(x, z, is.verts)) return false;
    const d = Math.sqrt(minDistSqPointToPolygonBoundary(x, z, is.verts));
    if (d <= margin) return false;
  }
  return true;
}

function validateRimCandidate(
  x: number,
  z: number,
  halfExtent: number,
  islands: readonly IslandPolygon[],
  others: ReadonlyArray<{ x: number; z: number }>,
  minSepSq: number,
  islandMargin: number,
): boolean {
  if (!isInsideOperationalArea(x, z, halfExtent)) return false;
  if (isInSeaControlZone(x, z)) return false;
  if (pointInAnyIsland(x, z, islands)) return false;
  if (!pointAwayFromIslands(x, z, islands, islandMargin)) return false;
  for (const o of others) {
    const dx = x - o.x;
    const dz = z - o.z;
    if (dx * dx + dz * dz < minSepSq) return false;
  }
  return true;
}

/**
 * Sucht Spawn auf dem **äußeren Ring** des AO (Rand der Karte), nicht in der Sea-Control-Zone,
 * frei von Inseln, mit Mindestabstand zu `others`.
 * Bei Miss: `null` — Aufrufer kann `pickRimSpawnDeterministic` nutzen.
 */
export function tryPickRespawnPosition(
  halfExtent: number,
  islands: readonly IslandPolygon[],
  others: ReadonlyArray<{ x: number; z: number }>,
  minSeparation: number,
  rng: () => number,
): { x: number; z: number; headingRad: number } | null {
  const outerR = halfExtent - RESPAWN_AO_EDGE_INSET;
  const innerR = Math.max(outerR - RESPAWN_RIM_THICKNESS, 0);
  const minSepSq = minSeparation * minSeparation;
  const islandMargin = SHIP_ISLAND_COLLISION_RADIUS + 6;

  for (let i = 0; i < RESPAWN_PICK_ATTEMPTS; i++) {
    const t = rng() * Math.PI * 2;
    const r = innerR + rng() * Math.max(1, outerR - innerR);
    const x = Math.cos(t) * r;
    const z = Math.sin(t) * r;

    if (!validateRimCandidate(x, z, halfExtent, islands, others, minSepSq, islandMargin)) {
      continue;
    }

    const headingRad = Math.atan2(-x, -z);
    return { x, z, headingRad };
  }
  return null;
}

const RIM_FALLBACK_ANGLE_STEPS = 128;
const RIM_FALLBACK_R_STEPS = [0, 40, 80, 120, 160];

/**
 * Deterministischer Rand-Spawn (Vollrotation ab `angleSeed`), wenn Zufallssuche fehlschlägt.
 * Nutzt denselben Ring wie `tryPickRespawnPosition`; im Notfall nur noch Insel-/AO-Checks.
 */
export function pickRimSpawnDeterministic(
  halfExtent: number,
  islands: readonly IslandPolygon[],
  others: ReadonlyArray<{ x: number; z: number }>,
  minSeparation: number,
  angleSeed: number,
): { x: number; z: number; headingRad: number } {
  const outerR = halfExtent - RESPAWN_AO_EDGE_INSET;
  const innerR = Math.max(outerR - RESPAWN_RIM_THICKNESS, 0);
  const minSepSq = minSeparation * minSeparation;
  const islandMargin = SHIP_ISLAND_COLLISION_RADIUS + 6;

  for (let s = 0; s < RIM_FALLBACK_ANGLE_STEPS; s++) {
    const t = angleSeed + (s / RIM_FALLBACK_ANGLE_STEPS) * Math.PI * 2;
    for (const dr of RIM_FALLBACK_R_STEPS) {
      const r = Math.max(innerR, outerR - dr);
      const x = Math.cos(t) * r;
      const z = Math.sin(t) * r;
      if (!validateRimCandidate(x, z, halfExtent, islands, others, minSepSq, islandMargin)) {
        continue;
      }
      return { x, z, headingRad: Math.atan2(-x, -z) };
    }
  }

  for (let s = 0; s < RIM_FALLBACK_ANGLE_STEPS; s++) {
    const t = angleSeed + (s / RIM_FALLBACK_ANGLE_STEPS) * Math.PI * 2;
    const r = outerR;
    const x = Math.cos(t) * r;
    const z = Math.sin(t) * r;
    if (!isInsideOperationalArea(x, z, halfExtent)) continue;
    if (isInSeaControlZone(x, z)) continue;
    if (pointInAnyIsland(x, z, islands)) continue;
    return { x, z, headingRad: Math.atan2(-x, -z) };
  }

  const t = angleSeed;
  const r = outerR;
  const x = Math.cos(t) * r;
  const z = Math.sin(t) * r;
  return { x, z, headingRad: Math.atan2(-x, -z) };
}
