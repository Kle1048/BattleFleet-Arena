/**
 * Layered air defense (server-authoritative helpers):
 * - **Softkill** (chaff/ECM): automatic, separate from hardkill; may break ASuM lock without destroying.
 * - **Hardkill**: SAM → PD → CIWS; nur mit passendem Rumpf-Loadout pro Schicht (siehe BattleRoom); vollautomatisch.
 *
 * Tick model: in range + ready + Feuersektor → `airDefenseFire` (Client: Abfang-FK startet).
 * - **SAM / PD**: nach Flugzeit (`computeSamPdInterceptTravelMs`) Trefferwurf am ASuM-Standort — Treffer: beide weg;
 *   Fehlschuss: nur Abfang „verbraucht“ (Cooldown), ASuM fliegt weiter.
 * - **CIWS**: Trefferwurf im nächsten Tick (nahezu sofort).
 *
 * **Sektor:** Beim ersten Schuss (`pickHardkillEngagementLayer` / `airDefenseFire`) muss die ASuM-Richtung
 * mindestens einen passenden Mount-Sektor (`visual_sam` / `visual_pdms` / `visual_ciws`) treffen — nicht beim Trefferwurf.
 */

import { aimDirectionYawFromBowRad, isYawWithinMountFireSector } from "./artillery";
import {
  resolveEffectiveMountFireSector,
  type ShipHullVisualProfile,
} from "./shipVisualLayout";

/** Äußerer SAM-Ring (m). */
export const AD_SAM_RANGE = 400;
export const AD_SAM_RANGE_SQ = AD_SAM_RANGE * AD_SAM_RANGE;
/** PD / RAM-ähnlich (m), zwischen SAM und CIWS. */
export const AD_PD_RANGE = 200;
export const AD_PD_RANGE_SQ = AD_PD_RANGE * AD_PD_RANGE;
/** CIWS (m). */
export const AD_CIWS_RANGE = 100;
export const AD_CIWS_RANGE_SQ = AD_CIWS_RANGE * AD_CIWS_RANGE;
/**
 * Softkill-Einflusszone (m) — einmaliger Wurf, wenn die Rakete diese Distanz zum Verteidiger erreicht.
 */
export const AD_SOFTKILL_RANGE = 200;
export const AD_SOFTKILL_RANGE_SQ = AD_SOFTKILL_RANGE * AD_SOFTKILL_RANGE;

export const AD_SOFTKILL_PROC_CHANCE = 0.3;
export const AD_SOFTKILL_COOLDOWN_MS = 2500;
/**
 * Nach erfolgreichem Softkill: gleiches Ziel darf per Seeker nicht **sofort** wieder erworben werden,
 * sonst wäre der Lock-Bruch wirkungslos (Kegel + stehendes Ziel → jeden Tick Re-Lock).
 */
export const AD_SOFTKILL_SAME_TARGET_REACQUIRE_BLOCK_MS = 4500;

/**
 * Globaler SAM-Abstand pro Verteidiger (ms) — nach jedem SAM-Versuch (Feuer + Trefferwurf),
 * unabhängig von Treffer/Fehlschuss. Wird in `BattleRoom` bereits beim `airDefenseFire` reserviert,
 * damit im selben Tick nicht zwei Raketen parallel einen SAM starten.
 */
/** Mindestabstand zwischen SAM-Versuchen pro Verteidiger (3 s). */
export const AD_SAM_COOLDOWN_MS = 3000;
export const AD_PD_COOLDOWN_MS = 1800;
export const AD_CIWS_COOLDOWN_MS = 520;

export const AD_SAM_P_HIT = 0.22;
export const AD_PD_P_HIT = 0.35;
export const AD_CIWS_P_HIT = 0.28;

/** Mittlere Geschwindigkeit SAM/PD-Abfangkörper (m/s) — bestimmt Server-Flugzeit bis Trefferwurf. */
export const AD_SAM_PD_INTERCEPT_SPEED_MPS = 480;
export const AD_SAM_PD_INTERCEPT_TRAVEL_MS_MIN = 220;
export const AD_SAM_PD_INTERCEPT_TRAVEL_MS_MAX = 1050;

/**
 * Flugzeit Verteidiger↔ASuM für SAM/PD (ms), an Entfernung gekoppelt — grob an Client-VFX angelehnt.
 */
export function computeSamPdInterceptTravelMs(distM: number): number {
  if (!Number.isFinite(distM) || distM <= 0) return AD_SAM_PD_INTERCEPT_TRAVEL_MS_MIN;
  const raw = (distM / AD_SAM_PD_INTERCEPT_SPEED_MPS) * 1000;
  return Math.round(
    Math.max(AD_SAM_PD_INTERCEPT_TRAVEL_MS_MIN, Math.min(AD_SAM_PD_INTERCEPT_TRAVEL_MS_MAX, raw)),
  );
}

/** @deprecated Nicht mehr genutzt — Hardkill läuft ohne Tasten-Commit. */
export const AD_HARDKILL_COMMIT_DURATION_MS = 15_000;

export type AirDefenseHardkillLayer = "sam" | "pd" | "ciws";

const HARDKILL_LAYER_VISUAL: Record<AirDefenseHardkillLayer, string> = {
  sam: "visual_sam",
  pd: "visual_pdms",
  ciws: "visual_ciws",
};

