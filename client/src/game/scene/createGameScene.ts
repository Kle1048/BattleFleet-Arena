import * as THREE from "three";
import { AREA_OF_OPERATIONS_HALF_EXTENT, DEFAULT_MAP_ISLANDS } from "@battlefleet/shared";
import { VisualColorTokens, createWaterMaterial, setWaterIslands } from "../runtime/materialLibrary";
import {
  computeFollowCamBackOffset,
  getFollowCameraTuning,
} from "../runtime/followCameraTuning";
import { getShipDebugTuning } from "../runtime/shipDebugTuning";
import { worldToRenderX } from "../runtime/renderCoords";

/**
 * Karten-Koordinaten (wie Seekarte, Y = hoch):
 * - +Z = Nord (Bildschirm oben)
 * - +X = Ost (Bildschirm rechts)
 * - −X = West (Bildschirm links)
 * - −Z = Süd (Bildschirm unten)
 * Three.js lookAt: senkrechte Draufsicht (90°), Norden oben (`camera.up = +Z`).
 * Osten rechts wird über Render-Mapping (`worldToRenderX`) erreicht.
 */

/** Sichtbarer Ruder-Einschlag am Heck: ±35° entsprechen Rudder ±1. */
export const RUDDER_DEFLECTION_DEG = 35;
/** Einheitlicher Overlay-Layer für UI-nahe Linien in der Welt. */
export const OVERLAY_RENDER_ORDER = 90;

type LightingPresetId = "midday_clear" | "golden_hour" | "stormy_haze";
type LightingPreset = {
  background: number;
  fogColor: number | null;
  fogNear: number;
  fogFar: number;
  ambientColor: number;
  ambientIntensity: number;
  sunColor: number;
  sunIntensity: number;
  sunPos: readonly [number, number, number];
};

const LIGHTING_PRESETS: Record<LightingPresetId, LightingPreset> = {
  midday_clear: {
    background: 0x53bce8,
    fogColor: null,
    fogNear: 0,
    fogFar: 0,
    ambientColor: 0xcfe9ff,
    ambientIntensity: 0.56,
    sunColor: 0xffffff,
    sunIntensity: 0.98,
    sunPos: [140, 1500, 220],
  },
  golden_hour: {
    background: 0x66b9d8,
    fogColor: 0xc6ad90,
    fogNear: 380,
    fogFar: 2100,
    ambientColor: 0xffddb0,
    ambientIntensity: 0.42,
    sunColor: 0xffc37a,
    sunIntensity: 1.08,
    sunPos: [620, 520, 260],
  },
  stormy_haze: {
    background: 0x3f6f8c,
    fogColor: 0x55748b,
    fogNear: 160,
    fogFar: 1200,
    ambientColor: 0x9ab6c8,
    ambientIntensity: 0.66,
    sunColor: 0xbdd6ea,
    sunIntensity: 0.62,
    sunPos: [-260, 720, -180],
  },
};

/** Schnellumschalter für die gewünschte Stimmung. */
const ACTIVE_LIGHTING_PRESET: LightingPresetId = "golden_hour";

/** Dreieck-Schiff in lokaler XZ-Ebene; Bug bei +Z. */
export const SHIP_BOW_Z = 28;
export const SHIP_STERN_Z = -22;
export const SHIP_LENGTH = SHIP_BOW_Z - SHIP_STERN_Z;
/** Mitte des vorderen Drittels entlang der Längsachse — Kamera-Dreh-/Blickpunkt. */
export const SHIP_CAMERA_PIVOT_LOCAL_Z = SHIP_BOW_Z - SHIP_LENGTH / 6;

export type GameSceneBundle = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  water: THREE.Mesh;
  ambient: THREE.AmbientLight;
  sun: THREE.DirectionalLight;
};

/**
 * Halbe Kartenbreite/-tiefe (Wasser + Gitter). An Operational-Area gekoppelt (Debug kompakt).
 */
function waterMapHalfExtent(): number {
  return Math.round(AREA_OF_OPERATIONS_HALF_EXTENT * 2.8);
}

/** Referenz: halbe sichtbare „Karten“-Höhe in XZ (FX-Culling, Näherung). */
export const ORTHO_VIEW_HALF_HEIGHT = 320;

/** Nachschlag-Follow-Cam: Sichtfeld in Grad. */
export const FOLLOW_CAM_FOV = 52;

/** Blickpunkt-Höhe (Deck). */
export const FOLLOW_CAM_LOOK_Y = 1.2;

/** Vertikaler Abstand Augpunkt → Blickpunkt entlang +Y (Referenz ≈ Default `heightAbovePivot`). */
export const FOLLOW_CAM_TOP_DOWN_HEIGHT = 800;
/** Standard-Kippwinkel (gleich Default in `followCameraTuning`). */
export const FOLLOW_CAM_PITCH_DEG = 90;

