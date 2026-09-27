import assert from "node:assert/strict";
import * as THREE from "three";
import { createSpriteParticleBackend } from "./spriteParticleBackend";
import type { ParticleVisual } from "./particleBillboards";

const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => ({
  getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), clearRect() {}, fillRect() {} }),
}) } });
try {
  const scene = new THREE.Scene();
  const backend = createSpriteParticleBackend(scene, () => 0.5);
  const options = { texture: "soft" as const, x: 1, y: 2, z: 3, vx: 2, vy: 0, vz: 0,
    dragPerSec: 0, maxAgeMs: 1000, sizeStart: 2, sizeEnd: 4, alphaStart: 1, alphaEnd: 0,
    colorStart: 0xff0000, colorEnd: 0xff0000, spinPerSec: 1 };
  backend.emit(options);
  backend.emit({ ...options, colorStart: 0x00ff00, colorEnd: 0x00ff00, alphaStart: 0.5 });
  backend.update(500);
  const batch = scene.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  const [red, green] = batch.userData.particles as readonly ParticleVisual[];
  assert.equal(scene.children.length, 1);
  assert.notEqual(red!.material, green!.material);
  assert.equal(red!.material.map, green!.material.map, "texture shared, mutable materials owned per sprite");
  assert.equal(red!.material.color.getHex(), 0xff0000); assert.equal(green!.material.color.getHex(), 0x00ff00);
  assert.equal(red!.material.opacity, 0.5); assert.equal(green!.material.opacity, 0.25);
  assert.equal(red!.position.x, 1.2, "kinematics still clamp dt to 100 ms but lifetime advances full elapsed dt");
  assert.equal(red!.scale.x, 3); assert.equal(red!.renderOrder, 11);
  assert.equal(red!.material.blending, THREE.NormalBlending); assert.equal(batch.material.depthWrite, false);
  let materials = 0, textures = 0;
  batch.material.addEventListener("dispose", () => materials++);
  red!.material.map!.addEventListener("dispose", () => textures++);
  backend.update(500); assert.equal(backend.getStats().activeParticles, 0);
  backend.dispose(); backend.dispose(); backend.emit(options); backend.update(10);
  assert.equal(materials, 1); assert.equal(textures, 1); assert.equal(scene.children.length, 0);
  assert.deepEqual(backend.getStats(), { activeParticles: 0, pooledParticles: 0 });
} finally {
  if (previous) Object.defineProperty(globalThis, "document", previous); else Reflect.deleteProperty(globalThis, "document");
}
console.log("sprite material independence, shared texture ownership, unchanged kinematics/blending and inert cleanup ok");
