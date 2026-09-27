import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { createFxSystem } from "./fxSystem";

const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => ({
  width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), clearRect() {}, fillRect() {} }),
}) } });
try {
  let seed = 12345, now = 0;
  const scene = new THREE.Scene();
  const fx = createFxSystem(scene, { now: () => now,
    random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32) });
  const hash = createHash("sha256");
  const textures = new Map<THREE.Texture, number>();
  let peak = 0;
  for (let frame = 0; frame < 900; frame++) {
    const dt = [0, 1000 / 60, 1000 / 30, 5, 100, 240][frame % 6]!;
    now += dt;
    fx.spawnMissileTrailStreamTick(frame, 5, frame * 0.07, 8);
    fx.spawnShipDamageSmokeTick(-frame, 8, 0.3, frame % 2 ? "damaged" : "heavily_damaged");
    if (frame % 4 === 0) fx.spawnArtilleryMuzzle(4, 9, 0.3, 2);
    if (frame % 5 === 0) fx.spawnArtilleryImpact((["hit", "water", "island"] as const)[frame % 3]!, 4, 6, 1.4);
    if (frame % 9 === 0) { fx.spawnMissileImpact(10, 8, "hit"); fx.spawnTorpedoImpact(3, 9, "water"); }
    if (frame % 31 === 0) for (let burst = 0; burst < 3; burst++) fx.spawnShipDestroyedExplosion(2 + burst, 4);
    if (frame % 23 === 0) fx.spawnSoftkillChaffCloud(2, 3, 0.9, 20);
    peak = Math.max(peak, fx.getStats().activeParticles);
    fx.update(dt);
    const stats = fx.getStats(); peak = Math.max(peak, stats.activeParticles);
    const sprites = scene.children as THREE.Sprite[];
    hash.update(JSON.stringify([stats, sprites.map(sprite => {
      const material = sprite.material;
      if (!textures.has(material.map!)) textures.set(material.map!, textures.size);
      return sprite.visible ? [textures.get(material.map!), sprite.position.toArray(), sprite.scale.toArray(),
        material.color.toArray(), material.opacity, material.rotation, material.blending, material.depthTest, sprite.renderOrder] : null;
    })]));
  }
  const fingerprint = hash.digest("hex");
  assert.equal(peak, 960);
  // Captured from the unmodified pre-14 implementation. Do not regenerate after changing the pool.
  assert.equal(fingerprint, "457556e6a34a14f35a578c51b63484fe4b2f60cd0b6264015f3004bf47de616f");
  fx.dispose(); assert.equal(scene.children.length, 0);
} finally {
  if (previous) Object.defineProperty(globalThis, "document", previous); else Reflect.deleteProperty(globalThis, "document");
}
console.log("all FX recipes, mixed textures/ages, saturation and exact sprite-state fingerprint preserved");
