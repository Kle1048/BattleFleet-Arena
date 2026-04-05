import { pointInAnyIsland } from "./artillery";
import type { IslandCircle } from "./islands";
import { SHIP_ISLAND_COLLISION_RADIUS } from "./islands";
import { isInsideOperationalArea } from "./mapBounds";

export const RESPAWN_PICK_ATTEMPTS = 56;
/** Innerer Ring, äußerer Rand weniger als halfExtent (AO-Insel). */
export const RESPAWN_RADIUS_INNER = 100;
export const RESPAWN_AO_EDGE_INSET = 95;

function pointAwayFromIslands(
  x: number,
  z: number,
  islands: readonly IslandCircle[],
  margin: number,
): boolean {
  for (const is of islands) {
    const d = Math.hypot(x - is.x, z - is.z);
    if (d <= is.radius + margin) return false;
  }
  return true;
}

/**
 * Sucht Spawn-Punkt im AO, frei von Inseln (Schiffskollisionsabstand), Mindestabstand zu `others`.
 * Bei Miss: `null` — Aufrufer nutzt Fallback (z. B. Join-Ring).
 */
export function tryPickRespawnPosition(
  halfExtent: number,
  islands: readonly IslandCircle[],
  others: ReadonlyArray<{ x: number; z: number }>,
  minSeparation: number,
  rng: () => number,
): { x: number; z: number; headingRad: number } | null {
  const maxR = halfExtent - RESPAWN_AO_EDGE_INSET;
  const minR = RESPAWN_RADIUS_INNER;
  const minSepSq = minSeparation * minSeparation;
  const islandMargin = SHIP_ISLAND_COLLISION_RADIUS + 6;

  for (let i = 0; i < RESPAWN_PICK_ATTEMPTS; i++) {
    const t = rng() * Math.PI * 2;
    const r = minR + rng() * Math.max(1, maxR - minR);
    const x = Math.cos(t) * r;
    const z = Math.sin(t) * r;

    if (!isInsideOperationalArea(x, z, halfExtent)) continue;
    if (pointInAnyIsland(x, z, islands)) continue;
    if (!pointAwayFromIslands(x, z, islands, islandMargin)) continue;

    let ok = true;
    for (const o of others) {
      const dx = x - o.x;
      const dz = z - o.z;
      if (dx * dx + dz * dz < minSepSq) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    const headingRad = Math.atan2(-x, -z);
    return { x, z, headingRad };
  }
  return null;
}
