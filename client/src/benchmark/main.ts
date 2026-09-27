import { createGameScene, resizeCamera } from "../game/scene/createGameScene";
import { createGameRenderer } from "../game/runtime/rendererLifecycle";
import { DEFAULT_ENVIRONMENT_TUNING } from "../game/runtime/environmentTuning";
import { installReflectionCameraLayerMask } from "../game/runtime/renderOverlayLayers";
import { updateGameWaterAnimations } from "../game/runtime/materialLibrary";
import { createCockpitHud } from "../game/hud/cockpitHud";
import { loadShipAssets } from "../game/runtime/shipAssetLoading";
import { getAuthoritativeHullProfile, resolveShipHullGltfUrlForClass, setHullProfileWorkbenchLivePreview } from "../game/runtime/shipProfileRuntime";
import { resolveMountGltfUrl } from "../game/runtime/mountGltfUrls";
import { getShipHullGltfSourceForUrl } from "../game/scene/shipGltfHull";
import { gltfAssetCache } from "../game/scene/gltfAssetCache";
import { disposeShipSpriteTexture } from "../game/scene/shipVisual";
import { disposeVisualResources } from "../game/scene/shipVisualResources";
import { ISLAND_GLB_URLS } from "../game/scene/islandGltfVisuals";
import { createReplay } from "./replay";
import { createVisualCheckpoint } from "./visualCheckpoint";
import { measureGpuFrames } from "./gpuProbe";
import { profileRender } from "./renderProfile";
import { compareStaticMountDraws } from "./staticMountComparison";
import { createMeasurements, type ResourceSample } from "./metrics";
import { FIXTURE_ID, FIXTURE_SAMPLE_FRAMES, FIXTURE_SEED, FIXTURE_STEP_MS, FIXTURE_WARMUP_FRAMES } from "./fixture";
import gameShell from "../../index.html?raw";

// Use the exact game HUD CSS without executing or embedding the game's bootstrap HTML.
const style = document.createElement("style");
style.textContent = (gameShell.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "") + `
  #app { width:1280px; height:720px; position:absolute; inset:0; }
  #benchmark-controls { position:fixed; left:230px; bottom:12px; z-index:10000; padding:12px;
    background:#0c1625ee; color:white; font:12px monospace; width:700px; max-height:240px; overflow:auto; }
  #benchmark-controls button { padding:6px; margin:6px; }
  #benchmark-results { white-space:pre-wrap; }
`;
document.head.append(style);
const root = document.querySelector<HTMLElement>("#app")!;
const status = document.querySelector<HTMLElement>("#benchmark-status")!;
const output = document.querySelector<HTMLElement>("#benchmark-results")!;
const runButton = document.querySelector<HTMLButtonElement>("#benchmark-run")!;
const stopButton = document.querySelector<HTMLButtonElement>("#benchmark-stop")!;
const visualButton = document.querySelector<HTMLButtonElement>("#benchmark-visual")!;
const gpuButton = document.querySelector<HTMLButtonElement>("#benchmark-gpu")!;
const profileButton = document.querySelector<HTMLButtonElement>("#benchmark-profile")!;
const mountsButton = document.querySelector<HTMLButtonElement>("#benchmark-mounts")!;
const nativeNow = performance.now.bind(performance);
const results: unknown[] = [];
let stopRun = () => {};
let disposed = false;
const cleanup: Array<() => void> = [];
const dispose = () => {
  if (disposed) return;
  disposed = true; stopRun();
  for (const release of cleanup.reverse()) {
    try { release(); } catch (error) { console.warn("Benchmark cleanup failed", error); }
  }
  cleanup.length = 0;
};
const print = () => { output.textContent = JSON.stringify(results, null, 2); };

