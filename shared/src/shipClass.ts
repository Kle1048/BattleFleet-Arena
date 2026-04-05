/**
 * Task 12 — Schiffsklassen (FAC, Zerstörer, Kreuzer): Stats, Bug-Feuerbogen, Silhouette-Skalierung.
 */

import { ARTILLERY_ARC_HALF_ANGLE_RAD, ARTILLERY_PLAYER_MAX_HP } from "./artillery";
import { ASWM_MAX_PER_OWNER } from "./aswm";
import { TORPEDO_MAX_PER_OWNER } from "./torpedo";

export const SHIP_CLASS_FAC = "fac";
export const SHIP_CLASS_DESTROYER = "destroyer";
export const SHIP_CLASS_CRUISER = "cruiser";

export type ShipClassId =
  | typeof SHIP_CLASS_FAC
  | typeof SHIP_CLASS_DESTROYER
  | typeof SHIP_CLASS_CRUISER;

export type ShipClassProfile = {
  id: ShipClassId;
  /** Repliziert / UI: kurzes Label */
  labelDe: string;
  /** maxHp bei Level 1 ohne Progressions-Multiplikator (Basis für `progressionMaxHpForLevel`). */
  baseMaxHp: number;
  /** Multiplikatoren relativ zu `DESTROYER_LIKE_MVP`. */
  movementSpeedMul: number;
  turnRateMul: number;
  accelMul: number;
  /** Halber Artillerie-Bogen (rad), identisch zu `isInForwardArc`. */
  artilleryArcHalfAngleRad: number;
  aswmMaxPerOwner: number;
  /** Faktor auf `ASWM_COOLDOWN_MS` vor Level-Skalierung. */
  aswmCooldownFactor: number;
  torpedoMaxPerOwner: number;
  torpedoCooldownFactor: number;
  /** Zusätzlicher Faktor auf eingehenden Waffenschaden (× Progression). */
  incomingDamageTakenMul: number;
  /** Client: Größe des Dreiecks-Rumpfs (~1 = Zerstörer). */
  hullScale: number;
};

const PROFILE_FAC: ShipClassProfile = {
  id: SHIP_CLASS_FAC,
  labelDe: "FAC",
  baseMaxHp: Math.round(ARTILLERY_PLAYER_MAX_HP * 0.7),
  movementSpeedMul: 1.14,
  turnRateMul: 1.12,
  accelMul: 1.08,
  artilleryArcHalfAngleRad: (70 * Math.PI) / 180,
  aswmMaxPerOwner: 1,
  aswmCooldownFactor: 0.88,
  torpedoMaxPerOwner: TORPEDO_MAX_PER_OWNER,
  torpedoCooldownFactor: 0.92,
  incomingDamageTakenMul: 1.06,
  hullScale: 0.62,
};

const PROFILE_DESTROYER: ShipClassProfile = {
  id: SHIP_CLASS_DESTROYER,
  labelDe: "Zerstörer",
  baseMaxHp: ARTILLERY_PLAYER_MAX_HP,
  movementSpeedMul: 1,
  turnRateMul: 1,
  accelMul: 1,
  artilleryArcHalfAngleRad: ARTILLERY_ARC_HALF_ANGLE_RAD,
  aswmMaxPerOwner: ASWM_MAX_PER_OWNER,
  aswmCooldownFactor: 1,
  torpedoMaxPerOwner: TORPEDO_MAX_PER_OWNER,
  torpedoCooldownFactor: 1,
  incomingDamageTakenMul: 1,
  hullScale: 1,
};

const PROFILE_CRUISER: ShipClassProfile = {
  id: SHIP_CLASS_CRUISER,
  labelDe: "Kreuzer",
  baseMaxHp: Math.round(ARTILLERY_PLAYER_MAX_HP * 1.32),
  movementSpeedMul: 0.86,
  turnRateMul: 0.88,
  accelMul: 0.92,
  artilleryArcHalfAngleRad: (52 * Math.PI) / 180,
  aswmMaxPerOwner: ASWM_MAX_PER_OWNER,
  aswmCooldownFactor: 1.1,
  torpedoMaxPerOwner: TORPEDO_MAX_PER_OWNER,
  torpedoCooldownFactor: 1.08,
  incomingDamageTakenMul: 0.93,
  hullScale: 1.22,
};

const byId: Record<ShipClassId, ShipClassProfile> = {
  [SHIP_CLASS_FAC]: PROFILE_FAC,
  [SHIP_CLASS_DESTROYER]: PROFILE_DESTROYER,
  [SHIP_CLASS_CRUISER]: PROFILE_CRUISER,
};

export function normalizeShipClassId(raw: unknown): ShipClassId {
  const s = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  if (s === SHIP_CLASS_FAC || s === "fast_attack") return SHIP_CLASS_FAC;
  if (s === SHIP_CLASS_CRUISER) return SHIP_CLASS_CRUISER;
  if (s === SHIP_CLASS_DESTROYER || s === "") return SHIP_CLASS_DESTROYER;
  return SHIP_CLASS_DESTROYER;
}

export function getShipClassProfile(id: unknown): ShipClassProfile {
  return byId[normalizeShipClassId(id)];
}

export function shipClassBaseMaxHp(id: unknown): number {
  return getShipClassProfile(id).baseMaxHp;
}
