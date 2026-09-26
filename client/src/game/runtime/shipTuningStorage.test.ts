import assert from "node:assert/strict";
import { loadPersistedShipTuning } from "./shipTuningStorage";
import { applyShipDebugTuning, DEFAULT_SHIP_DEBUG_TUNING, getShipDebugTuningForVisualClass } from "./shipDebugTuning";
const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let stored = '{"wakeSpawnLocalZ":-60,"showRangeRings":true}';
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => stored } });
try {
  assert.deepEqual(loadPersistedShipTuning(), { showRangeRings: true });
  applyShipDebugTuning(loadPersistedShipTuning());
  const first = getShipDebugTuningForVisualClass("fac");
  assert(first.showRangeRings);
  assert.equal(getShipDebugTuningForVisualClass("fac"), first);
  applyShipDebugTuning({ showRangeRings: false });
  const next = getShipDebugTuningForVisualClass("fac");
  assert.notEqual(next, first); assert(!next.showRangeRings);
  stored = "invalid json";
  assert.deepEqual(loadPersistedShipTuning(), {});
} finally {
  applyShipDebugTuning(DEFAULT_SHIP_DEBUG_TUNING);
  if (previous) Object.defineProperty(globalThis, "localStorage", previous);
  else Reflect.deleteProperty(globalThis, "localStorage");
}
console.log("ship tuning startup storage and cache invalidation tests ok");
