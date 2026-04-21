import type { ShipMovementState } from "./shipMovement";
import type { ShipCollisionHitbox } from "./shipVisualLayout";
import type { IslandCircle } from "./mapIslands";
import { MAP_ISLAND_LAYOUT } from "./mapIslands";
import mapIslandPolygonOverridesData from "./data/mapIslandPolygonOverrides.json";
import { hitboxWorldCenterXZ, obbHalfProjectionRadiusXZ } from "./shipShipCollision";

/** Convex CCW island footprint in world XZ (first vertex not repeated at end). */
export type IslandPolygon = {
  id: string;
  verts: readonly { x: number; z: number }[];
};

const POLY_WATER_PAD = 1.08;
const POLY_VERTS = 10;

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

/** Wavy ring from circle centers — extends slightly past gameplay radius into water. */
export function buildIslandPolygonsFromCircleSpecs(
  specs: readonly IslandCircle[],
  waterPad = POLY_WATER_PAD,
  nVerts = POLY_VERTS,
): IslandPolygon[] {
  const out: IslandPolygon[] = [];
  for (const is of specs) {
    const verts: { x: number; z: number }[] = [];
    const phase = is.id.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) * 0.017;
    for (let i = 0; i < nVerts; i++) {
      const t = (2 * Math.PI * i) / nVerts + phase * 0.4;
      const ripple = 1.03 + 0.12 * Math.sin(2.7 * i + phase * 2.1);
      const r = is.radius * waterPad * ripple;
      verts.push({ x: is.x + r * Math.cos(t), z: is.z + r * Math.sin(t) });
    }
    out.push({ id: is.id, verts });
  }
  return out;
}

type IslandPolygonOverrideFile = {
  islands?: ReadonlyArray<{
    id: string;
    verts: ReadonlyArray<{ x: number; z: number }>;
  }>;
};

function mergeIslandPolygonOverrides(
  base: IslandPolygon[],
  file: IslandPolygonOverrideFile,
): IslandPolygon[] {
  const byId = new Map<string, ReadonlyArray<{ x: number; z: number }>>();
  for (const e of file.islands ?? []) {
    if (e.id && e.verts && e.verts.length >= 3) byId.set(e.id, e.verts);
  }
  return base.map((p) => {
    const v = byId.get(p.id);
    return v ? { id: p.id, verts: v } : p;
  });
}

export const DEFAULT_MAP_ISLAND_POLYGONS: IslandPolygon[] = mergeIslandPolygonOverrides(
  buildIslandPolygonsFromCircleSpecs(MAP_ISLAND_LAYOUT as unknown as IslandCircle[]),
  mapIslandPolygonOverridesData as IslandPolygonOverrideFile,
);

function polygonCentroid(verts: readonly { x: number; z: number }[]): { x: number; z: number } {
  let a = 0;
  let cx = 0;
  let cz = 0;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const v0 = verts[i]!;
    const v1 = verts[(i + 1) % n]!;
    const cross = v0.x * v1.z - v1.x * v0.z;
    a += cross;
    cx += (v0.x + v1.x) * cross;
    cz += (v0.z + v1.z) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) {
    let sx = 0;
    let sz = 0;
    for (const v of verts) {
      sx += v.x;
      sz += v.z;
    }
    return { x: sx / n, z: sz / n };
  }
  return { x: cx / (6 * a), z: cz / (6 * a) };
}

/** Point-in-polygon (ray cast along +X). Works for convex polygons. */
export function pointInConvexPolygon(x: number, z: number, verts: readonly { x: number; z: number }[]): boolean {
  const n = verts.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = verts[i]!;
    const vj = verts[j]!;
    const zCross = vi.z > z !== vj.z > z;
    if (!zCross) continue;
    const xInt = ((vj.x - vi.x) * (z - vi.z)) / (vj.z - vi.z + 1e-20) + vi.x;
    if (x < xInt) inside = !inside;
  }
  return inside;
}

function distSqPointToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const abLenSq = abx * abx + abz * abz;
  if (abLenSq < 1e-12) return apx * apx + apz * apz;
  let t = (apx * abx + apz * abz) / abLenSq;
  t = clamp(t, 0, 1);
  const qx = ax + t * abx;
  const qz = az + t * abz;
  const dx = px - qx;
  const dz = pz - qz;
  return dx * dx + dz * dz;
}

/** Minimum squared distance from point to polygon boundary (any winding). */
export function minDistSqPointToPolygonBoundary(
  x: number,
  z: number,
  verts: readonly { x: number; z: number }[],
): number {
  let best = Infinity;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const a = verts[i]!;
    const b = verts[(i + 1) % n]!;
    best = Math.min(best, distSqPointToSegment(x, z, a.x, a.z, b.x, b.z));
  }
  return best;
}

