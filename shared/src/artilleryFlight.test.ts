import assert from "node:assert/strict";
import {
  ARTILLERY_FLIGHT_TIME_BASE_MS,
  ARTILLERY_FLIGHT_TIME_MAX_MS,
  computeFlightMs,
} from "./artillery";

{
  const t0 = computeFlightMs(0);
  assert.equal(t0, ARTILLERY_FLIGHT_TIME_BASE_MS);
}

{
  const tNear = computeFlightMs(50);
  const tFar = computeFlightMs(300);
  assert.ok(tFar >= tNear);
}

{
  const t = computeFlightMs(99999);
  assert.equal(t, ARTILLERY_FLIGHT_TIME_MAX_MS);
}

console.log("artilleryFlight tests ok");
