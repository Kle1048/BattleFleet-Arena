import { planAction } from "./actionPlanner";
import type { ActionPlanningInput } from "./types";

function base(intent: ActionPlanningInput["intent"]): ActionPlanningInput {
  return {
    intent,
    snapshot: {
      timestamp: 1000,
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
      enemies: [
        {
          id: "enemy",
          x: 0,
          z: 100,
          headingRad: 0,
          shipClass: "fac",
          hp: 50,
          maxHp: 100,
          lifeState: "alive",
          primaryCooldownSec: 0,
          secondaryCooldownSec: 0,
          torpedoCooldownSec: 0,
          adHudIncomingAswm: 0,
        },
      ],
      missiles: [],
      torpedoes: [],
    },
    context: {
      dangerScore: 0.3,
      aggressionScore: 0.8,
      survivalScore: 0.3,
      bestTargetId: "enemy",
      bestTargetDistSq: 100 * 100,
      targetInGunArc: true,
      targetInMissileArc: true,
      selfInSeaControlZone: true,
      incomingMissileThreat: false,
      incomingMissileCount: 0,
      preferredRange: "medium",
      situationTag: "advantage",
    },
    memory: {
      lastIntent: null,
      lastIntentChangeAt: 0,
      lastTargetId: null,
      lastThreatId: null,
    },
  };
}

{
  const cmd = planAction(base("ATTACK"));
  if (!cmd.primaryFire) throw new Error("Expected ATTACK to fire primary weapon");
}

{
  const cmd = planAction({
    ...base("EVADE_MISSILES"),
    context: { ...base("EVADE_MISSILES").context, incomingMissileThreat: true },
  });
  if (cmd.primaryFire) throw new Error("Expected evade command without primary fire");
}

{
  const cmd = planAction({
    ...base("ATTACK"),
    snapshot: {
      ...base("ATTACK").snapshot,
      self: { ...base("ATTACK").snapshot.self, adHudIncomingAswm: 2 },
    },
  });
  if (!cmd.airDefenseEngage) throw new Error("Expected airDefenseEngage when adHud incoming");
}

{
  const cmd = planAction(base("ATTACK"));
  if (cmd.airDefenseEngage) throw new Error("Expected no airDefenseEngage without adHud incoming");
}

console.log("bot action planner tests ok");
