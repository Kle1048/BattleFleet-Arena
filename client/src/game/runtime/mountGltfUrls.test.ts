import assert from "node:assert/strict";
import { MODEL_CATALOG } from "@battlefleet/shared";
import { resolveMountGltfUrl, uniqueMountVisualUrls } from "./mountGltfUrls";
import { resolveShipHullGltfUrl, HULL_GLTF_URL_BY_ID } from "./hullGltfUrls";

for (const [id, model] of Object.entries(MODEL_CATALOG)) {
  const resolve = model.kind === "hull" ? resolveShipHullGltfUrl : resolveMountGltfUrl;
  assert.equal(resolve(id), `/assets/${model.file}`);
}
assert.equal(resolveMountGltfUrl("gepard_artillery"), "/assets/systems/mount_gepard_artillery.glb");
assert.equal(resolveMountGltfUrl("spruance_mk45"), "/assets/systems/mount_spruance_mk45.glb");
assert.equal(Object.keys(HULL_GLTF_URL_BY_ID).length, 3);
assert.equal(uniqueMountVisualUrls().length, 11);
for (const id of ["visual_artillery", "unknown", "__proto__", "constructor", "../outside"]) {
  assert.throws(() => resolveMountGltfUrl(id), /Unknown model/);
  assert.throws(() => resolveShipHullGltfUrl(id), /Unknown model/);
}
assert.throws(() => resolveMountGltfUrl("gepard"), /not a mount/);
assert.throws(() => resolveShipHullGltfUrl("gepard_artillery"), /not a hull/);
console.log("One model catalog drives URLs; unknown IDs and wrong model kinds fail explicitly");
