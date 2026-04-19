/**
 * Krängung in der Kurve — nur Darstellung (keine Server-Simulation).
 * Rudder −1…1, Speed in Welt wie `PlayerState.speed`.
 */
/** Cap ≈ 10° — reine Darstellung. */
const ROLL_MAX_RAD = (10 * Math.PI) / 180;
const ROLL_RUDDER_GAIN = 0.1;
/** Ab dieser Geschwindigkeit (näherungsweise) volle Krängung. */
const ROLL_SPEED_REF = 7;
/** Glättung (höher = schneller). */
const ROLL_SMOOTH_RATE = 14;

const rollSmoothedRadBySessionId = new Map<string, number>();

export function visualRollRadFromRudderAndSpeed(rudder: number, speed: number): number {
  const r = Number.isFinite(rudder) ? rudder : 0;
  const sp = Number.isFinite(speed) ? speed : 0;
  const speedFactor = Math.min(1, Math.abs(sp) / ROLL_SPEED_REF);
  const roll = -ROLL_RUDDER_GAIN * r * speedFactor;
  return Math.max(-ROLL_MAX_RAD, Math.min(ROLL_MAX_RAD, roll));
}

/**
 * Exponentielles Einfedern der Ziel-Krängung (pro Frame, dt-abhängig).
 */
export function stepVisualRollSmoothed(
  sessionId: string,
  targetRollRad: number,
  dtSec: number,
): number {
  const prev = rollSmoothedRadBySessionId.get(sessionId) ?? 0;
  const t = Math.max(0, dtSec);
  const alpha = t <= 0 ? 0 : 1 - Math.exp(-ROLL_SMOOTH_RATE * t);
  const next = prev + alpha * (targetRollRad - prev);
  rollSmoothedRadBySessionId.set(sessionId, next);
  return next;
}

/** Aufruf einmal pro Frame nach dem Schiffs-Loop — entfernte Spieler aus dem Glättungs-Speicher. */
export function pruneVisualRollSmoothed(activeSessionIds: ReadonlySet<string>): void {
  for (const id of [...rollSmoothedRadBySessionId.keys()]) {
    if (!activeSessionIds.has(id)) rollSmoothedRadBySessionId.delete(id);
  }
}
