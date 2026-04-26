/**
 * Peilung Gegner relativ zum eigenen Bug: Skalarprodukt mit Steuerbord-Einheitsvektor in XZ.
 * Positiv = Steuerbord, negativ = Backbord (wie `shipBowForwardWorld` in shared).
 */
export function starboardDotFromMeToTarget(
  meX: number,
  meZ: number,
  headingRad: number,
  targetX: number,
  targetZ: number,
): number {
  const vx = targetX - meX;
  const vz = targetZ - meZ;
  return vx * Math.cos(headingRad) - vz * Math.sin(headingRad);
}
