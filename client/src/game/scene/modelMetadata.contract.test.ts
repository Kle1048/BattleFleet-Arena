import assert from "node:assert/strict";
import { Matrix4, Vector3 } from "three";
import { encodeGlb, decodeGlb, type GltfDocument } from "../../../../scripts/models/glb";
import { extractModelMetadata } from "../../../../scripts/models/extractModelMetadata";

// Asymmetric reference: starboard/port are deliberately different distances,
// with a rotated parent and a matrix-authored rail. No JSON socket registry.
const reference: GltfDocument = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0, 4] }], nodes: [
  { name: "hull", translation: [2, 3, 4], rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2], children: [1, 2, 3] },
  { name: "SOCKET_starboard", translation: [5, 0, 10] },
  { name: "SOCKET_port", translation: [-3, 1, -7] },
  { name: "bf_wake", translation: [0, 0, -20] },
  { name: "RAIL_identity", matrix: new Matrix4().makeTranslation(0, 2, 8).elements },
] };
const bytes = encodeGlb(reference);
assert.deepEqual(decodeGlb(bytes).document, reference);
const metadata = extractModelMetadata(bytes, { sockets: ["starboard", "port"], rails: ["identity"], effects: ["wake"] });
const p = metadata.sockets.starboard!.position;
assert(new Vector3(p.x, p.y, p.z).distanceTo(new Vector3(12, 3, -1)) < 1e-9);
assert.deepEqual(metadata.rails.identity!.eulerRad, { x: 0, y: 0, z: 0 }, "zero rotation must remain explicit");
assert.deepEqual(extractModelMetadata(bytes), metadata, "deterministic metadata");
assert.throws(() => extractModelMetadata(bytes, { sockets: ["missing"] }), /Missing/);
function invalid(edit: (doc: GltfDocument) => void, pattern: RegExp) {
  const doc = structuredClone(reference); edit(doc); assert.throws(() => extractModelMetadata(encodeGlb(doc)), pattern);
}
invalid(d => { d.nodes![2]!.name = "SOCKET_starboard"; }, /Duplicate/);
invalid(d => { d.nodes![0]!.children!.push(0); }, /hierarchy/);
invalid(d => { d.scenes[0]!.nodes!.push(1); }, /hierarchy/);
invalid(d => { d.nodes![1]!.scale = [2, 1, 1]; }, /unit scale/);
invalid(d => { d.nodes![1]!.scale = [-1, 1, 1]; }, /reflection/);
invalid(d => { d.nodes![1]!.translation = [1, 2]; }, /translation/);
invalid(d => { d.nodes![1]!.rotation = [0, 0, 0, 2]; }, /quaternion/);
invalid(d => { d.nodes![1]!.name = "SOCKET_constructor"; }, /Invalid marker/);
invalid(d => { d.images = [{ uri: "https://example.invalid/texture.png" }]; }, /self-contained/);
const broken = Buffer.from(bytes); broken.writeUInt32LE(100, 8);
assert.throws(() => extractModelMetadata(broken), /header/);
console.log("asymmetric GLB metadata, parent transforms, explicit zero, deterministic output and fail-closed validation ok");
