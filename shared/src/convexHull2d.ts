/**
 * Konvexe Hülle in der XZ-Ebene (Y ignoriert). Monotone-Chain, Ergebnis gegen den Uhrzeigersinn.
 * Für Insel-Fußabdrücke aus Mesh-Vertices in Weltkoordinaten.
 */

export type XZ = { x: number; z: number };

function cross(o: XZ, a: XZ, b: XZ): number {
  return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
}

/** Entfernt exakte Duplikate (nach Sortierung benachbart). */
function dedupeSorted(points: XZ[]): XZ[] {
  const out: XZ[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (prev && prev.x === p.x && prev.z === p.z) continue;
    out.push(p);
  }
  return out;
}

/**
 * Konvexe Hülle von Punkten in XZ. Mindestens 3 nicht-kollineare Punkte → geschlossenes Polygon (CCW).
 * Weniger als drei Punkte oder stärker degeneriert: gekürzte Punktliste.
 */
export function convexHullXZ(points: readonly XZ[]): XZ[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [{ ...points[0]! }];
  if (points.length === 2) {
    const a = points[0]!;
    const b = points[1]!;
    if (a.x === b.x && a.z === b.z) return [{ ...a }];
    return [{ ...a }, { ...b }];
  }

  const sorted = dedupeSorted(
    [...points].sort((p, q) => (p.x === q.x ? p.z - q.z : p.x - q.x)),
  );
  if (sorted.length < 2) return sorted.map((p) => ({ ...p }));

  const lower: XZ[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: XZ[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}