/**
 * Perspektive: sichtbare Bodenfläche ≠ achsenparalleles Rechteck — Culling-Rechteck vergrößern.
 */
export const PERSPECTIVE_ARTY_CULL_EXTENT_SCALE = 1.55;

/** Zusatz zum größten Abstand Eigenschaft → Bildecken, damit Rand-Splashes nicht wegfallen. */
export const ARTILLERY_FX_CULL_MARGIN = 56;

/**
 * Halbbreite/-tiefe eines XZ-Rechtecks um den Kamera-Pivot (Näherung für FX-Culling).
 */
export function orthoVisibleHalfExtents(
  viewportWidth: number,
  viewportHeight: number,
): { halfW: number; halfH: number } {
  const halfH = ORTHO_VIEW_HALF_HEIGHT;
  const aspect = viewportWidth / Math.max(viewportHeight, 1);
  return { halfW: halfH * aspect, halfH };
}

/** Welt-XZ des Kamera-Pivots (vordere-Drittel-Punkt), konsistent mit `updateFollowCamera`. */
export function cameraPivotXZ(
  shipX: number,
  shipZ: number,
  headingRad: number,
): { x: number; z: number } {
  const fwdX = Math.sin(headingRad);
  const fwdZ = Math.cos(headingRad);
  const pivotLocalZ = getShipDebugTuning().cameraPivotLocalZ;
  return {
    x: shipX + fwdX * pivotLocalZ,
    z: shipZ + fwdZ * pivotLocalZ,
  };
}

/**
 * Quadrat des Kreisradius um das **Eigenschaft**: Abstand zum am weitesten entfernten Eck
 * des sichtbaren Rechtecks (Pivot ± Halbexten) + Marge — das komplette Viewport-Rechteck
 * liegt innerhalb dieses Kreises, daher keine sichtbaren FX durch Culling verloren.
 *
 * **Wann rendern:** siehe `main.ts` (`shouldRenderArtyFiredClientVfx`, `artyImpact` + `skipSplash`)
 * und `docs/ARCHITECTURE.md` (Artillerie-VFX Culling).
 */
export function artilleryFxCullRadiusSq(
  shipX: number,
  shipZ: number,
  pivotX: number,
  pivotZ: number,
  halfW: number,
  halfH: number,
  margin: number,
): number {
  const corners: readonly [number, number][] = [
    [pivotX + halfW, pivotZ + halfH],
    [pivotX + halfW, pivotZ - halfH],
    [pivotX - halfW, pivotZ + halfH],
    [pivotX - halfW, pivotZ - halfH],
  ];
  let maxD = 0;
  for (const [cx, cz] of corners) {
    const d = Math.hypot(cx - shipX, cz - shipZ);
    if (d > maxD) maxD = d;
  }
  const r = maxD + margin;
  return r * r;
}

export function createGameScene(): GameSceneBundle {
  const mood = LIGHTING_PRESETS[ACTIVE_LIGHTING_PRESET];
  const scene = new THREE.Scene();
  /* Kein Himmel: Hintergrundfarbe kommt aus dem Lichtpreset. */
  const backdrop = mood.background;
  scene.background = new THREE.Color(backdrop);
  scene.fog =
    mood.fogColor == null ? null : new THREE.Fog(new THREE.Color(mood.fogColor), mood.fogNear, mood.fogFar);

  const camera = new THREE.PerspectiveCamera(FOLLOW_CAM_FOV, 1, 1, 25_000);
  const lookY = FOLLOW_CAM_LOOK_Y;
  const camT0 = getFollowCameraTuning();
  const h = camT0.heightAbovePivot;
  const back0 = computeFollowCamBackOffset(h, camT0.pitchDeg);
  if (camT0.northUp) {
    camera.up.set(0, 0, 1);
  } else {
    camera.up.set(0, 1, 0);
  }
  camera.position.set(0, lookY + h, -back0);
  camera.lookAt(0, lookY, 0);

  const MAP_HALF = waterMapHalfExtent();

  /* Ebene Fläche — keine Vertex-Wellen; Bewegung auf dem Wasser später z. B. per Shader. */
  const waterGeom = new THREE.PlaneGeometry(MAP_HALF * 2, MAP_HALF * 2, 1, 1);
  const waterMat = createWaterMaterial();
  const water = new THREE.Mesh(waterGeom, waterMat);
  water.rotation.x = -Math.PI / 2; /* Plane XY → XZ-Boden */
  water.receiveShadow = true;
  setWaterIslands(
    waterMat,
    DEFAULT_MAP_ISLANDS.map((is) => ({ x: worldToRenderX(is.x), z: is.z, radius: is.radius })),
  );
  scene.add(water);

  /** Grenze des Einsatzgebiets (Task 4) — deckungsgleich mit Server-`AREA_OF_OPERATIONS_HALF_EXTENT`. */
  const opHalf = AREA_OF_OPERATIONS_HALF_EXTENT;
  const borderY = 0.18;
  const borderPts = [
    new THREE.Vector3(worldToRenderX(-opHalf), borderY, -opHalf),
    new THREE.Vector3(worldToRenderX(opHalf), borderY, -opHalf),
    new THREE.Vector3(worldToRenderX(opHalf), borderY, opHalf),
    new THREE.Vector3(worldToRenderX(-opHalf), borderY, opHalf),
    new THREE.Vector3(worldToRenderX(-opHalf), borderY, -opHalf),
  ];
  const borderGeom = new THREE.BufferGeometry().setFromPoints(borderPts);
  const borderMat = new THREE.LineBasicMaterial({
    color: VisualColorTokens.opsBorder,
    depthWrite: false,
    depthTest: false,
    transparent: true,
    opacity: 0.88,
  });
  const opsAreaBorder = new THREE.Line(borderGeom, borderMat);
  opsAreaBorder.renderOrder = OVERLAY_RENDER_ORDER;
  scene.add(opsAreaBorder);

  /* Inseln — dieselben Daten wie Server (`DEFAULT_MAP_ISLANDS`). */
  for (const is of DEFAULT_MAP_ISLANDS) {
    const island = createIslandMesh(is.radius);
    island.position.set(worldToRenderX(is.x), 0, is.z);
    island.name = `island_${is.id}`;
    scene.add(island);
  }

  const ambient = new THREE.AmbientLight(mood.ambientColor, mood.ambientIntensity);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(mood.sunColor, mood.sunIntensity);
  /* Sonnenstand + Lichtfarbe kommen aus dem aktiven Stimmungs-Preset. */
  sun.position.set(...mood.sunPos);
  sun.castShadow = true;
  scene.add(sun);

  return { scene, camera, water, ambient, sun };
}

