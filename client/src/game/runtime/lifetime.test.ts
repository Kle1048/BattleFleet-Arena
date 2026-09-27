import assert from "node:assert/strict";
import { createLifetime } from "./lifetime";

const order: string[] = [];
const failures: unknown[] = [];
const owner = createLifetime(error => failures.push(error));
owner.use({ dispose() { order.push("first"); } });
const releaseEarly = owner.defer(() => order.push("early"));
owner.defer(() => { order.push("failure"); throw new Error("intentional cleanup failure"); });
owner.defer(() => {
  order.push("last");
  owner.dispose(); // Reentrant shutdown is harmless.
  owner.defer(() => order.push("late during dispose"));
});
releaseEarly(); releaseEarly();
assert.deepEqual(order, ["early"]);
owner.dispose(); owner.dispose(); releaseEarly();
assert.deepEqual(order, ["early", "last", "late during dispose", "failure", "first"]);
assert.equal(failures.length, 1);
assert.equal(owner.disposed, true);
owner.use({ dispose() { order.push("late async resource"); } });
assert.equal(order.at(-1), "late async resource");

// A failing error reporter also cannot leak the rest of the resource stack.
const brokenReporter = createLifetime(() => { throw new Error("logger failed"); });
brokenReporter.defer(() => order.push("still released"));
brokenReporter.defer(() => { throw new Error("resource failed"); });
brokenReporter.dispose();
assert.equal(order.at(-1), "still released");
console.log("LIFO resource ownership, early/late release and failure-safe reentrant disposal ok");
