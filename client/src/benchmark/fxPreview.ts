import { createGameScene, resizeCamera, type LightingPresetId } from "../game/scene/createGameScene";
import { createGameRenderer } from "../game/runtime/rendererLifecycle";
import { DEFAULT_ENVIRONMENT_TUNING } from "../game/runtime/environmentTuning";
import { installReflectionCameraLayerMask } from "../game/runtime/renderOverlayLayers";
import { updateGameWaterAnimations } from "../game/runtime/materialLibrary";
import { createFxSystem } from "../game/effects/fxSystem";
import { loadShipAssets } from "../game/runtime/shipAssetLoading";
import { getAuthoritativeHullProfile, resolveShipHullGltfUrlForClass, setHullProfileWorkbenchLivePreview } from "../game/runtime/shipProfileRuntime";
import { resolveMountGltfUrl } from "../game/runtime/mountGltfUrls";
import { getShipHullGltfSourceForUrl } from "../game/scene/shipGltfHull";
import { createShipRenderer } from "../game/renderers/ships/shipRenderer";
import { createCombatFixture, seededRandom } from "./fixture";
import { gltfAssetCache } from "../game/scene/gltfAssetCache";
import { disposeShipSpriteTexture } from "../game/scene/shipVisual";
import { LIGHTING_PRESETS } from "../game/scene/lightingPresets";
import { sunAnglesFromPosition } from "../game/scene/environmentSun";
import { createShipWakeRibbonSystem } from "../game/scene/shipWakeRibbon";

async function start() {
const root = document.querySelector<HTMLElement>("#app")!;
const stats = document.querySelector<HTMLOutputElement>("#stats")!;
const renderer = createGameRenderer(root);
const bundle = await createGameScene({ environmentTuning: { ...DEFAULT_ENVIRONMENT_TUNING, fogStrength: .25 } });
const reflection = installReflectionCameraLayerMask(renderer, bundle.camera);
setHullProfileWorkbenchLivePreview("fac", getAuthoritativeHullProfile("fac")!);
await loadShipAssets("fac");
const ships = createShipRenderer(bundle.scene, "preview", {
  getHullGltfTemplate: id => getShipHullGltfSourceForUrl(resolveShipHullGltfUrlForClass(id)),
  getMountGltfTemplate: id => getShipHullGltfSourceForUrl(resolveMountGltfUrl(id)),
});
const ship = createCombatFixture().players[0]!;
ship.id = "preview"; ship.x = 0; ship.z = 0; ship.headingRad = 0; ship.aimX = 0; ship.aimZ = 100;
ships.sync([ship]);
const wakes = createShipWakeRibbonSystem(bundle.scene);
const wakeVisuals = new Map(ships.getVisuals());
let wakeMode = false;
let now = 0, raf = 0, playing = false, disposed = false;
const makeFx = () => createFxSystem(bundle.scene, { camera: bundle.camera, random: seededRandom(73), now: () => now });
let fx = makeFx();
const play = document.querySelector<HTMLButtonElement>("#play")!;
function camera() {
  const overhead = document.querySelector<HTMLSelectElement>("#angle")!.value === "overhead";
  bundle.camera.up.set(0, 1, 0);
  bundle.camera.position.set(...(overhead ? [15, wakeMode ? 250 : 150, .01] : [85, 60, 95]) as [number, number, number]);
  bundle.camera.lookAt(wakeMode ? 0 : 15, 0, wakeMode ? -35 : 0); bundle.camera.updateMatrixWorld(true);
}
function draw() {
  updateGameWaterAnimations(bundle.water, now);
  renderer.render(bundle.scene, bundle.camera);
  stats.textContent = wakeMode ? "Fahrt mit 28 m/s · Schaum ohne Spritzpartikel" : `${Math.round(now)} ms · ${fx.getStats().activeParticles} aktive Partikel`;
}
function reset() {
  wakeMode = false; ship.x = 0; ship.z = 0; ship.headingRad = 0; ships.sync([ship]);
  const visual = wakeVisuals.get(ship.id)!;
  visual.group.position.set(0, 0, 0); visual.group.rotation.y = 0;
  wakes.updateFromPlayers({ players: [], visuals: wakeVisuals }); camera();
  fx.dispose(); now = 0; fx = makeFx();
  fx.spawnArtilleryImpact("hit", 0, 12, 1.2);
  fx.spawnTorpedoImpact(-55, 15, "water");
  fx.spawnShipDamageSmokeTick(0, 0, 0, "heavily_damaged");
}
function stop() { playing = false; cancelAnimationFrame(raf); play.textContent = "Animation starten"; }
function show(time: number) {
  stop(); reset();
  while (now < time) { const dt = Math.min(1000 / 60, time - now); now += dt; fx.update(dt); }
  draw();
}
function resize() { renderer.setSize(root.clientWidth, root.clientHeight); resizeCamera(bundle.camera, root.clientWidth, root.clientHeight); draw(); }
document.querySelectorAll<HTMLButtonElement>("[data-time]").forEach(button => button.addEventListener("click", () => show(Number(button.dataset.time))));
document.querySelector("#wake")!.addEventListener("click", () => {
  stop(); fx.dispose(); now = 6000; fx = makeFx(); wakeMode = true;
  wakes.updateFromPlayers({ players: [], visuals: wakeVisuals });
  ship.speed = 28;
  for (let i = 0; i <= 90; i++) {
    ship.z = (i - 90) * 2.4; ship.x = Math.sin((i - 90) * .018) * 22;
    ship.headingRad = Math.atan2(22 * .018 * Math.cos((i - 90) * .018), 2.4);
    ships.sync([ship]);
    const visual = wakeVisuals.get(ship.id)!;
    visual.group.position.set(-ship.x, 0, ship.z); visual.group.rotation.y = -ship.headingRad;
    wakes.updateFromPlayers({ players: [ship], visuals: wakeVisuals, nowSeconds: i / 12 });
  }
  camera(); draw();
});
document.querySelector("#angle")!.addEventListener("change", () => { camera(); draw(); });
document.querySelector<HTMLSelectElement>("#lighting")!.addEventListener("change", event => {
  const lightingPreset = (event.target as HTMLSelectElement).value as LightingPresetId;
  bundle.applyEnvironmentTuning({ lightingPreset, ...sunAnglesFromPosition(LIGHTING_PRESETS[lightingPreset].sunPos) }); draw();
});
play.addEventListener("click", () => {
  if (playing) { stop(); return; }
  reset(); playing = true; play.textContent = "Pause";
  let previous = performance.now();
  const frame = (timestamp: number) => {
    if (!playing || disposed) return;
    const dt = Math.min(50, timestamp - previous); previous = timestamp; now += dt;
    fx.update(dt); draw(); if (now > 3400) reset();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
});
window.addEventListener("resize", resize);
window.addEventListener("beforeunload", () => {
  disposed = true; stop(); window.removeEventListener("resize", resize);
  fx.dispose(); wakes.dispose(); ships.dispose(); reflection.dispose(); bundle.dispose(); gltfAssetCache.dispose(); disposeShipSpriteTexture(); renderer.dispose();
}, { once: true });
camera(); resize(); show(300);
}
void start().catch(error => {
  document.querySelector("#stats")!.textContent = `Vorschau fehlgeschlagen: ${String(error)}`;
  console.error(error);
});
