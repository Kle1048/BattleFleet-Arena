import assert from "node:assert/strict";
import { createGameScene } from "./createGameScene";
import { gltfAssetCache } from "./gltfAssetCache";

const originalFetch = globalThis.fetch;
const signals: AbortSignal[] = [];
globalThis.fetch = (_input, init) => {
  signals.push(init!.signal as AbortSignal);
  return new Promise<Response>(() => {}); // All assets hang indefinitely.
};
let timer: ReturnType<typeof setTimeout> | undefined;
try {
  const scene = await Promise.race([
    createGameScene(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("optional assets blocked scene/lobby")), 500);
    }),
  ]);
  assert.ok(scene.scene.children.some((object) => object.name.startsWith("island_")));
  assert.ok(scene.water);
  scene.dispose();
  gltfAssetCache.dispose();
  assert.ok(signals.length > 0);
  assert.ok(signals.every((signal) => signal.aborted));
} finally {
  clearTimeout(timer);
  gltfAssetCache.dispose();
  globalThis.fetch = originalFetch;
}
console.log("scene startup with hanging assets tests ok");
