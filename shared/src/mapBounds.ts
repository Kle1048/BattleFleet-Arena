/**
 * Quadratisches Einsatzgebiet (XZ), Mittelpunkt Welt-Nullpunkt.
 * Gültig wenn |x| ≤ half und |z| ≤ half.
 */

/** Halbe Kantenlänge: Weltkoordinaten [-half, +half] auf X und Z. (Debug: kleiner als Ziel-MVP.) */
export const AREA_OF_OPERATIONS_HALF_EXTENT = 900;

/** Zeit außerhalb bis „Zerstörung“ (Raum verlassen durch Server). */
export const OOB_DESTROY_AFTER_MS = 10_000;

export function isInsideOperationalArea(x: number, z: number, halfExtent: number): boolean {
  return Math.abs(x) <= halfExtent && Math.abs(z) <= halfExtent;
}
