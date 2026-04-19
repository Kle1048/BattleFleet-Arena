import { DecisionTreeStrategy } from "./decisionEngine";
import type { DecisionInput } from "./types";

const strategy = new DecisionTreeStrategy();

function mkInput(overrides: Partial<DecisionInput>): DecisionInput {
  return {
    snapshot: {
      timestamp: 0,
      self: {
        id: "me",
        x: 0,
        z: 0,
        headingRad: 0,
        shipClass: "fac",
        hp: 100,
        maxHp: 100,
        lifeState: "alive",
        primaryCooldownSec: 0,
        secondaryCooldownSec: 0,
        torpedoCooldownSec: 0,
        adHudIncomingAswm: 0,
      },
      enemies: [],
      missiles: [],
      torpedoes: [],
    },
    context: {
      dangerScore: 0.2,
      aggressionScore: 0.8,
      survivalScore: 0.2,
      bestTargetId: null,
      bestTargetDistSq: null,
      targetInGunArc: false,
      targetInMissileArc: false,
      selfInSeaControlZone: true,
      incomingMissileThreat: false,
      incomingMissileCount: 0,
      preferredRange: "medium",
      situationTag: "safe",
    },
    memory: {
      lastIntent: null,
      lastIntentChangeAt: 0,
      lastTargetId: null,
      lastThreatId: null,
    },
    ...overrides,
  };
}

{
  const intent = strategy.decide(
    mkInput({
      context: { ...mkInput({}).context, incomingMissileThreat: true },
    }),
  );
  if (intent !== "EVADE_MISSILES") throw new Error("Expected EVADE_MISSILES");
}

{
  const base = mkInput({});
  const intent = strategy.decide({
    ...base,
    snapshot: { ...base.snapshot, self: { ...base.snapshot.self, hp: 20, maxHp: 100 } },
  });
  if (intent !== "RETREAT") throw new Error("Expected RETREAT");
}

console.log("bot decision tests ok");
