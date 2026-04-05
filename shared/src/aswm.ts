/**
 * Task 7 — Anti-Schiff-Lenkflugkörper (MVP): Feuerrichtung = Schiff→Aim;
 * **Suchkegel ±30°** um die **aktuelle Flugrichtung** — nur Ziele im Kegel werden angeflogen.
 */

import { forwardXZ, isInForwardArc } from "./artillery";
import { PlayerLifeState } from "./playerLife";

/** Horizontale Geschwindigkeit (XZ, Einheiten/s). */
export const ASWM_SPEED = 190;
/** Max. Drehgeschwindigkeit Richtung Ziel (rad/s). */
export const ASWM_TURN_RATE_RAD_PER_S = 1.05;
export const ASWM_LIFETIME_MS = 12_000;
export const ASWM_HIT_RADIUS = 26;
/** Kollision Insel: Zentrum FK gilt als innerhalb, wenn Distanz ≤ Inselradius + dieser Wert. */
export const ASWM_ISLAND_COLLISION_RADIUS = 14;
export const ASWM_DAMAGE = 28;
export const ASWM_COOLDOWN_MS = 3200;
export const ASWM_MAX_PER_OWNER = 2;
/** Länge des Suchkegels (m): nur Ziele innerhalb dieser Entfernung zur Rakete. */
export const ASWM_ACQUIRE_CONE_LENGTH = 210;
export const ASWM_SPAWN_FORWARD = 22;

/**
 * Halber Öffnungswinkel des Suchkegels um die Blick-/Flugrichtung (±30°).
 */
export const ASWM_ACQUIRE_HALF_ANGLE_RAD = (30 * Math.PI) / 180;

export type AswmTargetCandidate = {
  id: string;
  x: number;
  z: number;
  lifeState: string;
};

/**
 * Nächstes Ziel im **Suchkegel** um `boreHeadingRad` (±30°), in Reichweite, nicht Respawn.
 * `boreHeadingRad` pro Tick = aktuelle Raketenflugrichtung (Seeker).
 */
export function pickAswmAcquisitionTarget(
  observerX: number,
  observerZ: number,
  boreHeadingRad: number,
  ownerId: string,
  candidates: readonly AswmTargetCandidate[],
): string | null {
  let bestId: string | null = null;
  let bestD2 = Infinity;
  const maxSq = ASWM_ACQUIRE_CONE_LENGTH * ASWM_ACQUIRE_CONE_LENGTH;
  for (const c of candidates) {
    if (c.id === ownerId) continue;
    if (c.lifeState === PlayerLifeState.AwaitingRespawn) continue;
    if (
      !isInForwardArc(
        observerX,
        observerZ,
        boreHeadingRad,
        c.x,
        c.z,
        ASWM_ACQUIRE_HALF_ANGLE_RAD,
      )
    ) {
      continue;
    }
    const dx = c.x - observerX;
    const dz = c.z - observerZ;
    const d2 = dx * dx + dz * dz;
    if (d2 > maxSq) continue;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestId = c.id;
    }
  }
  return bestId;
}

/**
 * Start in **Feuerrichtung** (Schiff → Aim). Bei Aim ≈ Schiff: `fallbackHeadingRad` (Bug).
 */
export function spawnAswmFromFireDirection(
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
    x: shipX + f.x * ASWM_SPAWN_FORWARD,
    z: shipZ + f.z * ASWM_SPAWN_FORWARD,
    headingRad,
  };
}

export function stepAswmMissile(
  x: number,
  z: number,
  headingRad: number,
  dt: number,
  targetX: number | null,
  targetZ: number | null,
): { x: number; z: number; headingRad: number } {
  let h = headingRad;
  if (targetX != null && targetZ != null) {
    const dx = targetX - x;
    const dz = targetZ - z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.5) {
      const desired = Math.atan2(dx, dz);
      let delta = desired - h;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const maxTurn = ASWM_TURN_RATE_RAD_PER_S * dt;
      delta = Math.max(-maxTurn, Math.min(maxTurn, delta));
      h += delta;
    }
  }
  const f = forwardXZ(h);
  return {
    x: x + f.x * ASWM_SPEED * dt,
    z: z + f.z * ASWM_SPEED * dt,
    headingRad: h,
  };
}
