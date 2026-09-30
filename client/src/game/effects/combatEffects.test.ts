import assert from "node:assert/strict";
import * as THREE from "three";
import { createFxSystem } from "./fxSystem";
import { createSpriteParticleBackend } from "./spriteParticleBackend";
import type { ParticleVisual } from "./particleBillboards";

const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => ({
  getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), clearRect() {}, fillRect() {} }),
}) } });
try {
  const scene = new THREE.Scene();
  const fx = createFxSystem(scene, { random: () => .5 });
  const particles = scene.getObjectByName("particle_billboards")!.userData.particles as ParticleVisual[];
  fx.spawnTorpedoImpact(10, 20, "water");
  const rings = particles.filter(p => p.ground);
  assert.equal(rings.length, 2);
  assert.ok(rings.every(p => p.material.depthTest));
  const ringHeights = rings.map(p => p.position.y);
  const spray = particles.find(p => p.stretch === 2.6)!;
  const startY = spray.position.y;
  fx.update(100);
  assert.ok(spray.position.y > startY, "water plume rises");
  assert.deepEqual(rings.map(p => p.position.y), ringHeights, "ripples stay on the water plane");
  for (let i = 0; i < 30; i++) fx.update(100);
  assert.equal(fx.getStats().activeParticles, 0, "water effects fully expire");
  fx.spawnArtilleryImpact("hit", 0, 0);
  assert.ok(fx.getStats().activeParticles <= 25, "hit recipe stays small");
  assert.ok(scene.children.some(p => p instanceof THREE.PointLight && p.intensity > 0));
  fx.update(200);
  assert.ok(scene.children.filter(p => p instanceof THREE.PointLight).every(p => (p as THREE.PointLight).intensity === 0));
  assert.ok(particles.some(p => p.visible), "smoke outlives the light pulse");
  fx.dispose(); assert.equal(scene.children.length, 0);

  const backend = createSpriteParticleBackend(scene, () => .6);
  const options = { texture: "smoke" as const, x: 0, y: 2, z: 0, vx: 0, vy: 0, vz: 0,
    dragPerSec: 0, maxAgeMs: 2000, sizeStart: 4, sizeEnd: 12, alphaStart: .6, alphaEnd: 0,
    colorStart: 0x888888, colorEnd: 0x666666, spinPerSec: 0 };
  backend.emit(options); backend.update(100);
  const smoke = (scene.getObjectByName("particle_billboards")!.userData.particles as ParticleVisual[])[0]!;
  assert.ok(smoke.position.x > 0 && smoke.position.z > 0 && smoke.position.y > 2, "wind and buoyancy act on smoke");
  for (let i = 0; i < 1100; i++) backend.emit(options);
  assert.equal(backend.getStats().activeParticles, 800, "background smoke leaves 160 slots for impacts");
  for (let i = 0; i < 160; i++) backend.emit({ ...options, texture: "flashAdd" });
  assert.equal(backend.getStats().activeParticles, 960);
  backend.emit(options);
  assert.equal(backend.getStats().activeParticles, 960, "extra smoke cannot evict flashes");
  backend.dispose();
} finally {
  if (previous) Object.defineProperty(globalThis, "document", previous); else Reflect.deleteProperty(globalThis, "document");
}
console.log("combat FX: planar ripples, ballistic spray, light lifetime, wind, reserve and cleanup ok");