export function circleOverlapsConvexIslandPolygon(
  cx: number,
  cz: number,
  radius: number,
  verts: readonly { x: number; z: number }[],
): boolean {
  const r = Math.max(0, radius);
  if (pointInConvexPolygon(cx, cz, verts)) return true;
  return minDistSqPointToPolygonBoundary(cx, cz, verts) <= r * r + 1e-10;
}

export function isCircleOverlappingAnyIslandPolygon(
  x: number,
  z: number,
  objectRadius: number,
  islands: readonly IslandPolygon[],
): boolean {
  const orad = Math.max(0, objectRadius);
  for (const is of islands) {
    if (circleOverlapsConvexIslandPolygon(x, z, orad, is.verts)) return true;
  }
  return false;
}

export function pointInAnyIslandPolygon(x: number, z: number, islands: readonly IslandPolygon[]): boolean {
  for (const is of islands) {
    if (pointInConvexPolygon(x, z, is.verts)) return true;
  }
  return false;
}

function orient(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  return (bz - az) * (cx - bx) - (bx - ax) * (cz - bz);
}

function onSegment(ax: number, az: number, bx: number, bz: number, px: number, pz: number): boolean {
  return (
    px <= Math.max(ax, bx) + 1e-9 &&
    px + 1e-9 >= Math.min(ax, bx) &&
    pz <= Math.max(az, bz) + 1e-9 &&
    pz + 1e-9 >= Math.min(az, bz)
  );
}

export function segmentIntersectsConvexPolygon(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  verts: readonly { x: number; z: number }[],
): boolean {
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const p1 = verts[i]!;
    const p2 = verts[(i + 1) % n]!;
    const o1 = orient(ax, az, bx, bz, p1.x, p1.z);
    const o2 = orient(ax, az, bx, bz, p2.x, p2.z);
    const o3 = orient(p1.x, p1.z, p2.x, p2.z, ax, az);
    const o4 = orient(p1.x, p1.z, p2.x, p2.z, bx, bz);
    if (o1 === 0 && onSegment(ax, az, bx, bz, p1.x, p1.z)) return true;
    if (o2 === 0 && onSegment(ax, az, bx, bz, p2.x, p2.z)) return true;
    if (o3 === 0 && onSegment(p1.x, p1.z, p2.x, p2.z, ax, az)) return true;
    if (o4 === 0 && onSegment(p1.x, p1.z, p2.x, p2.z, bx, bz)) return true;
    if (o1 > 0 !== o2 > 0 && o3 > 0 !== o4 > 0) return true;
  }
  return pointInConvexPolygon(ax, az, verts) || pointInConvexPolygon(bx, bz, verts);
}

/**
 * SAT: convex polygon (CCW) vs ship hitbox OBB in XZ. Returns MTV to move **ship** out of polygon
 * (direction from polygon toward ship when resolved).
 */
export function satConvexPolygonObbOverlapMtv(
  verts: readonly { x: number; z: number }[],
  obbCx: number,
  obbCz: number,
  halfHx: number,
  halfHz: number,
  headingRad: number,
): { depth: number; nx: number; nz: number } | null {
  const n = verts.length;
  const axes: { nx: number; nz: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = verts[i]!;
    const b = verts[(i + 1) % n]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) continue;
    axes.push({ nx: dz / len, nz: -dx / len });
  }
  axes.push(
    { nx: Math.cos(headingRad), nz: -Math.sin(headingRad) },
    { nx: Math.sin(headingRad), nz: Math.cos(headingRad) },
  );

  let minOverlap = Infinity;
  let bestNx = 0;
  let bestNz = 0;
  for (const raw of axes) {
    const len = Math.hypot(raw.nx, raw.nz);
    if (len < 1e-12) continue;
    const nx = raw.nx / len;
    const nz = raw.nz / len;
    let pmin = Infinity;
    let pmax = -Infinity;
    for (const v of verts) {
      const p = v.x * nx + v.z * nz;
      pmin = Math.min(pmin, p);
      pmax = Math.max(pmax, p);
    }
    const pc = obbCx * nx + obbCz * nz;
    const ro = obbHalfProjectionRadiusXZ(halfHx, halfHz, headingRad, nx, nz);
    const omin = pc - ro;
    const omax = pc + ro;
    const overlap = Math.min(pmax, omax) - Math.max(pmin, omin);
    if (overlap < -1e-3) return null;
    if (overlap < minOverlap) {
      minOverlap = overlap;
      const polyMid = 0.5 * (pmin + pmax);
      const dir = pc >= polyMid ? 1 : -1;
      bestNx = nx * dir;
      bestNz = nz * dir;
    }
  }
  if (minOverlap === Infinity || minOverlap < 1e-8) return null;

  const cent = polygonCentroid(verts);
  if ((obbCx - cent.x) * bestNx + (obbCz - cent.z) * bestNz < 0) {
    bestNx = -bestNx;
    bestNz = -bestNz;
  }
  return { depth: minOverlap, nx: bestNx, nz: bestNz };
}

