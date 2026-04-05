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

// Insel i3: x: 120, z: 480, r: 72 — knapp außerhalb Uferzone
{
  const x = 120;
  const z = 480 + 72 + 30;
  const k = classifyArtilleryImpactVisual(x, z, false, DEFAULT_MAP_ISLANDS);
  assert.equal(k, "island");
}

console.log("artilleryImpactVisual tests ok");
