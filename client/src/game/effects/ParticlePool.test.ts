import assert from "node:assert/strict";
import { ParticlePool } from "./ParticlePool";
import { IndexHeap } from "./indexHeap";

const heap = new IndexHeap((a, b) => a < b);
for (const value of [5, 3, 9, 1, 6, 2]) heap.push(value);
assert.throws(() => heap.push(5), /Duplicate/);
heap.remove(3); heap.remove(3); heap.remove(6);
assert.deepEqual([heap.pop(), heap.pop(), heap.pop(), heap.pop(), heap.pop()], [1, 2, 5, 9, undefined]);
heap.push(3); heap.clear(); heap.push(3); assert.equal(heap.pop(), 3);

type Slot = { id: number; textureKey: string; ageMs: number; maxAge: number; active: boolean };
const created: Slot[] = [];
const destroyed: number[] = [];
let hides = 0;
const limit = 12;
const keys = ["soft", "smoke", "ring", "flashAdd"];
const pool = new ParticlePool(limit, keys, key => {
  const slot = { id: created.length, textureKey: key, ageMs: 0, maxAge: 0, active: false };
  created.push(slot); return slot;
}, () => { hides++; }, particle => destroyed.push(particle.id));
const reference: Slot[] = [];
let seed = 531;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const acquireReference = (textureKey: string) => {
  if (reference.filter(slot => slot.active).length >= limit) {
    let oldest: Slot | undefined;
    for (const slot of reference) if (slot.active && (!oldest || slot.ageMs > oldest.ageMs)) oldest = slot;
    oldest!.active = false;
  }
  let slot = reference.find(slot => !slot.active && slot.textureKey === textureKey);
  if (!slot) { slot = { id: reference.length, textureKey, ageMs: 0, maxAge: 0, active: false }; reference.push(slot); }
  slot.active = true; slot.ageMs = 0; return slot;
};
for (let operation = 0; operation < 15_000; operation++) {
  if (random() < 0.84) {
    const key = keys[Math.floor(random() * keys.length)]!;
    const maxAge = 20 + random() * 1000;
    const actual = pool.acquire(key), expected = acquireReference(key);
    assert.equal(actual.id, expected.id, "first-free/oldest-age/index tie policy must remain exact");
    actual.maxAge = expected.maxAge = maxAge;
  } else {
    const dt = [0, 1000 / 60, 1, 500, 0.01][Math.floor(random() * 5)]!;
    pool.update(dt, slot => slot.ageMs < slot.maxAge);
    for (const slot of reference) if (slot.active) { slot.ageMs += dt; slot.active = slot.ageMs < slot.maxAge; }
  }
  assert.deepEqual(created, reference);
  const active = reference.filter(slot => slot.active).length;
  assert.deepEqual(pool.stats(), { activeParticles: active, pooledParticles: reference.length - active });
  assert.equal(pool["oldest"].size, active);
  assert.equal([...pool["free"].values()].reduce((sum, indices) => sum + indices.size, 0), reference.length - active);
  assert.equal(new Set(pool["active"]).size, active);
  for (const key of keys) assert(created.filter(slot => slot.textureKey === key).length <= limit);
}
assert(hides > 1000);
pool.dispose(); pool.dispose();
assert.equal(destroyed.length, created.length); assert.equal(new Set(destroyed).size, destroyed.length);
assert.deepEqual(pool.stats(), { activeParticles: 0, pooledParticles: 0 });
assert.throws(() => pool.acquire("soft"), /disposed/);
pool.update(10, () => { throw new Error("late callback"); });
console.log("15k mixed spawn/expiry/eviction operations: exact legacy policy, active/free heaps, bounded retention and disposal ok");
