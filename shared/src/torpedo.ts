/** Task 8 (angepasst): Mine statt Torpedo — statisch, Näherungszünder. */

import { forwardXZ } from "./artillery";

export const TORPEDO_SPEED = 58;
export const TORPEDO_LIFETIME_MS = 45_000;
/** Wird als Minen-Trigger-Radius genutzt. */
export const TORPEDO_HIT_RADIUS = 24;
/** Mine: 90% der maximalen HP des auslösenden Schiffs (serverseitig direkt so berechnet). */
export const TORPEDO_DAMAGE = 0;
export const TORPEDO_COOLDOWN_MS = 1000;
export const TORPEDO_MAX_PER_OWNER = 10;
/** Mine am Schiffsende (Heck) in lokaler -Z Richtung. */
export const TORPEDO_SPAWN_FORWARD = -22;
/** Kollision Insel: wie ASuM, etwas größerer Körper. */
export const TORPEDO_ISLAND_COLLISION_RADIUS = 16;

/** Mine wird hinter dem Schiff gelegt; Heading bleibt für eventuelle Visual-Ausrichtung erhalten. */
export function spawnTorpedoFromFireDirection(
  shipX: number,
  shipZ: number,
  _aimX: number,
  _aimZ: number,
  fallbackHeadingRad: number,
  spawnLocalZ: number = TORPEDO_SPAWN_FORWARD,
): { x: number; z: number; headingRad: number } {
  const headingRad = fallbackHeadingRad;
  const f = forwardXZ(headingRad);
  return {
    x: shipX + f.x * spawnLocalZ,
    z: shipZ + f.z * spawnLocalZ,
    headingRad,
  };
}

export function stepTorpedoStraight(
  x: number,
  z: number,
  headingRad: number,
  _dt: number,
): { x: number; z: number; headingRad: number } {
  // Mine bleibt statisch.
  return {
    x,
    z,
    headingRad,
  };
}