/**
 * Liegt die Anflugrichtung zur ASuM (Yaw vom Bug) im Feuersektor mindestens eines Mounts dieser Schicht?
 * Nur für die Schussentscheidung — nicht für den späteren Trefferwurf.
 */
export function missileBearingInHardkillLayerMountSector(
  hull: ShipHullVisualProfile | undefined,
  classArcHalfAngleRad: number,
  layer: AirDefenseHardkillLayer,
  defenderX: number,
  defenderZ: number,
  defenderHeadingRad: number,
  missileX: number,
  missileZ: number,
): boolean {
  if (!hull?.mountSlots?.length) return false;
  const loadout = hull.defaultLoadout ?? {};
  const want = HARDKILL_LAYER_VISUAL[layer];
  const yaw = aimDirectionYawFromBowRad(
    defenderX,
    defenderZ,
    defenderHeadingRad,
    missileX,
    missileZ,
  );
  if (yaw == null) return true;
  for (const slot of hull.mountSlots) {
    const vid = loadout[slot.id] ?? slot.defaultVisualId ?? "";
    if (vid !== want) continue;
    const sector = resolveEffectiveMountFireSector(slot, hull, classArcHalfAngleRad);
    if (isYawWithinMountFireSector(yaw, sector)) return true;
  }
  return false;
}

export type HardkillAttemptInput = {
  distSq: number;
  nowMs: number;
  samNextAtMs: number;
  pdNextAtMs: number;
  ciwsNextAtMs: number;
  /** SAM: nur bei aktiv gesetztem Suchrad (`radarActive`). */
  samAllowed: boolean;
  /** PD: nur mit Lock des Flugkörpers auf dieses Schiff. */
  pdAllowed: boolean;
  /** CIWS: nur mit `visual_ciws` am Slot (Loadout). */
  ciwsAllowed: boolean;
};

/**
 * Äußerste bereite Schicht wählen: SAM vor PD vor CIWS.
 */
export function pickHardkillEngagementLayer(
  input: HardkillAttemptInput,
): AirDefenseHardkillLayer | null {
  const { distSq, nowMs, samNextAtMs, pdNextAtMs, ciwsNextAtMs, samAllowed, pdAllowed, ciwsAllowed } =
    input;
  if (distSq <= AD_SAM_RANGE_SQ && nowMs >= samNextAtMs && samAllowed) return "sam";
  if (distSq <= AD_PD_RANGE_SQ && nowMs >= pdNextAtMs && pdAllowed) return "pd";
  if (distSq <= AD_CIWS_RANGE_SQ && nowMs >= ciwsNextAtMs && ciwsAllowed) return "ciws";
  return null;
}

export function isHardkillLayerInRange(
  layer: AirDefenseHardkillLayer,
  distSq: number,
): boolean {
  if (layer === "sam") return distSq <= AD_SAM_RANGE_SQ;
  if (layer === "pd") return distSq <= AD_PD_RANGE_SQ;
  return distSq <= AD_CIWS_RANGE_SQ;
}

export function rollHardkillHit(
  layer: AirDefenseHardkillLayer,
  random01: () => number,
): boolean {
  const p =
    layer === "sam" ? AD_SAM_P_HIT : layer === "pd" ? AD_PD_P_HIT : AD_CIWS_P_HIT;
  return random01() < p;
}

export function applyHardkillCooldownAfterRoll(
  layer: AirDefenseHardkillLayer,
  nowMs: number,
  samNextAtMs: number,
  pdNextAtMs: number,
  ciwsNextAtMs: number,
): { samNextAtMs: number; pdNextAtMs: number; ciwsNextAtMs: number } {
  if (layer === "sam") {
    return {
      samNextAtMs: nowMs + AD_SAM_COOLDOWN_MS,
      pdNextAtMs,
      ciwsNextAtMs,
    };
  }
  if (layer === "pd") {
    return {
      samNextAtMs,
      pdNextAtMs: nowMs + AD_PD_COOLDOWN_MS,
      ciwsNextAtMs,
    };
  }
  return {
    samNextAtMs,
    pdNextAtMs,
    ciwsNextAtMs: nowMs + AD_CIWS_COOLDOWN_MS,
  };
}

export type SoftkillAttemptInput = {
  nowMs: number;
  defenderSoftkillLastUsedAtMs: number;
  random01: () => number;
};

/**
 * Ein Versuch pro Rakete/Zielpaar (außerhalb des Server-Takts wird der Versuch nicht wiederholt).
 * Setzt immer eine Ship-Cooldown-Zeit nach einem Versuch.
 */
export function trySoftkillBreakLock(input: SoftkillAttemptInput): {
  attempted: boolean;
  brokeLock: boolean;
  newSoftkillLastUsedAtMs: number;
} {
  const { nowMs, defenderSoftkillLastUsedAtMs, random01 } = input;
  const cooldownEndsAt =
    defenderSoftkillLastUsedAtMs > 0
      ? defenderSoftkillLastUsedAtMs + AD_SOFTKILL_COOLDOWN_MS
      : 0;
  if (nowMs < cooldownEndsAt) {
    return { attempted: false, brokeLock: false, newSoftkillLastUsedAtMs: defenderSoftkillLastUsedAtMs };
  }
  const success = random01() < AD_SOFTKILL_PROC_CHANCE;
  return {
    attempted: true,
    brokeLock: success,
    newSoftkillLastUsedAtMs: nowMs,
  };
}
