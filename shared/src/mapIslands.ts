/**
 * Single source for island centers / gameplay radii (GLB scale + legacy circle reference).
 * Collision uses convex polygons in `islandPolygonGeometry` derived from these specs.
 */

/** Kreis-Insel in der XZ-Ebene (Radius = bisherige Gameplay-Skalierung der GLBs). */
export type IslandCircle = {
  id: string;
  x: number;
  z: number;
  radius: number;
};

export const MAP_ISLAND_LAYOUT = [
  { id: "i1", x: -840, z: 360, radius: 190 },
  { id: "i2", x: 760, z: -640, radius: 280 },
  { id: "i3", x: 240, z: 960, radius: 144 },
  { id: "i4", x: -520, z: -1000, radius: 220 },
  { id: "i5", x: 1000, z: 680, radius: 128 },
] as const;

export const DEFAULT_MAP_ISLANDS: IslandCircle[] = MAP_ISLAND_LAYOUT.map((s) => ({ ...s }));
