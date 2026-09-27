import assert from "node:assert/strict";
import * as THREE from "three";
import { createShipRenderer } from "./shipRenderer";
import { disposeVisualResources } from "../../scene/shipVisualResources";

const template = new THREE.Group();
const geometry = new THREE.BoxGeometry(4, 2, 12);
const texture = new THREE.Texture();
const material = new THREE.MeshStandardMaterial({ map: texture });
template.add(new THREE.Mesh(geometry, [material, material]));
const pivot = new THREE.Group(); pivot.name = "bf_yaw";
const muzzle = new THREE.Object3D(); muzzle.name = "bf_muzzle"; muzzle.position.z = 6;
pivot.add(muzzle); template.add(pivot);
let templateDisposals = 0;
for (const resource of [geometry, material, texture]) {
  resource.addEventListener("dispose", () => { templateDisposals++; });
}
const scene = new THREE.Scene();
const renderer = createShipRenderer(scene, "me", {
  getHullGltfTemplate: () => template,
  getMountGltfTemplate: () => template,
});

function trackOwned(root: THREE.Object3D): () => void {
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry && mesh.geometry !== geometry) resources.add(mesh.geometry);
    for (const m of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) {
      assert.notEqual(m, material, "each ship owns its material clones");
      resources.add(m);
    }
  });
  const counts = new Map([...resources].map((r) => [r, 0]));
  for (const r of resources) r.addEventListener("dispose", () => counts.set(r, counts.get(r)! + 1));
  return () => { for (const count of counts.values()) assert.equal(count, 1); };
}

renderer.ensureShip("me", "fac");
renderer.ensureShip("other", "fac");
const verifyFirst = trackOwned(renderer.getVisuals().get("me")!.group);
renderer.ensureShip("me", "destroyer");
verifyFirst();
assert.equal(templateDisposals, 0, "class switch must preserve shared resources");
const verifyOther = trackOwned(renderer.getVisuals().get("other")!.group);
renderer.removeShip("other");
renderer.removeShip("other");
verifyOther();
renderer.ensureShip("wreck:1", "cruiser");
const verifyWreck = trackOwned(renderer.getVisuals().get("wreck:1")!.group);
renderer.removeShip("wreck:1");
verifyWreck();
const verifyFinal = trackOwned(renderer.getVisuals().get("me")!.group);
renderer.dispose();
renderer.dispose();
verifyFinal();
assert.equal(scene.children.length, 0);
assert.equal(templateDisposals, 0);

// Async upgrades preserve pose, never resurrect removed ships and ignore an old class's load.
const pending: Array<() => void> = [];
let ready = false;
const lazy = createShipRenderer(scene, "me", {
  getHullGltfTemplate: () => ready ? template : null,
  getMountGltfTemplate: () => template,
  loadShipAssets: () => new Promise<void>((resolve) => pending.push(resolve)),
});
lazy.ensureShip("me", "fac");
const placeholder = lazy.getVisuals().get("me")!;
placeholder.group.position.set(5, 6, 7);
placeholder.group.rotation.set(0, -3 * Math.PI / 4, 0);
placeholder.modelMotion.rotation.set(0.2, 0, 2, "YXZ");
const verifyPlaceholder = trackOwned(placeholder.group);
ready = true;
pending.shift()!();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.ok(lazy.getVisuals().get("me")!.hullModel);
assert.deepEqual(lazy.getVisuals().get("me")!.group.position.toArray(), [5, 6, 7]);
assert.deepEqual(lazy.getVisuals().get("me")!.group.rotation.toArray(), placeholder.group.rotation.toArray());
assert.deepEqual(lazy.getVisuals().get("me")!.modelMotion.rotation.toArray(), placeholder.modelMotion.rotation.toArray());
verifyPlaceholder();
lazy.ensureShip("me", "destroyer");
lazy.ensureShip("me", "cruiser");
const cruiser = lazy.getVisuals().get("me");
pending.shift()!();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(lazy.getVisuals().get("me"), cruiser);
lazy.removeShip("me");
pending.shift()!();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(scene.children.length, 0);
lazy.ensureShip("late", "fac");
lazy.dispose();
pending.shift()!();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(scene.children.length, 0);
disposeVisualResources(template, true);
assert.equal(templateDisposals, 3, "only cache shutdown disposes shared assets, once each");
console.log("ship renderer resource and async lifecycle tests ok");
