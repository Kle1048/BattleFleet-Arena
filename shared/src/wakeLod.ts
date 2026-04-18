/**
 * Horizontale Distanz-LOD (XZ / „Welt“-Ebene der Schiffssimulation).
 */

/** Standard-Radius (m): Wake jenseits dieses Abstands zum Anker nicht berechnen. */
export const DEFAULT_SHIP_WAKE_LOD_MAX_DIST_WORLD = 980;

export function isWithinHorizontalDistanceSq(
  ax: number,
  az: number,
  px: number,
  pz: number,
  maxDist: number,
): boolean {
  const dx = px - ax;
  const dz = pz - az;
  return dx * dx + dz * dz <= maxDist * maxDist;
}
