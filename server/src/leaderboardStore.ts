import { leaderboardRepository } from "./application/storageServices.js";
export type { LeaderboardRow, MatchResultForLeaderboard } from "./persistence/ports.js";

/** Compatibility queries expose committed data only; all mutation goes through the repository. */
export const topLeaderboard = (limit = 10) => leaderboardRepository.top(limit);
export const leaderboardSize = () => leaderboardRepository.size();
export const leaderboardRevision = () => leaderboardRepository.revision();
export const resetLeaderboard = (expectedRevision: number) => leaderboardRepository.reset(expectedRevision);

/** Client-chosen correlation key, explicitly not authenticated player identity. */
export function normalizePlayerToken(raw: unknown, sessionId: string): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  return /^[A-Za-z0-9_-]{8,128}$/.test(value) ? value : `session:${sessionId}`;
}
