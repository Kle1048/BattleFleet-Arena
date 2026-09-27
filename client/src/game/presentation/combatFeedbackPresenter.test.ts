import assert from "node:assert/strict";
import { createCombatFeedbackPresenter, type CombatFeedbackOptions } from "./combatFeedbackPresenter";

const calls: unknown[][] = [];
const record = (name: string) => (...args: unknown[]) => { calls.push([name, ...args]); };
let now = 0;
let player: ReturnType<CombatFeedbackOptions["localPlayer"]> = { x: 10, z: 20, headingRad: 0.5, lifeState: "alive" };
let puff: (() => void) | undefined;
const options: CombatFeedbackOptions = {
  mySessionId: "me", now: () => now, localPlayer: () => player, text: key => key,
  toast: record("toast"), shake: record("shake"), flash: record("flash"),
  effects: {
    destroyed: record("destroyed"),
    chaff(x, z, heading, onPuff) { calls.push(["chaff", x, z, heading]); puff = onPuff; },
  },
  audio: {
    airDefenseSamFire: record("sam-fire"), airDefenseSamIntercept: record("sam-intercept"),
    airDefenseCiwsFire: record("ciws-fire"), airDefenseCiwsIntercept: record("ciws-intercept"),
    shipShipCollision: record("ship"), shipIslandCollision: record("island"),
    softkillChaff: record("chaff-audio"), pokeSfxDuck: record("duck"),
    explosionSelf: record("self-explosion"), explosionOtherAt: record("other-explosion"),
  },
};
const feedback = createCombatFeedbackPresenter(options);
const take = () => calls.splice(0);

for (const layer of ["sam", "pd", "ciws"] as const) {
  for (const phase of ["fire", "intercept"] as const) {
    feedback.onAirDefenseSound({ phase, layer, worldX: 11, worldZ: 12 });
    assert.deepEqual(take(), [[`${layer === "pd" ? "sam" : layer}-${phase}`, { worldX: 11, worldZ: 12 }]]);
  }
}
feedback.onCollisionContact("ship"); feedback.onCollisionContact("island");
feedback.onAswmMagazineReloaded();
assert.deepEqual(take(), [["ship"], ["island"], ["toast", "toast.aswmMagazineReloaded", "info", 3500]]);

for (const distance of [360, 500]) feedback.onMineImpactNearLocalPlayer(distance);
assert.deepEqual(take(), []);
feedback.onMineImpactNearLocalPlayer(180);
assert.deepEqual(take(), [["shake", { durationMs: 215, amplitude: 5 }]]);
feedback.onMineImpactNearLocalPlayer(-10);
assert.deepEqual(take(), [["shake", { durationMs: 310, amplitude: 8 }]]);

const artillery = { tag: "artillery_hull" } as const;
const missile = { tag: "aswm_impact" } as const;
now = 1999; feedback.onFeelLocalWeaponThreat(missile); feedback.onFeelLocalWeaponThreat(artillery);
assert.deepEqual(take(), [], "initial monotonic-time suppression remains unchanged");
now = 2000; feedback.onFeelLocalWeaponThreat(missile);
assert.deepEqual(take(), [["toast", "toast.feelAswmImpactNear", "danger", 2800], ["shake", { durationMs: 280, amplitude: 8 }], ["duck", 135]]);
now = 2399; feedback.onFeelLocalWeaponThreat(artillery);
assert.deepEqual(take(), []);
now = 2400; feedback.onFeelLocalWeaponThreat(artillery); feedback.onFeelLocalWeaponThreat(missile);
assert.deepEqual(take(), [["toast", "toast.feelArtilleryHullHit", "danger", 2600], ["shake", { durationMs: 200, amplitude: 5.5 }], ["duck", 115]]);
now = 4000; feedback.onFeelLocalWeaponThreat(missile);
assert.equal(take().length, 3, "each threat has an independent cooldown");

feedback.onSoftkillResult(true);
assert.deepEqual(take(), [["chaff", 10, 20, 0.5], ["toast", "toast.softkillSuccess", "info", 3800]]);
assert(puff);
puff();
const firstPuff = take();
assert.deepEqual(firstPuff, [["chaff-audio", 0.32 / Math.sqrt(8), { worldX: 10, worldZ: 20 }]]);
// Replacing the entire view proves the callback re-samples rather than retaining it.
player = { ...player!, x: 40, z: 50 };
puff();
assert.deepEqual(take(), [["chaff-audio", 0.32 / Math.sqrt(8), { worldX: 40, worldZ: 50 }]]);
assert.deepEqual(firstPuff[0]![2], { worldX: 10, worldZ: 20 }, "owned output positions do not mutate later");
player = undefined;
puff();
assert.deepEqual(take(), [["chaff-audio", 0.32 / Math.sqrt(8), { worldX: 40, worldZ: 50 }]]);
feedback.onSoftkillResult(false);
assert.deepEqual(take(), [["chaff-audio", 0.32], ["toast", "toast.softkillFailed", "danger", 3800]]);
player = { x: 0, z: 0, headingRad: 0, lifeState: "awaiting_respawn" };
feedback.onSoftkillResult(true);
assert.deepEqual(take(), [["chaff-audio", 0.32], ["toast", "toast.softkillSuccess", "info", 3800]]);

feedback.onShipDestroyed({ id: "me", x: 1, z: 2 });
assert.deepEqual(take(), [["destroyed", 1, 2], ["self-explosion"], ["flash", { intensity: 1 }], ["shake", { durationMs: 520, amplitude: 15 }]]);
feedback.onShipDestroyed({ id: "other", x: 170, z: 0 });
assert.deepEqual(take(), [["destroyed", 170, 0], ["flash", { intensity: 0.535 }], ["shake", { durationMs: 360, amplitude: 10.5 }], ["other-explosion", 170, 0, 0.5499999999999999]]);
feedback.onShipDestroyed({ id: "other", x: 340, z: 0 });
assert.deepEqual(take().map(c => c[0]), ["destroyed", "other-explosion"], "flash boundary is exclusive");
feedback.onShipDestroyed({ id: "other", x: 520, z: 0 });
assert.deepEqual(take(), [["destroyed", 520, 0], ["other-explosion", 520, 0, 0.22]]);
feedback.onShipDestroyed({ id: "other", x: 521, z: 0 });
assert.deepEqual(take(), [["destroyed", 521, 0]], "sound boundary is inclusive, then silent");
player = undefined;
feedback.onShipDestroyed({ id: "other", x: 1000, z: -10 });
assert.deepEqual(take(), [["destroyed", 1000, -10], ["other-explosion", 1000, -10, 0.38]]);

feedback.dispose(); feedback.dispose();
now = 10000;
puff(); feedback.onSoftkillResult(true); feedback.onShipDestroyed({ id: "me", x: 0, z: 0 });
feedback.onAirDefenseSound({ phase: "fire", layer: "sam", worldX: 0, worldZ: 0 });
feedback.onFeelLocalWeaponThreat(artillery); feedback.onCollisionContact("ship");
feedback.onAswmMagazineReloaded(); feedback.onMineImpactNearLocalPlayer(0);
assert.deepEqual(take(), [], "disposed session emits neither synchronous nor delayed feedback");
console.log("combat feedback ordering, cooldown boundaries, spatial policy and deferred ownership ok");
