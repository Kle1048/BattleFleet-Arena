import assert from "node:assert/strict";
import type { LeaderboardRepository, MatchResult } from "../persistence/ports.js";
import { MatchResultService } from "./MatchResultService.js";

const accepted: MatchResult[] = [];
const completion: { resolve: (value: { revision: number; duplicate: boolean }) => void; reject: (reason: Error) => void }[] = [];
const repository: LeaderboardRepository = {
  load: async () => {}, size: () => 0, revision: () => 0, top: () => [], reset: async () => 0,
  recordMatch: result => {
    accepted.push(result);
    return new Promise((resolve, reject) => { completion.push({ resolve, reject }); });
  },
};
const service = new MatchResultService(repository, 2);
const result = (matchId: string): MatchResult => ({ matchId, completedAtMs: 100,
  rows: [{ playerKey: "private-key", displayName: "Name", score: 5, xp: 2, kills: 1, won: true }] });
const original = result("one");
const one = service.submit(original);
assert.equal(service.submit(result("one")), one, "pending duplicate coalesces without another queue slot");
(original.rows[0] as { score: number }).score = 900;
assert.equal(accepted[0]!.rows[0]!.score, 5, "application port owns async DTO even with a different repository");
const two = service.submit(result("two"));
const failed = assert.rejects(two, /disk/);
await assert.rejects(service.submit(result("overflow")), /full/);
assert.equal(service.snapshot().pending.length, 2);
assert.equal(service.snapshot().rejected, 1);
completion[0]!.resolve({ revision: 1, duplicate: false });
completion[1]!.reject(new Error("disk"));
await one; await failed;
assert.deepEqual(service.snapshot().recent.map(value => value.state), ["committed", "failed"]);
for (let i = 0; i < 10; i++) {
  const pending = service.submit(result("next-" + i));
  completion.at(-1)!.resolve({ revision: i + 2, duplicate: false }); await pending;
}
assert.equal(service.snapshot().pending.length, 0);
assert.equal(service.snapshot().recent.length, 2, "completed diagnostics have bounded retention");
assert(!JSON.stringify(service.snapshot()).includes("private-key"));
console.log("owned result DTOs, pending coalescing, capacity, failure visibility and bounded status history ok");
