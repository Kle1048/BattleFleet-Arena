import * as THREE from "three";
import { AREA_OF_OPERATIONS_HALF_EXTENT, DEFAULT_MAP_ISLANDS } from "@battlefleet/shared";
import { VisualColorTokens, createWaterMaterial } from "../runtime/materialLibrary";

/**
 * Karten-Koordinaten (wie Seekarte, Y = hoch):
 * - +Z = Nord (Bildschirm oben)
 * - +X = Ost (Bildschirm rechts)
 * - −X = West (Bildschirm links)
 * - −Z = Süd (Bildschirm unten)
 * Three.js lookAt lässt standardmäßig +X links erscheinen; orthografisch left/right tauschen spiegelt X → Ost rechts.
 */

/** Sichtbarer Ruder-Einschlag am Heck: ±35° entsprechen Rudder ±1. */
export const RUDDER_DEFLECTION_DEG = 35;

/** Dreieck-Schiff in lokaler XZ-Ebene; Bug bei +Z. */
export const SHIP_BOW_Z = 28;
export const SHIP_STERN_Z = -22;
export const SHIP_LENGTH = SHIP_BOW_Z - SHIP_STERN_Z;
/** Mitte des vorderen Drittels entlang der Längsachse — Kamera-Dreh-/Blickpunkt. */
export const SHIP_CAMERA_PIVOT_LOCAL_Z = SHIP_BOW_Z - SHIP_LENGTH / 6;

export type GameSceneBundle = {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
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

/** Halbe Bildhöhe in Welteinheiten (orthografisch, kein Zoom durch Distanz). */
export const ORTHO_VIEW_HALF_HEIGHT = 320;

/** Zusatz zum größten Abstand Eigenschaft → Bildecken, damit Rand-Splashes nicht wegfallen. */
export const ARTILLERY_FX_CULL_MARGIN = 56;

/**
 * Halbbreite/-tiefe des sichtbaren Ortho-Rechtecks auf der XZ-Ebene (wie `resizeCamera`).
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
  return {
    x: shipX + fwdX * SHIP_CAMERA_PIVOT_LOCAL_Z,
    z: shipZ + fwdZ * SHIP_CAMERA_PIVOT_LOCAL_Z,
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
  const scene = new THREE.Scene();
  /* Kein Himmel: leere Pixel wie Wasserfarbe (reine Draufsicht). */
  const backdrop = VisualColorTokens.waterBase;
  scene.background = new THREE.Color(backdrop);
  scene.fog = null;

  const halfH = ORTHO_VIEW_HALF_HEIGHT;
  /* linker/rechter Rand wird in resizeCamera gespiegelt (Ost rechts); hier nur Platzhalter bis erster Resize. */
  const camera = new THREE.OrthographicCamera(halfH, -halfH, halfH, -halfH, 0.5, 20000);
  camera.position.set(0, 2000, 0);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);

  const MAP_HALF = waterMapHalfExtent();

  /* Ebene Fläche — keine Vertex-Wellen; Bewegung auf dem Wasser später z. B. per Shader. */
  const waterGeom = new THREE.PlaneGeometry(MAP_HALF * 2, MAP_HALF * 2, 1, 1);
  const waterMat = createWaterMaterial();
  const water = new THREE.Mesh(waterGeom, waterMat);
  water.rotation.x = -Math.PI / 2; /* Plane XY → XZ-Boden */
  water.receiveShadow = true;
  scene.add(water);

  /* Weltfestes Gitter (Norden = +Z): Fahrt gut erkennbar gegenüber dem Raster. */
  const gridSize = MAP_HALF * 2;
  const gridDivs = Math.max(48, Math.round(AREA_OF_OPERATIONS_HALF_EXTENT / 25));
  const grid = new THREE.GridHelper(
    gridSize,
    gridDivs,
    VisualColorTokens.gridMajor,
    VisualColorTokens.gridMinor,
  );
  grid.position.y = 0.08;
  grid.renderOrder = 1;
  const gridMat = grid.material as THREE.LineBasicMaterial;
  gridMat.transparent = true;
  gridMat.opacity = 0.72;
  gridMat.depthWrite = false;
  scene.add(grid);

  /** Grenze des Einsatzgebiets (Task 4) — deckungsgleich mit Server-`AREA_OF_OPERATIONS_HALF_EXTENT`. */
  const opHalf = AREA_OF_OPERATIONS_HALF_EXTENT;
  const borderY = 0.18;
  const borderPts = [
    new THREE.Vector3(-opHalf, borderY, -opHalf),
    new THREE.Vector3(opHalf, borderY, -opHalf),
    new THREE.Vector3(opHalf, borderY, opHalf),
    new THREE.Vector3(-opHalf, borderY, opHalf),
    new THREE.Vector3(-opHalf, borderY, -opHalf),
  ];
  const borderGeom = new THREE.BufferGeometry().setFromPoints(borderPts);
  const borderMat = new THREE.LineBasicMaterial({
    color: VisualColorTokens.opsBorder,
    depthWrite: false,
    transparent: true,
    opacity: 0.88,
  });
  const opsAreaBorder = new THREE.Line(borderGeom, borderMat);
  opsAreaBorder.renderOrder = 2;
  scene.add(opsAreaBorder);

  /* Inseln — dieselben Daten wie Server (`DEFAULT_MAP_ISLANDS`). */
  for (const is of DEFAULT_MAP_ISLANDS) {
    const island = createIslandMesh(is.radius);
    island.position.set(is.x, 0, is.z);
    island.name = `island_${is.id}`;
    scene.add(island);
  }

  const ambient = new THREE.AmbientLight(0xc8e6ff, 0.62);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 0.88);
  /* Leicht schräg von oben — liest sich trotzdem gut bei Top-Down. */
  sun.position.set(80, 1400, 120);
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

/** left/right vertauscht: Standard-lookAt zeigt +X links; so liegt Ost (+X) rechts wie auf einer Karte. */
export function resizeCamera(camera: THREE.OrthographicCamera, w: number, h: number): void {
  const halfH = ORTHO_VIEW_HALF_HEIGHT;
  const aspect = w / Math.max(h, 1);
  camera.left = halfH * aspect;
  camera.right = -halfH * aspect;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}

/**
 * Echte Draufsicht: orthografisch, senkrecht von +Y.
 * Nord +Z oben, Ost +X rechts (nach left/right-Spiegelung). Blickpunkt = vorderes Drittel des Schiffs.
 */
export function updateFollowCamera(
  camera: THREE.OrthographicCamera,
  shipX: number,
  shipZ: number,
  shipHeading: number,
): void {
  const fwdX = Math.sin(shipHeading);
  const fwdZ = Math.cos(shipHeading);
  const pivotX = shipX + fwdX * SHIP_CAMERA_PIVOT_LOCAL_Z;
  const pivotZ = shipZ + fwdZ * SHIP_CAMERA_PIVOT_LOCAL_Z;

  const camHeight = 2400;
  const lookY = 1.2;

  camera.up.set(0, 0, 1);
  camera.position.set(pivotX, camHeight, pivotZ);
  camera.lookAt(pivotX, lookY, pivotZ);
}
