import { DecisionTreeStrategy, createDecisionEngine } from "./decisionEngine";
import { planAction } from "./actionPlanner";
import { createBotDecisionLog } from "./decisionLog";
import { createBotMemoryStore } from "./memoryStore";
import { orient } from "./orientationSystem";
import { observeWorld } from "./perceptionSystem";
import type { BotInputCommand, BotIntent, BotVisibleMissile, BotVisiblePlayer, BotVisibleTorpedo, TacticalContext } from "./types";

export function createBotController(): {
  enable: () => void;
  disable: () => void;
  isEnabled: () => boolean;
  update: (
    now: number,
    playerList: Iterable<BotVisiblePlayer>,
    mySessionId: string,
    missileList: readonly BotVisibleMissile[],
    torpedoList: readonly BotVisibleTorpedo[],
  ) => BotInputCommand | null;
  getDebugState: () => {
    enabled: boolean;
    intent: BotIntent | null;
    targetId: string | null;
    context: TacticalContext | null;
    lastInputs: BotInputCommand[];
    recentIntents: { at: number; intent: BotIntent }[];
    logs: { timestamp: number; phase: "OBSERVE" | "ORIENT" | "DECIDE" | "ACT"; message: string; data?: Record<string, unknown> }[];
  };
} {
  let enabled = false;
  let lastDecideAt = 0;
  let lastActAt = 0;
  let cachedIntent: BotIntent | null = null;
  let cachedContext: TacticalContext | null = null;
  let cachedTargetId: string | null = null;
  let latestCommand: BotInputCommand | null = null;
  const memory = createBotMemoryStore();
  const decisionEngine = createDecisionEngine(new DecisionTreeStrategy());
  const log = createBotDecisionLog(240);
  const lastInputs: BotInputCommand[] = [];
  const recentIntents: { at: number; intent: BotIntent }[] = [];

  return {
    enable(): void {
      enabled = true;
    },
    disable(): void {
      enabled = false;
    },
    isEnabled(): boolean {
      return enabled;
    },
    update(now, playerList, mySessionId, missileList, torpedoList): BotInputCommand | null {
      if (!enabled) return null;
      const snapshot = observeWorld(now, playerList, mySessionId, missileList, torpedoList);
      if (!snapshot) return null;
      if (now - lastDecideAt >= 140 || !cachedIntent || !cachedContext) {
        const context = orient(snapshot, memory.get());
        cachedContext = context;
        cachedTargetId = context.bestTargetId;
        memory.setLastTarget(context.bestTargetId);
        const prevIntent = cachedIntent;
        cachedIntent = decisionEngine.decide({ snapshot, context, memory: memory.get() });
        memory.onIntent(cachedIntent, now);
        if (prevIntent !== cachedIntent) {
          const switchedAt = Date.now();
          recentIntents.push({ at: switchedAt, intent: cachedIntent });
          if (recentIntents.length > 20) recentIntents.splice(0, recentIntents.length - 20);
          log.addSimple("DECIDE", `intent=${cachedIntent}`, {
            from: prevIntent,
            to: cachedIntent,
            dangerScore: context.dangerScore,
            targetId: context.bestTargetId,
          });
        }
        lastDecideAt = now;
      }
      if (now - lastActAt >= 70 && cachedIntent && cachedContext) {
        latestCommand = planAction({
          intent: cachedIntent,
          snapshot,
          context: cachedContext,
          memory: memory.get(),
        });
        lastInputs.push(latestCommand);
        if (lastInputs.length > 12) lastInputs.splice(0, lastInputs.length - 12);
        lastActAt = now;
      }
      return latestCommand;
    },
    getDebugState() {
      return {
        enabled,
        intent: cachedIntent,
        targetId: cachedTargetId,
        context: cachedContext,
        lastInputs: [...lastInputs],
        recentIntents: [...recentIntents],
        logs: log.getRecent(120, "ALL"),
      };
    },
  };
}
