import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { RequestBudget, TokenBucket, readMaxRooms, readTrustLoopbackProxy } from "./loadLimits.js";
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
assert.equal(readTrustLoopbackProxy({}), false);
assert.equal(readTrustLoopbackProxy({ BFA_TRUST_LOOPBACK_PROXY: "1" }), true);
assert.throws(() => readTrustLoopbackProxy({ BFA_TRUST_LOOPBACK_PROXY: "true" }));
const proxied = (peer: string, ip: string | string[]) => ({ socket: { remoteAddress: peer },
  headers: { "x-real-ip": ip, "x-forwarded-for": "untrusted" } }) as unknown as IncomingMessage;
for (const trust of [false, true]) {
  const direct = new RequestBudget(() => 0, 4096, trust);
  for (let i = 0; i < 40; i++) assert(direct.allow(proxied("203.0.113.1", `198.51.100.${i}`)));
  assert(!direct.allow(proxied("203.0.113.1", "198.51.100.99")), "non-proxy spoof cannot mint a budget");
}
const proxy = new RequestBudget(() => 0, 4096, true);
for (let i = 0; i < 40; i++) assert(proxy.allow(proxied("127.0.0.1", "198.51.100.1")));
assert(!proxy.allow(proxied("127.0.0.1", "198.51.100.1")));
assert(proxy.allow(proxied("127.0.0.1", "198.51.100.2")), "different players do not share Nginx's budget");
const ipv6 = new RequestBudget(() => 0, 4096, true);
for (let i = 0; i < 40; i++) assert(ipv6.allow(proxied("::1", "2001:db8::1")));
assert(!ipv6.allow(proxied("::1", "2001:0db8:0:0:0:0:0:1")), "IPv6 spelling cannot reset budget");
const invalid = new RequestBudget(() => 0, 4096, true);
for (let i = 0; i < 40; i++) assert(invalid.allow(proxied("127.0.0.1", "garbage")));
assert(!invalid.allow(proxied("127.0.0.1", ["198.51.100.1", "198.51.100.2"])));
assert(!invalid.allow(proxied("127.0.0.1", "198.51.100.1, 198.51.100.2")));
assert(!invalid.allow(proxied("127.0.0.1", "fe80::1%eth0")), "scoped addresses must not reach URL parsing");
console.log("opt-in loopback proxy isolation, direct spoof rejection and canonical IPv6 budgets ok");
