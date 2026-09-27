import type { SimulationSettings } from "../simulation/SimulationSettings.js";
import { getMatchDurationMs, getMinRoomPlayers, getOobDestroyAfterMs, getOperationalAreaHalfExtent, getPassiveXpBase, getPassiveXpIntervalMs, getRespawnDelayMs, getSamCooldownMs, getSeaControlXpMultiplier, getSpawnProtectionMs } from "../adminConfig.js";

/** Application config cache supplies live values; the simulation never imports environment or storage. */
export const simulationSettings: SimulationSettings = {
  getMatchDurationMs,
  getMinRoomPlayers,
  getOobDestroyAfterMs,
  getOperationalAreaHalfExtent,
  getPassiveXpBase,
  getPassiveXpIntervalMs,
  getRespawnDelayMs,
  getSamCooldownMs,
  getSeaControlXpMultiplier,
  getSpawnProtectionMs,
};
