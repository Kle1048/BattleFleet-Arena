/**
 * Render-Koordinaten für Top-Down-Karte:
 * - Welt: +Z = Nord, +X = Ost
 * - Bildschirm: Nord oben, Ost rechts
 *
 * Dafür wird nur die X-Achse beim Rendern gespiegelt.
 */
export function worldToRenderX(worldX: number): number {
  return -worldX;
}

export function renderToWorldX(renderX: number): number {
  return -renderX;
}

/** Yaw um Y-Achse muss bei X-Spiegelung ebenfalls gespiegelt werden. */
export function worldToRenderYaw(worldYawRad: number): number {
  return -worldYawRad;
}
