import assert from "node:assert/strict";
import { createUpdateCadence } from "./updateCadence";
for (const fps of [60, 120, 144]) {
  const due = createUpdateCadence(50);
  let updates = 0;
  for (let i = 0; i < fps * 10; i++) if (due(i * 1000 / fps)) updates++;
  assert(updates <= 200 && updates >= 180, `${fps}fps: ${updates} updates`);
}
const due = createUpdateCadence(50);
assert(due(0)); assert(!due(10)); assert(due(11, true)); assert(!due(50)); assert(due(61));
assert(due(100_000)); assert(!due(100_001)); // no catch-up bursts
assert(due(0)); // time reset
console.log("HUD cadence tests ok");
