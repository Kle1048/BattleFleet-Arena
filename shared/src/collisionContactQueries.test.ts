import assert from "node:assert/strict";
import { SHIP_CLASS_DESTROYER } from "./shipClass";
import {
  circleIntersectsAnyWreckHitboxFootprintXZ,
  shipOverlapsAnyWreck,
  twoShipsObbOverlap,
} from "./collisionContactQueries";

const pose = (x: number, z: number) => ({
  x,
  z,
  headingRad: 0,
  shipClass: SHIP_CLASS_DESTROYER,
});

assert.equal(twoShipsObbOverlap(pose(0, 0), pose(500, 0)), false, "weit weg");
assert.equal(twoShipsObbOverlap(pose(0, 0), pose(0, 0)), true, "identische Pose");

const oneWreckList = {
  length: 1,
  at: (i: number) =>
    i === 0
      ? { anchorX: 0, anchorZ: 0, headingRad: 0, shipClass: SHIP_CLASS_DESTROYER }
      : undefined,
};
assert.equal(
  shipOverlapsAnyWreck(pose(500, 0), oneWreckList),
  false,
  "Wrack weit weg",
);
assert.equal(
  circleIntersectsAnyWreckHitboxFootprintXZ(500, 0, 2, oneWreckList),
  false,
  "Punkt weit vom Wrack",
);

console.log("collisionContactQueries tests ok");
