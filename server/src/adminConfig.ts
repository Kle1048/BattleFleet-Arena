import { operationalHalfExtentFromParticipantCount } from "@battlefleet/shared/rules";
import { configService } from "./application/storageServices.js";
import type { AdminConfigPatch } from "./application/configValues.js";
export type { AdminConfig, AdminConfigPatch } from "./application/configValues.js";

/** Existing rules-facing getters read only the immutable committed cache (no I/O or copies). */
export const getAdminConfig = () => configService.snapshot().config;
export const getConfigRevision = () => configService.snapshot().revision;
export const updateAdminConfig = async (patch: AdminConfigPatch, expectedRevision?: number) =>
  (await configService.patch(patch, expectedRevision)).config;
export const getMatchDurationMs = () => getAdminConfig().matchDurationSec * 1000;
export const getMinRoomPlayers = () => getAdminConfig().minRoomPlayers;
export const isMaintenanceMode = () => getAdminConfig().maintenanceMode;
export function getOperationalAreaHalfExtent(participantCount: number): number {
  return getAdminConfig().operationalAreaHalfExtent || operationalHalfExtentFromParticipantCount(participantCount);
}
export const getPassiveXpIntervalMs = () => getAdminConfig().passiveXpIntervalMs;
export const getPassiveXpBase = () => getAdminConfig().passiveXpBase;
export const getSeaControlXpMultiplier = () => getAdminConfig().seaControlXpMultiplier;
export const getRespawnDelayMs = () => getAdminConfig().respawnDelayMs;
export const getSpawnProtectionMs = () => getAdminConfig().spawnProtectionMs;
export const getSamCooldownMs = () => getAdminConfig().samCooldownMs;
export const getOobDestroyAfterMs = () => getAdminConfig().oobDestroyAfterMs;
