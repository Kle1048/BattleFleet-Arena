import assert from "node:assert/strict";
import { createGameScene } from "./createGameScene";
import { gltfAssetCache } from "./gltfAssetCache";
import { DEFAULT_ENVIRONMENT_TUNING } from "../runtime/environmentTuning";
import { BufferGeometry, Material, Mesh } from "three";

const originalFetch = globalThis.fetch;
const signals: AbortSignal[] = [];
globalThis.fetch = (_input, init) => {
  signals.push(init!.signal as AbortSignal);
  return new Promise<Response>(() => {}); // All assets hang indefinitely.
};
let timer: ReturnType<typeof setTimeout> | undefined;
try {
  const scene = await Promise.race([
    createGameScene({ environmentTuning: { ...DEFAULT_ENVIRONMENT_TUNING, elevationDeg: 35 } }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("optional assets blocked scene/lobby")), 500);
    }),
  ]);
  assert.ok(scene.scene.children.some((object) => object.name.startsWith("island_")));
  assert.ok(scene.water);
  assert.equal(scene.getEnvironmentTuning().elevationDeg, 35);
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  scene.scene.traverse(object => {
    const mesh = object as Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) {
      materials.add(material);
    }
  });
  let freedGeometry = 0, freedMaterial = 0;
  for (const geometry of geometries) geometry.addEventListener("dispose", () => freedGeometry++);
  for (const material of materials) material.addEventListener("dispose", () => freedMaterial++);
  scene.dispose(); scene.dispose();
  assert.equal(freedGeometry, geometries.size);
  assert.equal(freedMaterial, materials.size);
  assert.equal(scene.scene.children.length, 0);
  gltfAssetCache.dispose();
  await scene.assetsReady; // Cancellation settles readiness; optional assets never block startup.
  assert.ok(signals.length > 0);
  assert.ok(signals.every((signal) => signal.aborted));
} finally {
  clearTimeout(timer);
  gltfAssetCache.dispose();
  globalThis.fetch = originalFetch;
}
console.log("scene startup with hanging assets tests ok");
