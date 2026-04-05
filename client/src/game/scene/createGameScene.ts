import * as THREE from "three";

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
 * Halbe Kartenbreite/-tiefe (Wasser + Gitter zentriert bei 0).
 * Muss deutlich größer sein als die orthografische Sicht (~ORTHO_VIEW_HALF_HEIGHT × Aspect):
 * sonst „fällt“ die Hälfte des Bildes aus der Geometrie — nur Clear-Color, Schiff wirkt abgeschnitten.
 */
const MAP_HALF = 12000;

/** Halbe Bildhöhe in Welteinheiten (orthografisch, kein Zoom durch Distanz). */
export const ORTHO_VIEW_HALF_HEIGHT = 320;

export function createGameScene(): GameSceneBundle {
  const scene = new THREE.Scene();
  /* Kein Himmel: leere Pixel wie Wasserfarbe (reine Draufsicht). */
  const backdrop = 0x5ec8f5;
  scene.background = new THREE.Color(backdrop);
  scene.fog = null;

  const halfH = ORTHO_VIEW_HALF_HEIGHT;
  /* linker/rechter Rand wird in resizeCamera gespiegelt (Ost rechts); hier nur Platzhalter bis erster Resize. */
  const camera = new THREE.OrthographicCamera(halfH, -halfH, halfH, -halfH, 0.5, 20000);
  camera.position.set(0, 2000, 0);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);

  /* Ebene Fläche — keine Vertex-Wellen; Bewegung auf dem Wasser später z. B. per Shader. */
  const waterGeom = new THREE.PlaneGeometry(MAP_HALF * 2, MAP_HALF * 2, 1, 1);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x5ec8f5,
    metalness: 0.08,
    roughness: 0.42,
    emissive: 0x0a3060,
    emissiveIntensity: 0.12,
  });
  const water = new THREE.Mesh(waterGeom, waterMat);
  water.rotation.x = -Math.PI / 2; /* Plane XY → XZ-Boden */
  water.receiveShadow = true;
  scene.add(water);

  /* Weltfestes Gitter (Norden = +Z): Fahrt gut erkennbar gegenüber dem Raster. */
  const gridSize = MAP_HALF * 2;
  const gridDivs = 240;
  const grid = new THREE.GridHelper(gridSize, gridDivs, 0xf0f8ff, 0x6ab8e8);
  grid.position.y = 0.08;
  grid.renderOrder = 1;
  const gridMat = grid.material as THREE.LineBasicMaterial;
  gridMat.transparent = true;
  gridMat.opacity = 0.72;
  gridMat.depthWrite = false;
  scene.add(grid);

  const ambient = new THREE.AmbientLight(0xc8e6ff, 0.62);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 0.88);
  /* Leicht schräg von oben — liest sich trotzdem gut bei Top-Down. */
  sun.position.set(80, 1400, 120);
  sun.castShadow = true;
  scene.add(sun);

  return { scene, camera, water, ambient, sun };
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
