import type { SimulationSettings } from "./SimulationSettings.js";

/** Controlled settings for headless tests, independent of environment and local admin files. */
export const testSettings: SimulationSettings = {
  getMatchDurationMs: () => 300000,
  getMinRoomPlayers: () => 1,
  getOobDestroyAfterMs: () => 10000,
  getOperationalAreaHalfExtent: () => 4000,
  getPassiveXpBase: () => 5,
  getPassiveXpIntervalMs: () => 4000,
  getRespawnDelayMs: () => 1000,
  getSamCooldownMs: () => 3000,
  getSeaControlXpMultiplier: () => 2,
  getSpawnProtectionMs: () => 1000,
};
