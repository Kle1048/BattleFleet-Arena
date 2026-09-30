import assert from "node:assert/strict";
import { observeWorld } from "./perceptionSystem";
import { orient } from "./orientationSystem";
import { planAction } from "./actionPlanner";
import { desiredBotRadar } from "./radarControl";
import { profileIntent, botProfile } from "./profiles";
import { createBotController } from "./botController";
import type { BotVisiblePlayer } from "./types";

const self: BotVisiblePlayer = { id: "self", x: 0, z: 0, headingRad: 0, radarActive: true,
  shipClass: "fac", hp: 100, maxHp: 100, lifeState: "alive", primaryCooldownSec: 0,
  secondaryCooldownSec: 0, torpedoCooldownSec: 0, adHudIncomingAswm: 0 };
const near = { ...self, id: "near", z: 150 };
const weak = { ...self, id: "weak", x: 300, z: 250, hp: 10 };
const memory = { lastIntent: null, lastTargetId: null, lastThreatId: null, lastIntentChangeAt: 0 };
const snapshot = observeWorld(10000, [self, near, weak], "self", [], [], 1200)!;
snapshot.profile = "aggressive";
assert.equal(orient(snapshot, memory).bestTargetId, "weak", "prefer damaged contact over closer healthy target");
assert.equal(orient(snapshot, { ...memory, lastTargetId: "near" }).bestTargetId, "near", "keep pursuit target");
for (const intent of ["ATTACK", "RETREAT", "EVADE_MISSILES"] as const)
  assert.equal(desiredBotRadar(snapshot, intent), true);
snapshot.profile = "cautious";
let radarSamples = 0;
for (let time = 0; time < 12000; time += 50)
  radarSamples += Number(desiredBotRadar({ ...snapshot, enemies: [], timestamp: time }, "ATTACK"));
