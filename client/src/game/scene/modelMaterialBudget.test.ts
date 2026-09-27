import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MODEL_CATALOG } from "@battlefleet/shared";
import { checkMaterialBudget } from "../../../../scripts/models/materialBudget";
import { decodeGlb, encodeGlb } from "../../../../scripts/models/glb";

let total = 0;
for (const [id, model] of Object.entries(MODEL_CATALOG)) {
  const bytes = readFileSync(new URL(`../../../public/assets/${model.file}`, import.meta.url));
  const result = checkMaterialBudget(bytes, model.kind);
  assert.equal(result.images, 1, id + ': one colour map');
  assert.equal(result.maxTextureSize, model.kind === 'hull' ? 1024 : 256);
  total += result.textureBytesRgba8WithMips;
  const { document, bin } = decodeGlb(bytes);
  const materials = document.materials as { normalTexture?: unknown; pbrMetallicRoughness: {
    baseColorTexture: { index: number }; metallicFactor: number; roughnessFactor: number } }[];
  for (const mat of materials) {
    assert.equal(mat.pbrMetallicRoughness.baseColorTexture.index, 0);
    assert(Math.abs(mat.pbrMetallicRoughness.roughnessFactor - .72) < 1e-6);
    assert(Math.abs(mat.pbrMetallicRoughness.metallicFactor - .045) < 1e-6);
  }
  const views = document.bufferViews as { byteOffset?: number }[];
  const offset = views[document.images![0]!.bufferView!]!.byteOffset ?? 0;
  const oversized = Buffer.from(bin!); oversized.writeUInt32BE(4096, offset + 16);
  assert.throws(() => checkMaterialBudget(encodeGlb(document, oversized), model.kind), /budget/);
  const zero = Buffer.from(bin!); zero.writeUInt32BE(0, offset + 20);
  assert.throws(() => checkMaterialBudget(encodeGlb(document, zero), model.kind), /budget/);
  const extra = structuredClone(document); extra.images!.push(extra.images![0]!);
  assert.throws(() => checkMaterialBudget(encodeGlb(extra, bin), model.kind), /one colour/);
  materials[0]!.normalTexture = { index: 0 };
  assert.throws(() => checkMaterialBudget(encodeGlb(document, bin), model.kind), /auxiliary/);
}
assert(total < 20 * 1024 * 1024, 'Entire catalog texture budget below 20 MiB RGBA8 including mips');
console.log('14 clean models: one colour map, hull 1024 / mount 256, constant PBR, <20 MiB, invalid budgets rejected');
