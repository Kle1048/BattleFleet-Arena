import type { ShipMovementState } from "./shipMovement";
import type { ShipCollisionHitbox } from "./shipVisualLayout";
import {
  DEFAULT_MAP_ISLAND_POLYGONS,
  isCircleOverlappingAnyIslandPolygon,
  resolveShipIslandPolygonCollisions,
} from "./islandPolygonGeometry";
export type { IslandCircle } from "./mapIslands";
export { DEFAULT_MAP_ISLANDS, MAP_ISLAND_LAYOUT } from "./mapIslands";

export type { IslandPolygon } from "./islandPolygonGeometry";
export {
  DEFAULT_MAP_ISLAND_POLYGONS,
  buildIslandPolygonsFromCircleSpecs,
  circleOverlapsConvexIslandPolygon,
  isCircleOverlappingAnyIslandPolygon,
  minDistSqPointToPolygonBoundary,
  pointInAnyIslandPolygon,
  pointInConvexPolygon,
  resolveShipIslandPolygonCollisions,
  satConvexPolygonObbOverlapMtv,
  segmentIntersectsConvexPolygon,
  shipHitboxOverlapsAnyIslandPolygon,
} from "./islandPolygonGeometry";

/**
 * Näherungsweise Schiff als Kreis für Insel-Kollision ohne Hitbox-Daten (Legacy).
 */
export const SHIP_ISLAND_COLLISION_RADIUS = 26;

/** Basis-HP für einmaligen Insel-Kanten-Kontakt (skaliert mit `ShipClassProfile.hullScale`). */
export const ISLAND_SCRAPE_BASE_HP = 7;

/**
 * Kreis (Punkt + Radius) schneidet **Insel-Polygone** der Standardkarte.
 * @deprecated Der Parameter `islands` wird ignoriert; nutze `isCircleOverlappingAnyIslandPolygon` mit eigenen Polygonen.
 */
export function isInsideAnyIslandCircle(
  x: number,
  z: number,
  _islands: readonly { x: number; z: number; radius: number }[],
  objectRadius: number,
): boolean {
  return isCircleOverlappingAnyIslandPolygon(x, z, objectRadius, DEFAULT_MAP_ISLAND_POLYGONS);
}

/**
 * Schiebt die Schiffsposition aus allen Insel-Polygonen (serverseitig nach `stepMovement`).
 * @deprecated Der Parameter `islands` wird ignoriert; nutze `resolveShipIslandPolygonCollisions` mit eigenen Polygonen.
 */
export function resolveShipIslandCollisions(
  ship: ShipMovementState,
  _islands: readonly { x: number; z: number; radius: number }[],
  hitbox?: ShipCollisionHitbox | null,
  legacyShipRadius: number = SHIP_ISLAND_COLLISION_RADIUS,
): void {
  resolveShipIslandPolygonCollisions(ship, DEFAULT_MAP_ISLAND_POLYGONS, hitbox, legacyShipRadius);
}
