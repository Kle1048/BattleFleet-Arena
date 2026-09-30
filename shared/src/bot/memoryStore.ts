import type { BotIntent, BotMemory } from "./types";

export function createBotMemoryStore(): {
  get: () => BotMemory;
  setPursuit: (pursuit: BotMemory["pursuit"]) => void;
  setLastTarget: (targetId: string | null) => void;
  setLastThreat: (threatId: string | null) => void;
  onIntent: (intent: BotIntent, now: number) => void;
} {
  const mem: BotMemory = {
    lastIntent: null,
    lastIntentChangeAt: 0,
    lastTargetId: null,
    lastThreatId: null,
  };
  return {
    get(): BotMemory {
      return { ...mem };
    },
    setPursuit(pursuit) { mem.pursuit = pursuit; },
    setLastTarget(targetId): void {
      mem.lastTargetId = targetId;
    },
    setLastThreat(threatId): void {
      mem.lastThreatId = threatId;
    },
    onIntent(intent, now): void {
      if (mem.lastIntent !== intent) {
        mem.lastIntent = intent;
        mem.lastIntentChangeAt = now;
      }
    },
  };
}
