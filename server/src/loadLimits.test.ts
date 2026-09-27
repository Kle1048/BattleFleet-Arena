import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { RequestBudget, TokenBucket, readMaxRooms } from "./loadLimits.js";
let now = 0;
const bucket = new TokenBucket(20, 2, () => now);
assert(bucket.take()); assert(bucket.take()); assert(!bucket.take());
now = 49; assert(!bucket.take()); now = 50; assert(bucket.take());
now = 10; assert(!bucket.take(), "backward clock cannot replenish");
now = 1000; assert(bucket.take()); assert(bucket.take()); assert(!bucket.take(), "refill capped at burst");
assert.equal(readMaxRooms({}), 4);
for (const raw of ["0", "-1", "4.2", "NaN", "Infinity", "65", "", " 4", "04"]) {
  assert.throws(() => readMaxRooms({ BFA_MAX_ROOMS: raw }));
}
const request = (ip: string, spoof = "") => ({ socket: { remoteAddress: ip },
  headers: { "x-forwarded-for": spoof } }) as unknown as IncomingMessage;
now = 0;
const peers = new RequestBudget(() => now, 2);
for (let i = 0; i < 40; i++) assert(peers.allow(request("peer-a", `spoof-${i}`)));
assert(!peers.allow(request("peer-a", "new-spoof")), "forwarded header cannot reset budget");
assert(peers.allow(request("peer-b")));
assert(!peers.allow(request("peer-c")), "bounded peer map rejects instead of evicting live budgets");
now = 60_001; assert(peers.allow(request("peer-c")), "expired peer entries are reclaimed");
const total = new RequestBudget(() => now);
for (let i = 0; i < 120; i++) assert(total.allow(request(`peer-${i}`)));
assert(!total.allow(request("another-peer")), "global budget bounds rotating addresses");
console.log("monotonic rate/burst limits, strict config, peer cap/expiry and spoof resistance ok");
