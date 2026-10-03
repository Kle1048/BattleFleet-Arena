import assert from "node:assert/strict";
import { retryJoin, joinFailureMessage } from "./retryJoin";
const controller = new AbortController();
let calls = 0;
const prompts: number[] = [];
const value = await retryJoin(async () => {
  calls++;
  if (calls < 4) throw { code: [503, 429, 409][calls - 1] };
  return "joined";
}, async (error, attempt) => { prompts.push(attempt); assert(joinFailureMessage(error).length > 20); }, controller.signal);
assert.equal(value, "joined"); assert.equal(calls, 4); assert.deepEqual(prompts, [1, 2, 3]);
let confirm!: () => void;
calls = 0;
const waiting = retryJoin(async () => { calls++; throw new Error("network"); },
  () => new Promise<void>(resolve => { confirm = resolve; }), controller.signal);
await Promise.resolve(); await Promise.resolve();
assert.equal(calls, 1, "no automatic reconnect loop while dialog is open");
controller.abort(); confirm();
await assert.rejects(waiting, { name: "AbortError" });
assert.equal(calls, 1, "cancellation prevents a late retry");
assert(!joinFailureMessage({ type: "error" }).includes("object Object"));
assert(!joinFailureMessage(new Error("<script>bad</script>")).includes("script"));
console.log("manual join retries, error classification, no retry storm and cancellation ok");
