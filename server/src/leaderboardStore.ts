import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export type LeaderboardRow = {
  playerKey: string;
  displayName: string;
  matches: number;
  wins: number;
  kills: number;
  scoreTotal: number;
  xpTotal: number;
  updatedAtMs: number;
};

type LeaderboardFileShape = {
  version: 1;
  rows: LeaderboardRow[];
};

export type MatchResultForLeaderboard = {
  playerKey: string;
  displayName: string;
  kills: number;
  score: number;
  xp: number;
  won: boolean;
};

const dataDir = process.env.BFA_DATA_DIR?.trim() || path.resolve(process.cwd(), "server-data");
const filePath = path.resolve(dataDir, "leaderboard.json");
const tempPath = `${filePath}.tmp`;
const byPlayerKey = new Map<string, LeaderboardRow>();
let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  if (!existsSync(filePath)) return;
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LeaderboardFileShape>;
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    for (const row of rows) {
      if (!row || typeof row.playerKey !== "string") continue;
      byPlayerKey.set(row.playerKey, {
        playerKey: row.playerKey,
        displayName: typeof row.displayName === "string" ? row.displayName : row.playerKey,
        matches: Number.isFinite(row.matches) ? Math.max(0, Math.floor(row.matches)) : 0,
        wins: Number.isFinite(row.wins) ? Math.max(0, Math.floor(row.wins)) : 0,
        kills: Number.isFinite(row.kills) ? Math.max(0, Math.floor(row.kills)) : 0,
        scoreTotal: Number.isFinite(row.scoreTotal) ? Math.max(0, Math.floor(row.scoreTotal)) : 0,
        xpTotal: Number.isFinite(row.xpTotal) ? Math.max(0, Math.floor(row.xpTotal)) : 0,
        updatedAtMs: Number.isFinite(row.updatedAtMs) ? Math.max(0, Math.floor(row.updatedAtMs)) : 0,
      });
    }
  } catch (error) {
    console.error("[leaderboard] failed to load %s: %s", filePath, String(error));
  }
}

function persistToDisk(): void {
  try {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    const payload: LeaderboardFileShape = {
      version: 1,
      rows: [...byPlayerKey.values()],
    };
    writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
    renameSync(tempPath, filePath);
  } catch (error) {
    console.error("[leaderboard] failed to persist %s: %s", filePath, String(error));
  }
}

export function normalizePlayerToken(raw: unknown, sessionId: string): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (/^[A-Za-z0-9_-]{8,128}$/.test(s)) return s;
  return `session:${sessionId}`;
}

export function recordMatchResults(rows: readonly MatchResultForLeaderboard[]): void {
  ensureLoaded();
  if (rows.length < 1) return;
  const now = Date.now();
  for (const inRow of rows) {
    if (!inRow || typeof inRow.playerKey !== "string" || inRow.playerKey.length < 1) continue;
    const prev = byPlayerKey.get(inRow.playerKey);
    const next: LeaderboardRow = prev
      ? { ...prev }
      : {
          playerKey: inRow.playerKey,
          displayName: inRow.displayName || inRow.playerKey,
          matches: 0,
          wins: 0,
          kills: 0,
          scoreTotal: 0,
          xpTotal: 0,
          updatedAtMs: now,
        };
    next.displayName = inRow.displayName || next.displayName || inRow.playerKey;
    next.matches += 1;
    if (inRow.won) next.wins += 1;
    next.kills += Math.max(0, Math.floor(inRow.kills));
    next.scoreTotal += Math.max(0, Math.floor(inRow.score));
    next.xpTotal += Math.max(0, Math.floor(inRow.xp));
    next.updatedAtMs = now;
    byPlayerKey.set(inRow.playerKey, next);
  }
  persistToDisk();
}

export function topLeaderboard(limit = 10): LeaderboardRow[] {
  ensureLoaded();
  const n = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 10;
  const rows = [...byPlayerKey.values()];
  rows.sort(
    (a, b) =>
      b.scoreTotal - a.scoreTotal ||
      b.kills - a.kills ||
      b.wins - a.wins ||
      a.playerKey.localeCompare(b.playerKey),
  );
  return rows.slice(0, n);
}

export function leaderboardSize(): number {
  ensureLoaded();
  return byPlayerKey.size;
}

export function resetLeaderboard(): void {
  ensureLoaded();
  byPlayerKey.clear();
  persistToDisk();
}
