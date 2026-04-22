import * as THREE from "three";
import { worldToRenderX } from "../runtime/renderCoords";
import { assignToOverlayLayer } from "../runtime/renderOverlayLayers";
const PORTAL_RING_RENDER_ORDER = 90;
import {
  VIBE_JAM_EXIT_PORTAL_X,
  VIBE_JAM_EXIT_PORTAL_Z,
  VIBE_JAM_RETURN_PORTAL_X,
  VIBE_JAM_RETURN_PORTAL_Z,
  hasVibeJamReturnPortal,
} from "./vibeJamPortal";

type PortalGlowPalette = {
  /** Äußerer Halo (additiv) */
  haloOuter: number;
  haloMid: number;
  /** Dünner Photon-Rand (additiv) */
  rimHot: number;
  rimCool: number;
};

function disposePortalObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
      obj.geometry.dispose();
      const m = obj.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m.dispose();
    }
  });
}

/**
 * Boden-„Schwarzes Loch“: tiefschwarzer Kern, mehrere additive Ringe, heller Rand.
 */
function createBlackHolePortalGroup(
  radius: number,
  y: number,
  palette: PortalGlowPalette,
): THREE.Group {
  const group = new THREE.Group();
  const segs = 80;
  const ro = PORTAL_RING_RENDER_ORDER;

  const addRingMesh = (
    inner: number,
    outer: number,
    color: number,
    opacity: number,
    order: number,
    blending: THREE.Blending = THREE.AdditiveBlending,
  ): void => {
    const geom = new THREE.RingGeometry(inner, outer, segs);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.renderOrder = order;
    assignToOverlayLayer(mesh);
    group.add(mesh);
  };

  // Weit außen: diffuser Halo
  addRingMesh(radius * 1.05, radius * 1.28, palette.haloOuter, 0.22, ro);
  addRingMesh(radius * 0.98, radius * 1.12, palette.haloMid, 0.32, ro + 1);

  // Innere Dämmerung (leicht aufhellend zum Rand, noch dunkel)
  addRingMesh(
    radius * 0.82,
    radius * 0.98,
    0x0a0018,
    0.55,
    ro + 2,
    THREE.NormalBlending,
  );

  // Photon-Sphere: zwei dünne helle Ringe
  const linePts = (r: number, yLift: number): THREE.Vector3[] => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, yLift, Math.sin(a) * r));
    }
    return pts;
  };

  const makeLineLoop = (r: number, yLift: number, color: number, opacity: number, order: number): void => {
    const geom = new THREE.BufferGeometry().setFromPoints(linePts(r, yLift));
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    const line = new THREE.LineLoop(geom, mat);
    line.renderOrder = order;
    assignToOverlayLayer(line);
    group.add(line);
  };

  makeLineLoop(radius * 1.01, y + 0.004, palette.rimCool, 0.35, ro + 3);
  makeLineLoop(radius * 1.0, y + 0.006, palette.rimHot, 0.85, ro + 4);

  // Ereignishorizont — fast reines Schwarz
  const coreGeom = new THREE.CircleGeometry(radius * 0.82, segs);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.985,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const core = new THREE.Mesh(coreGeom, coreMat);
  core.rotation.x = -Math.PI / 2;
  core.position.y = y + 0.008;
  core.renderOrder = ro + 5;
  assignToOverlayLayer(core);
  group.add(core);

  // Mini-Glühen direkt am Kernrand (subtiler „Lensing“-Kreis)
  addRingMesh(radius * 0.78, radius * 0.84, palette.rimHot, 0.12, ro + 4, THREE.AdditiveBlending);

  return group;
}

/**
 * Zwei Bodenportale: Exit (Vibe Jam) und optional Return — Schwarzes-Loch-Look.
 */
export function addVibeJamPortalWorldRings(scene: THREE.Scene): { dispose: () => void } {
  const y = 0.22;
  const rExit = 38;
  const exitPalette: PortalGlowPalette = {
    haloOuter: 0xff0066,
    haloMid: 0xaa00ff,
    rimHot: 0xffccff,
    rimCool: 0xff4488,
  };
  const exit = createBlackHolePortalGroup(rExit, y, exitPalette);
  exit.position.set(worldToRenderX(VIBE_JAM_EXIT_PORTAL_X), 0, VIBE_JAM_EXIT_PORTAL_Z);
  scene.add(exit);

  let ret: THREE.Group | null = null;
  if (hasVibeJamReturnPortal()) {
    const rRet = rExit * 0.92;
    const retPalette: PortalGlowPalette = {
      haloOuter: 0x00ccff,
      haloMid: 0x0066ff,
      rimHot: 0xccffff,
      rimCool: 0x66eeff,
    };
    ret = createBlackHolePortalGroup(rRet, y + 0.015, retPalette);
    ret.position.set(worldToRenderX(VIBE_JAM_RETURN_PORTAL_X), 0, VIBE_JAM_RETURN_PORTAL_Z);
    scene.add(ret);
  }

  return {
    dispose: () => {
      scene.remove(exit);
      disposePortalObject(exit);
      if (ret) {
        scene.remove(ret);
        disposePortalObject(ret);
      }
    },
  };
}
