import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAuthoritativeShipHullProfile } from "../../shared/src/shipProfiles";
import { modelDefinition, MODEL_CATALOG } from "../../shared/src/content/models";
import { modelSpatialMetadata } from "../../shared/src/content/modelMetadata";
import { compileModelMetadata } from "./buildModelMetadata";
import { decodeGlb } from "./glb";
import { checkMaterialBudget } from "./materialBudget";
import type { ShipClassId } from "../../shared/src/shipClass";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Texture/geometry audit; runtime pose/aim is covered by modelRuntime.contract.test.ts. */
export async function verifyShipAsset(shipClass: ShipClassId, outputDirectory: string): Promise<void> {
  const generated = await compileModelMetadata(MODEL_CATALOG);
  for (const [id, actual] of Object.entries(generated)) assert.deepEqual(actual, modelSpatialMetadata(id));
  const profile = getAuthoritativeShipHullProfile(shipClass)!;
  const installed = [profile.hullGltfId, ...Object.values(profile.defaultLoadout ?? {}).map(e => e.modelId),
    ...(profile.fixedSeaSkimmerLaunchers ?? []).map(r => r.equipment.modelId)];
  const files = [...new Set(installed)].map(id => {
    const definition = modelDefinition(id);
    const bytes = readFileSync(path.join(root, "client/public/assets", definition.file));
    const { document, bin } = decodeGlb(bytes);
    assert(bin);
    assert(!document.cameras, "No presentation cameras in game assets");
    const images = document.images ?? [];
    assert.equal(images.length, 1, `${id}: one clean colour map required`);
    const materialBudget = checkMaterialBudget(bytes, definition.kind);
    const views = document.bufferViews as { byteOffset?: number; byteLength: number }[];
    for (const image of images) {
      assert.notEqual(image.bufferView, undefined);
      const view = views[image.bufferView!]!;
      const start = view.byteOffset ?? 0;
      assert(start >= 0 && view.byteLength >= 8 && start + view.byteLength <= bin.length);
      assert.equal(bin.subarray(start, start + 8).toString("hex"), "89504e470d0a1a0a", `${id}: PNG payload`);
    }
    const meshes = document.meshes as { primitives: { mode?: number; indices?: number; attributes: Record<string, number> }[] }[];
    const accessors = document.accessors as { count: number }[];
    let triangles = 0;
    for (const mesh of meshes) for (const primitive of mesh.primitives) {
      assert.equal(primitive.mode ?? 4, 4);
      assert.notEqual(primitive.attributes.TEXCOORD_0, undefined, `${id}: missing UVs`);
      const accessor = primitive.indices ?? primitive.attributes.POSITION!;
      triangles += accessors[accessor]!.count / 3;
    }
    return { modelId: id, triangles, bytes: bytes.length, embeddedImages: images.length, ...materialBudget };
  });
  const assembledTriangles = installed.reduce((total, id) => total + files.find(f => f.modelId === id)!.triangles, 0);
  assert(assembledTriangles <= 10000, `${shipClass}: triangle budget exceeded`);
  const report = { passed: true, contractVersion: 2, assembledTriangles,
    checks: ["all catalog GLB hashes and generated markers", "clean colour-only texture budget", "UVs", "assembled triangle budget"],
    runtimeVerification: "npm test (modelRuntime.contract.test.ts)", files };
  writeFileSync(path.join(root, outputDirectory, "runtime-validation.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(report);
}
