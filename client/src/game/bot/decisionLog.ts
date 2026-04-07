import type { BotLogEntry, BotLogPhase } from "./types";

export function createBotDecisionLog(limit = 200): {
  add: (entry: BotLogEntry) => void;
  addSimple: (phase: BotLogPhase, message: string, data?: Record<string, unknown>) => void;
  getRecent: (max: number, phase?: BotLogPhase | "ALL") => BotLogEntry[];
} {
  const entries: BotLogEntry[] = [];
  return {
    add(entry): void {
      entries.push(entry);
      if (entries.length > limit) {
        entries.splice(0, entries.length - limit);
      }
    },
    addSimple(phase, message, data): void {
      entries.push({ timestamp: performance.now(), phase, message, data });
      if (entries.length > limit) {
        entries.splice(0, entries.length - limit);
      }
    },
    getRecent(max, phase = "ALL"): BotLogEntry[] {
      const filtered = phase === "ALL" ? entries : entries.filter((q) => q.phase === phase);
      return filtered.slice(Math.max(0, filtered.length - Math.max(0, max)));
    },
  };
}
