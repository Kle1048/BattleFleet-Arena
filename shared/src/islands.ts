import type { ShipMovementState } from "./shipMovement";

/** Kreis-Insel in der XZ-Ebene (MVP, konsistent Server + Client). */
export type IslandCircle = {
  /** Stabile Id für Debug / später Schema. */
  id: string;
  x: number;
  z: number;
  radius: number;
};

/**
 * Näherungsweise Schiff als Kreis für Insel-Kollision (Bug-Mitte ≈ Schiffsposition).
 * Etwas konservativer als halbe Schiffslänge, damit die Silhouette nicht in die Insel ragt.
 */
export const SHIP_ISLAND_COLLISION_RADIUS = 26;

/**
 * Feste Inseln (4–5 Stück, unterschiedliche Radien).
 * Liegen innerhalb von |x|,|z| < AREA_OF_OPERATIONS_HALF_EXTENT − Rand (bei aktuellem Debug-Half passend).
 */
export const DEFAULT_MAP_ISLANDS: IslandCircle[] = [
  { id: "i1", x: -420, z: 180, radius: 95 },
  { id: "i2", x: 380, z: -320, radius: 140 },
  { id: "i3", x: 120, z: 480, radius: 72 },
  { id: "i4", x: -260, z: -500, radius: 110 },
  { id: "i5", x: 500, z: 340, radius: 64 },
];

const RESOLVE_ITERATIONS = 4;

/**
 * Schiebt die Schiffsposition aus allen Insel-Kreisen heraus (serverseitig nach `stepMovement`).
 */
export function resolveShipIslandCollisions(
  ship: ShipMovementState,
  islands: readonly IslandCircle[],
  shipRadius: number = SHIP_ISLAND_COLLISION_RADIUS,
): void {
  for (let n = 0; n < RESOLVE_ITERATIONS; n++) {
    for (const is of islands) {
      const dx = ship.x - is.x;
      const dz = ship.z - is.z;
      const minDist = is.radius + shipRadius;
      const distSq = dx * dx + dz * dz;
      if (distSq >= minDist * minDist) continue;
      if (distSq < 1e-12) {
        ship.x = is.x + minDist;
        ship.z = is.z;
        continue;
      }
      const dist = Math.sqrt(distSq);
      const push = minDist / dist;
      ship.x = is.x + dx * push;
      ship.z = is.z + dz * push;
    }
  }
}
