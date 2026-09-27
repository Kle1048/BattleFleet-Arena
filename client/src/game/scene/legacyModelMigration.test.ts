import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Box3, Vector3 } from "three";
import { MODEL_CATALOG } from "@battlefleet/shared";
import { migrateLegacyModel } from "../../../../scripts/models/migrateLegacyModels";
import { decodeGlb } from "../../../../scripts/models/glb";
import { extractModelMetadata, visitModelNodes } from "../../../../scripts/models/extractModelMetadata";

const expected: Record<string, { slots: number; length: number }> = {
  gepard: { slots: 2, length: 60.016 }, spruance: { slots: 3, length: 120 }, cruiser: { slots: 3, length: 169.946 },
};
for (const [id, model] of Object.entries(MODEL_CATALOG)) {
  const original = readFileSync(new URL(`../../../public/assets/${model.file}`, import.meta.url));
  const migrated = migrateLegacyModel(id, original);
  const { document, bin } = decodeGlb(migrated);
  assert.deepEqual(bin, decodeGlb(original).bin, `${id}: geometry/images unchanged`);
  assert.deepEqual(migrateLegacyModel(id, migrated), migrated, `${id}: migration idempotent`);
  assert.equal(document.asset.extras!.bfaContractVersion, 2);
  const metadata = extractModelMetadata(migrated);
  const box = new Box3();
  // Accessor bounds give an independent hull extent; no textures, WebGL or browser required.
  const meshes = document.meshes as { primitives: { attributes: { POSITION: number } }[] }[];
  const accessors = document.accessors as { min: number[]; max: number[] }[];
  visitModelNodes(document, (node, world) => {
    if (node.mesh === undefined) return;
    for (const primitive of meshes[node.mesh]!.primitives) {
      const accessor = accessors[primitive.attributes.POSITION]!;
      box.union(new Box3(new Vector3().fromArray(accessor.min), new Vector3().fromArray(accessor.max)).applyMatrix4(world));
    }
  });
  if (model.kind === "hull") {
    assert.equal(Object.keys(metadata.sockets).length, expected[id]!.slots);
    assert.equal(Object.keys(metadata.rails).length, 2);
    assert(Math.abs(box.max.z - box.min.z - expected[id]!.length) < .001, `${id}: retained game length`);
    assert(Math.abs(metadata.effects.wake!.position.z - box.min.z) < .001, `${id}: wake at stern`);
    assert.equal(metadata.effects.wake!.position.y, 0, `${id}: wake at waterline`);
    for (const marker of Object.values(metadata.sockets)) {
      assert(marker.position.z > box.min.z && marker.position.z < box.max.z, `${id}: socket within hull length`);
    }
  } else {
    assert(metadata.effects.muzzle, `${id}: explicit muzzle`);
    assert(metadata.effects.muzzle.position.z > 0, `${id}: +Z weapon front`);
    if (model.yaw) {
      assert.deepEqual(metadata.effects.yaw!.position, { x: 0, y: 0, z: 0 });
      assert.deepEqual(metadata.effects.yaw!.eulerRad, { x: 0, y: 0, z: 0 });
      assert.equal(document.scenes[0]!.nodes!.length, 1);
      assert.equal(document.nodes![document.scenes[0]!.nodes![0]!]!.name, "bf_yaw");
    }
  }
}
console.log("14 real GLBs: lossless/idempotent metric migration, retained hull lengths, rigid sockets/rails and explicit muzzle/wake/yaw markers");
