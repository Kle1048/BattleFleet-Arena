/**
 * Task 11 — In-Match-Progression: XP & Level 1…10 (Match-Score bleibt unabhängig).
 * Tod: ein Level runter (min. 1), XP auf Untergrenze des neuen Levels; neues Match: Reset wie `resetMatchForNewRound`.
 */

import {
  ARTILLERY_PLAYER_MAX_HP,
  ARTILLERY_PRIMARY_COOLDOWN_MS,
} from "./artillery";
import { ASWM_COOLDOWN_MS } from "./aswm";
import { TORPEDO_COOLDOWN_MS } from "./torpedo";

export const PROGRESSION_MAX_LEVEL = 10;

/** XP pro Kill (kein Assist im Spiel). */
export const PROGRESSION_XP_PER_KILL = 100;

/**
 * Kumulative Mindest-XP um **mindestens** dieses Level zu sein.
 * Index = Level (1…10). Level 10: alles XP ≥ `PROGRESSION_LEVEL_MIN_XP[10]` bleibt L10.
 */
export const PROGRESSION_LEVEL_MIN_XP: ReadonlyArray<number> = [
  0,
  0,
  100,
  230,
  400,
  600,
  850,
  1150,
  1500,
  1900,
  2400,
];

export function progressionClampLevel(level: number): number {
  return Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Math.floor(level)));
}

/**
 * US Navy officer ranks (O-1…O-10) for progression levels 1…10 (gameplay abstraction).
 * Index 0 = level 1, … index 9 = level 10.
 */
export const PROGRESSION_LEVEL_NAVAL_RANK_EN: readonly string[] = [
  "Ensign",
  "Lieutenant Junior Grade",
  "Lieutenant",
  "Lieutenant Commander",
  "Commander",
  "Captain",
  "Commodore",
  "Rear Admiral",
  "Vice Admiral",
  "Admiral",
];

/** English naval officer rank title for the given progression level (1…10). */
export function progressionNavalRankEn(level: number): string {
  const lv = progressionClampLevel(level);
  return PROGRESSION_LEVEL_NAVAL_RANK_EN[lv - 1] ?? PROGRESSION_LEVEL_NAVAL_RANK_EN[0]!;
}

/** Kumulativ-XP am Anfang dieses Levels (Untergrenze für `progressionLevelFromTotalXp`). */
export function progressionMinXpForLevel(level: number): number {
  const lv = progressionClampLevel(level);
  return PROGRESSION_LEVEL_MIN_XP[lv] ?? 0;
}

/** Level aus kumulativer XP im aktuellen Leben (1…10). */
export function progressionLevelFromTotalXp(totalXp: number): number {
  const xp = Math.max(0, totalXp);
  let lv = 1;
  for (let L = PROGRESSION_MAX_LEVEL; L >= 1; L--) {
    if (xp >= PROGRESSION_LEVEL_MIN_XP[L]!) {
      lv = L;
      break;
    }
  }
  return lv;
}

/** XP-Bedarf ab aktuellem Level bis zum nächsten (0 wenn schon Max-Level). */
export function progressionXpToNextLevel(level: number, totalXp: number): {
  intoLevel: number;
  need: number;
} {
  const lv = progressionClampLevel(level);
  if (lv >= PROGRESSION_MAX_LEVEL) {
    return { intoLevel: 0, need: 0 };
  }
  const curMin = PROGRESSION_LEVEL_MIN_XP[lv]!;
  const nextMin = PROGRESSION_LEVEL_MIN_XP[lv + 1]!;
  return {
    intoLevel: Math.max(0, totalXp - curMin),
    need: Math.max(1, nextMin - curMin),
  };
}

export function progressionMaxHpForLevel(
  level: number,
  baseMaxHp: number = ARTILLERY_PLAYER_MAX_HP,
): number {
  const lv = progressionClampLevel(level);
  return Math.round(baseMaxHp * (1 + 0.055 * (lv - 1)));
}

/** Faktor < 1 = kürzere Cooldowns bei höherem Level. */
export function progressionPrimaryCooldownFactor(level: number): number {
  const lv = progressionClampLevel(level);
  return Math.max(0.78, 1 - 0.017 * (lv - 1));
}

export function progressionSecondaryCooldownFactor(level: number): number {
  const lv = progressionClampLevel(level);
  return Math.max(0.82, 1 - 0.014 * (lv - 1));
}

export function progressionTorpedoCooldownFactor(level: number): number {
  const lv = progressionClampLevel(level);
  return Math.max(0.85, 1 - 0.012 * (lv - 1));
}

export function progressionPrimaryCooldownMs(level: number): number {
  return Math.max(
    280,
    Math.round(ARTILLERY_PRIMARY_COOLDOWN_MS * progressionPrimaryCooldownFactor(level)),
  );
}

export function progressionSecondaryCooldownMs(level: number): number {
  return Math.max(
    1500,
    Math.round(ASWM_COOLDOWN_MS * progressionSecondaryCooldownFactor(level)),
  );
}

export function progressionTorpedoCooldownMs(level: number): number {
  return Math.max(
    1000,
    Math.round(TORPEDO_COOLDOWN_MS * progressionTorpedoCooldownFactor(level)),
  );
}

/** Eingehenden Schaden leicht reduzieren (Abwehr-Skalierung). */
export function progressionIncomingDamageFactor(level: number): number {
  const lv = progressionClampLevel(level);
  return Math.max(0.88, 1 - 0.012 * (lv - 1));
}

export type MovementScale = {
  maxSpeedFactor: number;
  maxTurnRateFactor: number;
};

export function progressionMovementScale(level: number): MovementScale {
  const lv = progressionClampLevel(level);
  return {
    maxSpeedFactor: 1 + 0.018 * (lv - 1),
    maxTurnRateFactor: 1 + 0.015 * (lv - 1),
  };
}