assert.equal(radarSamples, 40, "cautious blind search emits two seconds in twelve");
assert.equal(desiredBotRadar(snapshot, "ATTACK"), true, "maintain a useful close radar contact while healthy");
assert.equal(desiredBotRadar(snapshot, "RETREAT"), false, "retreat does not latch radar on");
const retreat = planAction({ snapshot, context: orient(snapshot, memory), memory, intent: "RETREAT" });
assert.equal(retreat.throttle, 1, "escape forward instead of backing into combat");
assert.equal(retreat.primaryFire, true, "a retreat may still take a valid defensive gun shot");
const evasive = planAction({ snapshot, context: orient(snapshot, memory), memory, intent: "EVADE_MISSILES" });
assert.equal(evasive.primaryFire, false);
snapshot.profile = "objective";
snapshot.enemies = [{ ...near, z: 510 }, { ...weak, z: 300 }];
assert.equal(orient(snapshot, memory).bestTargetId, "weak", "prefer vulnerable targets in the objective");
assert.equal(profileIntent("CHASE", { ...snapshot, self: { ...self, x: 501 } }, memory), "SEEK_SEA_CONTROL", "objective bot returns from long pursuits while still able to engage");
assert.equal(orient({ ...snapshot, enemies: [{ ...near, z: 510 }] }, memory).bestTargetId, "near", "allow self-defense outside the zone");
for (const profile of ["aggressive", "cautious", "objective"] as const) {
  const blindSnapshot = { ...snapshot, profile, enemies: [], esmBearings: [] };
  assert.equal(profileIntent("ATTACK", blindSnapshot, memory), "SEEK_SEA_CONTROL", "all profiles share the mission");
  assert.equal(profileIntent("RETREAT", blindSnapshot, memory), "SEEK_SEA_CONTROL", "healthy ships do not retreat forever without a threat");
  assert.equal(profileIntent("RETREAT", { ...blindSnapshot, self: { ...self, hp: 30 } }, memory), "RETREAT", "damage permits recovery away from combat");
  assert.equal(profileIntent("EVADE_MISSILES", { ...blindSnapshot, missiles: [{ missileId: 1, ownerId: "enemy", x: 0, z: 100 }] }, memory), "EVADE_MISSILES", "incoming threats outrank the mission");
  assert.equal(profileIntent("ATTACK", { ...blindSnapshot, self: { ...self, x: 900 }, esmBearings: [{ id: "emitter", bearingRad: 0 }] }, memory), "SEEK_SEA_CONTROL", "a distant emission alone does not abandon the common mission");
}
const brain = createBotController({ wallNow: () => 0, monotonicNow: () => 0 }, { profile: "aggressive", decide: () => "CHASE" });
brain.enable();
brain.update(10000, [self, weak], "self", [], [], 1200, false);
const lost = brain.update(10150, [self], "self", [], [], 1200, false)!;
assert.equal(brain.getMemory().pursuit?.x, weak.x);
assert.equal(lost.primaryFire, false);
assert.equal(lost.secondaryFire, false, "last-known positions never authorize firing");
const pursuit = { ...memory, pursuit: { id: "weak", x: 300, z: 250, at: 10000 } };
const blind = { ...snapshot, profile: "aggressive" as const, enemies: [], esmBearings: [], timestamp: 39999 };
assert.equal(profileIntent("ATTACK", blind, pursuit), "CHASE", "search old location for up to thirty seconds");
assert.equal(profileIntent("ATTACK", { ...blind, timestamp: 40001 }, pursuit), "SEEK_SEA_CONTROL", "stale pursuit expires into the common mission");
const flank = { ...snapshot, profile: "aggressive" as const, self: { ...self, x: 50 }, enemies: [{ ...near, z: 300 }] };
for (const profile of ["aggressive", "cautious", "objective"] as const) {
  const far = { ...flank, profile, enemies: [{ ...near, z: 500 }] };
  const command = planAction({ snapshot: far, context: orient(far, memory), memory, intent: "REPOSITION" });
  assert(command.rudderInput < -0.23, "all profiles can use a modest rear approach");
  const close = { ...snapshot, profile, enemies: [near], self: { ...self, secondaryCooldownSec: 30 } };
  const attack = planAction({ snapshot: close, context: orient(close, memory), memory, intent: "ATTACK" });
  assert.equal(attack.primaryFire, true, "every profile uses a legal gun opportunity");
  const farAttack = planAction({ snapshot: far, context: orient(far, memory), memory, intent: "ATTACK" });
  assert.equal(farAttack.primaryFire, false, "range restrictions still apply to every profile");
}
assert.throws(() => botProfile("made-up"), /Unknown/);
let missionLaunch = false;
for (let degrees = 0; degrees < 360; degrees++) {
  const passiveMission = { ...snapshot, profile: "cautious" as const,
    self: { ...self, x: 900, radarActive: false, headingRad: degrees * Math.PI / 180 },
    enemies: [], esmBearings: [{ id: "emitter", bearingRad: 0 }] };
  const command = planAction({ snapshot: passiveMission, memory, context: orient(passiveMission, memory), intent: "SEEK_SEA_CONTROL" });
  assert.equal(command.primaryFire, false, "bearing-only return to the mission cannot enable a cannon shot");
  if (command.secondaryFire) { missionLaunch = true; break; }
}
assert(missionLaunch, "a cautious bot can take a valid missile opportunity while returning to the objective");
const missionDefense = { ...snapshot, profile: "objective" as const, self: { ...self, x: 550 },
  enemies: [{ ...near, x: 550, z: 100 }] };
const missionIntent = profileIntent("ATTACK", missionDefense, memory);
assert.equal(missionIntent, "SEEK_SEA_CONTROL");
assert.equal(planAction({ snapshot: missionDefense, memory, context: orient(missionDefense, memory), intent: missionIntent }).primaryFire,
  true, "objective return keeps an available defensive gun shot outside the zone");
assert.equal(profileIntent("EVADE_MISSILES", { ...missionDefense,
  missiles: [{ missileId: 2, ownerId: "enemy", x: 550, z: 100 }] }, memory), "EVADE_MISSILES",
  "objective leash never suppresses an actual missile evasion");
console.log("Bot personality doctrine, target selection, emission duty and stale-contact safety passed");
