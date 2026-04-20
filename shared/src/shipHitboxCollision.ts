import type { ShipCollisionHitbox } from "./shipVisualLayout";

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

/**
 * Welt-Offset (ox, oz) → Schiff lokal XZ (+X Steuerbord, +Z Bug), nur Yaw `headingRad`.
 */
export function worldDeltaToShipLocalXZ(
  ox: number,
  oz: number,
  headingRad: number,
): { lx: number; lz: number } {
  const c = Math.cos(headingRad);
  const s = Math.sin(headingRad);
  return {
    lx: ox * c - oz * s,
    lz: ox * s + oz * c,
  };
}

/** Invers zu `worldDeltaToShipLocalXZ`: lokaler Offset (+X Steuerbord, +Z Bug) → Welt-ΔXZ vom Schiff. */
export function shipLocalDeltaToWorldXZ(
  lx: number,
  lz: number,
  headingRad: number,
): { ox: number; oz: number } {
  const c = Math.cos(headingRad);
  const s = Math.sin(headingRad);
  return {
    ox: lx * c + lz * s,
    oz: -lx * s + lz * c,
  };
}

/**
 * Quadrat des Abstands vom Punkt (px,pz) zur **Fußfläche** der Hitbox (Projektion der AABB auf XZ,
 * achsparallel zum Schiff). Ohne Hitbox: Abstand zum Schiffsmittelpunkt (Legacy).
 */
export function minDistSqPointToShipHitboxFootprintXZ(
  px: number,
  pz: number,
  shipX: number,
  shipZ: number,
  headingRad: number,
  hitbox: ShipCollisionHitbox | null | undefined,
): number {
  const ox = px - shipX;
  const oz = pz - shipZ;
  if (!hitbox) {
    return ox * ox + oz * oz;
  }
  const { lx, lz } = worldDeltaToShipLocalXZ(ox, oz, headingRad);
  const cx = hitbox.center.x;
  const cz = hitbox.center.z;
  const hx = Math.max(0, hitbox.halfExtents.x);
  const hz = Math.max(0, hitbox.halfExtents.z);
  const qx = clamp(lx, cx - hx, cx + hx);
  const qz = clamp(lz, cz - hz, cz + hz);
  const dx = lx - qx;
  const dz = lz - qz;
  return dx * dx + dz * dz;
}

/**
 * Kreis um (`cx`,`cz`) mit Radius `r` schneidet die Hitbox-Fußfläche (in XZ).
 */

/**
 * Welt-XZ-Mittelpunkt der Hitbox-Fußfläche und Umkreisradius (alle Ecken der AABB liegen auf oder innerhalb).
 * `shipX`/`shipZ` müssen zum gleichen Bezugspunkt gehören wie die Hitbox-Daten (z. B. Modell-Ursprung unter `ShipVisual.group`, nicht zwingend Simulations-Drehpunkt).
 */
export function shipHitboxFootprintCircumcircleWorldXZ(
  shipX: number,
  shipZ: number,
  headingRad: number,
  hitbox: ShipCollisionHitbox | null | undefined,
): { cx: number; cz: number; radius: number } {
  if (!hitbox) {
    return { cx: shipX, cz: shipZ, radius: 36 };
  }
  const bx = hitbox.center.x;
  const bz = hitbox.center.z;
  const hx = Math.max(0, hitbox.halfExtents.x);
  const hz = Math.max(0, hitbox.halfExtents.z);
  const cW = shipLocalDeltaToWorldXZ(bx, bz, headingRad);
  const cx = shipX + cW.ox;
  const cz = shipZ + cW.oz;
  const corners: [number, number][] = [
    [bx - hx, bz - hz],
    [bx + hx, bz - hz],
    [bx - hx, bz + hz],
    [bx + hx, bz + hz],
  ];
  let maxR = 0;
  for (const [lx, lz] of corners) {
    const w = shipLocalDeltaToWorldXZ(lx, lz, headingRad);
    const wx = shipX + w.ox;
    const wz = shipZ + w.oz;
    maxR = Math.max(maxR, Math.hypot(wx - cx, wz - cz));
  }
  const margin = 1.06;
  return { cx, cz, radius: maxR * margin };
}

export function circleIntersectsShipHitboxFootprintXZ(
  cx: number,
  cz: number,
  radius: number,
  shipX: number,
  shipZ: number,
  headingRad: number,
  hitbox: ShipCollisionHitbox | null | undefined,
): boolean {
  const r2 = radius * radius;
  return minDistSqPointToShipHitboxFootprintXZ(cx, cz, shipX, shipZ, headingRad, hitbox) <= r2 + 1e-12;
}
