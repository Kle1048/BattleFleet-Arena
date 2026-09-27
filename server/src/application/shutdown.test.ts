import assert from "node:assert/strict";
import { createShutdown } from "./shutdown.js";
import { WriteQueue } from "../persistence/WriteQueue.js";

const sequence: string[] = [];
const queue = new WriteQueue();
const shutdown = createShutdown(async () => {
  sequence.push("rooms");
  void queue.run(async () => { await new Promise(resolve => setTimeout(resolve, 5)); sequence.push("commit"); });
}, async () => { await queue.close(); sequence.push("closed"); }, () => { throw new Error("unexpected failure"); });
const first = shutdown(); assert.equal(shutdown(), first);
assert.equal(await first, true); assert.deepEqual(sequence, ["rooms", "commit", "closed"]);
await assert.rejects(queue.run(async () => {}), /not accepting/);
const errors: unknown[] = [];
let closes = 0;
const hanging = createShutdown(() => new Promise(() => {}), async () => { closes++; }, error => errors.push(error), 5);
assert.equal(await hanging(), false); assert.equal(closes, 1); assert.equal(errors.length, 1);
const failed = createShutdown(async () => { throw new Error("room"); }, async () => { throw new Error("storage"); }, error => errors.push(error));
assert.equal(await failed(), false); assert.equal(errors.length, 3);
console.log("idempotent room-stop then storage-drain, deadlines and visible failure exit status ok");
