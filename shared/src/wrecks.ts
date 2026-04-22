/**
 * Wracks nach Schiffszerstörung — Kollision wie Insel-Kreise, Lebensdauer unabhängig vom Respawn.
 */

/** Wrack bleibt als Hindernis (Server + repliziert für Client-Animation). */
export const WRECK_DURATION_MS = 60_000;

/** Dauer der sichtbaren Sink-/Kipp-Animation (asymptotisch auslaufend; kleiner = schnelleres Absinken). */
export const WRECK_ANIM_TOTAL_MS = 20_000;

/**
 * 0 = Heck zuerst unter (Bug zuletzt oben), 1 = Backbord unten, 2 = Steuerbord unten,
 * 3 = Bug zuerst unter (Heck zuletzt oben).
 */
export type WreckVariantId = 0 | 1 | 2 | 3;

/** Deterministisch pro Session — gleicher Wert auf Server und Client. */
export function wreckVariantFromSessionId(sessionId: string): WreckVariantId {
  let h = 2166136261;
  for (let i = 0; i < sessionId.length; i++) {
    h ^= sessionId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const v = Math.abs(h) % 4;
  return v as WreckVariantId;
}
