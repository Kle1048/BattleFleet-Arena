import assert from "node:assert/strict";
import { convexHullXZ } from "./convexHull2d";

{
  const h = convexHullXZ([
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 10 },
    { x: 0, z: 10 },
  ]);
  assert.equal(h.length, 4);
}

{
  const h = convexHullXZ([
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 2, z: 0 },
    { x: 1, z: 1 },
  ]);
  assert.ok(h.length >= 3);
}

{
  const inner = convexHullXZ([
    { x: 0, z: 0 },
    { x: 0, z: 0 },
    { x: 5, z: 5 },
  ]);
  assert.ok(inner.length >= 1);
}

console.log("convexHull2d tests ok");
