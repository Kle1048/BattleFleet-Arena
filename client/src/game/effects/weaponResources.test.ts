import assert from "node:assert/strict";
import * as THREE from "three";
import { createArtilleryFx } from "./artilleryFx";
import { createMissileFx } from "./missileFx";
import type { FxSystem } from "./fxSystem";
import { warmupWeaponRendering } from "../runtime/warmupWeaponRendering";

const scene = new THREE.Scene();
const silent = { spawnArtilleryMuzzle() {}, spawnMissileTrailStreamTick() {} } as unknown as FxSystem;
const artillery = createArtilleryFx(scene, silent), missiles = createMissileFx(scene, silent);
const probes = [artillery.createWarmupMesh(), missiles.createWarmupMesh()];
const disposed = new Map<THREE.EventDispatcher, number>();
for (const mesh of probes) for (const resource of [mesh.geometry, mesh.material as THREE.Material]) {
  disposed.set(resource, 0); resource.addEventListener("dispose", () => disposed.set(resource, disposed.get(resource)! + 1));
}
for (let i = 0; i < 100; i++) {
  artillery.onFired({ shellId: i, ownerId: "ship", fromX: 0, fromZ: 0, toX: 10, toZ: 10, flightMs: 100 });
  const shell = scene.children[0] as THREE.Mesh;
  assert.equal(shell.geometry, probes[0]!.geometry); assert.equal(shell.material, probes[0]!.material);
  // Cover both server impacts and the lost-impact timeout.
  if (i % 2) artillery.onImpact({ shellId: i, x: 10, z: 10 }, { skipSplash: true });
  else artillery.update(performance.now() + 1000);
  missiles.sync([{ missileId: i, x: 0, z: 0, headingRad: 0 }]);
  const body = scene.children[0]!.children[0] as THREE.Mesh;
  assert.equal(body.geometry, probes[1]!.geometry); assert.equal(body.material, probes[1]!.material);
  missiles.sync(i % 2 ? [] : null);
  assert.equal(scene.children.length, 0);
  assert.ok([...disposed.values()].every(n => n === 0), "idle gaps retain GPU resources/programs");
}
const camera = new THREE.PerspectiveCamera();
let renders = 0;
warmupWeaponRendering({ render(s: THREE.Scene) {
  assert.equal(s, scene);
  assert.equal(!!s.getObjectByName("weapon_shader_warmup"), renders === 0);
  renders++;
} } as unknown as THREE.WebGLRenderer, scene, camera, probes);
assert.equal(renders, 2); assert.equal(scene.children.length, 0);
assert.throws(() => warmupWeaponRendering({ render() { throw Error("GPU unavailable"); } } as unknown as THREE.WebGLRenderer,
  scene, camera, probes), /GPU unavailable/);
assert.equal(scene.children.length, 0, "failed warmup detaches probes without disposing borrowed resources");
artillery.dispose(); missiles.dispose(); artillery.dispose(); missiles.dispose();
assert.ok([...disposed.values()].every(n => n === 1), "session releases each owned resource exactly once");
artillery.onFired({ shellId: 999, ownerId: "late", fromX: 0, fromZ: 0, toX: 1, toZ: 1, flightMs: 100 });
assert.equal(scene.children.length, 0);
console.log("100 separated weapon cycles: stable GPU resources, timeout/null cleanup, warmup rollback and one-time disposal");
