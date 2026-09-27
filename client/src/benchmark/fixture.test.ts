import assert from "node:assert/strict";
import { createCombatFixture, seededRandom, FIXTURE_STEP_MS, FIXTURE_SAMPLE_FRAMES, FIXTURE_WARMUP_FRAMES } from "./fixture";
import { withFixtureClock } from "./fixtureClock";
import { createMeasurements, summarize } from "./metrics";

assert.deepEqual(summarize([]), { count: 0, p50: null, p95: null, max: null });
assert.deepEqual(summarize([4, 1, 3, 2, NaN, Infinity]), { count: 4, p50: 2, p95: 4, max: 4 });
const metrics = createMeasurements(2);
const frame = { intervalMs: 10, runtimeCpuMs: 1, fxCpuMs: 2, renderCpuMs: 3,
  drawCalls: 4, triangles: 5, activeParticles: 6, pooledParticles: 7 };
metrics.frame(frame); frame.intervalMs = 60; metrics.frame(frame);
assert.equal(metrics.report().longFramesOver50Ms, 1);
assert.equal(metrics.report().intervalMs.p50, 10, "owns samples instead of retaining a mutable input");
assert.throws(() => metrics.frame(frame), /capacity/);
assert.throws(() => createMeasurements(0), /capacity/);
const resource = { frame: 0, geometries: 1, textures: 2, programs: 3, sceneObjects: 4, heapBytes: null };
metrics.resources(resource); resource.geometries = 99;
assert.equal(metrics.report().resources[0]!.geometries, 1);
metrics.report().resources[0]!.geometries = 50;
assert.equal(metrics.report().resources[0]!.geometries, 1, "report is detached too");

const a = createCombatFixture(), b = createCombatFixture();
assert.notEqual(a.players, b.players);
assert.notEqual(a.players[0], b.players[0]);
const firstX = a.players[1]!.x;
a.step(1); assert.equal(a.players[1]!.x, firstX, "no update between 20 Hz patches");
let deaths = 0;
const wasDead = new Set<string>();
for (let index = 0; index < FIXTURE_WARMUP_FRAMES + FIXTURE_SAMPLE_FRAMES; index++) {
  a.step(index); b.step(index);
  if (index % 60 === 0) assert.deepEqual(a, { ...b, step: a.step });
  for (const player of a.players) {
    if (player.lifeState === "awaiting_respawn" && !wasDead.has(player.id)) { deaths++; wasDead.add(player.id); }
    if (player.lifeState !== "awaiting_respawn") wasDead.delete(player.id);
    assert(Number.isFinite(player.x) && Number.isFinite(player.z));
  }
}
assert.equal(deaths, 16, "one state-driven destruction and respawn per ship");
assert.equal(wasDead.size, 0);
assert.equal(a.players.length, 16); assert.equal(a.missiles.length, 12);
assert.equal(new Set(a.missiles.map(m => m.missileId)).size, 12);
assert.equal(FIXTURE_STEP_MS, 1000 / 60);
const randomA = seededRandom(42), randomB = seededRandom(42);
for (let index = 0; index < 100; index++) assert.equal(randomA(), randomB());

const oldRandom = Math.random, oldDate = Date.now;
const oldNow = Object.getOwnPropertyDescriptor(performance, "now");
assert.throws(() => withFixtureClock(123, () => 0.5, () => {
  assert.equal(performance.now(), 123); assert.equal(Date.now(), 1_800_000_000_123);
  assert.equal(Math.random(), 0.5); throw new Error("fixture failure");
}), /fixture failure/);
assert.equal(Math.random, oldRandom); assert.equal(Date.now, oldDate);
assert.deepEqual(Object.getOwnPropertyDescriptor(performance, "now"), oldNow, "clock restored even after throw");
console.log("replay fixture determinism/cadence, owned bounded metrics and synchronous clock restoration ok");
