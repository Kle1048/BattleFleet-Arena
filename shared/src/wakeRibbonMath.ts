/**
 * Reine 2D-Hilfen für ein Kielwasser-Band in der XZ-Ebene (Y nach oben).
 */

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
