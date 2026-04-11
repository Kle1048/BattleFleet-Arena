import type { ShipMovementState } from "./shipMovement";
import type { ShipCollisionHitbox } from "./shipVisualLayout";
import {
  shipLocalDeltaToWorldXZ,
  worldDeltaToShipLocalXZ,
} from "./shipHitboxCollision";

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

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

/**
 * Nächster Punkt auf der Hitbox-Fußfläche (AABB in Schiff lokal XZ) zu einem Weltpunkt.
 */
function closestPointOnHitboxFootprintWorld(
  shipX: number,
  shipZ: number,
  headingRad: number,
  hitbox: ShipCollisionHitbox,
  worldX: number,
  worldZ: number,
): { px: number; pz: number } {
  const ox = worldX - shipX;
  const oz = worldZ - shipZ;
  const { lx, lz } = worldDeltaToShipLocalXZ(ox, oz, headingRad);
  const cx = hitbox.center.x;
  const cz = hitbox.center.z;
  const hx = Math.max(0, hitbox.halfExtents.x);
  const hz = Math.max(0, hitbox.halfExtents.z);
  const qx = clamp(lx, cx - hx, cx + hx);
  const qz = clamp(lz, cz - hz, cz + hz);
  const { ox: wx, oz: wz } = shipLocalDeltaToWorldXZ(qx, qz, headingRad);
  return { px: shipX + wx, pz: shipZ + wz };
}

/**
 * Insel = Kreis; Schiff = Hitbox-OBB in XZ (wie Waffen/Schiff-Schiff). Ohne Hitbox: Legacy-Kreis um `ship.x/z`.
 * Schiebt die Schiffsposition aus allen Insel-Kreisen heraus (serverseitig nach `stepMovement`).
 */
/**
 * Punkt (x,z) liegt in mindestens einem Insel-Kreis, erweitert um `objectRadius` (z. B. Flugkörper).
 */
export function isInsideAnyIslandCircle(
  x: number,
  z: number,
  islands: readonly IslandCircle[],
  objectRadius: number,
): boolean {
  const orad = Math.max(0, objectRadius);
  for (const is of islands) {
    const dx = x - is.x;
    const dz = z - is.z;
    const r = is.radius + orad;
    if (dx * dx + dz * dz <= r * r) return true;
  }
  return false;
}

export function resolveShipIslandCollisions(
  ship: ShipMovementState,
  islands: readonly IslandCircle[],
  hitbox?: ShipCollisionHitbox | null,
  legacyShipRadius: number = SHIP_ISLAND_COLLISION_RADIUS,
): void {
  for (let n = 0; n < RESOLVE_ITERATIONS; n++) {
    for (const is of islands) {
      const ir = Math.max(0, is.radius);
      if (hitbox) {
        const { px, pz } = closestPointOnHitboxFootprintWorld(
          ship.x,
          ship.z,
          ship.headingRad,
          hitbox,
          is.x,
          is.z,
        );
        const dx = is.x - px;
        const dz = is.z - pz;
        const d = Math.hypot(dx, dz);
        if (d >= ir - 1e-4) continue;
        const pen = ir - d;
        let nx: number;
        let nz: number;
        if (d > 1e-6) {
          nx = (px - is.x) / d;
          nz = (pz - is.z) / d;
        } else {
          const tx = ship.x - is.x;
          const tz = ship.z - is.z;
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
      } else {
        const dx = ship.x - is.x;
        const dz = ship.z - is.z;
        const minDist = ir + legacyShipRadius;
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
}
