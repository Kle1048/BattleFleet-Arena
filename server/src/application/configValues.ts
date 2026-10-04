import {
  AD_SAM_COOLDOWN_MS,
  MATCH_DURATION_SEC,
  MATCH_PASSIVE_XP_BASE,
  MATCH_PASSIVE_XP_INTERVAL_MS,
  OOB_DESTROY_AFTER_MS,
  OPERATIONAL_AREA_HALF_EXTENT_MAX,
  OPERATIONAL_AREA_HALF_EXTENT_MIN,
  RESPAWN_DELAY_MS,
  SEA_CONTROL_XP_MULTIPLIER,
  SPAWN_PROTECTION_DURATION_MS,
} from "@battlefleet/shared/rules";
import { DEFAULT_MIN_ROOM_PLAYERS, MAX_HUMAN_CLIENTS_IN_ROOM } from "../simulation/systems/botPopulation.js";

export type AdminConfig = {
  matchDurationSec: number;
  minRoomPlayers: number;
  maintenanceMode: boolean;
  /** Applied at room creation / round restart, never halfway through a round. */
  islandsEnabled: boolean;
  operationalAreaHalfExtent: number;
  passiveXpIntervalMs: number;
  passiveXpBase: number;
  seaControlXpMultiplier: number;
  respawnDelayMs: number;
  spawnProtectionMs: number;
  samCooldownMs: number;
  oobDestroyAfterMs: number;
};

export type AdminConfigPatch = Partial<AdminConfig>;

export function defaultConfig(matchDurationSec = MATCH_DURATION_SEC, minRoomPlayers = DEFAULT_MIN_ROOM_PLAYERS): AdminConfig {
  return {
    matchDurationSec: clampMatchDurationSec(matchDurationSec),
    minRoomPlayers: clampMinRoomPlayers(minRoomPlayers),
    maintenanceMode: false,
    islandsEnabled: false,
    operationalAreaHalfExtent: 0,
    passiveXpIntervalMs: MATCH_PASSIVE_XP_INTERVAL_MS,
    passiveXpBase: MATCH_PASSIVE_XP_BASE,
    seaControlXpMultiplier: SEA_CONTROL_XP_MULTIPLIER,
    respawnDelayMs: RESPAWN_DELAY_MS,
    spawnProtectionMs: SPAWN_PROTECTION_DURATION_MS,
    samCooldownMs: AD_SAM_COOLDOWN_MS,
    oobDestroyAfterMs: OOB_DESTROY_AFTER_MS,
};
}

function clampMatchDurationSec(n: number): number {
  return Math.max(60, Math.min(3600, Math.floor(n)));
}

function clampMinRoomPlayers(n: number): number {
  return Math.max(1, Math.min(MAX_HUMAN_CLIENTS_IN_ROOM, Math.floor(n)));
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function clampFloat(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function clampOperationalAreaHalfExtent(n: number): number {
  const raw = Math.floor(n);
  if (raw <= 0) return 0;
  return clampInt(raw, OPERATIONAL_AREA_HALF_EXTENT_MIN, OPERATIONAL_AREA_HALF_EXTENT_MAX);
}

export function normalizeConfig(next: AdminConfigPatch, config: Readonly<AdminConfig>): AdminConfig {
  const duration = Number(next.matchDurationSec);
  const minPlayers = Number(next.minRoomPlayers);
  const operationalAreaHalfExtent = Number(next.operationalAreaHalfExtent);
  const passiveXpIntervalMs = Number(next.passiveXpIntervalMs);
  const passiveXpBase = Number(next.passiveXpBase);
  const seaControlXpMultiplier = Number(next.seaControlXpMultiplier);
  const respawnDelayMs = Number(next.respawnDelayMs);
  const spawnProtectionMs = Number(next.spawnProtectionMs);
  const samCooldownMs = Number(next.samCooldownMs);
  const oobDestroyAfterMs = Number(next.oobDestroyAfterMs);
  return {
    matchDurationSec: Number.isFinite(duration)
      ? clampMatchDurationSec(duration)
      : config.matchDurationSec,
    islandsEnabled: typeof next.islandsEnabled === "boolean" ? next.islandsEnabled : config.islandsEnabled,
    minRoomPlayers: Number.isFinite(minPlayers)
      ? clampMinRoomPlayers(minPlayers)
      : config.minRoomPlayers,
    maintenanceMode:
      typeof next.maintenanceMode === "boolean"
        ? next.maintenanceMode
        : config.maintenanceMode,
    operationalAreaHalfExtent: Number.isFinite(operationalAreaHalfExtent)
      ? clampOperationalAreaHalfExtent(operationalAreaHalfExtent)
      : config.operationalAreaHalfExtent,
    passiveXpIntervalMs: Number.isFinite(passiveXpIntervalMs)
      ? clampInt(passiveXpIntervalMs, 500, 60_000)
      : config.passiveXpIntervalMs,
    passiveXpBase: Number.isFinite(passiveXpBase)
      ? clampFloat(passiveXpBase, 0, 100)
      : config.passiveXpBase,
    seaControlXpMultiplier: Number.isFinite(seaControlXpMultiplier)
      ? clampFloat(seaControlXpMultiplier, 1, 20)
      : config.seaControlXpMultiplier,
    respawnDelayMs: Number.isFinite(respawnDelayMs)
      ? clampInt(respawnDelayMs, 0, 60_000)
      : config.respawnDelayMs,
    spawnProtectionMs: Number.isFinite(spawnProtectionMs)
      ? clampInt(spawnProtectionMs, 0, 30_000)
      : config.spawnProtectionMs,
    samCooldownMs: Number.isFinite(samCooldownMs)
      ? clampInt(samCooldownMs, 500, 30_000)
      : config.samCooldownMs,
    oobDestroyAfterMs: Number.isFinite(oobDestroyAfterMs)
      ? clampInt(oobDestroyAfterMs, 1_000, 60_000)
      : config.oobDestroyAfterMs,
  };
}
