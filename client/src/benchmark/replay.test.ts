import assert from "node:assert/strict";
import * as THREE from "three";
import { createReplay } from "./replay";
import { FIXTURE_SAMPLE_FRAMES, FIXTURE_WARMUP_FRAMES } from "./fixture";
import { disposeShipSpriteTexture } from "../game/scene/shipVisual";

const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalFetch = globalThis.fetch;
// CPU/resource characterization, not a WebGL or visual correctness substitute.
globalThis.fetch = async () => { throw new Error("no assets in the headless replay fixture"); };
Object.defineProperty(globalThis, "window", { configurable: true, value: { innerWidth: 1280, innerHeight: 720 } });
Object.defineProperty(globalThis, "document", { configurable: true, value: {
  createElement(name: string) {
    assert.equal(name, "canvas");
    return { width: 0, height: 0, getContext: () => ({
      createRadialGradient: () => ({ addColorStop() {} }), clearRect() {}, fillRect() {}, fillStyle: "",
    }) };
  },
} });
try {
  const scene = new THREE.Scene();
  const snapshots: unknown[][] = [];
  for (let repetition = 0; repetition < 2; repetition++) {
    let hud = 0;
    const replay = createReplay({ scene, camera: new THREE.PerspectiveCamera(52, 1280 / 720, 1, 25000),
      cockpit: { update() { hud++; } }, getHullGltfTemplate: () => null, getMountGltfTemplate: () => null,
    });
    const checkpoints: unknown[] = [];
    for (let frame = 0; frame < FIXTURE_SAMPLE_FRAMES + FIXTURE_WARMUP_FRAMES; frame++) {
      const result = replay.step(frame);
      assert(result.activeParticles >= 0 && result.activeParticles <= 960);
      assert(result.pooledParticles >= 0); // Existing stats use "pooled" for inactive slots only.
      const batches = scene.children.filter(object => object.name === "particle_billboards");
      assert.equal(batches.length, 1, "one render object regardless of particle count");
      assert.equal(result.activeParticles + result.pooledParticles, batches[0]!.userData.particles.length);
      if (frame % 300 === 0) checkpoints.push({ frame, active: result.activeParticles,
        // Reconstruct legacy object count to retain all non-particle membership assertions.
        pool: result.pooledParticles, children: scene.children.length - 1 + result.activeParticles + result.pooledParticles,
        counts: replay.counts() });
    }
    assert.equal(replay.counts().deaths, 16);
    assert.equal(replay.counts().hudUpdates, hud);
    assert.deepEqual(replay.counts(), { inputs: 660, hudUpdates: 700, deaths: 16 });
    replay.dispose(); replay.dispose();
    assert.equal(scene.children.length, 0, "every replay-owned object is removed between runs");
    assert.throws(() => replay.step(0), /disposed/);
    snapshots.push(checkpoints);
  }
  assert.deepEqual(snapshots[0], snapshots[1], "repetitions preserve FX counts, membership and output cadence");
  // Original FX baseline retained; only input counts change for intentional 20 Hz pacing.
  assert.deepEqual(snapshots[0], [
    { frame: 0, active: 241, pool: 0, children: 289, counts: { inputs: 1, hudUpdates: 1, deaths: 0 } },
    { frame: 300, active: 958, pool: 177, children: 1191, counts: { inputs: 101, hudUpdates: 101, deaths: 0 } },
    { frame: 600, active: 955, pool: 180, children: 1191, counts: { inputs: 201, hudUpdates: 201, deaths: 0 } },
    { frame: 900, active: 959, pool: 237, children: 1252, counts: { inputs: 300, hudUpdates: 301, deaths: 1 } },
    { frame: 1200, active: 955, pool: 623, children: 1634, counts: { inputs: 361, hudUpdates: 401, deaths: 16 } },
    { frame: 1500, active: 956, pool: 622, children: 1634, counts: { inputs: 461, hudUpdates: 501, deaths: 16 } },
    { frame: 1800, active: 959, pool: 619, children: 1634, counts: { inputs: 561, hudUpdates: 601, deaths: 16 } },
  ]);
} finally {
  disposeShipSpriteTexture(); globalThis.fetch = originalFetch;
  if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument); else Reflect.deleteProperty(globalThis, "document");
  if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else Reflect.deleteProperty(globalThis, "window");
}
console.log("real frame/FX replay counts, deterministic repetitions and scene cleanup ok (headless, no GPU)");
