import assert from "node:assert/strict";
import { classifyArtilleryImpactVisual } from "./artillery";
import { DEFAULT_MAP_ISLANDS } from "./islands";

{
  const k = classifyArtilleryImpactVisual(0, 0, true, DEFAULT_MAP_ISLANDS);
  assert.equal(k, "hit");
}

{
  const k = classifyArtilleryImpactVisual(0, 0, false, DEFAULT_MAP_ISLANDS);
  assert.equal(k, "water");
}

// Insel i3 — knapp außerhalb Uferzone (siehe DEFAULT_MAP_ISLANDS)
{
  const i3 = DEFAULT_MAP_ISLANDS[2]!;
  const x = i3.x;
  const z = i3.z + i3.radius + 30;
  const k = classifyArtilleryImpactVisual(x, z, false, DEFAULT_MAP_ISLANDS);
  assert.equal(k, "island");
}

console.log("artilleryImpactVisual tests ok");
