import { planAction } from "./actionPlanner";
import assert from "node:assert/strict";
import { artilleryAim, interceptSeconds, missileFireSolution } from "./fireControl";
import { ASWM_SPEED } from "../aswm";
import type { ActionPlanningInput } from "./types";

function base(intent: ActionPlanningInput["intent"]): ActionPlanningInput {
  return {
    intent,
    snapshot: {
      timestamp: 1000,
      operationalHalfExtent: 3500,
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

console.log("bot action planner tests ok");

for (const intent of ["ATTACK", "CHASE", "FINISH_TARGET"] as const) {
  const input = base(intent);
  input.snapshot.enemies[0]!.z = 1000;
  assert.equal(planAction(input).primaryFire, false, `${intent}: never fire beyond gun range`);
  input.snapshot.enemies = [];
  assert.equal(planAction(input).primaryFire, false, `${intent}: no target means no gunfire`);
}
{
  const input = base("ATTACK");
  input.snapshot.self.primaryCooldownSec = 1;
  assert.equal(planAction(input).primaryFire, false);
  input.snapshot.enemies[0]!.speed = 60;
  input.snapshot.enemies[0]!.headingRad = Math.PI / 2;
  const lead = artilleryAim(input.snapshot.self, input.snapshot.enemies[0]!);
  assert(lead.x > 20 && lead.x < 40, "cannon lead follows its own short shell flight time");
}
{
  const time = interceptSeconds(400, 300, 60, 0, ASWM_SPEED)!;
  assert(time > 0);
  assert(Math.abs(Math.hypot(400 + 60 * time, 300) - ASWM_SPEED * time) < 1e-8);
  assert.equal(interceptSeconds(0, 300, 0, ASWM_SPEED + 10, ASWM_SPEED), null);
}
{
  const input = base("ATTACK");
  const target = input.snapshot.enemies[0]!;
  target.x = 250; target.z = 250; target.speed = 60; target.headingRad = Math.PI / 2;
  let foundLaunch = false;
  for (let degree = 0; degree < 360; degree++) {
    input.snapshot.self.headingRad = degree * Math.PI / 180;
    const solution = missileFireSolution(input.snapshot.self, target);
    if (!solution?.canFire) continue;
    assert(solution.x > target.x + 60, "missile lead accounts for lateral target travel");
    const cmd = planAction(input);
    assert.equal(cmd.secondaryFire, true);
    assert.equal(cmd.aimWorldX, solution.x);
    assert.equal(cmd.primaryFire, false, "do not send missile lead to simultaneous gunfire");
    const stationary = missileFireSolution(input.snapshot.self, { ...target, speed: 0 });
    assert(stationary);
    assert(Math.abs(stationary.rudderYawError - solution.rudderYawError) > 0.05, "hull steers to predicted intercept");
    foundLaunch = true;
    break;
  }
  assert(foundLaunch, "a properly aligned fixed rail can acquire a crossing target");
  input.snapshot.self.aswmRemainingPort = 0;
  input.snapshot.self.aswmRemainingStarboard = 0;
  assert.equal(missileFireSolution(input.snapshot.self, target), null);
  assert.equal(planAction(input).secondaryFire, false);
}
console.log("bot gun range, cooldowns, intercept lead, launch alignment and ammunition checks passed");
