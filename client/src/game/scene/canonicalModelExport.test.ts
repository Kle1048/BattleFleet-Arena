import assert from "node:assert/strict";
import { canonicalizeModel } from "../../../../scripts/models/canonicalizeModel";
import { decodeGlb, encodeGlb, type GltfDocument } from "../../../../scripts/models/glb";
import { extractModelMetadata, visitModelNodes } from "../../../../scripts/models/extractModelMetadata";
import { Quaternion, Vector3 } from "three";

const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
const source: GltfDocument = { asset: { version: "2.0" }, scenes: [{ nodes: [0] }],
  nodes: [{ name: "parent", translation: [2, 3, 4], rotation: q.toArray(), children: [1, 2] },
    { name: "bf_muzzle", translation: [1, 2, 5] },
    { name: "mesh", mesh: 0, translation: [-3, 0, 7], scale: [2, 3, 4] }],
  meshes: [{ primitives: [] }], buffers: [{ byteLength: 4 }],
};
const binary = Buffer.from([1, 2, 3, 4]);
const bytes = encodeGlb(source, binary);
const output = canonicalizeModel(bytes, { kind: "mount", rotating: true, metresPerUnit: 0.01 });
const decoded = decodeGlb(output);
assert.deepEqual(decoded.bin, binary, "no texture/geometry re-encoding");
const metadata = extractModelMetadata(output);
assert(Math.abs(metadata.effects.muzzle!.position.x - .07) < 1e-12);
assert(Math.abs(metadata.effects.muzzle!.position.y - .05) < 1e-12);
assert(Math.abs(metadata.effects.muzzle!.position.z - .03) < 1e-12);
assert.deepEqual(metadata.effects.yaw!.position, { x: 0, y: 0, z: 0 });
let meshSeen = false;
visitModelNodes(decoded.document, (node, matrix) => {
  if (node.mesh === undefined) return;
  meshSeen = true;
  const p = new Vector3(), r = new Quaternion(), s = new Vector3(); matrix.decompose(p, r, s);
  assert(p.distanceTo(new Vector3(.09, .03, .07)) < 1e-12);
  assert(s.distanceTo(new Vector3(.02, .03, .04)) < 1e-12);
  assert(Math.abs(r.dot(q)) > 1 - 1e-12);
});
assert(meshSeen);
assert.deepEqual(decodeGlb(bytes).document, source, "author input is untouched");
assert.throws(() => canonicalizeModel(output, { kind: "mount", metresPerUnit: .01 }), /twice/);
for (const scale of [0, -1, NaN, Infinity]) {
  assert.throws(() => canonicalizeModel(bytes, { kind: "mount", metresPerUnit: scale }), /unit scale/);
}
assert.throws(() => canonicalizeModel(encodeGlb({ ...source, animations: [] }, binary),
  { kind: "mount", metresPerUnit: 1 }), /animations/);
const invalid = structuredClone(source); invalid.nodes![1]!.scale = [2, 2, 2];
assert.throws(() => canonicalizeModel(encodeGlb(invalid, binary), { kind: "mount", metresPerUnit: 1 }), /unit scale/);
console.log("Canonical export: metric hierarchy, rigid markers, explicit pivot, preserved binary and rejected ambiguous transforms");
