import assert from "node:assert/strict";
import { observeWorld } from "./perceptionSystem";
import { orient } from "./orientationSystem";
import { createBotController } from "./botController";
import { DecisionTreeStrategy } from "./decisionEngine";
import { desiredBotRadar } from "./radarControl";
import { encodePolicyObservation, LearnedPolicyStrategy, POLICY_FEATURES, POLICY_ACTIONS, POLICY_VERSION } from "./learnedPolicy";
import type { BotVisiblePlayer } from "./types";

const self: BotVisiblePlayer = {
  id: "self", x: 0, z: 0, headingRad: 0, speed: 0, radarActive: true, shipClass: "fac",
  hp: 100, maxHp: 100, lifeState: "alive", primaryCooldownSec: 0, secondaryCooldownSec: 0,
  torpedoCooldownSec: 0, adHudIncomingAswm: 0, aswmRemainingPort: 2, aswmRemainingStarboard: 2,
};
const enemy = { ...self, id: "enemy", z: 600, radarActive: false };
const memory = { lastIntent: null, lastTargetId: null, lastThreatId: null, lastIntentChangeAt: 0 };
const see = (observer = self, target = enemy) => observeWorld(10000, [observer, target], observer.id, [], [], 2000)!;

assert.equal(see().enemies.length, 1, "radar detects even silent ships at 600m");
assert.equal(see(self, { ...enemy, z: 1200.01 }).enemies.length, 0);
assert.equal(see({ ...self, radarActive: false }).enemies.length, 1, "passive sight identifies silent ships at 600m");
assert.equal(see({ ...self, radarActive: false }).esmBearings!.length, 0, "silent target has no passive contact");
for (const [shipClass, range] of [["fac", 1600], ["dd", 2000], ["cg", 2400]] as const) {
  // Use actual canonical class IDs below; the test also guards the emitter-based multiplier.
  const canonical = shipClass === "dd" ? "destroyer" : shipClass === "cg" ? "cruiser" : shipClass;
  const target = { ...enemy, shipClass: canonical, radarActive: true, z: range };
  assert.equal(see({ ...self, radarActive: false }, target).esmBearings!.length, 1);
  assert.equal(see({ ...self, radarActive: false }, { ...target, z: range + 0.01 }).esmBearings!.length, 0);
}
const passive = see({ ...self, radarActive: false }, { ...enemy, z: 900, radarActive: true });
assert.deepEqual(passive.esmBearings, [{ id: "enemy", bearingRad: 0 }]);
assert.equal(passive.enemies.length, 0);
const alternative = see({ ...self, radarActive: false }, {
  ...enemy, z: 1100, radarActive: true, hp: 1, speed: 90, headingRad: Math.PI / 2,
});
const input = (snapshot: typeof passive) => ({ snapshot, memory, context: orient(snapshot, memory) });
assert.deepEqual(encodePolicyObservation(input(passive)), encodePolicyObservation(input(alternative)),
  "unknown distance, course, speed and HP cannot leak through passive policy observations");
const invisible = see(self, { ...enemy, z: 1900, radarActive: false });
assert.deepEqual(invisible.enemies, []);
assert.deepEqual(invisible.esmBearings, []);
assert.equal(desiredBotRadar(passive, "ATTACK"), false);
assert.equal(desiredBotRadar(see(), "RETREAT"), false);
assert.equal(desiredBotRadar(see(), "ATTACK"), true);
let activeSearchSamples = 0;
for (let now = 0; now < 8000; now += 50) {
  if (desiredBotRadar({ ...invisible, timestamp: now }, "REPOSITION")) activeSearchSamples++;
}
assert.equal(activeSearchSamples, 40, "blind search emits for two seconds per eight-second cycle");

const sizes = [POLICY_FEATURES.length, 64, 64, POLICY_ACTIONS.length];
const learned = new LearnedPolicyStrategy({
  version: POLICY_VERSION, activation: "tanh", features: [...POLICY_FEATURES], actions: [...POLICY_ACTIONS],
  layers: sizes.slice(1).map((size, i) => ({ bias: Array(size).fill(0),
    weight: Array.from({ length: size }, () => Array(sizes[i]).fill(0)) })),
});
for (const strategy of [new DecisionTreeStrategy(), learned]) {
  let launched = false;
  for (let degree = 0; degree < 360; degree++) {
    const me = { ...self, radarActive: false, headingRad: degree * Math.PI / 180 };
    const brain = createBotController({ wallNow: () => 10000, monotonicNow: () => 10000 }, strategy);
    brain.enable();
    const target = { ...enemy, radarActive: true, z: 900 };
    const command = brain.update(10000, [me, target], me.id, [], [], 2000, false)!;
    assert.equal(command.primaryFire, false, "ESM never authorizes cannon fire");
    assert.equal(command.radarActive, false, "passive engagement remains silent");
    if (command.secondaryFire) {
      launched = true;
      const lost = brain.update(10050, [me, { ...target, radarActive: false }], me.id, [], [], 2000, false)!;
      assert.equal(lost.secondaryFire, false, "emitter shutdown cancels a cached launch immediately");
      assert.equal(lost.primaryFire, false);
      break;
    }
  }
  assert(launched, "rule and neural strategies can both launch on a passive bearing");
}
console.log("radar/ESM boundaries, passive information isolation, emissions control and both bot strategies passed");
