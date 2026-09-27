import type { AdminConfig, AdminConfigPatch } from "../application/configValues.js";

export type ConfigSnapshot = { revision: number; config: Readonly<AdminConfig> };
export interface ConfigRepository {
  load(): Promise<ConfigSnapshot>;
  patch(patch: AdminConfigPatch, expectedRevision?: number): Promise<ConfigSnapshot>;
}

export type LeaderboardRow = {
  playerKey: string; displayName: string; matches: number; wins: number; kills: number;
  scoreTotal: number; xpTotal: number; updatedAtMs: number;
};
export type MatchResultForLeaderboard = {
  playerKey: string; displayName: string; kills: number; score: number; xp: number; won: boolean;
};
export type MatchResult = { matchId: string; completedAtMs: number; rows: readonly Readonly<MatchResultForLeaderboard>[] };
export interface LeaderboardRepository {
  load(): Promise<void>;
  recordMatch(result: MatchResult): Promise<{ revision: number; duplicate: boolean }>;
  top(limit?: number): LeaderboardRow[];
  size(): number;
  revision(): number;
  reset(expectedRevision: number): Promise<number>;
}
export interface StorageLifecycle {
  flush(timeoutMs?: number): Promise<void>;
  close(timeoutMs?: number): Promise<void>;
}
