import assert from "node:assert/strict";
import { createGameScene } from "./createGameScene";
import { gltfAssetCache } from "./gltfAssetCache";
import { DEFAULT_ENVIRONMENT_TUNING } from "../runtime/environmentTuning";
import { BufferGeometry, Material, Mesh } from "three";

const originalFetch = globalThis.fetch;
const signals: AbortSignal[] = [];
const urls: string[] = [];
globalThis.fetch = (input, init) => {
  urls.push(String(input));
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
  const islands = scene.scene.getObjectByName("mapIslands")!;
  assert.equal(islands.visible, false, "unknown/disabled terrain starts hidden");
  assert.deepEqual(islands.children, [scene.islandCollisionPolygonGroup]);
  assert.equal(scene.islandCollisionPolygonGroup.children.length, 0, "no unused debug geometry");
  assert.equal(urls.filter(url => url.endsWith(".glb")).length, 0, "disabled islands never enter the GLB queue");
  scene.setIslandsEnabled(false);
  assert.equal(islands.visible, false);
  assert.equal(scene.islandCollisionPolygonGroup.parent, islands, "collision overlay cannot outlive terrain visibility");
  scene.setIslandsEnabled(true);
  assert.equal(islands.visible, true);
  assert.equal(islands.children.length, 6, "five fallbacks and the debug group");
  assert.equal(scene.islandCollisionPolygonGroup.children.length, 5);
  const firstChildren = [...islands.children];
  scene.setIslandsEnabled(true);
  scene.setIslandsEnabled(false);
  scene.setIslandsEnabled(true);
  assert.deepEqual(islands.children, firstChildren, "state updates and round toggles reuse terrain");
  await Promise.resolve();
  assert.equal(urls.filter(url => url.endsWith(".glb")).length, 2, "islands respect the shared two-request budget");
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
  scene.setIslandsEnabled(true);
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
