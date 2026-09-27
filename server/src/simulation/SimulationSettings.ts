/** Host-supplied live tuning; reading settings performs no I/O inside the simulation. */
export interface SimulationSettings {
  getIslandsEnabled(): boolean;
  getMatchDurationMs(): number;
  getMinRoomPlayers(): number;
  getOobDestroyAfterMs(): number;
  getOperationalAreaHalfExtent(participantCount: number): number;
  getPassiveXpBase(): number;
  getPassiveXpIntervalMs(): number;
  getRespawnDelayMs(): number;
  getSamCooldownMs(): number;
  getSeaControlXpMultiplier(): number;
  getSpawnProtectionMs(): number;
}

/** Detached result values are safe to retain across reset, leave and asynchronous persistence. */
export interface MatchPlayerResult {
  sessionId: string;
  displayName: string;
  kills: number;
  score: number;
  xp: number;
  won: boolean;
}
