/**
 * Quadratisches Einsatzgebiet (XZ), Mittelpunkt Welt-Nullpunkt.
 * Gültig wenn |x| ≤ half und |z| ≤ half.
 * Außerhalb: OOB-Warnung / Zerstörung nach `OOB_DESTROY_AFTER_MS`.
 *
 * **Wasser-/Weltkarte** (`MAP_WORLD_HALF_EXTENT`) bleibt fest **10 000 × 10 000 m**; die **AO-Halbkante**
 * skaliert mit der Teilnehmerzahl (`operationalHalfExtentFromParticipantCount`) und wird im Raum-State repliziert.
 */

/** Feste halbe Kantenlänge der sichtbaren Wasser-Plane (±5000 m → 10 000 × 10 000 m). */
export const MAP_WORLD_HALF_EXTENT = 5000;

/** Kleinster AO-Halbradius — wenige Teilnehmer, engeres Gefecht. */
export const OPERATIONAL_AREA_HALF_EXTENT_MIN = 2000;

/** Größter AO-Halbradius — viele Teilnehmer; bleibt innerhalb `MAP_WORLD_HALF_EXTENT`. */
export const OPERATIONAL_AREA_HALF_EXTENT_MAX = 4800;

/**
 * Legacy-Name: oberes Ende der AO-Skalierung (Tests, Sea-Control-Assert, Fallbacks).
 * Laufende Matches nutzen `BattleState.operationalAreaHalfExtent`.
 */
export const AREA_OF_OPERATIONS_HALF_EXTENT = OPERATIONAL_AREA_HALF_EXTENT_MAX;

/** Zeit außerhalb bis „Zerstörung“ (Raum verlassen durch Server). */
export const OOB_DESTROY_AFTER_MS = 10_000;

/**
 * AO-Halbkante aus Teilnehmerzahl (Menschen + Server-Bots im `playerList`).
 * Linear von `OPERATIONAL_AREA_HALF_EXTENT_MIN` (1 Teilnehmer) bis `OPERATIONAL_AREA_HALF_EXTENT_MAX` (≥16).
 */
export function operationalHalfExtentFromParticipantCount(participantCount: number): number {
  const n = Math.max(1, Math.floor(participantCount));
  const loN = 1;
  const hiN = 16;
  const t = hiN <= loN ? 1 : Math.min(1, Math.max(0, (n - loN) / (hiN - loN)));
  return Math.round(
    OPERATIONAL_AREA_HALF_EXTENT_MIN +
      t * (OPERATIONAL_AREA_HALF_EXTENT_MAX - OPERATIONAL_AREA_HALF_EXTENT_MIN),
  );
}

export function isInsideOperationalArea(x: number, z: number, halfExtent: number): boolean {
  return Math.abs(x) <= halfExtent && Math.abs(z) <= halfExtent;
}
