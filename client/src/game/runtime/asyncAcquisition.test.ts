import assert from "node:assert/strict";
import { acquireWithTimeout } from "./asyncAcquisition";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const released: number[] = [];
const failures: unknown[] = [];
const controller = new AbortController();
const defaults = {
  signal: controller.signal, timeoutMs: 1000, timeoutMessage: "join timeout",
  releaseLate: (value: number) => { released.push(value); },
  reportCleanupError: (error: unknown) => { failures.push(error); },
};
assert.equal(await acquireWithTimeout(Promise.resolve(1), defaults), 1);
assert.deepEqual(released, []);
await assert.rejects(acquireWithTimeout(Promise.reject(new Error("join failed")), defaults), /join failed/);

const lateJoin = deferred<number>();
const abandoned = acquireWithTimeout(lateJoin.promise, defaults);
controller.abort();
await assert.rejects(abandoned, { name: "AbortError" });
lateJoin.resolve(2);
await Promise.resolve();
assert.deepEqual(released, [2]);

// A signal already aborted still observes and releases an eventual resource.
await assert.rejects(acquireWithTimeout(Promise.resolve(3), defaults), { name: "AbortError" });
assert.deepEqual(released, [2, 3]);

const timedOut = deferred<number>();
await assert.rejects(acquireWithTimeout(timedOut.promise, {
  ...defaults, signal: new AbortController().signal, timeoutMs: 0,
}), /join timeout/);
timedOut.resolve(4);
await Promise.resolve();
assert.deepEqual(released, [2, 3, 4]);

for (const releaseLate of [
  () => { throw new Error("sync cleanup failed"); },
  () => Promise.reject(new Error("async cleanup failed")),
]) {
  await assert.rejects(acquireWithTimeout(Promise.resolve(5), { ...defaults, releaseLate }));
}
await Promise.resolve();
assert.equal(failures.length, 2);
// A late failure is observed too, not emitted as an unhandled rejection.
const lateFailure = deferred<number>();
await assert.rejects(acquireWithTimeout(lateFailure.promise, defaults));
lateFailure.reject(new Error("server rejected after cancellation"));
await Promise.resolve();
console.log("Async acquisition cancellation, timeout, late success/failure and cleanup failures ok");
