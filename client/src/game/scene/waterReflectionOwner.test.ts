import assert from "node:assert/strict";
import { PerspectiveCamera, PlaneGeometry, Scene, type WebGLRenderer, type WebGLRenderTarget } from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import { ownWaterReflectionTarget } from "./waterReflectionOwner";

for (const failRender of [false, true]) {
  const geometry = new PlaneGeometry(100, 100);
  const water = new Water(geometry, {});
  const originalHook = water.onBeforeRender;
  water.rotation.x = -Math.PI / 2;
  water.updateMatrixWorld();
  const camera = new PerspectiveCamera();
  camera.position.set(0, 100, 1); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const scene = new Scene();
  let targetDisposals = 0;
  let renders = 0;
  let seenTarget: WebGLRenderTarget | null = null;
  const renderer = {
    xr: { enabled: false }, shadowMap: { autoUpdate: true }, autoClear: true,
    state: { buffers: { depth: { setMask() {} } } },
    getRenderTarget: () => null,
    setRenderTarget(target: WebGLRenderTarget | null) {
      if (target && target !== seenTarget) {
        seenTarget = target;
        target.addEventListener("dispose", () => targetDisposals++);
      }
    },
    render() { renders++; if (failRender) throw new Error("reflection render failed"); },
  } as unknown as WebGLRenderer;
  const originalSetTarget = renderer.setRenderTarget;
  const owner = ownWaterReflectionTarget(water);
  const render = () => water.onBeforeRender(renderer, scene, camera, geometry, water.material, null!);
  if (failRender) assert.throws(render, /reflection render failed/);
  else render();
  assert.equal(renderer.setRenderTarget, originalSetTarget, "scoped interception always restores renderer");
  assert.equal(water.onBeforeRender, originalHook, "no additional per-frame wrapper after first reflection");
  assert.ok(seenTarget);
  assert.equal(targetDisposals, 0);
  owner.dispose(); owner.dispose();
  assert.equal(targetDisposals, 1);
  render();
  assert.equal(renders, 1, "disposed water cannot recreate its framebuffer");
  geometry.dispose(); water.material.dispose();
}

const unseen = new Water(new PlaneGeometry(10, 10), {});
const owner = ownWaterReflectionTarget(unseen);
owner.dispose(); owner.dispose(); // No reflection pass/GPU allocation took place.
unseen.geometry.dispose(); unseen.material.dispose();
console.log("Real Three Water reflection target ownership, exception restoration and inert disposal ok");
