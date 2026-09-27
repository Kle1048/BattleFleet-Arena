import assert from "node:assert/strict";
import { createFrameScheduler } from "./frameScheduler";

let time = 10, nextId = 0;
const callbacks = new Map<number, (now: number) => void>();
const cancelled: number[] = [];
const errors: unknown[] = [];
const frames: number[][] = [];
const scheduler = createFrameScheduler(error => errors.push(error), {
  now: () => time,
  request(callback) { callbacks.set(++nextId, callback); return nextId; },
  cancel(id) { cancelled.push(id); callbacks.delete(id); },
});
function runNext(at: number) {
  assert.equal(callbacks.size, 1, "exactly one pending app frame");
  const [id, callback] = [...callbacks][0]!;
  callbacks.delete(id); time = at; callback(at);
}
scheduler.start((now, dt) => frames.push([now, dt]));
runNext(26); runNext(42);
assert.deepEqual(frames, [[26, 16], [42, 16]]);
const late = [...callbacks.values()][0]!;
scheduler.stop(); late(100);
assert.equal(callbacks.size, 0); assert.equal(frames.length, 2);
scheduler.start(() => scheduler.stop()); runNext(58);
assert.equal(callbacks.size, 0);
scheduler.start(() => scheduler.start((now, dt) => frames.push([now, dt])));
runNext(74); runNext(90);
assert.deepEqual(frames.at(-1), [90, 16]);
scheduler.start(() => { throw new Error("intentional frame failure"); });
runNext(106);
assert.equal(errors.length, 1); assert.equal(callbacks.size, 0);
scheduler.start(() => scheduler.dispose()); runNext(122);
scheduler.dispose(); scheduler.start(() => assert.fail("disposed scheduler restarted"));
assert.equal(callbacks.size, 0);
assert(cancelled.length >= 2);
console.log("single app rAF, stop/restart races, late callbacks and frame failure shutdown ok");
