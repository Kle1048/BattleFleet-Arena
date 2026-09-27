import assert from "node:assert/strict";
import * as THREE from "three";
import { instanceStaticMounts } from "./staticMountInstances";
import { cloneMeshMaterialsDeep } from "./shipGltfHull";
import { disposeVisualResources } from "./shipVisualResources";

const geometry = new THREE.BoxGeometry(2, 3, 4), sourceMaterial = new THREE.MeshStandardMaterial();
function fixture() {
  const hull = new THREE.Group(), clones: THREE.Group[] = [], materialClones = new Map<THREE.Material, THREE.Material>();
  hull.position.set(15, 7, -32); hull.rotation.y = .7;
  for (let index = 0; index < 2; index++) {
    const mount = new THREE.Group(); mount.position.set(index ? 4 : -4, 2, -10);
    mount.rotation.y = index ? .4 : -.4;
    const mesh = new THREE.Mesh(geometry, sourceMaterial); mesh.position.z = 1;
    mesh.castShadow = true; mesh.receiveShadow = true;
    const muzzle = new THREE.Object3D(); muzzle.name = "bf_muzzle"; muzzle.position.set(0, 1, 3);
    mount.add(mesh, muzzle); hull.add(mount); clones.push(mount);
    cloneMeshMaterialsDeep(mount, materialClones);
  }
  return { hull, clones };
}
const a = fixture(), b = fixture();
const original = a.clones.map(c => c.children[0] as THREE.Mesh);
a.hull.updateWorldMatrix(true, true);
const before = original.map(m => m.matrixWorld.clone());
const muzzles = a.clones.map(c => c.getObjectByName("bf_muzzle")!.getWorldPosition(new THREE.Vector3()));
instanceStaticMounts(a.hull, a.clones); instanceStaticMounts(b.hull, b.clones);
const batch = a.hull.children.find(c => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
assert(batch); assert.equal(batch.count, 2); assert.equal(batch.geometry, geometry);
assert(original.every(m => !m.visible && m.material === batch.material));
assert.notEqual(batch.material, (b.hull.children.find(c => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh).material);
assert.notEqual(batch.material, sourceMaterial);
a.hull.updateWorldMatrix(true, true);
const relative = new THREE.Matrix4();
for (let index = 0; index < 2; index++) {
  batch.getMatrixAt(index, relative);
  const actual = batch.matrixWorld.clone().multiply(relative);
  actual.elements.forEach((v, i) => assert(Math.abs(v - before[index]!.elements[i]!) < 1e-5));
  assert(a.clones[index]!.getObjectByName("bf_muzzle")!.getWorldPosition(new THREE.Vector3()).distanceTo(muzzles[index]!) < 1e-8);
}
assert(batch.boundingSphere && batch.boundingBox);
const version = batch.instanceMatrix.version;
a.hull.position.x += 100; a.hull.rotation.y += .5; a.hull.updateWorldMatrix(true, true);
assert.equal(batch.instanceMatrix.version, version, "hull motion does not reupload static instance transforms");
const transparent = fixture();
(transparent.clones[0]!.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.transparent = true;
instanceStaticMounts(transparent.hull, transparent.clones);
assert(!transparent.hull.children.some(c => c instanceof THREE.InstancedMesh), "transparent sorting stays untouched");
const mirrored = fixture(); mirrored.clones[0]!.scale.x = -1;
instanceStaticMounts(mirrored.hull, mirrored.clones);
assert(!mirrored.hull.children.some(c => c instanceof THREE.InstancedMesh), "negative instance scales stay separate");
let instanceDisposals = 0, geometryDisposals = 0, materialDisposals = 0;
batch.addEventListener("dispose", () => instanceDisposals++);
geometry.addEventListener("dispose", () => geometryDisposals++);
(batch.material as THREE.Material).addEventListener("dispose", () => materialDisposals++);
disposeVisualResources(a.hull); disposeVisualResources(a.hull);
assert.deepEqual([instanceDisposals, geometryDisposals, materialDisposals], [1, 0, 1]);
for (const f of [b, transparent, mirrored]) disposeVisualResources(f.hull);
geometry.dispose(); sourceMaterial.dispose();
console.log("Static mount instances: world-pose/muzzle parity, per-hull materials, immutable transforms, transparent/mirrored fallback and GPU disposal");
