import assert from "node:assert/strict";
import { DEFAULT_MAP_ISLANDS, isInsideAnyIslandCircle } from "./islands";

{
  const islands = [{ id: "t", x: 0, z: 0, radius: 100 }];
  assert.equal(isInsideAnyIslandCircle(0, 0, islands, 0), true);
  assert.equal(isInsideAnyIslandCircle(150, 0, islands, 0), false);
  assert.equal(isInsideAnyIslandCircle(101, 0, islands, 0), false);
  assert.equal(isInsideAnyIslandCircle(99, 0, islands, 0), true);
  assert.equal(isInsideAnyIslandCircle(108, 0, islands, 10), true);
}

{
  const i1 = DEFAULT_MAP_ISLANDS[0]!;
  assert.ok(i1, "fixture island");
  assert.equal(
    isInsideAnyIslandCircle(i1.x, i1.z, DEFAULT_MAP_ISLANDS, 14),
    true,
    "center of island i1",
  );
  assert.equal(
    isInsideAnyIslandCircle(i1.x + i1.radius + 30, i1.z, DEFAULT_MAP_ISLANDS, 14),
    false,
    "well outside i1",
  );
}

console.log("islands tests ok");
