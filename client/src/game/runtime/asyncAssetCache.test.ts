import assert from "node:assert/strict";
import { createAsyncAssetCache, fetchAssetBytes } from "./asyncAssetCache";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const completions = new Map<string, (value: string) => void>();
const signals = new Map<string, AbortSignal>();
const released: string[] = [];
const cache = createAsyncAssetCache({
  load: (key: string, signal) => new Promise<string>((resolve) => {
    signals.set(key, signal);
    completions.set(key, resolve);
  }),
  disposeValue: (value) => { released.push(value); },
});
const a = cache.load("a");
assert.equal(cache.load("a"), a, "deduplicate concurrent calls");
const b = cache.load("b");
const c = cache.load("c");
await flush();
assert.deepEqual([...completions.keys()], ["a", "b"], "only two concurrent loads");
completions.get("a")!("A");
assert.equal(await a, "A");
await flush();
assert.ok(completions.has("c"));
assert.equal(cache.get("a"), "A");
cache.dispose();
assert.equal(await b, null);
assert.equal(await c, null);
assert.ok(signals.get("b")!.aborted);
completions.get("b")!("late B");
completions.get("c")!("late C");
await flush();
assert.deepEqual(released.sort(), ["A", "late B", "late C"]);
assert.equal(await cache.load("after shutdown"), null);
cache.dispose();
assert.equal(released.length, 3);

let attempts = 0;
let timedOutSignal: AbortSignal | undefined;
const timed = createAsyncAssetCache({
  timeoutMs: 15,
  concurrency: 1,
  load: async (key: string, signal) => {
    attempts++;
    if (key === "stuck") {
      timedOutSignal = signal;
      return new Promise<string>(() => {});
    }
    if (key === "broken") throw new Error("decode failed");
    return key;
  },
});
const stuck = timed.load("stuck");
const next = timed.load("next");
assert.equal(await stuck, null);
assert.ok(timedOutSignal!.aborted);
assert.equal(await next, "next", "timeout frees queue slot");
assert.equal(await timed.load("broken"), null);
assert.equal(await timed.load("broken"), null);
assert.equal(attempts, 3, "failed assets do not retry on every frame");
timed.dispose();

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response("missing", { status: 404 });
  await assert.rejects(fetchAssetBytes("/missing", new AbortController().signal), /404/);
} finally { globalThis.fetch = originalFetch; }
console.log("async asset cache tests ok");
