import type { LeaderboardRepository, MatchResult } from "../persistence/ports.js";
import { StorageError, storageErrorCode } from "../persistence/storageErrors.js";
import { MAX_HUMAN_CLIENTS_IN_ROOM } from "../simulation/systems/botPopulation.js";

type ResultStatus = { matchId: string; state: "pending" | "committed" | "failed"; error?: string };

/** The room submits without awaiting; bounded diagnostics never retain complete player results. */
export class MatchResultService {
  private readonly pending = new Map<string, Promise<void>>();
  private readonly recent: ResultStatus[] = [];
  private rejected = 0;
  constructor(private readonly repository: LeaderboardRepository, private readonly limit = 128) {}
  submit(result: MatchResult): Promise<void> {
    const existing = this.pending.get(result.matchId);
    if (existing) return existing;
    if (this.pending.size >= this.limit || result.rows.length > MAX_HUMAN_CLIENTS_IN_ROOM) {
      this.rejected++;
      return Promise.reject(new StorageError("capacity", "Match result queue is full"));
    }
    const status: ResultStatus = { matchId: result.matchId, state: "pending" };
    const owned = { ...result, rows: result.rows.map(row => Object.freeze({ ...row })) };
    const operation = this.repository.recordMatch(owned).then(() => { status.state = "committed"; }, error => {
      status.state = "failed";
      status.error = storageErrorCode(error);
      throw error;
    }).finally(() => {
      this.pending.delete(result.matchId);
      this.recent.push(status);
      if (this.recent.length > this.limit) this.recent.shift();
    });
    this.pending.set(result.matchId, operation);
    return operation;
  }
  snapshot() {
    return { pending: [...this.pending.keys()].map(matchId => ({ matchId, state: "pending" as const })),
      recent: this.recent.map(status => ({ ...status })), rejected: this.rejected };
  }
}
