import * as THREE from "three";
import { assignToOverlayLayer } from "../runtime/renderOverlayLayers";
import { VisualColorTokens } from "../runtime/materialLibrary";
import { OVERLAY_RENDER_ORDER } from "./createGameScene";

/** Abstand der Kreise in Simulations-/Weltmetern (wie Server-Reichweiten). */
export const SHIP_RANGE_RING_SPACING_M = 100;
/** Anzahl Ringe (1×100 m … count×100 m). */
export const SHIP_RANGE_RING_COUNT = 12;
const RING_Y = 0.14;
const SEGMENTS = 96;

/**
 * Konzentrische Kreise in der XZ-Ebene um den Schiffsmittelpunkt (lokal).
 * Skalierung wie `weaponGuideGroup`: `invHullScale`, damit Radien in Weltmetern gelten.
 */
export function createLocalShipRangeRingsGroup(hullScale: number): THREE.Group {
  const root = new THREE.Group();
  root.name = "shipRangeRingsDebug";
  const inv = hullScale > 1e-6 ? 1 / hullScale : 1;
  root.scale.setScalar(inv);

  for (let i = 1; i <= SHIP_RANGE_RING_COUNT; i++) {
    const r = i * SHIP_RANGE_RING_SPACING_M;
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= SEGMENTS; s++) {
      const t = (s / SEGMENTS) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.sin(t) * r, RING_Y, Math.cos(t) * r));
    }
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: i % 2 === 0 ? VisualColorTokens.shipAimLocal : 0x6aa0c8,
      transparent: true,
      opacity: 0.38,
      fog: false,
      depthTest: false,
      depthWrite: false,
    });
    const line = new THREE.LineLoop(geom, mat);
    line.renderOrder = OVERLAY_RENDER_ORDER;
    root.add(line);
  }
  assignToOverlayLayer(root);
  return root;
}
