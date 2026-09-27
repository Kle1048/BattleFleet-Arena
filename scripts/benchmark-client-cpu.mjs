// Headless real-module replay: isolates CPU from WebGL/desktop load. No GPU/FPS claim.
import * as THREE from "three";
import { createReplay } from "../client/src/benchmark/replay.ts";
import { summarize } from "../client/src/benchmark/metrics.ts";
import { disposeShipSpriteTexture } from "../client/src/game/scene/shipVisual.ts";

globalThis.fetch = async () => { throw new Error("headless benchmark uses procedural asset fallbacks"); };
globalThis.window = { innerWidth: 1280, innerHeight: 720 };
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({
  createRadialGradient: () => ({ addColorStop() {} }), clearRect() {}, fillRect() {}, fillStyle: "",
}) }) };
for (let repetition = 1; repetition <= 3; repetition++) {
  const scene = new THREE.Scene();
  const replay = createReplay({ scene, camera: new THREE.PerspectiveCamera(52, 1280 / 720, 1, 25000),
    cockpit: { update() {} }, getHullGltfTemplate: () => null, getMountGltfTemplate: () => null });
  const fx = [], runtime = [];
  for (let frame = 0; frame < 2100; frame++) {
    const sample = replay.step(frame);
    if (frame >= 300) { fx.push(sample.fxCpuMs); runtime.push(sample.runtimeCpuMs); }
  }
  console.log(JSON.stringify({ repetition, fxCpuMs: summarize(fx), runtimeCpuMs: summarize(runtime), counts: replay.counts() }));
  replay.dispose();
  if (scene.children.length) throw new Error("replay resources retained");
}
disposeShipSpriteTexture();
