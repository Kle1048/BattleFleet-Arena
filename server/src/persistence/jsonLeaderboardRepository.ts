import { AtomicJsonFile, type JsonFileIO, type JsonCodec } from "./atomicJsonFile.js";
import type { LeaderboardRepository, LeaderboardRow, MatchResult } from "./ports.js";
import { WriteQueue } from "./WriteQueue.js";
import { StorageError } from "./storageErrors.js";
import { array, integer, object, string } from "./jsonValidation.js";

type LeaderboardDocument = { version: 2; revision: number; rows: LeaderboardRow[]; recordedMatches: string[] };
export const leaderboardCodec: JsonCodec<LeaderboardDocument> = {
  empty: () => ({ version: 2, revision: 0, rows: [], recordedMatches: [] }),
  decode(raw) {
    const source = object(raw);
    if (source.version !== 1 && source.version !== 2) throw new StorageError("version", "Unsupported leaderboard version");
    const migrated = source.version === 1;
    const keys = new Set<string>();
    const rows = array(source.rows).map(value => {
      const row = object(value);
      const playerKey = string(row.playerKey);
      if (keys.has(playerKey)) throw new StorageError("corrupt", "Duplicate leaderboard player");
      keys.add(playerKey);
      return { playerKey, displayName: string(row.displayName), matches: integer(row.matches),
        wins: integer(row.wins), kills: integer(row.kills), scoreTotal: integer(row.scoreTotal),
        xpTotal: integer(row.xpTotal), updatedAtMs: integer(row.updatedAtMs) };
    });
    const recordedMatches = migrated ? [] : array(source.recordedMatches).map(value => string(value, 128));
    if (new Set(recordedMatches).size !== recordedMatches.length) throw new StorageError("corrupt", "Duplicate match marker");
    return { migrated, value: { version: 2, revision: migrated ? 0 : integer(source.revision), rows, recordedMatches } };
  },
};

/** Aggregate and durable deduplication markers form one indivisible JSON commit. */
export class JsonLeaderboardRepository implements LeaderboardRepository {
  readonly queue = new WriteQueue();
  readonly file: AtomicJsonFile<LeaderboardDocument>;
  private current!: LeaderboardDocument;
  private recorded = new Set<string>();
  private retries = 0;
  constructor(filePath: string, io?: JsonFileIO, private readonly retryDelayMs = 100) {
    this.file = new AtomicJsonFile(filePath, leaderboardCodec, io);
  }
  async load(): Promise<void> {
    this.current = await this.file.load();
    this.recorded = new Set(this.current.recordedMatches);
  }
  revision(): number { return this.current.revision; }
  retryCount(): number { return this.retries; }
  size(): number { return this.current.rows.length; }
  top(limit = 10): LeaderboardRow[] {
    const n = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 10;
    return [...this.current.rows].sort((a, b) => b.scoreTotal - a.scoreTotal || b.kills - a.kills ||
      b.wins - a.wins || a.playerKey.localeCompare(b.playerKey)).slice(0, n).map(row => ({ ...row }));
  }
  recordMatch(result: MatchResult): Promise<{ revision: number; duplicate: boolean }> {
    // Snapshot before enqueue: reset/leave and caller mutation cannot change pending work.
    const owned = { ...result, rows: result.rows.map(row => ({ ...row })) };
    return this.queue.run(async () => {
      string(owned.matchId, 128);
      integer(owned.completedAtMs);
      if (this.recorded.has(owned.matchId)) return { revision: this.current.revision, duplicate: true };
      const byKey = new Map(this.current.rows.map(row => [row.playerKey, { ...row }]));
      for (const row of owned.rows) {
        const key = string(row.playerKey);
        const previous = byKey.get(key) ?? { playerKey: key, displayName: key, matches: 0,
          wins: 0, kills: 0, scoreTotal: 0, xpTotal: 0, updatedAtMs: 0 };
        const next = { ...previous, displayName: string(row.displayName || previous.displayName),
          matches: integer(previous.matches + 1), wins: integer(previous.wins + (row.won ? 1 : 0)),
          kills: integer(previous.kills + Math.max(0, Math.floor(row.kills))),
          scoreTotal: integer(previous.scoreTotal + Math.max(0, Math.floor(row.score))),
          xpTotal: integer(previous.xpTotal + Math.max(0, Math.floor(row.xp))), updatedAtMs: owned.completedAtMs };
        byKey.set(key, next);
      }
      const next: LeaderboardDocument = { version: 2, revision: integer(this.current.revision + 1),
        rows: [...byKey.values()], recordedMatches: [...this.current.recordedMatches, owned.matchId] };
      // Retries stay inside the same FIFO slot: an intervening reset cannot be overtaken.
      for (let attempt = 0; ; attempt++) {
        try { await this.file.save(next); break; }
        catch (error) {
          if (error instanceof StorageError || attempt >= 2) throw error;
          this.retries++;
          await new Promise(resolve => setTimeout(resolve, this.retryDelayMs * (attempt + 1)));
        }
      }
      this.current = next;
      this.recorded.add(owned.matchId);
      return { revision: next.revision, duplicate: false };
    });
  }
  reset(expectedRevision: number): Promise<number> {
    return this.queue.run(async () => {
      if (expectedRevision !== this.current.revision) throw new StorageError("conflict", "Leaderboard revision changed; reload before retrying");
      // Keep tombstones across a reset: retrying an already counted match must not resurrect it.
      const next: LeaderboardDocument = { ...this.current, revision: integer(this.current.revision + 1), rows: [] };
      await this.file.save(next);
      this.current = next;
      return next.revision;
    });
  }
}
