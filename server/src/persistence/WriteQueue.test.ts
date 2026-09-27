import assert from "node:assert/strict";
import { WriteQueue } from "./WriteQueue.js";

const queue = new WriteQueue(2);
let release!: () => void;
const order: string[] = [];
const first = queue.run(async () => { order.push("a"); await new Promise<void>(resolve => { release = resolve; }); order.push("b"); });
const second = queue.run(async () => { order.push("c"); throw new Error("expected failure"); });
const observed = assert.rejects(second, /expected/);
await assert.rejects(queue.run(async () => 3), /not accepting/);
await assert.rejects(queue.flush(5), /deadline/);
assert.deepEqual(order, ["a"]);
assert.equal(queue.snapshot().pending, 2);
release(); await first; await observed; await queue.flush();
assert.deepEqual(order, ["a", "b", "c"]);
assert.equal(await queue.run(async () => 4), 4, "failed predecessor cannot poison next commit");
await queue.close(); await queue.close();
await assert.rejects(queue.run(async () => 5), /not accepting/);
assert.deepEqual(queue.snapshot(), { pending: 0, capacity: 2, committed: 2, failed: 1,
  rejected: 2, lastError: "unavailable", accepting: false });
console.log("bounded FIFO, failure isolation, flush deadline and permanent close ok");
