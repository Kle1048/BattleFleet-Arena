import * as THREE from "three";
import { createSpriteParticleBackend as createLegacy } from "./reference/legacySpriteParticleBackend";
import { createSpriteParticleBackend as createBatch } from "../game/effects/spriteParticleBackend";
import { createGameScene } from "../game/scene/createGameScene";
import { DEFAULT_ENVIRONMENT_TUNING } from "../game/runtime/environmentTuning";
import { disposeVisualResources } from "../game/scene/shipVisualResources";
import { seededRandom } from "./fixture";

const width = 640, height = 480;
const status = document.querySelector<HTMLElement>("#status")!;
const output = document.querySelector<HTMLElement>("#results")!;
const angle = document.querySelector<HTMLSelectElement>("#angle")!;
const renderers: THREE.WebGLRenderer[] = [];
const releases: Array<() => void> = [];
let disposed = false, busy = false;
window.addEventListener("beforeunload", () => {
  disposed = true; for (const release of releases.reverse()) release();
  for (const renderer of renderers) { renderer.dispose(); renderer.forceContextLoss(); }
});

async function build(id: string, create: typeof createBatch) {
  const bundle = await createGameScene({ environmentTuning: DEFAULT_ENVIRONMENT_TUNING });
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderers.push(renderer);
  renderer.setPixelRatio(1); renderer.setSize(width, height, false); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.info.autoReset = false;
  document.getElementById(id)!.append(renderer.domElement);
  bundle.camera.aspect = width / height; bundle.camera.updateProjectionMatrix();
  // Opaque occluder exercises normal particle depth testing versus rings/flashes.
  const occluder = new THREE.Mesh(new THREE.BoxGeometry(90, 40, 120), new THREE.MeshStandardMaterial({ color: 0x697c89 }));
  occluder.position.set(0, 20, 0); bundle.scene.add(occluder);
  const backend = create(bundle.scene, seededRandom(717));
  const random = seededRandom(143);
  const keys = ["soft", "smoke", "smoke", "soft", "ring", "flashAdd"] as const;
  for (let i = 0; i < 960; i++) backend.emit({ texture: keys[i % keys.length]!,
    x: (random() - .5) * 400, y: random() * 65, z: (random() - .5) * 300,
    vx: 0, vy: 0, vz: 0, dragPerSec: 0, maxAgeMs: 3000,
    sizeStart: 12 + random() * 28, sizeEnd: 50, alphaStart: .1 + random() * .4, alphaEnd: 0,
    colorStart: i % 6 === 5 ? 0xff9b32 : 0xaaaaaa, colorEnd: 0x555555, spinPerSec: .3 });
  backend.update(100);
  releases.push(() => { backend.dispose(); bundle.dispose(); disposeVisualResources(occluder); });
  await bundle.assetsReady;
  return { bundle, backend, renderer, pixels: new Uint8Array(width * height * 4) };
}

async function start() {
  const legacy = await build("legacy", createLegacy), batch = await build("batch", createBatch);
  const views = [legacy, batch];
  const render = (view: typeof batch, readPixels = false) => {
    if (view.renderer.getContext().isContextLost()) throw new Error("WebGL context lost; discard measurement");
    view.renderer.info.reset(); view.renderer.render(view.bundle.scene, view.bundle.camera);
    if (readPixels) {
      const gl = view.renderer.getContext();
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, view.pixels);
    }
    return { calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles,
      geometries: view.renderer.info.memory.geometries, textures: view.renderer.info.memory.textures };
  };
  const compare = () => {
    for (const { bundle } of views) {
      bundle.camera.up.set(0, 1, 0);
      bundle.camera.position.set(...(angle.value === "port" ? [300, 110, -250] : angle.value === "near" ? [0, 14, -20] : [0, 650, -.01]) as [number, number, number]);
      bundle.camera.lookAt(0, 0, 0); bundle.camera.updateMatrixWorld(true);
    }
    const before = render(legacy, true), after = render(batch, true);
    let changed = 0, max = 0, sum = 0;
    for (let i = 0; i < legacy.pixels.length; i += 4) for (let c = 0; c < 3; c++) {
      const delta = Math.abs(legacy.pixels[i + c]! - batch.pixels[i + c]!);
      sum += delta; max = Math.max(max, delta); if (delta > 2) changed++;
    }
    output.textContent = JSON.stringify({ camera: angle.value, referenceActiveParticles: legacy.backend.getStats().activeParticles,
      activeParticles: batch.backend.getStats().activeParticles,
      note: "Different art direction and budgets; not an equal-workload batching benchmark or RGB parity assertion",
      reference: before, instanced: after, rgb: { meanError: sum / (width * height * 3), maxError: max,
        channelsOver2: changed, fractionOver2: changed / (width * height * 3) } }, null, 2);
    status.textContent = "Comparison complete";
  };
  document.querySelector("#run")!.addEventListener("click", compare);
  angle.addEventListener("change", compare);
  document.querySelector("#timing")!.addEventListener("click", async () => {
    if (busy) return; busy = true;
    const controls = document.querySelectorAll<HTMLButtonElement | HTMLSelectElement>("button,select");
    controls.forEach(control => { control.disabled = true; });
    try {
    const timings: number[][] = [[], []];
    for (let frame = 0; frame < 140 && !disposed; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (disposed) return;
      for (const index of frame % 2 ? [1, 0] : [0, 1]) {
        const t = performance.now(); render(views[index]!); const elapsed = performance.now() - t;
        if (frame >= 20) timings[index]!.push(elapsed);
      }
      status.textContent = `Timing ${Math.max(0, frame - 19)}/120 (render CPU, not GPU)`;
    }
    output.textContent += "\n" + JSON.stringify(timings.map((values, index) => {
      values.sort((a, b) => a - b);
      return { backend: index ? "instanced" : "reference", samples: values.length,
        cpuP50Ms: values[Math.floor(values.length * .5)], cpuP95Ms: values[Math.floor(values.length * .95)] };
    }), null, 2);
    status.textContent = "Timing complete";
    } catch (error) {
      status.textContent = `FAILED: ${String(error)}`;
      console.error(error);
    } finally {
      busy = false; controls.forEach(control => { control.disabled = false; });
    }
  });
  compare();
}
void start().catch(error => { status.textContent = `FAILED: ${String(error)}`; console.error(error); });
