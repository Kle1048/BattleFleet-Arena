/**
 * Task 9 — SAM + CIWS (MVP): zweistufig, wahrscheinlichkeitsbasiert, keine Bullet-Simulation.
 * **Reichweite:** äußerer Ring bis **SAM**-Radius; Innenring **CIWS** (Teilkreis im SAM-Gürtel).
 * **Reihenfolge:** zuerst **SAM**, bei Fehlschuss (nächster Englagement-Zyklus) **CIWS**.
 *
 * **Tick-Modell (Server):** Eintritt in Reichweite + bereiter Layer → **Feuer** (`airDefenseFire`);
 * erst im **darauffolgenden** Simulationstick → **Wurf** (Treffer/Fehler + Cooldown).
 *
 * Nur gegen **Luftziele** (eingehende ASuM). **Torpedos** werden hier nicht abgefangen.
 */

/** Äußerer SAM-Gürtel (Meter). */
export const AD_SAM_RANGE = 100;
export const AD_SAM_RANGE_SQ = AD_SAM_RANGE * AD_SAM_RANGE;
/** Innenring CIWS (Meter). */
export const AD_CIWS_RANGE = 50;
export const AD_CIWS_RANGE_SQ = AD_CIWS_RANGE * AD_CIWS_RANGE;

export const AD_SAM_COOLDOWN_MS = 4200;
export const AD_CIWS_COOLDOWN_MS = 520;

/** Trefferchance pro Layer (0…1) — niedrig; reale Abfangquote über Anflug + Tick-Retries. */
export const AD_SAM_P_HIT = 0.22;
export const AD_CIWS_P_HIT = 0.28;

export type AirDefenseLayer = "sam" | "ciws";

export type AirDefenseAttemptInput = {
  distSq: number;
  nowMs: number;
  /** Frühester Zeitpunkt für nächsten SAM-Versuch (`nowMs <` → nicht bereit). */
  samNextAtMs: number;
  ciwsNextAtMs: number;
};

/** Welcher Layer als Nächstes **feuern** darf (SAM vor CIWS), ohne Wurf — `null` wenn nichts bereit/in Reichweite. */
export function pickAirDefenseEngagementLayer(
  input: AirDefenseAttemptInput,
): AirDefenseLayer | null {
  const { distSq, nowMs, samNextAtMs, ciwsNextAtMs } = input;
  if (distSq <= AD_SAM_RANGE_SQ && nowMs >= samNextAtMs) return "sam";
  if (distSq <= AD_CIWS_RANGE_SQ && nowMs >= ciwsNextAtMs) return "ciws";
  return null;
}

/** Liegt `distSq` noch im gültigen Rohr für den gewählten Layer? */
export function isAirDefenseLayerInRange(
  layer: AirDefenseLayer,
  distSq: number,
): boolean {
  if (layer === "sam") return distSq <= AD_SAM_RANGE_SQ;
  return distSq <= AD_CIWS_RANGE_SQ;
}

/** Reiner Trefferwurf (einmal). */
export function rollAirDefenseHit(
  layer: AirDefenseLayer,
  random01: () => number,
): boolean {
  const p = layer === "sam" ? AD_SAM_P_HIT : AD_CIWS_P_HIT;
  return random01() < p;
}

/** Cooldown für den Layer setzen, nachdem **geschossen und aufgelöst** wurde (Treffer oder Fehlschuss). */
export function applyAirDefenseCooldownAfterRoll(
  layer: AirDefenseLayer,
  nowMs: number,
  samNextAtMs: number,
  ciwsNextAtMs: number,
): { samNextAtMs: number; ciwsNextAtMs: number } {
  if (layer === "sam") {
    return { samNextAtMs: nowMs + AD_SAM_COOLDOWN_MS, ciwsNextAtMs };
  }
  return { samNextAtMs, ciwsNextAtMs: nowMs + AD_CIWS_COOLDOWN_MS };
}
