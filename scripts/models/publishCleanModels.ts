/** One-time, guarded material migration. No geometry or marker changes accepted. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Vector3 } from "three";
import { canonicalizeModel } from "./canonicalizeModel";
import { extractModelMetadata, visitModelNodes } from "./extractModelMetadata";
import { decodeGlb } from "./glb";
import { checkMaterialBudget } from "./materialBudget";
import { MODEL_CATALOG, modelDefinition } from "../../shared/src/content/models";
import { compileModelMetadata } from "./buildModelMetadata";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const staging = path.join(root, "assets/blender/clean");
// Millimetre-quantised, winding-preserving triangle multiset: ignores UV splits
// and exporter vertex order, never accepts changed silhouettes/topology/counts.
function geometrySignature(bytes: Buffer): string[] {
  const { document: doc, bin } = decodeGlb(bytes);
  const accessors = doc.accessors as any[], views = doc.bufferViews as any[], meshes = doc.meshes as any[];
  function value(id: number, index: number, component = 0): number {
    const a = accessors[id], v = views[a.bufferView];
    const size = a.componentType === 5126 || a.componentType === 5125 ? 4 : a.componentType === 5123 ? 2 : 1;
    const stride = v.byteStride ?? size * (a.type === "VEC3" ? 3 : 1);
    const offset = (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + index * stride + component * size;
    return a.componentType === 5126 ? bin!.readFloatLE(offset) : size === 4 ? bin!.readUInt32LE(offset)
      : size === 2 ? bin!.readUInt16LE(offset) : bin!.readUInt8(offset);
  }
  const triangles: string[] = [];
  visitModelNodes(doc, (node, world) => {
    if (node.mesh === undefined) return;
    for (const p of meshes[node.mesh].primitives) {
      assert.equal(p.mode ?? 4, 4);
      const count = accessors[p.indices ?? p.attributes.POSITION].count;
      for (let i = 0; i < count; i += 3) {
        const points = [0, 1, 2].map(k => {
          const index = p.indices === undefined ? i + k : value(p.indices, i + k);
          return new Vector3(...[0, 1, 2].map(c => value(p.attributes.POSITION, index, c)) as [number, number, number])
            .applyMatrix4(world).toArray().map(x => Math.round(x * 1000)).join(",");
        });
        triangles.push([points.join("|"), [points[1], points[2], points[0]].join("|"),
          [points[2], points[0], points[1]].join("|")].sort()[0]!);
      }
    }
  });
  return triangles.sort();
}
function closeMetadata(actual: unknown, expected: unknown, label: string): void {
  if (typeof expected === "number") {
    assert.equal(typeof actual, "number", label);
    assert(Math.abs((actual as number) - expected) < .00001, label); return;
  }
  if (expected && typeof expected === "object") {
    assert(actual && typeof actual === "object", label);
    const a = actual as Record<string, unknown>, e = expected as Record<string, unknown>;
    assert.deepEqual(Object.keys(a).sort(), Object.keys(e).sort(), label);
    for (const key of Object.keys(e)) if (key !== "sourceSha256") closeMetadata(a[key], e[key], label + "." + key);
  } else assert.equal(actual, expected, label);
}
async function main(): Promise<void> {
const manifest = JSON.parse(await readFile(path.join(staging, "manifest.json"), "utf8")) as
  { modelId: string; file: string; metresPerUnit: number }[];
assert.deepEqual(manifest.map(m => m.modelId).sort(), Object.keys(MODEL_CATALOG).sort(), "Complete catalog required");
const updates = [];
for (const entry of manifest) {
  const model = modelDefinition(entry.modelId);
  assert.equal(entry.file, entry.modelId + "_source.glb");
  const target = path.join(root, "client/public/assets", model.file);
  const previous = await readFile(target);
  const next = canonicalizeModel(await readFile(path.join(staging, entry.file)), {
    kind: model.kind, rotating: model.yaw, metresPerUnit: entry.metresPerUnit,
  });
  const budget = checkMaterialBudget(next, model.kind);
  assert.deepEqual(geometrySignature(next), geometrySignature(previous), entry.modelId + ": geometry changed");
  closeMetadata(extractModelMetadata(next), extractModelMetadata(previous), entry.modelId);
  updates.push({ entry, target, previous, next, budget });
}
// No runtime file is touched until the entire batch passed its geometry/marker gates.
const recovery = path.join(staging, "previous-runtime");
await mkdir(recovery, { recursive: true });
for (const u of updates) {
  const backup = path.join(recovery, u.entry.modelId + ".glb");
  try { await access(backup); } catch { await writeFile(backup, u.previous, { flag: "wx" }); }
}
for (const u of updates) await writeFile(u.target, u.next);
const metadata = await compileModelMetadata(MODEL_CATALOG);
await writeFile(path.join(root, "shared/src/content/generatedModelMetadata.json"), JSON.stringify(metadata, null, 2) + "\n");
const report = updates.map(u => ({ modelId: u.entry.modelId, beforeBytes: u.previous.length,
  afterBytes: u.next.length, ...u.budget }));
await writeFile(path.join(staging, "publication-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
