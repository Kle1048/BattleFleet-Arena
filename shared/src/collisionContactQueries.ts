import { DEFAULT_MAP_ISLANDS } from "./islands";
import { circleIntersectsShipHitboxFootprintXZ } from "./shipHitboxCollision";
import { getShipHullProfileByClass } from "./shipProfiles";
import { hitboxWorldCenterXZ, satOBB2DOverlapMTV } from "./shipShipCollision";

/** Gleiche Daten wie für Server-Physik / Client-Anzeige (Klassen-Id → Hitbox). */
export type ShipCollisionPose = {
  x: number;
  z: number;
  headingRad: number;
  shipClass: string;
};

export function shipOverlapsAnyIsland(pose: ShipCollisionPose): boolean {
  const hb = getShipHullProfileByClass(pose.shipClass)?.collisionHitbox;
  if (!hb) return false;
  for (const is of DEFAULT_MAP_ISLANDS) {
    if (
      circleIntersectsShipHitboxFootprintXZ(
        is.x,
        is.z,
        is.radius,
        pose.x,
        pose.z,
        pose.headingRad,
        hb,
      )
    ) {
      return true;
    }
  }
  return false;
}

export function twoShipsObbOverlap(a: ShipCollisionPose, b: ShipCollisionPose): boolean {
  const hbA = getShipHullProfileByClass(a.shipClass)?.collisionHitbox;
  const hbB = getShipHullProfileByClass(b.shipClass)?.collisionHitbox;
  if (!hbA || !hbB) return false;
  const hxA = Math.max(0, hbA.halfExtents.x);
  const hzA = Math.max(0, hbA.halfExtents.z);
  const hxB = Math.max(0, hbB.halfExtents.x);
  const hzB = Math.max(0, hbB.halfExtents.z);
  const c1 = hitboxWorldCenterXZ(a.x, a.z, a.headingRad, hbA);
  const c2 = hitboxWorldCenterXZ(b.x, b.z, b.headingRad, hbB);
  return (
    satOBB2DOverlapMTV(
      c1,
      hxA,
      hzA,
      a.headingRad,
      c2,
      hxB,
      hzB,
      b.headingRad,
    ) != null
  );
}
