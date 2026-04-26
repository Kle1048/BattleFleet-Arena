/** Globale SFX-Lautstärke + kurzes „Ducking“ nach lauten Ereignissen (Plan A — Feel). */

export const MASTER_SFX_MULT = 0.9;

/** Während Ducking: Multiplikator auf den bereits ortsabhängigen Gain. */
export const SFX_DUCK_MULT = 0.38;

export function effectiveSfxGain(base: number, nowMs: number, duckUntilMs: number): number {
  return base * MASTER_SFX_MULT * (nowMs < duckUntilMs ? SFX_DUCK_MULT : 1);
}

export function extendDuckUntil(nowMs: number, currentUntilMs: number, durationMs: number): number {
  return Math.max(currentUntilMs, nowMs + Math.max(0, durationMs));
}
