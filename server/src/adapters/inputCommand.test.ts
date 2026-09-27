import assert from "node:assert/strict";
import { decodeInputCommand } from "./inputCommand.js";

for (const raw of [null, undefined, 1, "input", true, [], () => 0]) assert.equal(decodeInputCommand(raw), null);
const converted = decodeInputCommand({ throttle: "0.5", rudderInput: true, aimX: 12, aimZ: -34,
  mineSpawnLocalZ: -25, radarActive: false, primaryFire: true, secondaryFire: 1,
  torpedoFire: "true", aswmFireSide: "port", sessionId: "victim", hp: 999, score: 999 })!;
assert.deepEqual(converted, { throttle: 0.5, rudderInput: 1, aimX: 12, aimZ: -34,
  mineSpawnLocalZ: -25, radarActive: false, primaryFire: true, secondaryFire: false,
  torpedoFire: false, aswmFireSide: "port" });
assert(!("sessionId" in converted)); assert(!("hp" in converted)); assert(!("score" in converted));
const maliciousNumber = { valueOf() { throw new Error("must not execute"); } };
for (const invalid of [NaN, Infinity, -Infinity, {}, [], null, undefined, maliciousNumber, Symbol("n"), 1n]) {
  const parsed = decodeInputCommand({ throttle: invalid, rudderInput: invalid, aimX: invalid,
    aimZ: invalid, mineSpawnLocalZ: invalid, radarActive: invalid, aswmFireSide: invalid })!;
  assert.equal(parsed.throttle, 0); assert.equal(parsed.rudderInput, 0);
  assert.equal(parsed.aimX, undefined); assert.equal(parsed.aimZ, undefined);
  assert.equal(parsed.mineSpawnLocalZ, undefined);
  assert.equal(parsed.radarActive, undefined); assert.equal(parsed.aswmFireSide, undefined);
}
for (const n of [-1e300, -140, -1, -0.2, 0, 0.5, 1, 20, 1e300]) {
  const parsed = decodeInputCommand({ throttle: n, rudderInput: n, aimX: n, mineSpawnLocalZ: n })!;
  assert.equal(parsed.throttle, n, "domain, not transport, clamps ranges");
  assert.equal(parsed.aimX, n);
}
console.log("input boundary finite values, safe legacy coercion and intention allowlist ok");
