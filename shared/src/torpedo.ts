/**
 * Task 8 — Torpedos (MVP): langsamer als ASuM, **geradeaus** (kein Homing), weniger parallel aktiv.
 */

import { forwardXZ } from "./artillery";

export const TORPEDO_SPEED = 58;
export const TORPEDO_LIFETIME_MS = 28_000;
export const TORPEDO_HIT_RADIUS = 32;
/** Deutlich über ASuM (28); ~ein Treffer macht ein Schiff kampfunfähig nahe am Ein-Kill. */
export const TORPEDO_DAMAGE = 78;
export const TORPEDO_COOLDOWN_MS = 7500;
export const TORPEDO_MAX_PER_OWNER = 1;
export const TORPEDO_SPAWN_FORWARD = 30;
/** Kollision Insel: wie ASuM, etwas größerer Körper. */
export const TORPEDO_ISLAND_COLLISION_RADIUS = 16;

/**
 * Start in **Feuerrichtung** (Schiff → Aim). Bei Aim ≈ Schiff: `fallbackHeadingRad` (Bug).
 */
export function spawnTorpedoFromFireDirection(
  shipX: number,
  shipZ: number,
  aimX: number,
  aimZ: number,
  fallbackHeadingRad: number,
): { x: number; z: number; headingRad: number } {
  let dx = aimX - shipX;
  let dz = aimZ - shipZ;
  const len = Math.hypot(dx, dz);
  let headingRad: number;
  if (len < 1e-3) {
    headingRad = fallbackHeadingRad;
  } else {
    headingRad = Math.atan2(dx, dz);
  }
  const f = forwardXZ(headingRad);
  return {
    x: shipX + f.x * TORPEDO_SPAWN_FORWARD,
    z: shipZ + f.z * TORPEDO_SPAWN_FORWARD,
    headingRad,
  };
}

export function stepTorpedoStraight(
  x: number,
  z: number,
  headingRad: number,
  dt: number,
): { x: number; z: number; headingRad: number } {
  const f = forwardXZ(headingRad);
  return {
    x: x + f.x * TORPEDO_SPEED * dt,
    z: z + f.z * TORPEDO_SPEED * dt,
    headingRad,
  };
}
