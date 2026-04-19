/**
 * Reine 2D-Hilfen für ein Kielwasser-Band in der XZ-Ebene (Y nach oben).
 */

/** Halbe Schiffsbreite in lokalem X (m) am FAC — `data/ships/fac.json` → `collisionHitbox.halfExtents.x`. */
export const WAKE_RIBBON_REF_HALF_BEAM_X = 4;

/** Am Heck abgestimmte halbe Bandbreite (m) bei Referenz-FAC. */
export const WAKE_RIBBON_TUNED_BASE_HALF_WIDTH = 4.6;

/**
 * Halbe sichtbare Kielwasser-Breite aus der Gameplay-Hitbox (Quer-Halbachse X).
 * Zerstörer/Kreuzer skalieren gegenüber FAC proportional zur Hitbox.
 */
export function wakeRibbonBaseHalfWidthFromHitboxHalfBeamX(hitboxHalfBeamX: number): number {
  if (typeof hitboxHalfBeamX !== "number" || !Number.isFinite(hitboxHalfBeamX) || hitboxHalfBeamX <= 0) {
    return WAKE_RIBBON_TUNED_BASE_HALF_WIDTH;
  }
  return WAKE_RIBBON_TUNED_BASE_HALF_WIDTH * (hitboxHalfBeamX / WAKE_RIBBON_REF_HALF_BEAM_X);
}

/** Minimale Hitbox-Z-Angaben für Heck (Kollisions-AABB, +Z = Bug). */
export type WakeRibbonHitboxZ = {
  center: { z: number };
  halfExtents: { z: number };
};

/**
 * Lokales Z der heckwärtsigen Fläche der Kollisions-AABB (`center.z - halfExtents.z`).
 */
export function wakeRibbonSternLocalZFromHitbox(hitbox: WakeRibbonHitboxZ | undefined): number | null {
  if (!hitbox?.center || !hitbox.halfExtents) return null;
  const cz = hitbox.center.z;
  const hz = hitbox.halfExtents.z;
  if (typeof cz !== "number" || typeof hz !== "number" || !Number.isFinite(cz) || !Number.isFinite(hz)) {
    return null;
  }
  return cz - hz;
}

export function wakeRibbonSternLocalZOrFallback(
  hitbox: WakeRibbonHitboxZ | undefined,
  fallbackSternZ: number,
): number {
  const z = wakeRibbonSternLocalZFromHitbox(hitbox);
  return z != null ? z : fallbackSternZ;
}

export function normalizeXZ(dx: number, dz: number): { x: number; z: number } {
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return { x: 0, z: 1 };
  return { x: dx / len, z: dz / len };
}

/**
 * Tangente entlang einer Polylinie am Index `i` (Mittel aus an- und abgehendem Segment).
 */
export function spineTangentXZ(
  pts: ReadonlyArray<{ x: number; z: number }>,
  i: number,
): { x: number; z: number } {
  const n = pts.length;
  if (n < 2) return { x: 0, z: 1 };
  const p0 = pts[0];
  const p1 = pts[1];
  if (!p0 || !p1) return { x: 0, z: 1 };
  if (i <= 0) {
    return normalizeXZ(p1.x - p0.x, p1.z - p0.z);
  }
  const plast = pts[n - 1];
  const pprev = pts[n - 2];
  if (i >= n - 1) {
    if (!plast || !pprev) return { x: 0, z: 1 };
    return normalizeXZ(plast.x - pprev.x, plast.z - pprev.z);
  }
  const a = pts[i - 1];
  const b = pts[i + 1];
  if (!a || !b) return { x: 0, z: 1 };
  return normalizeXZ(b.x - a.x, b.z - a.z);
}

/**
 * Einheitlicher Normalenvektor in der XZ-Ebene zur Tangente (rechtsdrehend um +Y: „links“ vom Kurs).
 * Entspricht `normalize(cross(up, tangent))` mit `up = (0,1,0)` und Tangente `(tx,0,tz)`.
 */
export function xzPerpendicularFromTangent(tx: number, tz: number): { x: number; z: number } {
  return normalizeXZ(-tz, tx);
}
