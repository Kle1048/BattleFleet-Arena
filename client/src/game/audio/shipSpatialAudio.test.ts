import assert from "node:assert/strict";
import { shipRightUnitXZ, stereoPanFromShip } from "./shipSpatialAudio";

{
  const h = 0;
  const r = shipRightUnitXZ(h);
  assert.ok(Math.abs(r.x - 1) < 1e-9 && Math.abs(r.z - 0) < 1e-9);
}

{
  const listener = { x: 0, z: 0, headingRad: 0 };
  assert.ok(Math.abs(stereoPanFromShip(listener, 0, 200)) < 0.05);
  assert.ok(stereoPanFromShip(listener, 200, 0) > 0.9);
  assert.ok(stereoPanFromShip(listener, -200, 0) < -0.9);
}

console.log("shipSpatialAudio tests ok");
