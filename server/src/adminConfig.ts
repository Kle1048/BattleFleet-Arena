import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
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
  operationalHalfExtentFromParticipantCount,
} from "@battlefleet/shared";
import {
  MAX_HUMAN_CLIENTS_IN_ROOM,
  readMinTotalParticipantsFromEnv,
} from "./serverBotPopulation.js";

export type AdminConfig = {
  matchDurationSec: number;
  minRoomPlayers: number;
  maintenanceMode: boolean;
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

const dataDir = process.env.BFA_DATA_DIR?.trim() || path.resolve(process.cwd(), "server-data");
const filePath = path.resolve(dataDir, "admin-config.json");
const tempPath = `${filePath}.tmp`;

let loaded = false;
let config: AdminConfig = {
  matchDurationSec: readMatchDurationFromEnv(),
  minRoomPlayers: readMinTotalParticipantsFromEnv(),
  maintenanceMode: false,
  operationalAreaHalfExtent: 0,
  passiveXpIntervalMs: MATCH_PASSIVE_XP_INTERVAL_MS,
  passiveXpBase: MATCH_PASSIVE_XP_BASE,
  seaControlXpMultiplier: SEA_CONTROL_XP_MULTIPLIER,
  respawnDelayMs: RESPAWN_DELAY_MS,
  spawnProtectionMs: SPAWN_PROTECTION_DURATION_MS,
  samCooldownMs: AD_SAM_COOLDOWN_MS,
  oobDestroyAfterMs: OOB_DESTROY_AFTER_MS,
};

function readMatchDurationFromEnv(): number {
  const raw = process.env.BFA_MATCH_DURATION_SEC?.trim();
  if (raw === undefined || raw === "") return MATCH_DURATION_SEC;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return MATCH_DURATION_SEC;
  return clampMatchDurationSec(n);
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

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  if (!existsSync(filePath)) return;
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AdminConfig>;
    config = normalizeConfig({
      ...config,
      ...parsed,
    });
  } catch (error) {
    console.error("[admin-config] failed to load %s: %s", filePath, String(error));
  }
}

function normalizeConfig(next: AdminConfigPatch): AdminConfig {
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

function persistToDisk(): void {
  try {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    writeFileSync(tempPath, JSON.stringify(config, null, 2), "utf8");
    renameSync(tempPath, filePath);
  } catch (error) {
    console.error("[admin-config] failed to persist %s: %s", filePath, String(error));
  }
}

export function getAdminConfig(): AdminConfig {
  ensureLoaded();
  return { ...config };
}

export function updateAdminConfig(patch: AdminConfigPatch): AdminConfig {
  ensureLoaded();
  config = normalizeConfig({
    ...config,
    ...patch,
  });
  persistToDisk();
  return getAdminConfig();
}

export function getMatchDurationMs(): number {
  return getAdminConfig().matchDurationSec * 1000;
}

export function getMinRoomPlayers(): number {
  return getAdminConfig().minRoomPlayers;
}

export function isMaintenanceMode(): boolean {
  return getAdminConfig().maintenanceMode;
}

export function getOperationalAreaHalfExtent(participantCount: number): number {
  const configured = getAdminConfig().operationalAreaHalfExtent;
  if (configured > 0) return configured;
  return operationalHalfExtentFromParticipantCount(participantCount);
}

export function getPassiveXpIntervalMs(): number {
  return getAdminConfig().passiveXpIntervalMs;
}

export function getPassiveXpBase(): number {
  return getAdminConfig().passiveXpBase;
}

export function getSeaControlXpMultiplier(): number {
  return getAdminConfig().seaControlXpMultiplier;
}

export function getRespawnDelayMs(): number {
  return getAdminConfig().respawnDelayMs;
}

export function getSpawnProtectionMs(): number {
  return getAdminConfig().spawnProtectionMs;
}

export function getSamCooldownMs(): number {
  return getAdminConfig().samCooldownMs;
}

export function getOobDestroyAfterMs(): number {
  return getAdminConfig().oobDestroyAfterMs;
}
