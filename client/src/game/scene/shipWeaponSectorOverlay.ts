import * as THREE from "three";
import {
  flattenMountFireSectorUnions,
  type MountFireSector,
  type ShipHullVisualProfile,
  listRotatingMountWeaponGuideConfigs,
  mountFireSectorArc,
} from "@battlefleet/shared";
import { VisualColorTokens } from "../runtime/materialLibrary";
import { assignToOverlayLayer } from "../runtime/renderOverlayLayers";
import { OVERLAY_RENDER_ORDER } from "./createGameScene";

const ARC_SEGMENTS = 32;

function bowDirXZ(yawFromBow: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(yawFromBow), 0, Math.cos(yawFromBow));
}

function addPolyline(group: THREE.Group, mat: THREE.LineBasicMaterial, pts: THREE.Vector3[]): void {
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(geom, mat);
  line.renderOrder = OVERLAY_RENDER_ORDER;
  group.add(line);
}

function addRay(
  group: THREE.Group,
  mat: THREE.LineBasicMaterial,
  yaw: number,
  len: number,
): void {
  const d = bowDirXZ(yaw).multiplyScalar(len);
  addPolyline(group, mat, [new THREE.Vector3(0, 0, 0), d]);
}

function addMountSectorGeometry(
  group: THREE.Group,
  mat: THREE.LineBasicMaterial,
  sector: MountFireSector,
  arcR: number,
): void {
  if (sector.kind === "union") {
    for (const s of flattenMountFireSectorUnions(sector)) {
      addMountSectorGeometry(group, mat, s, arcR);
    }
    return;
  }
  /** Randstrahlen exakt bis zum Bogen — gleiche Länge wie die Bogen-Endpunkte. */
  const rayLen = arcR;
  if (sector.kind === "symmetric") {
    const c = sector.centerYawRadFromBow ?? 0;
    const h = sector.halfAngleRadFromBow;
    const a0 = c - h;
    const a1 = c + h;
    const arcPts: THREE.Vector3[] = [];
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS;
      const ang = a0 + t * (a1 - a0);
      arcPts.push(bowDirXZ(ang).clone().multiplyScalar(arcR));
    }
    addPolyline(group, mat, arcPts);
    addRay(group, mat, a0, rayLen);
    addRay(group, mat, a1, rayLen);
  } else {
    const lo = sector.minYawRadFromBow;
    const hi = sector.maxYawRadFromBow;
    const interval = mountFireSectorArc(sector);
    addRay(group, mat, lo, rayLen);
    addRay(group, mat, hi, rayLen);
    const arcPts: THREE.Vector3[] = [];
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS;
      const ang = interval.start + t * interval.sweep;
      arcPts.push(bowDirXZ(ang).clone().multiplyScalar(arcR));
    }
    addPolyline(group, mat, arcPts);
  }
}

export type LocalWeaponGuideOverlayOptions = {
  shipGroup: THREE.Group;
  artilleryArcHalfAngleRad: number;
  hullProfile?: ShipHullVisualProfile;
};

/**
 * Nur lokaler Spieler: Feuersektoren in der Overlay-Schicht (kein Spiegelbild im Wasser).
 * Mit GLB + Mount-Daten: ein Bogen pro drehbarem Mount am Socket; sonst ein klassenweiter Artilleriebogen.
 */
export function createLocalPlayerWeaponGuideOverlay(
  opts: LocalWeaponGuideOverlayOptions,
): THREE.Group {
  const root = new THREE.Group();
  root.name = "weaponGuideOverlay";

  const mat = new THREE.LineBasicMaterial({
    color: VisualColorTokens.shipAimLocal,
    transparent: true,
    opacity: 0.32,
    fog: false,
    depthTest: false,
    depthWrite: false,
  });

  const entries = listRotatingMountWeaponGuideConfigs(opts.hullProfile, opts.artilleryArcHalfAngleRad);
  for (const entry of entries) {
    const group = new THREE.Group();
    group.name = `weaponSector_${entry.slotId}`;
    group.position.set(entry.socket.x, entry.socket.y, entry.socket.z);
    addMountSectorGeometry(group, mat, entry.sector, entry.engagementRangeWorld);
    root.add(group);
  }
  if (!entries.length) mat.dispose();
  opts.shipGroup.add(root);

  assignToOverlayLayer(root);
  return root;
}
