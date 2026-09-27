import assert from "node:assert/strict";
import { Mesh, Scene } from "three";
import { createAirDefenseFx } from "./airDefenseFx";
import type { AnimationClock } from "../runtime/animationLifetime";

let now = 0;
let sequence = 0;
const frames = new Map<number, () => void>();
const delays = new Map<number, { run(): void; at: number }>();
const clock: AnimationClock = {
  now: () => now,
  request: run => { const id = ++sequence; frames.set(id, run); return id; },
  cancel: id => { frames.delete(id); },
  delay: (run, ms) => { const id = ++sequence; delays.set(id, { run, at: now + ms }); return id; },
  clearDelay: id => { delays.delete(id); },
};
const advance = (ms: number) => {
  now += ms;
  for (const [id, pending] of [...delays]) {
    if (pending.at <= now) { delays.delete(id); pending.run(); }
  }
  const ready = [...frames];
  frames.clear();
  for (const [, run] of ready) run();
};
const scene = new Scene();
let geometryDisposals = 0;
let materialDisposals = 0;
function trackResources() {
  scene.traverse(object => {
    if (!(object instanceof Mesh)) return;
    object.geometry.addEventListener("dispose", () => geometryDisposals++);
    assert.ok(!Array.isArray(object.material));
    object.material.addEventListener("dispose", () => materialDisposals++);
  });
}

for (let cycle = 0; cycle < 20; cycle++) {
  const effects = createAirDefenseFx(clock);
  effects.fire(scene, "ciws", 10, 0, 100, 0);
  assert.equal(delays.size, 16);
  advance(0); // First tracer starts, the remaining fifteen are still delayed.
  effects.fire(scene, "sam", 10, 0, 100, 0);
  effects.hit(scene, 100, 0, "pd");
  assert.equal(scene.children.length, 3);
  assert.equal(frames.size, 3);
  const lateCallbacks = [...frames.values(), ...[...delays.values()].map(item => item.run)];
  trackResources();
  effects.dispose(); effects.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(frames.size, 0);
  assert.equal(delays.size, 0);
  for (const run of lateCallbacks) run(); // Browser already dequeued callbacks before cancellation.
  effects.fire(scene, "ciws", 10, 0, 100, 0);
  effects.hit(scene, 0, 0, "sam");
  assert.equal(scene.children.length, 0);
  assert.equal(delays.size, 0);
}
assert.equal(geometryDisposals, 60);
assert.equal(materialDisposals, 60);

// Normal completion keeps the existing 780 ms straight flight and 240 ms ring.
const effects = createAirDefenseFx(clock);
effects.fire(scene, "sam", 10, 0, 100, 0);
assert.equal(scene.children[0]!.position.x, -10);
advance(390);
assert.equal(scene.children[0]!.position.x, -55);
trackResources();
advance(390);
assert.equal(scene.children.length, 0);
effects.hit(scene, 100, 0, "sam");
trackResources();
advance(240);
assert.equal(scene.children.length, 0);
assert.equal(frames.size, 0);
effects.dispose();
assert.equal(geometryDisposals, 62);
assert.equal(materialDisposals, 62);
for (const layer of ["sam", "pd", "ciws"] as const) {
  const launchEffects = createAirDefenseFx(clock);
  launchEffects.fire(scene, layer, 12, 14, 100, 120, 9);
  if (layer === "ciws") advance(0);
  assert.deepEqual(scene.children[0]!.position.toArray(), [-12, 9, 14], `${layer}: exact model muzzle origin`);
  if (layer !== "ciws") {
    assert.ok(scene.children[0]!.children[0]!.name.startsWith(layer === "pd" ? "PD_RAM" : "SAM_Sea_Sparrow"), `${layer}: dedicated projectile model`);
  }
  launchEffects.dispose();
}
// PD uses the new model on the live-target path as well; timing/lifetime stay shared.
const pdEffects = createAirDefenseFx(clock);
pdEffects.fire(scene, "pd", 12, 14, 100, 120, 9, () => ({x: -100, z: 120}));
assert.ok(scene.children[0]!.children[0]!.name.startsWith("PD_RAM"));
advance(80);
assert.ok(scene.children[0]!.position.x < -12);
pdEffects.dispose();
assert.equal(scene.children.length, 0);
assert.equal(frames.size, 0);
console.log("Air-defense delayed tracers/frames/resources: 20 lifecycles, late callbacks and normal timing ok");