const RESOLVE_ITERATIONS = 4;

export function resolveShipIslandPolygonCollisions(
  ship: ShipMovementState,
  islands: readonly IslandPolygon[],
  hitbox?: ShipCollisionHitbox | null,
  legacyShipRadius = 26,
): void {
  if (hitbox) {
    const hx = Math.max(0, hitbox.halfExtents.x);
    const hz = Math.max(0, hitbox.halfExtents.z);
    for (let iter = 0; iter < RESOLVE_ITERATIONS; iter++) {
      for (const poly of islands) {
        const c = hitboxWorldCenterXZ(ship.x, ship.z, ship.headingRad, hitbox);
        const mtv = satConvexPolygonObbOverlapMtv(poly.verts, c.x, c.z, hx, hz, ship.headingRad);
        if (!mtv) continue;
        ship.x += mtv.nx * mtv.depth;
        ship.z += mtv.nz * mtv.depth;
      }
    }
  } else {
    resolveShipIslandCollisionsLegacyCircleInPolygon(ship, islands, legacyShipRadius);
  }
}

/** Hitbox footprint overlaps any island polygon (for SFX edge detection). */
export function shipHitboxOverlapsAnyIslandPolygon(
  shipX: number,
  shipZ: number,
  headingRad: number,
  hitbox: ShipCollisionHitbox,
  islands: readonly IslandPolygon[],
): boolean {
  const hx = Math.max(0, hitbox.halfExtents.x);
  const hz = Math.max(0, hitbox.halfExtents.z);
  const c = hitboxWorldCenterXZ(shipX, shipZ, headingRad, hitbox);
  for (const poly of islands) {
    if (satConvexPolygonObbOverlapMtv(poly.verts, c.x, c.z, hx, hz, headingRad)) return true;
  }
  return false;
}

/** Closest point on polygon boundary to world point (for legacy push). */
export function closestPointOnPolygonBoundaryWorld(
  x: number,
  z: number,
  verts: readonly { x: number; z: number }[],
): { px: number; pz: number } {
  let bestD = Infinity;
  let bx = x;
  let bz = z;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const a = verts[i]!;
    const b = verts[(i + 1) % n]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const apx = x - a.x;
    const apz = z - a.z;
    const abLenSq = abx * abx + abz * abz;
    let qx: number;
    let qz: number;
    if (abLenSq < 1e-12) {
      qx = a.x;
      qz = a.z;
    } else {
      let t = (apx * abx + apz * abz) / abLenSq;
      t = clamp(t, 0, 1);
      qx = a.x + t * abx;
      qz = a.z + t * abz;
    }
    const dx = x - qx;
    const dz = z - qz;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      bx = qx;
      bz = qz;
    }
  }
  return { px: bx, pz: bz };
}

/** Push ship center out of polygon along boundary normal (hitbox path uses SAT above). */
export function resolveShipIslandCollisionsLegacyCircleInPolygon(
  ship: ShipMovementState,
  islands: readonly IslandPolygon[],
  legacyShipRadius: number,
): void {
  const r = legacyShipRadius;
  for (let iter = 0; iter < RESOLVE_ITERATIONS; iter++) {
    for (const poly of islands) {
      const verts = poly.verts;
      const inside = pointInConvexPolygon(ship.x, ship.z, verts);
      const { px, pz } = closestPointOnPolygonBoundaryWorld(ship.x, ship.z, verts);
      const dx = ship.x - px;
      const dz = ship.z - pz;
      const d = Math.hypot(dx, dz);
      if (!inside && d >= r - 1e-4) continue;
      const pen = inside ? r + d + 0.02 : r - d + 1e-3;
      if (pen <= 0) continue;
      let nx: number;
      let nz: number;
      if (d > 1e-6) {
        nx = dx / d;
        nz = dz / d;
      } else {
        const cent = polygonCentroid(verts);
        const tx = ship.x - cent.x;
        const tz = ship.z - cent.z;
        const tlen = Math.hypot(tx, tz);
        if (tlen > 1e-8) {
          nx = tx / tlen;
          nz = tz / tlen;
        } else {
          nx = 1;
          nz = 0;
        }
      }
      ship.x += nx * pen;
      ship.z += nz * pen;
    }
  }
}
