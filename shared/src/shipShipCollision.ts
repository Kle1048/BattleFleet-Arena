import type { ShipCollisionHitbox } from "./shipVisualLayout";
import type { ShipMovementState } from "./shipMovement";

/** Wie `resolveShipIslandCollisions`: mehrere Durchläufe bei Kettenberührungen. */
const SHIP_SHIP_RESOLVE_ITERATIONS = 6;

export type ShipCollisionParticipant = {
  ship: ShipMovementState;
  hitbox: ShipCollisionHitbox | undefined;
  /** Server: Zuordnung für Ram-Schaden */
  sessionId?: string;
};

/**
 * Mittelpunkt der Hitbox-Fußfläche in Welt-XZ (Schiff in `(shipX,shipZ)`, Yaw `headingRad`).
 */
export function hitboxWorldCenterXZ(
  shipX: number,
  shipZ: number,
  headingRad: number,
  hitbox: ShipCollisionHitbox,
): { x: number; z: number } {
  const cx = hitbox.center.x;
  const cz = hitbox.center.z;
  const c = Math.cos(headingRad);
  const s = Math.sin(headingRad);
  return {
    x: shipX + cx * c + cz * s,
    z: shipZ - cx * s + cz * c,
  };
}

function obbHalfProjectionRadiusXZ(
  halfHx: number,
  halfHz: number,
  headingRad: number,
  nx: number,
  nz: number,
): number {
  const ux = Math.cos(headingRad);
  const uz = -Math.sin(headingRad);
  const vx = Math.sin(headingRad);
  const vz = Math.cos(headingRad);
  return (
    halfHx * Math.abs(ux * nx + uz * nz) + halfHz * Math.abs(vx * nx + vz * nz)
  );
}

/**
 * SAT: zwei OBBs in XZ. Liefert Tiefe und normierte Richtung (von Schiff 1 zu Schiff 2),
 * entlang der Achse mit geringster Penetration.
 */
export function satOBB2DOverlapMTV(
  c1: { x: number; z: number },
  halfHx1: number,
  halfHz1: number,
  h1: number,
  c2: { x: number; z: number },
  halfHx2: number,
  halfHz2: number,
  h2: number,
): { depth: number; nx: number; nz: number } | null {
  const axes = [
    { x: Math.cos(h1), z: -Math.sin(h1) },
    { x: Math.sin(h1), z: Math.cos(h1) },
    { x: Math.cos(h2), z: -Math.sin(h2) },
    { x: Math.sin(h2), z: Math.cos(h2) },
  ];
  let minOverlap = Infinity;
  let bestNx = 0;
  let bestNz = 0;
  for (const raw of axes) {
    const len = Math.hypot(raw.x, raw.z);
    if (len < 1e-12) continue;
    const nx = raw.x / len;
    const nz = raw.z / len;
    const r1 = obbHalfProjectionRadiusXZ(halfHx1, halfHz1, h1, nx, nz);
    const r2 = obbHalfProjectionRadiusXZ(halfHx2, halfHz2, h2, nx, nz);
    const p1 = c1.x * nx + c1.z * nz;
    const p2 = c2.x * nx + c2.z * nz;
    const min1 = p1 - r1;
    const max1 = p1 + r1;
    const min2 = p2 - r2;
    const max2 = p2 + r2;
    const overlap = Math.min(max1, max2) - Math.max(min1, min2);
    if (overlap < -1e-4) return null;
    if (overlap < minOverlap) {
      minOverlap = overlap;
      const centerDelta = p2 - p1;
      const dir = Math.abs(centerDelta) < 1e-8 ? 1 : centerDelta >= 0 ? 1 : -1;
      bestNx = nx * dir;
      bestNz = nz * dir;
    }
  }
  if (minOverlap === Infinity || minOverlap < 1e-10) return null;
  return { depth: minOverlap, nx: bestNx, nz: bestNz };
}

/**
 * Schiebt überlappende Schiffe anhand der Hitbox-OBBs auseinander (autoritativer Server).
 * Nur Teilnehmer mit gesetztem `collisionHitbox`; andere Paare werden übersprungen.
 */
export function resolveShipShipCollisions(participants: ShipCollisionParticipant[]): void {
  const n = participants.length;
  if (n < 2) return;
  for (let iter = 0; iter < SHIP_SHIP_RESOLVE_ITERATIONS; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const A = participants[i]!;
        const B = participants[j]!;
        const hbA = A.hitbox;
        const hbB = B.hitbox;
        if (!hbA || !hbB) continue;
        const hxA = Math.max(0, hbA.halfExtents.x);
        const hzA = Math.max(0, hbA.halfExtents.z);
        const hxB = Math.max(0, hbB.halfExtents.x);
        const hzB = Math.max(0, hbB.halfExtents.z);
        const c1 = hitboxWorldCenterXZ(A.ship.x, A.ship.z, A.ship.headingRad, hbA);
        const c2 = hitboxWorldCenterXZ(B.ship.x, B.ship.z, B.ship.headingRad, hbB);
        const mtv = satOBB2DOverlapMTV(
          c1,
          hxA,
          hzA,
          A.ship.headingRad,
          c2,
          hxB,
          hzB,
          B.ship.headingRad,
        );
        if (!mtv) continue;
        const half = mtv.depth * 0.5;
        A.ship.x -= mtv.nx * half;
        A.ship.z -= mtv.nz * half;
        B.ship.x += mtv.nx * half;
        B.ship.z += mtv.nz * half;
      }
    }
  }
}
