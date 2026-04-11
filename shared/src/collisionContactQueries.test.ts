import assert from "node:assert/strict";
import { SHIP_CLASS_DESTROYER } from "./shipClass";
import { twoShipsObbOverlap } from "./collisionContactQueries";

const pose = (x: number, z: number) => ({
  x,
  z,
  headingRad: 0,
  shipClass: SHIP_CLASS_DESTROYER,
});

assert.equal(twoShipsObbOverlap(pose(0, 0), pose(500, 0)), false, "weit weg");
assert.equal(twoShipsObbOverlap(pose(0, 0), pose(0, 0)), true, "identische Pose");

console.log("collisionContactQueries tests ok");