async function start(): Promise<void> {
  // Failure here discriminates context creation from game code, assets, network and FX.
  const probeCanvas = document.createElement("canvas");
  const probe = probeCanvas.getContext("webgl2");
  if (!probe) throw new Error("Independent WebGL2 probe failed before scene/assets/replay. Browser GPU unavailable.");
  probe.getExtension("WEBGL_lose_context")?.loseContext();
  const startupAt = nativeNow();
  const renderer = createGameRenderer(root);
  renderer.setPixelRatio(1); renderer.setSize(1280, 720);
  renderer.info.autoReset = false; // Count reflection/shadow/main draws together.
  cleanup.push(() => { renderer.dispose(); renderer.forceContextLoss(); });
  // Keep the historic fixture available; explicit ?islands=0 tests today's game default.
  const islandsEnabled = new URLSearchParams(location.search).get("islands") !== "0";
  const bundle = await createGameScene({ environmentTuning: DEFAULT_ENVIRONMENT_TUNING, islandsEnabled });
  cleanup.push(() => { gltfAssetCache.dispose(); disposeShipSpriteTexture(); });
  cleanup.push(() => { bundle.dispose(); disposeVisualResources(bundle.scene); });
  resizeCamera(bundle.camera, 1280, 720);
  const reflection = installReflectionCameraLayerMask(renderer, bundle.camera);
  cleanup.push(() => reflection.dispose());
  const cockpit = createCockpitHud();
  cleanup.push(() => cockpit.dispose());
  // A page-local preview override bypasses editor profile patches without changing storage.
  for (const id of ["fac", "destroyer", "cruiser"] as const) {
    setHullProfileWorkbenchLivePreview(id, getAuthoritativeHullProfile(id)!);
  }
  await Promise.all([bundle.assetsReady, ...(["fac", "destroyer", "cruiser"] as const).map(loadShipAssets)]);
  if (disposed) return;
  if (renderer.getContext().isContextLost()) throw new Error("WebGL context lost during asset startup");
  const assetLoadMs = nativeNow() - startupAt;
  const hullAssets = (["fac", "destroyer", "cruiser"] as const).map(id => ({
    id, url: resolveShipHullGltfUrlForClass(id), loaded: !!getShipHullGltfSourceForUrl(resolveShipHullGltfUrlForClass(id)),
  }));
  const islandAssets = ISLAND_GLB_URLS.map(url => ({ url, loaded: !!gltfAssetCache.get(url) }));
  const mountUrls = new Set<string>();
  for (const id of ["fac", "destroyer", "cruiser"] as const) {
    const profile = getAuthoritativeHullProfile(id)!;
    for (const slot of profile.mountSlots ?? []) {
      const equipment = profile.defaultLoadout?.[slot.id];
      if (equipment) mountUrls.add(resolveMountGltfUrl(equipment.modelId));
    }
    for (const launcher of profile.fixedSeaSkimmerLaunchers ?? []) {
      if (launcher.equipment) mountUrls.add(resolveMountGltfUrl(launcher.equipment.modelId));
    }
  }
  const mountAssets = [...mountUrls].map(url => ({ url, loaded: !!getShipHullGltfSourceForUrl(url) }));
  results.push({ fixture: islandsEnabled ? FIXTURE_ID : `${FIXTURE_ID}-open-water`, islandsEnabled,
    seed: FIXTURE_SEED, build: import.meta.env.MODE,
    viewport: [1280, 720], pixelRatio: 1, deviceViewport: [window.innerWidth, window.innerHeight],
    environment: bundle.getEnvironmentTuning(), hullAssets, islandAssets, mountAssets,
    startupAssetLoadMs: assetLoadMs, startupCache: "browser-cache state uncontrolled; not a cold-download measurement",
    gpuTimeMs: null, gpuTiming: "not collected; renderCpuMs is CPU submission time, never GPU time",
    gpuTimerAvailable: !!renderer.getContext().getExtension("EXT_disjoint_timer_query_webgl2"),
    assetTransfers: performance.getEntriesByType("resource").filter(entry => /\.(glb|png|jpg)(\?|$)/.test(entry.name))
      .map(entry => { const resource = entry as PerformanceResourceTiming;
        return { url: resource.name, transferBytes: resource.transferSize, encodedBytes: resource.encodedBodySize, durationMs: resource.duration }; }),
    pooledParticlesMeaning: "inactive retained particles; total allocated = active + pooled",
    exclusions: ["server/network", "audio output", "legacy air-defense independent rAFs", "input-device sampling", "debug panels"],
  });
  print();
  let stopped = false;
  let visual: ReturnType<typeof createVisualCheckpoint> | undefined;
  let visualAngle = 0;
  let gpuAbort: AbortController | undefined;
  let profileAbort: AbortController | undefined;
  let mountAngle = 0;
  cleanup.push(() => visual?.dispose());
  visualButton.disabled = false;
  function ensureVisual() {
    visual ??= createVisualCheckpoint({ scene: bundle.scene, camera: bundle.camera, cockpit,
      getHullGltfTemplate: id => getShipHullGltfSourceForUrl(resolveShipHullGltfUrlForClass(id)),
      getMountGltfTemplate: id => getShipHullGltfSourceForUrl(resolveMountGltfUrl(id)),
    }, () => { updateGameWaterAnimations(bundle.water, 6000); renderer.render(bundle.scene, bundle.camera); });
    return visual;
  }
  visualButton.addEventListener("click", () => {
    if (stopButton.disabled === false) return;
    const angle = (["follow", "port", "overhead"] as const)[visualAngle++ % 3]!;
    ensureVisual().show(angle);
    status.textContent = `Visual checkpoint frame 360 + fixed air defense: ${angle}. Not a performance measurement.`;
  });
  gpuButton.disabled = false;
  profileButton.disabled = false;
  mountsButton.disabled = false;
  mountsButton.addEventListener("click", async () => {
    if (!stopButton.disabled) return;
    const angle = (["follow", "port", "overhead"] as const)[mountAngle++ % 3]!;
    ensureVisual().show(angle);
    runButton.disabled = true; stopButton.disabled = false; mountsButton.disabled = true;
    profileAbort = new AbortController(); status.textContent = `Comparing fixed launchers: ${angle}`;
    try {
      const comparison = await compareStaticMountDraws(renderer, bundle.scene, bundle.camera, profileAbort.signal);
      results.splice(4); results.push({ staticMountComparison: { angle, ...comparison } }); print();
      status.textContent = `Fixed launcher comparison complete: ${angle}`;
    } catch (error) { status.textContent = `INVALID fixed launcher comparison: ${String(error)}`; }
    finally { profileAbort = undefined; runButton.disabled = false; stopButton.disabled = true; mountsButton.disabled = false; }
  });
  profileButton.addEventListener("click", async () => {
    if (!stopButton.disabled) return;
    ensureVisual().show("follow");
    runButton.disabled = true; stopButton.disabled = false; profileButton.disabled = true;
    profileAbort = new AbortController();
    status.textContent = "Profiling static render passes: 20 warmup + 120 samples";
    try {
      const renderProfile = await profileRender(renderer, bundle.scene, bundle.camera, profileAbort.signal);
      results.splice(4); results.push({ renderProfile }); print(); status.textContent = "Render profile complete";
    } catch (error) { status.textContent = `INVALID render profile: ${String(error)}`; }
    finally { profileAbort = undefined; runButton.disabled = false; stopButton.disabled = true; profileButton.disabled = false; }
  });
  gpuButton.addEventListener("click", async () => {
    if (!stopButton.disabled) return;
    ensureVisual().show("follow");
    runButton.disabled = true; stopButton.disabled = false; gpuButton.disabled = true;
    gpuAbort = new AbortController();
    status.textContent = "Static GPU probe: 60 warm-up + 120 samples. Separate from CPU replay timings.";
    try {
      const probe = await measureGpuFrames(renderer, () => renderer.render(bundle.scene, bundle.camera), gpuAbort.signal);
      results.splice(4); results.push({ staticGpuProbe: probe }); print();
      status.textContent = probe.supported ? "Static GPU probe complete (not whole replay GPU time)." : "GPU timer extension unavailable.";
    } catch (error) { status.textContent = `INVALID GPU probe: ${String(error)}`; }
    finally { gpuAbort = undefined; runButton.disabled = false; stopButton.disabled = true; gpuButton.disabled = false; }
  });
  let active: ReturnType<typeof createReplay> | undefined;
  let raf = 0;
  let settle: (() => void) | undefined;
  const resources = (frame: number): ResourceSample => {
    let sceneObjects = 0;
    bundle.scene.traverse(() => sceneObjects++);
    const heap = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize;
    return { frame, sceneObjects, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length ?? 0, heapBytes: typeof heap === "number" ? heap : null };
  };
  stopRun = () => {
    profileAbort?.abort();
    gpuAbort?.abort();
    stopped = true; cancelAnimationFrame(raf); active?.dispose(); active = undefined; settle?.(); settle = undefined;
    runButton.disabled = false; stopButton.disabled = true;
  };
  const contextLost = () => {
    stopRun(); runButton.disabled = true;
    status.textContent = "INVALID: WebGL context lost. Reload after GPU recovery; no timing acceptance.";
    results.push({ invalid: "webglcontextlost" }); print();
  };
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  cleanup.push(() => renderer.domElement.removeEventListener("webglcontextlost", contextLost));
  runButton.disabled = false;
  status.textContent = "Ready. Run all three repetitions without resizing or changing tabs.";
  runButton.addEventListener("click", async () => {
    visual?.dispose(); visual = undefined; visualAngle = 0;
    runButton.disabled = true; stopButton.disabled = false; stopped = false;
    results.splice(1); // Bound retained reports to one three-repetition batch plus metadata.
    print();
    try {
      if (document.hidden) throw new Error("page is hidden; background-throttled timings are not comparable");
      if (window.innerWidth !== 1280 || window.innerHeight !== 720) throw new Error("set browser viewport to 1280 x 720 before measuring");
      for (let repetition = 1; repetition <= 3 && !stopped; repetition++) {
        const measurement = createMeasurements(FIXTURE_SAMPLE_FRAMES);
        active = createReplay({ scene: bundle.scene, camera: bundle.camera, cockpit,
          getHullGltfTemplate: id => getShipHullGltfSourceForUrl(resolveShipHullGltfUrlForClass(id)),
          getMountGltfTemplate: id => getShipHullGltfSourceForUrl(resolveMountGltfUrl(id)),
        });
        let frame = 0, previousTimestamp: number | undefined;
        status.textContent = `Repetition ${repetition}/3: 300 warm-up + 1800 measured frames`;
        await new Promise<void>((resolve, reject) => {
          settle = resolve;
          const draw = (timestamp: number) => {
            if (stopped || !active) return resolve();
            try {
              if (document.hidden || window.innerWidth !== 1280 || window.innerHeight !== 720) {
                throw new Error("visibility or viewport changed during measurement");
              }
              const intervalMs = previousTimestamp === undefined ? 0 : timestamp - previousTimestamp;
              previousTimestamp = timestamp;
              const sample = active.step(frame);
              updateGameWaterAnimations(bundle.water, frame * FIXTURE_STEP_MS);
              renderer.info.reset();
              const renderStarted = nativeNow(); renderer.render(bundle.scene, bundle.camera);
              const renderCpuMs = nativeNow() - renderStarted;
              if (frame >= FIXTURE_WARMUP_FRAMES) {
                measurement.frame({ intervalMs, runtimeCpuMs: sample.runtimeCpuMs, fxCpuMs: sample.fxCpuMs,
                  renderCpuMs, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
                  activeParticles: sample.activeParticles, pooledParticles: sample.pooledParticles });
                if (frame % 60 === 0) measurement.resources(resources(frame));
              }
              frame++;
              if (frame < FIXTURE_WARMUP_FRAMES + FIXTURE_SAMPLE_FRAMES) raf = requestAnimationFrame(draw);
              else resolve();
            } catch (error) { reject(error); }
          };
          raf = requestAnimationFrame(draw);
        });
        settle = undefined;
        if (stopped || !active) break;
        const counts = active.counts(); active.dispose(); active = undefined;
        // Remaining scene/cache resources are intentionally reused across warm repetitions.
        const afterReplayDispose = resources(frame);
        results.push({ repetition, ...measurement.report(), counts, afterReplayDispose }); print();
      }
      if (!stopped) status.textContent = "Complete. Compare identical fixture/build/assets across at least three repetitions.";
    } catch (error) {
      stopRun(); status.textContent = `INVALID: ${error instanceof Error ? error.message : String(error)}`;
      results.push({ invalid: status.textContent }); print();
    } finally { runButton.disabled = renderer.getContext().isContextLost(); stopButton.disabled = true; }
  });
}

stopButton.addEventListener("click", () => { stopRun(); status.textContent = "Stopped; incomplete repetition discarded."; });
window.addEventListener("beforeunload", () => dispose(), { once: true });
void start().catch(error => {
  dispose(); status.textContent = `INVALID: ${error instanceof Error ? error.message : String(error)}`;
  results.push({ invalid: status.textContent }); print();
});
