import * as THREE from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { AREA_OF_OPERATIONS_HALF_EXTENT, DEFAULT_MAP_ISLANDS } from "@battlefleet/shared";
import {
  VisualColorTokens,
  createWaterFoamOverlayMaterial,
  setWaterIslands,
} from "../runtime/materialLibrary";
import {
  computeFollowCamBackOffset,
  getFollowCameraTuning,
  stepAngleTowardLag,
} from "../runtime/followCameraTuning";
import { getShipDebugTuning } from "../runtime/shipDebugTuning";
import { worldToRenderX } from "../runtime/renderCoords";
import {
  DEFAULT_ENVIRONMENT_TUNING,
  loadPersistedEnvironmentTuning,
  savePersistedEnvironmentTuning,
  type EnvironmentTuning,
} from "../runtime/environmentTuning";
import { assignToOverlayLayer, configureMainCameraForGameplay } from "../runtime/renderOverlayLayers";
import { skySunPositionFromDirection, sunDirectionFromAngles } from "./environmentSun";
import { LIGHTING_PRESETS, type LightingPresetId } from "./lightingPresets";
import { createIslandGltfInstance, preloadIslandGltfTemplates } from "./islandGltfVisuals";

export type { LightingPresetId } from "./lightingPresets";

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

/** Dreieck-Schiff in lokaler XZ-Ebene; Bug bei +Z. */
export const SHIP_BOW_Z = 28;
export const SHIP_STERN_Z = -22;
export const SHIP_LENGTH = SHIP_BOW_Z - SHIP_STERN_Z;
/** Mitte des vorderen Drittels entlang der Längsachse — Kamera-Dreh-/Blickpunkt. */
export const SHIP_CAMERA_PIVOT_LOCAL_Z = SHIP_BOW_Z - SHIP_LENGTH / 6;

export type GameSceneBundle = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** three.js `Water` (Reflexion + Normalmap). */
  water: THREE.Mesh;
  /** Transparenter Schaum/Küste/Kielwasser über dem Wasser. */
  waterFoam: THREE.Mesh;
  sky: Sky;
  ambient: THREE.AmbientLight;
  sun: THREE.DirectionalLight;
  getEnvironmentTuning: () => EnvironmentTuning;
  applyEnvironmentTuning: (patch: Partial<EnvironmentTuning>) => void;
};

