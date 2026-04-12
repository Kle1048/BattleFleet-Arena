/**
 * Schiffs-Workbench: gleiche 3D-Pipeline wie das Spiel (Wasser, Inseln), ein Schiff,
 * Orbit-Kamera — ohne Colyseus. JSON-Patches über `openShipProfileEditor`.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  PlayerLifeState,
  SHIP_CLASS_CRUISER,
  SHIP_CLASS_DESTROYER,
  SHIP_CLASS_FAC,
  type ShipClassId,
} from "@battlefleet/shared";
import { createGameScene } from "../game/scene/createGameScene";
import { createShipVisual, setShipVisualLifeState, type ShipVisual } from "../game/scene/shipVisual";
import { loadShipHullGltfSource, getShipHullGltfSourceForUrl } from "../game/scene/shipGltfHull";
import {
  resolveShipHullGltfUrlForClass,
  uniqueHullGltfUrlsForAllClasses,
} from "../game/runtime/shipProfileRuntime";
import { resolveMountGltfUrl, uniqueMountVisualUrls } from "../game/runtime/mountGltfUrls";
import { createGameRenderer, bindRendererResize } from "../game/runtime/rendererLifecycle";
import { updateGameWaterAnimations } from "../game/runtime/materialLibrary";
import { openShipProfileEditor } from "../game/ui/shipProfileEditor";

const root = document.getElementById("app");
if (!root) throw new Error("#app missing");

const renderer = createGameRenderer(root);

function parseShipClass(raw: string): ShipClassId {
  if (raw === SHIP_CLASS_DESTROYER) return SHIP_CLASS_DESTROYER;
  if (raw === SHIP_CLASS_CRUISER) return SHIP_CLASS_CRUISER;
  return SHIP_CLASS_FAC;
}

async function boot(): Promise<void> {
  const bundle = await createGameScene();
  const { scene, camera, water, waterFoam } = bundle;
  const foamMat = waterFoam.material as THREE.Material;

  bindRendererResize(camera, renderer);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 35;
  controls.maxDistance = 900;
  controls.target.set(0, 1.2, 0);

  const hullUrls = uniqueHullGltfUrlsForAllClasses();
  const mountUrls = uniqueMountVisualUrls();
  await Promise.all([...hullUrls, ...mountUrls].map((u) => loadShipHullGltfSource(u)));

  function getHullGltfTemplate(shipClassId: ShipClassId): THREE.Group | null {
    return getShipHullGltfSourceForUrl(resolveShipHullGltfUrlForClass(shipClassId));
  }

  function getMountGltfTemplate(visualId: string): THREE.Group | null {
    return getShipHullGltfSourceForUrl(resolveMountGltfUrl(visualId));
  }

  let vis: ShipVisual | null = null;

  function mountShip(shipClassId: ShipClassId): void {
    if (vis) {
      scene.remove(vis.group);
      vis = null;
    }
    const hullSrc = getHullGltfTemplate(shipClassId);
    const next = createShipVisual({
      isLocal: true,
      shipClassId,
      hullGltfSource: hullSrc,
      getMountGltfTemplate,
    });
    next.group.position.set(0, 0, 0);
    next.group.rotation.y = 0;
    setShipVisualLifeState(next, PlayerLifeState.Alive, true);
    scene.add(next.group);
    vis = next;
  }

  const classSelect = document.getElementById("ship-workbench-class") as HTMLSelectElement | null;
  const profileBtn = document.getElementById("ship-workbench-profile-btn");

  const initialClass = classSelect ? parseShipClass(classSelect.value) : SHIP_CLASS_FAC;
  mountShip(initialClass);

  classSelect?.addEventListener("change", () => {
    mountShip(parseShipClass(classSelect.value));
  });

  profileBtn?.addEventListener("click", () => {
    void openShipProfileEditor().then(() => {
      const cid = classSelect ? parseShipClass(classSelect.value) : SHIP_CLASS_FAC;
      mountShip(cid);
    });
  });

  function frame(nowMs: number): void {
    controls.update();
    updateGameWaterAnimations(water, foamMat, nowMs);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void boot().catch((err) => {
  console.error("[ShipWorkbench]", err);
});
