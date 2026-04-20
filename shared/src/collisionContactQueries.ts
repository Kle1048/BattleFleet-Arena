import { DEFAULT_MAP_ISLANDS, type IslandCircle } from "./islands";
import { circleIntersectsShipHitboxFootprintXZ } from "./shipHitboxCollision";
import { getAuthoritativeShipHullProfile } from "./shipProfiles";
import { hitboxWorldCenterXZ, satOBB2DOverlapMTV } from "./shipShipCollision";

/** Gleiche Daten wie für Server-Physik / Client-Anzeige (Klassen-Id → Hitbox). */
export type ShipCollisionPose = {
  x: number;
  z: number;
  headingRad: number;
  shipClass: string;
};

export function shipOverlapsAnyIslandCircles(
  pose: ShipCollisionPose,
  islands: readonly IslandCircle[],
): boolean {
  const hb = getAuthoritativeShipHullProfile(pose.shipClass)?.collisionHitbox;
  if (!hb) return false;
  for (const is of islands) {
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

export function shipOverlapsAnyIsland(pose: ShipCollisionPose): boolean {
  return shipOverlapsAnyIslandCircles(pose, DEFAULT_MAP_ISLANDS);
}

/** Mindestens Wrack-Hitbox (OBB wie Schiff–Schiff); `anchor*` = Simulationspunkt wie bei Spielern. */
export type WreckHitboxPoseInput = {
  anchorX: number;
  anchorZ: number;
  headingRad: number;
  shipClass: string;
};

export function shipOverlapsAnyWreck(
  pose: ShipCollisionPose,
  wrecks: { length: number; at: (i: number) => WreckHitboxPoseInput | undefined } | null | undefined,
): boolean {
  if (!wrecks || wrecks.length === 0) return false;
  for (let i = 0; i < wrecks.length; i++) {
    const w = wrecks.at(i);
    if (!w) continue;
    if (
      twoShipsObbOverlap(pose, {
        x: w.anchorX,
        z: w.anchorZ,
        headingRad: w.headingRad,
        shipClass: w.shipClass,
      })
    ) {
      return true;
    }
  }
  return false;
}

/** Kreis (z. B. Flugkörper-Radius) schneidet eine Wrack-Hitbox-Fußfläche. */
export function circleIntersectsAnyWreckHitboxFootprintXZ(
  px: number,
  pz: number,
  circleRadius: number,
  wrecks: { length: number; at: (i: number) => WreckHitboxPoseInput | undefined } | null | undefined,
): boolean {
  if (!wrecks || wrecks.length === 0) return false;
  for (let i = 0; i < wrecks.length; i++) {
    const w = wrecks.at(i);
    if (!w) continue;
    const hb = getAuthoritativeShipHullProfile(w.shipClass)?.collisionHitbox;
    if (
      circleIntersectsShipHitboxFootprintXZ(
        px,
        pz,
        circleRadius,
        w.anchorX,
        w.anchorZ,
        w.headingRad,
        hb,
      )
    ) {
      return true;
    }
  }
  return false;
}

export function twoShipsObbOverlap(a: ShipCollisionPose, b: ShipCollisionPose): boolean {
  const hbA = getAuthoritativeShipHullProfile(a.shipClass)?.collisionHitbox;
  const hbB = getAuthoritativeShipHullProfile(b.shipClass)?.collisionHitbox;
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
