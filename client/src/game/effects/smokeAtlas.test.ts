import assert from "node:assert/strict";
import { createSmokeAtlas } from "./smokeAtlas";
const a = createSmokeAtlas(), b = createSmokeAtlas();
assert.deepEqual(a.image.data, b.image.data, "atlas is reproducible and independent of gameplay randomness");
const pixels = a.image.data;
assert.equal(pixels.length, 128 * 128 * 4);
for (let variant = 0; variant < 4; variant++) {
  const offset = (x: number, y: number) => (((variant >> 1) * 64 + y) * 128 + variant % 2 * 64 + x) * 4;
  for (let i = 0; i < 64; i++) for (const [x, y] of [[0, i], [63, i], [i, 0], [i, 63]]) {
    assert.equal(pixels[offset(x!, y!) + 3], 0, "transparent tile border prevents atlas seams");
  }
  assert.ok(pixels[offset(32, 32) + 3]! > 100, "each tile retains a dense core");
}
a.dispose(); b.dispose();
console.log("smoke atlas: repeatability, dense cores and seam-free borders ok");
