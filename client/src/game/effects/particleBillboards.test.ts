import assert from "node:assert/strict";
import * as THREE from "three";
import { createParticleBillboards, type ParticleVisual } from "./particleBillboards";

const scene = new THREE.Scene();
const textures = [new THREE.Texture(), new THREE.Texture(), new THREE.Texture()] as const;
const particle = (z: number, map = textures[0]): ParticleVisual => ({
  visible: true, position: new THREE.Vector3(0, 0, z), scale: new THREE.Vector3(2, 2, 2), renderOrder: 11,
  material: { map, color: new THREE.Color(0xff0000), opacity: .5, rotation: .7,
    blending: THREE.NormalBlending, depthTest: true },
});
const particles = [particle(-5), particle(-10, textures[1]), particle(-10, textures[2]), particle(1000)];
particles[2]!.material.depthTest = false;
particles[2]!.material.blending = THREE.AdditiveBlending;
const batch = createParticleBillboards(scene, 4, textures, particles);
const mesh = scene.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
const dataTexture = mesh.material.uniforms.particleState!.value as THREE.DataTexture;
const data = dataTexture.image.data;
assert.ok(data instanceof Float32Array, "particle state uses float texels");
const camera = new THREE.PerspectiveCamera(60, 1, 1, 50);
camera.updateMatrixWorld(true);
batch.prepare(camera);
assert.equal(mesh.geometry.instanceCount, 3);
assert.deepEqual([data[2], data[18], data[34]], [-10, -10, -5], "far to near with stable allocation tie order");
assert.deepEqual([data[9], data[25], data[41]], [1, 2, 0], "maps follow the sorted particles");
assert.equal(data[26], 1); assert.equal(data[27], 1, "additive and ignore-depth flags preserved");
assert.equal(mesh.material.depthWrite, false);
const identity = dataTexture.image.data;
camera.position.z = -20; camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
batch.prepare(camera);
assert.deepEqual([data[2], data[18], data[34]], [-5, -10, -10], "each camera/reflection sorts independently");
assert.equal(dataTexture.image.data, identity, "fixed upload buffer is reused");
const legacySprite = new THREE.Sprite();
const legacyFrustum = new THREE.Frustum();
const viewProjection = new THREE.Matrix4();
for (const cameraZ of [0, -20, 30]) {
  camera.position.set(0, 0, cameraZ); camera.lookAt(0, 0, -10); camera.updateMatrixWorld(true);
  legacyFrustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  for (const x of [-25, -4, 0, 4, 25]) {
    particles[0]!.position.x = x;
    const expected = particles.filter(p => {
      legacySprite.position.copy(p.position); legacySprite.scale.copy(p.scale); legacySprite.updateMatrixWorld(true);
      return legacyFrustum.intersectsSprite(legacySprite);
    }).length;
    batch.prepare(camera);
    assert.equal(mesh.geometry.instanceCount, expected, "same sphere/frustum result as Three Sprite");
  }
}
legacySprite.material.dispose();
particles.forEach(p => { p.visible = false; }); batch.prepare(camera);
assert.equal(mesh.geometry.instanceCount, 0, "empty pool produces no instances");
let disposedGeometry = 0, disposedMaterial = 0, disposedState = 0, disposedTexture = 0;
mesh.geometry.addEventListener("dispose", () => disposedGeometry++);
mesh.material.addEventListener("dispose", () => disposedMaterial++);
dataTexture.addEventListener("dispose", () => disposedState++);
textures[0].addEventListener("dispose", () => disposedTexture++);
batch.dispose(); batch.dispose(); batch.prepare(camera);
assert.deepEqual([disposedGeometry, disposedMaterial, disposedState, disposedTexture], [1, 1, 1, 0]);
assert.equal(scene.children.length, 0);
textures.forEach(texture => texture.dispose());
console.log("particle instancing: camera sort, ties, frustum parity, style flags, fixed buffers and disposal ok");