function createIslandMesh(radius: number): THREE.Group {
  const g = new THREE.Group();
  const sand = new THREE.MeshStandardMaterial({
    color: VisualColorTokens.islandSand,
    metalness: 0.04,
    roughness: 0.88,
    fog: false,
  });
  const veg = new THREE.MeshStandardMaterial({
    color: VisualColorTokens.islandVegetation,
    metalness: 0.02,
    roughness: 0.92,
    fog: false,
  });
  const baseH = Math.max(5, Math.min(16, 5 + radius * 0.04));
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.94, radius, baseH, 48),
    sand,
  );
  cyl.position.y = baseH / 2;
  cyl.castShadow = true;
  cyl.receiveShadow = true;
  g.add(cyl);
  const cap = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.92, 48), veg);
  cap.rotation.x = -Math.PI / 2;
  cap.position.y = baseH + 0.06;
  cap.receiveShadow = true;
  g.add(cap);
  const surf = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.94, radius * 1.02, 48),
    new THREE.MeshStandardMaterial({
      color: VisualColorTokens.islandShore,
      metalness: 0.02,
      roughness: 0.9,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  surf.rotation.x = -Math.PI / 2;
  surf.position.y = 0.12;
  surf.receiveShadow = true;
  g.add(surf);
  return g;
}

export function resizeCamera(camera: THREE.PerspectiveCamera, w: number, h: number): void {
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
}

/**
 * Follow-Cam: Blick auf vorderes-Schiff-Drittel (Pivot).
 * **North up:** `up = (0,0,1)`, Kamera liegt südlich (−Z) des Pivots.
 * **Head up:** `up = (0,1,0)`, Kamera liegt hinter dem Bug entlang −Vorwärts (XZ).
 */
export function updateFollowCamera(
  camera: THREE.PerspectiveCamera,
  shipX: number,
  shipZ: number,
  shipHeading: number,
): void {
  const { pitchDeg, northUp, heightAbovePivot: h } = getFollowCameraTuning();
  const fwdX = Math.sin(shipHeading);
  const fwdZ = Math.cos(shipHeading);
  const pivotLocalZ = getShipDebugTuning().cameraPivotLocalZ;
  const pivotX = shipX + fwdX * pivotLocalZ;
  const pivotZ = shipZ + fwdZ * pivotLocalZ;

  const lookY = FOLLOW_CAM_LOOK_Y;
  const back = computeFollowCamBackOffset(h, pitchDeg);
  const rpivotX = worldToRenderX(pivotX);

  if (northUp) {
    camera.up.set(0, 0, 1);
    camera.position.set(rpivotX, lookY + h, pivotZ - back);
  } else {
    camera.up.set(0, 1, 0);
    const camWorldX = pivotX - fwdX * back;
    const camWorldZ = pivotZ - fwdZ * back;
    const rcamX = worldToRenderX(camWorldX);
    camera.position.set(rcamX, lookY + h, camWorldZ);
  }
  camera.lookAt(rpivotX, lookY, pivotZ);
}
