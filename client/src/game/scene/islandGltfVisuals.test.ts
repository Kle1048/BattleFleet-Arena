import assert from "node:assert/strict";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from "three";
import { createGameScene, type GameSceneBundle } from "./createGameScene";
import { createIslandGltfInstance, ISLAND_GLB_URLS } from "./islandGltfVisuals";
import { gltfAssetCache } from "./gltfAssetCache";
import { disposeVisualResources } from "./shipVisualResources";
import { DEFAULT_ENVIRONMENT_TUNING } from "../runtime/environmentTuning";

const originalFetch = globalThis.fetch;
const originalGet = gltfAssetCache.get, originalLoad = gltfAssetCache.load;
const texture = new Texture();
const geometry = new BoxGeometry(2, 1, 2);
const material = new MeshStandardMaterial({ map: texture });
const template = new Group();
template.add(new Mesh(geometry, material));
let freedGeometry = 0, freedMaterial = 0, freedTexture = 0;
geometry.addEventListener("dispose", () => freedGeometry++);
material.addEventListener("dispose", () => freedMaterial++);
texture.addEventListener("dispose", () => freedTexture++);
const loaded = new Map<string, Group>();
const pending = new Map<string, { promise: Promise<Group | null>; resolve(value: Group | null): void }>();
let loadCalls = 0;
const scenes: GameSceneBundle[] = [];
try {
  // Stub only I/O; exercise actual scene setup, cloning, replacement and cleanup.
  globalThis.fetch = async () => new Response("offline", { status: 404 });
  gltfAssetCache.get = url => loaded.get(url);
  gltfAssetCache.load = url => {
    loadCalls++;
    let job = pending.get(url);
    if (!job) {
      let resolve!: (value: Group | null) => void;
      const promise = new Promise<Group | null>(done => { resolve = done; });
      job = { promise, resolve }; pending.set(url, job);
    }
    return job.promise;
  };
  const scene = await createGameScene({ environmentTuning: DEFAULT_ENVIRONMENT_TUNING });
  scenes.push(scene);
  await scene.assetsReady;
  assert.equal(loadCalls, 0);
  scene.setIslandsEnabled(true);
  const root = scene.scene.getObjectByName("mapIslands")!;
  const fallbacks = root.children.filter(child => child !== scene.islandCollisionPolygonGroup);
  let freedFallbacks = 0;
  for (const fallback of fallbacks) fallback.traverse(child => {
    if (child instanceof Mesh) child.geometry.addEventListener("dispose", () => freedFallbacks++);
  });
  assert.equal(loadCalls, 5);
  assert.equal(pending.size, 3, "five islands use three unique GLBs");
  let ready = false;
  const assetsReady = scene.assetsReady.then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(ready, false, "readiness includes assets enabled after scene creation");
  scene.setIslandsEnabled(false);
  scene.islandCollisionPolygonGroup.visible = true;
  for (const [url, job] of pending) {
    // One failed variant must retain its fallback without a retry loop.
    if (url !== ISLAND_GLB_URLS[2]) loaded.set(url, template);
    job.resolve(loaded.get(url) ?? null);
  }
  await assetsReady;
  assert.equal(root.visible, false, "late loads and debug toggles cannot reveal disabled islands");
  assert.equal(root.children.length, 6, "replacement never duplicates an island");
  assert.equal(freedFallbacks, 12, "four replaced fallbacks release all three geometries");
  scene.setIslandsEnabled(true);
  assert.equal(loadCalls, 5, "reenabling does not reload failed or successful templates");
  assert.equal(material.fog, true, "instance styling cannot mutate the template");
  const instance = createIslandGltfInstance(0, 190)!;
  const mesh = instance.children[0] as Mesh;
  assert.equal(mesh.geometry, geometry);
  assert.notEqual(mesh.material, material);
  assert.equal((mesh.material as MeshStandardMaterial).map, texture);
  let freedClone = 0;
  (mesh.material as MeshStandardMaterial).addEventListener("dispose", () => freedClone++);
  disposeVisualResources(instance);
  scene.dispose();
  assert.equal(freedClone, 1);
  assert.deepEqual([freedGeometry, freedMaterial, freedTexture], [0, 0, 0], "instances cannot free cached assets");

  loaded.clear(); pending.clear();
  const late = await createGameScene({ environmentTuning: DEFAULT_ENVIRONMENT_TUNING, islandsEnabled: true });
  scenes.push(late);
  const lateRoot = late.scene.getObjectByName("mapIslands")!;
  const lateChildren = [...lateRoot.children];
  late.dispose();
  for (const [url, job] of pending) { loaded.set(url, template); job.resolve(template); }
  await late.assetsReady;
  assert.equal(late.scene.children.length, 0, "late completion cannot resurrect a disposed scene");
  assert.deepEqual(lateRoot.children, lateChildren, "late completion cannot attach replacements");
  late.setIslandsEnabled(true);
  assert.equal(late.scene.children.length, 0);
} finally {
  for (const scene of scenes) scene.dispose();
  gltfAssetCache.get = originalGet; gltfAssetCache.load = originalLoad;
  globalThis.fetch = originalFetch;
  disposeVisualResources(template, true);
}
assert.deepEqual([freedGeometry, freedMaterial, freedTexture], [1, 1, 1], "cache owner releases shared resources once");
console.log("lazy islands: readiness, toggles, fallback, late completion and resource ownership ok");
