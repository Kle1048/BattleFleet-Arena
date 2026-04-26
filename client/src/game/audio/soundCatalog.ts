/**
 * WAV-Dateien unter `client/public/assets/sounds/` ablegen; Dateinamen = Werte unten.
 * Fehlende Dateien sind unkritisch — `gameAudio` fällt auf Synth-Beeps zurück.
 */
const BASE = `${import.meta.env.BASE_URL}assets/sounds/`;

export const SoundFiles = {
  primaryFire: "primary_fire.wav",
  missileFire: "missile_fire.wav",
  torpedoFire: "torpedo_fire.wav",
  hitNear: "hit_near.wav",
  levelUp: "level_up.wav",
  warning: "warning.wav",
  /** Schiff↔Schiff (lokaler Spieler, Kontaktbeginn). */
  shipShipCollision: "ship_ship_collision.wav",
  /** Schiff↔Insel/Land (lokaler Spieler, Kontaktbeginn). */
  shipIslandCollision: "ship_island_collision.wav",
  /** ASuM: Sucher hat Ziel erfasst (Übergang ohne → mit Ziel). */
  missileLockOn: "missile_lock_on.wav",
  /** Luftverteidigung: SAM-Start. */
  airDefenseSamFire: "air_defense_sam_fire.wav",
  /** Luftverteidigung: SAM-Einschlag / Intercept. */
  airDefenseSamIntercept: "air_defense_sam_intercept.wav",
  /** Luftverteidigung: CIWS-Salve. */
  airDefenseCiwsFire: "air_defense_ciws_fire.wav",
  /** Luftverteidigung: CIWS-Treffer. */
  airDefenseCiwsIntercept: "air_defense_ciws_intercept.wav",
  /** Direkter Waffentreffer (Artillerie / ASuM / Mine; Server `kind === "hit"`). */
  weaponHit: "weapon_hit.wav",
  /** Große Detonation: Schiffszerstörung. */
  explosion: "explosion.wav",
  /** ECM / Düppel — Softkill-Versuch (optional WAV). */
  softkillChaff: "softkill_chaff.wav",
  /**
   * Nahtloser Maschinenraum-/Diesel-Loop, Lautstärke und Wiedergabegeschwindigkeit
   * werden aus Fahrt/Throttle gemischt.
   */
  engineLoop: "engine_loop.wav",
  /** Hebelraster am Maschinentelegraf / Ruder-Wiederholer (pro Rasterwechsel). */
  telegraphNotchClick: "telegraph_notch_click.wav",
  /** Dynamische Musik, Stufe 0 (ruhig) — Variante A/B. */
  musicAmbientA: "music_ambient_a.wav",
  musicAmbientB: "music_ambient_b.wav",
  musicTensionA: "music_tension_a.wav",
  musicTensionB: "music_tension_b.wav",
  musicCombatA: "music_combat_a.wav",
  musicCombatB: "music_combat_b.wav",
} as const;

export type SoundId = keyof typeof SoundFiles;

export const SoundUrls: Record<SoundId, string> = {
  primaryFire: `${BASE}${SoundFiles.primaryFire}`,
  missileFire: `${BASE}${SoundFiles.missileFire}`,
  torpedoFire: `${BASE}${SoundFiles.torpedoFire}`,
  hitNear: `${BASE}${SoundFiles.hitNear}`,
  levelUp: `${BASE}${SoundFiles.levelUp}`,
  warning: `${BASE}${SoundFiles.warning}`,
  shipShipCollision: `${BASE}${SoundFiles.shipShipCollision}`,
  shipIslandCollision: `${BASE}${SoundFiles.shipIslandCollision}`,
  missileLockOn: `${BASE}${SoundFiles.missileLockOn}`,
  airDefenseSamFire: `${BASE}${SoundFiles.airDefenseSamFire}`,
  airDefenseSamIntercept: `${BASE}${SoundFiles.airDefenseSamIntercept}`,
  airDefenseCiwsFire: `${BASE}${SoundFiles.airDefenseCiwsFire}`,
  airDefenseCiwsIntercept: `${BASE}${SoundFiles.airDefenseCiwsIntercept}`,
  weaponHit: `${BASE}${SoundFiles.weaponHit}`,
  explosion: `${BASE}${SoundFiles.explosion}`,
  softkillChaff: `${BASE}${SoundFiles.softkillChaff}`,
  engineLoop: `${BASE}${SoundFiles.engineLoop}`,
  telegraphNotchClick: `${BASE}${SoundFiles.telegraphNotchClick}`,
  musicAmbientA: `${BASE}${SoundFiles.musicAmbientA}`,
  musicAmbientB: `${BASE}${SoundFiles.musicAmbientB}`,
  musicTensionA: `${BASE}${SoundFiles.musicTensionA}`,
  musicTensionB: `${BASE}${SoundFiles.musicTensionB}`,
  musicCombatA: `${BASE}${SoundFiles.musicCombatA}`,
  musicCombatB: `${BASE}${SoundFiles.musicCombatB}`,
};

/** Welche logischen Sounds es gibt (für Preload / Debug). */
export const ALL_SOUND_IDS: readonly SoundId[] = [
  "primaryFire",
  "missileFire",
  "torpedoFire",
  "hitNear",
  "levelUp",
  "warning",
  "shipShipCollision",
  "shipIslandCollision",
  "missileLockOn",
  "airDefenseSamFire",
  "airDefenseSamIntercept",
  "airDefenseCiwsFire",
  "airDefenseCiwsIntercept",
  "weaponHit",
  "explosion",
  "softkillChaff",
  "engineLoop",
  "telegraphNotchClick",
  "musicAmbientA",
  "musicAmbientB",
  "musicTensionA",
  "musicTensionB",
  "musicCombatA",
  "musicCombatB",
];
