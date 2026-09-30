import { DecisionTreeStrategy, createDecisionEngine, type BotDecisionStrategy } from "./decisionEngine";
import { profileIntent } from "./profiles";
import type { BotMemory } from "./types";
import { planAction } from "./actionPlanner";
import { createBotDecisionLog } from "./decisionLog";
import { createBotMemoryStore } from "./memoryStore";
import { orient } from "./orientationSystem";
import { observeWorld } from "./perceptionSystem";
import type {
  BotInputCommand,
  BotIntent,
  BotLogEntry,
  BotVisibleMissile,
  BotVisiblePlayer,
  BotVisibleTorpedo,
  TacticalContext,
} from "./types";

/** Diagnostics use host clocks; decision cadence continues to use update(now). */
export type BotDiagnosticClock = { wallNow: () => number; monotonicNow: () => number };

export function createBotController(clock: BotDiagnosticClock, strategy: BotDecisionStrategy = new DecisionTreeStrategy()): {
  getMemory: () => BotMemory;
  enable: () => void;
  disable: () => void;
  isEnabled: () => boolean;
  update: (
    now: number,
    playerList: Iterable<BotVisiblePlayer>,
    mySessionId: string,
    missileList: readonly BotVisibleMissile[],
    torpedoList: readonly BotVisibleTorpedo[],
    operationalHalfExtent: number,
    islandsEnabled?: boolean,
  ) => BotInputCommand | null;
  getDebugState: () => {
    enabled: boolean;
    intent: BotIntent | null;
    targetId: string | null;
    context: TacticalContext | null;
    lastInputs: BotInputCommand[];
    recentIntents: { at: number; intent: BotIntent }[];
    logs: BotLogEntry[];
  };
} {
  let enabled = false;
  let lastDecideAt = 0;
  let lastActAt = 0;
  let cachedIntent: BotIntent | null = null;
  let cachedContext: TacticalContext | null = null;
  let cachedTargetId: string | null = null;
  let latestCommand: BotInputCommand | null = null;
  let lastContactKey = "";
  const memory = createBotMemoryStore();
  const decisionEngine = createDecisionEngine(strategy);
  const log = createBotDecisionLog(240, clock.monotonicNow);
  const lastInputs: BotInputCommand[] = [];
  const recentIntents: { at: number; intent: BotIntent }[] = [];

  return {
    getMemory: () => memory.get(),
    enable(): void {
      enabled = true;
    },
    disable(): void {
      enabled = false;
    },
    isEnabled(): boolean {
      return enabled;
    },
    update(now, playerList, mySessionId, missileList, torpedoList, operationalHalfExtent, islandsEnabled = true): BotInputCommand | null {
      if (!enabled) return null;
      const snapshot = observeWorld(
        now,
        playerList,
        mySessionId,
        missileList,
        torpedoList,
        operationalHalfExtent,
      );
      if (!snapshot) return null;
      snapshot.islandsEnabled = islandsEnabled;
      snapshot.profile = strategy.profile;
      const context = orient(snapshot, memory.get());
      const seenTarget = snapshot.enemies.find(p => p.id === context.bestTargetId);
      if (seenTarget) memory.setPursuit({ id: seenTarget.id, x: seenTarget.x, z: seenTarget.z, at: now });
      const contactKey = JSON.stringify([snapshot.self.radarActive !== false,
        snapshot.enemies.map(p => p.id), snapshot.esmBearings?.map(b => b.id)]);
      const contactsChanged = contactKey !== lastContactKey;
      lastContactKey = contactKey;
      // Never retain the old precise target/weapon command after a sensor contact disappears.
      cachedContext = context;
      cachedTargetId = context.bestTargetId ?? context.esmTargetId ?? null;
      if (now - lastDecideAt >= 140 || !cachedIntent || !cachedContext) {
        if (context.bestTargetId || strategy.profile !== "aggressive") memory.setLastTarget(context.bestTargetId);
        const prevIntent = cachedIntent;
        cachedIntent = profileIntent(decisionEngine.decide({ snapshot, context, memory: memory.get() }), snapshot, memory.get());
        memory.onIntent(cachedIntent, now);
        if (prevIntent !== cachedIntent) {
          const switchedAt = clock.wallNow();
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
      if ((now - lastActAt >= 70 || contactsChanged) && cachedIntent && cachedContext) {
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
      if (!enabled) {
        return {
          enabled: false,
          intent: null,
          targetId: null,
          context: null,
          lastInputs: [] as BotInputCommand[],
          recentIntents: [] as { at: number; intent: BotIntent }[],
          logs: [] as BotLogEntry[],
        };
      }
      return {
        enabled: true,
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