async function loadWaterNormals(): Promise<THREE.Texture> {
  const loader = new THREE.TextureLoader();
  try {
    const t = await loader.loadAsync("/textures/waternormals.jpg");
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  } catch {
    const t = await loader.loadAsync("https://threejs.org/examples/textures/waternormals.jpg");
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
}

function applyFog(
  scene: THREE.Scene,
  mood: (typeof LIGHTING_PRESETS)[LightingPresetId],
  fogStrength: number,
): void {
  if (fogStrength < 0.02 || mood.fogColor == null) {
    scene.fog = null;
    return;
  }
  const far = THREE.MathUtils.lerp(80_000, mood.fogFar, fogStrength);
  const near = mood.fogNear;
  scene.fog = new THREE.Fog(new THREE.Color(mood.fogColor), near, far);
}

function applyEnvironmentState(
  tuning: EnvironmentTuning,
  ctx: {
    scene: THREE.Scene;
    sky: Sky;
    ambient: THREE.AmbientLight;
    sun: THREE.DirectionalLight;
    water: THREE.Mesh;
  },
): void {
  const { scene, sky, ambient, sun, water } = ctx;
  const mood = LIGHTING_PRESETS[tuning.lightingPreset];
  const dir = sunDirectionFromAngles(tuning.elevationDeg, tuning.azimuthDeg);

  ambient.color.setHex(mood.ambientColor);
  ambient.intensity = mood.ambientIntensity * tuning.ambientIntensityMul;
  sun.color.setHex(mood.sunColor);
  sun.intensity = mood.sunIntensity * tuning.sunIntensityMul;
  sun.position.copy(dir).multiplyScalar(3200);

  const skyU = sky.material.uniforms as Record<string, { value: number | THREE.Vector3 }>;
  if (skyU.turbidity) skyU.turbidity.value = tuning.turbidity;
  if (skyU.rayleigh) skyU.rayleigh.value = tuning.rayleigh;
  if (skyU.mieCoefficient) skyU.mieCoefficient.value = tuning.mieCoefficient;
  if (skyU.mieDirectionalG) skyU.mieDirectionalG.value = tuning.mieDirectionalG;
  if (skyU.sunPosition && skyU.sunPosition.value instanceof THREE.Vector3) {
    skyU.sunPosition.value.copy(skySunPositionFromDirection(dir));
  }

  if (tuning.skyEnabled) {
    scene.background = null;
  } else {
    scene.background = new THREE.Color(mood.background);
  }
  sky.visible = tuning.skyEnabled;

  applyFog(scene, mood, tuning.fogStrength);

  const wm = water.material as THREE.ShaderMaterial;
  wm.fog = scene.fog != null;
  if (wm.uniforms.waterColor) wm.uniforms.waterColor.value.setHex(tuning.waterColorHex);
  if (wm.uniforms.sunColor) wm.uniforms.sunColor.value.setHex(tuning.waterSunColorHex);
  if (wm.uniforms.sunDirection) wm.uniforms.sunDirection.value.copy(dir);
  if (wm.uniforms.distortionScale) wm.uniforms.distortionScale.value = tuning.waterDistortionScale;
  if (wm.uniforms.alpha) wm.uniforms.alpha.value = tuning.waterAlpha;
  if (wm.uniforms.size) wm.uniforms.size.value = tuning.waterSize;
}

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
export const FOLLOW_CAM_TOP_DOWN_HEIGHT = 200;
/** Standard-Kippwinkel (gleich Default in `followCameraTuning`). */
export const FOLLOW_CAM_PITCH_DEG = 35;

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

export async function createGameScene(): Promise<GameSceneBundle> {
  const persisted = loadPersistedEnvironmentTuning();
  let tuning: EnvironmentTuning = { ...DEFAULT_ENVIRONMENT_TUNING, ...persisted };

  const scene = new THREE.Scene();
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
  configureMainCameraForGameplay(camera);

  const waterNormals = await loadWaterNormals();
  const MAP_HALF = waterMapHalfExtent();
  const waterGeometry = new THREE.PlaneGeometry(MAP_HALF * 2, MAP_HALF * 2);

  const initialDir = sunDirectionFromAngles(tuning.elevationDeg, tuning.azimuthDeg);
  const water = new Water(waterGeometry, {
    textureWidth: tuning.reflectionTextureSize,
    textureHeight: tuning.reflectionTextureSize,
    clipBias: 0,
    waterNormals,
    sunDirection: initialDir.clone(),
    sunColor: tuning.waterSunColorHex,
    waterColor: tuning.waterColorHex,
    distortionScale: tuning.waterDistortionScale,
    alpha: tuning.waterAlpha,
    fog: false,
    eye: new THREE.Vector3(0, 400, 0),
  }) as THREE.Mesh;
  water.rotation.x = -Math.PI / 2;
  water.receiveShadow = true;

  const wm = water.material as THREE.ShaderMaterial;
  if (wm.uniforms.size) wm.uniforms.size.value = tuning.waterSize;

  const foamMat = createWaterFoamOverlayMaterial();
  const waterFoam = new THREE.Mesh(new THREE.PlaneGeometry(MAP_HALF * 2, MAP_HALF * 2, 1, 1), foamMat);
  waterFoam.rotation.x = -Math.PI / 2;
  waterFoam.position.y = 0.08;
  waterFoam.renderOrder = 2;

  const sky = new Sky();
  sky.scale.setScalar(450_000);
  scene.add(sky);

  scene.add(water);
  scene.add(waterFoam);

  /** Grenze des Einsatzgebiets — deckungsgleich mit Server-`AREA_OF_OPERATIONS_HALF_EXTENT`. */
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
  assignToOverlayLayer(opsAreaBorder);
  scene.add(opsAreaBorder);

  await preloadIslandGltfTemplates();
  let islandIdx = 0;
  for (const is of DEFAULT_MAP_ISLANDS) {
    const glbIsland = createIslandGltfInstance(islandIdx, is.radius);
    const island = glbIsland ?? createIslandMesh(is.radius);
    island.position.set(worldToRenderX(is.x), 0, is.z);
    island.name = `island_${is.id}`;
    scene.add(island);
    islandIdx += 1;
  }

  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(2048);
  sun.shadow.bias = -0.00028;
  sun.shadow.normalBias = 0.038;
  scene.add(ambient);
  scene.add(sun);
  scene.add(sun.target);

  const islandRenderData = DEFAULT_MAP_ISLANDS.map((is) => ({
    x: worldToRenderX(is.x),
    z: is.z,
    radius: is.radius,
  }));
  setWaterIslands(foamMat, islandRenderData);

  applyEnvironmentState(tuning, { scene, sky, ambient, sun, water });

  const getEnvironmentTuning = (): EnvironmentTuning => ({ ...tuning });
  const applyEnvironmentTuning = (patch: Partial<EnvironmentTuning>): void => {
    tuning = { ...tuning, ...patch };
    savePersistedEnvironmentTuning(tuning);
    applyEnvironmentState(tuning, { scene, sky, ambient, sun, water });
  };

  return {
    scene,
    camera,
    water,
    waterFoam,
    sky,
    ambient,
    sun,
    getEnvironmentTuning,
    applyEnvironmentTuning,
  };
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

/** Gedämpfte Gier für Head-up (nur Kameraposition); `null` = noch nicht initialisiert. */
let headUpSmoothedHeadingRad: number | null = null;

/**
 * Follow-Cam: Blick auf vorderes-Schiff-Drittel (Pivot).
 * **North up:** `up = (0,0,1)`, Kamera liegt südlich (−Z) des Pivots.
 * **Head up:** `up = (0,1,0)`, Kamera liegt hinter dem Bug entlang −Vorwärts (XZ), optional mit Verzögerung.
 */
export function updateFollowCamera(
  camera: THREE.PerspectiveCamera,
  shipX: number,
  shipZ: number,
  shipHeading: number,
  dtMs: number,
): void {
  const { pitchDeg, northUp, heightAbovePivot: h, headUpYawLagSec } = getFollowCameraTuning();
  const fwdX = Math.sin(shipHeading);
  const fwdZ = Math.cos(shipHeading);
  const pivotLocalZ = getShipDebugTuning().cameraPivotLocalZ;
  const pivotX = shipX + fwdX * pivotLocalZ;
  const pivotZ = shipZ + fwdZ * pivotLocalZ;

  const lookY = FOLLOW_CAM_LOOK_Y;
  const back = computeFollowCamBackOffset(h, pitchDeg);
  const rpivotX = worldToRenderX(pivotX);
  const dtSec = Math.min(Math.max(dtMs / 1000, 0), 0.25);

  if (northUp) {
    headUpSmoothedHeadingRad = shipHeading;
    camera.up.set(0, 0, 1);
    camera.position.set(rpivotX, lookY + h, pivotZ - back);
  } else {
    if (headUpSmoothedHeadingRad === null) {
      headUpSmoothedHeadingRad = shipHeading;
    } else {
      headUpSmoothedHeadingRad = stepAngleTowardLag(
        headUpSmoothedHeadingRad,
        shipHeading,
        dtSec,
        headUpYawLagSec,
      );
    }
    const cfwdX = Math.sin(headUpSmoothedHeadingRad);
    const cfwdZ = Math.cos(headUpSmoothedHeadingRad);
    camera.up.set(0, 1, 0);
    const camWorldX = pivotX - cfwdX * back;
    const camWorldZ = pivotZ - cfwdZ * back;
    const rcamX = worldToRenderX(camWorldX);
    camera.position.set(rcamX, lookY + h, camWorldZ);
  }
  camera.lookAt(rpivotX, lookY, pivotZ);
}
