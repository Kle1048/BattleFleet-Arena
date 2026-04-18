import assert from "node:assert/strict";
import { DEFAULT_SHIP_WAKE_LOD_MAX_DIST_WORLD, isWithinHorizontalDistanceSq } from "./wakeLod.ts";

assert.equal(
  isWithinHorizontalDistanceSq(0, 0, 100, 0, DEFAULT_SHIP_WAKE_LOD_MAX_DIST_WORLD),
  true,
);
assert.equal(
  isWithinHorizontalDistanceSq(0, 0, DEFAULT_SHIP_WAKE_LOD_MAX_DIST_WORLD + 1, 0, DEFAULT_SHIP_WAKE_LOD_MAX_DIST_WORLD),
  false,
);
assert.equal(isWithinHorizontalDistanceSq(10, 10, 10, 10, 0.5), true);

console.log("wakeLod tests ok");
