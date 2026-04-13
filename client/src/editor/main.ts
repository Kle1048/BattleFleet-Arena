/**
 * Schiffs-Workbench: gleiche 3D-Pipeline wie das Spiel (Wasser, Inseln), ein Schiff,
 * Orbit-Kamera — ohne Colyseus. Schiffsprofil-Panel rechts (`createShipProfileEditorPanel`).
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  PlayerLifeState,
  SHIP_CLASS_CRUISER,
  SHIP_CLASS_DESTROYER,
  SHIP_CLASS_FAC,
  type ShipClassId,
  type ShipHullVisualProfile,
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
import { createShipProfileEditorPanel } from "../game/ui/shipProfileEditor";
import { getEffectiveHullProfile } from "../game/runtime/shipProfileRuntime";
import { replaceWorkbenchShipMarkers } from "./workbenchShipMarkers";

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

const appRoot = requireElement("app");

const renderer = createGameRenderer(appRoot);

function parseShipClass(raw: string): ShipClassId {
  if (raw === SHIP_CLASS_DESTROYER) return SHIP_CLASS_DESTROYER;
  if (raw === SHIP_CLASS_CRUISER) return SHIP_CLASS_CRUISER;
  return SHIP_CLASS_FAC;
}

function shipClassToWorkbenchSelect(cid: ShipClassId): string {
  if (cid === SHIP_CLASS_DESTROYER) return "destroyer";
  if (cid === SHIP_CLASS_CRUISER) return "cruiser";
  return "fac";
}

async function boot(): Promise<void> {
  const bundle = await createGameScene();
  const { scene, camera, water, waterFoam } = bundle;
  const foamMat = waterFoam.material as THREE.Material;

  bindRendererResize(camera, renderer, appRoot);

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

  /** Rumpf-GLB nachladen, falls noch nicht im Cache (z. B. neues hullGltfId in der Live-Vorschau). */
  function mountShipWorkbench(shipClassId: ShipClassId): void {
    const url = resolveShipHullGltfUrlForClass(shipClassId);
    if (getShipHullGltfSourceForUrl(url)) {
      mountShip(shipClassId);
      return;
    }
    void loadShipHullGltfSource(url).then(() => mountShip(shipClassId));
  }

  let livePreviewMountTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleLivePreviewMount(shipClassId: ShipClassId): void {
    if (livePreviewMountTimer) clearTimeout(livePreviewMountTimer);
    livePreviewMountTimer = setTimeout(() => {
      livePreviewMountTimer = null;
      mountShipWorkbench(shipClassId);
    }, 80);
  }

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
    replaceWorkbenchShipMarkers(next, getEffectiveHullProfile(shipClassId));
    vis = next;
  }

  const classSelect = document.getElementById("ship-workbench-class") as HTMLSelectElement | null;
  const profileDock = document.getElementById("ship-profile-dock");
  if (!profileDock) throw new Error("#ship-profile-dock missing");

  const initialClass = classSelect ? parseShipClass(classSelect.value) : SHIP_CLASS_FAC;
  mountShip(initialClass);

  const profilePanel = createShipProfileEditorPanel(profileDock, {
    initialClass,
    onLivePreview: (profile: ShipHullVisualProfile) => {
      scheduleLivePreviewMount(profile.shipClassId);
    },
    onApplied: (cid) => {
      if (classSelect) classSelect.value = shipClassToWorkbenchSelect(cid);
      mountShipWorkbench(cid);
    },
    onClassChange: (cid) => {
      if (classSelect) classSelect.value = shipClassToWorkbenchSelect(cid);
    },
  });

  classSelect?.addEventListener("change", () => {
    const cid = parseShipClass(classSelect.value);
    profilePanel.setShipClass(cid);
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
