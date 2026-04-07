import type { BotIntent, DecisionInput } from "./types";

export interface BotDecisionStrategy {
  decide(input: DecisionInput): BotIntent;
}

export class DecisionTreeStrategy implements BotDecisionStrategy {
  decide(input: DecisionInput): BotIntent {
    const { snapshot, context } = input;
    const hpPercent = snapshot.self.maxHp > 0 ? snapshot.self.hp / snapshot.self.maxHp : 0;
    const target = snapshot.enemies.find((q) => q.id === context.bestTargetId) ?? null;
    if (context.incomingMissileThreat) return "EVADE_MISSILES";
    if (hpPercent < 0.25) return "RETREAT";
    if (
      target &&
      target.maxHp > 0 &&
      target.hp / target.maxHp < 0.2 &&
      snapshot.self.primaryCooldownSec <= 0.05
    ) {
      return "FINISH_TARGET";
    }
    if (context.targetInGunArc && snapshot.self.primaryCooldownSec <= 0.05 && context.dangerScore < 0.7) {
      return "ATTACK";
    }
    if (context.bestTargetId && !context.targetInGunArc) return "HOLD_ARC";
    if (context.bestTargetId) return "CHASE";
    return "REPOSITION";
  }
}

export function createDecisionEngine(strategy: BotDecisionStrategy): {
  decide: (input: DecisionInput) => BotIntent;
} {
  return {
    decide(input): BotIntent {
      return strategy.decide(input);
    },
  };
}
