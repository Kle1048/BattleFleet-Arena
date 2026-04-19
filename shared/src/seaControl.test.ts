import assert from "node:assert/strict";
import { isInSeaControlZone, SEA_CONTROL_ZONE_HALF_EXTENT } from "./seaControl.ts";

assert.equal(isInSeaControlZone(0, 0), true);
assert.equal(isInSeaControlZone(SEA_CONTROL_ZONE_HALF_EXTENT, 0), true);
assert.equal(isInSeaControlZone(SEA_CONTROL_ZONE_HALF_EXTENT + 0.1, 0), false);
assert.equal(isInSeaControlZone(0, -SEA_CONTROL_ZONE_HALF_EXTENT), true);

console.log("seaControl tests ok");
