import * as THREE from "three";
import {
  ARTILLERY_RANGE,
  type MountFireSector,
  type RotatingMountWeaponGuideConfig,
  type ShipHullVisualProfile,
  listRotatingMountWeaponGuideConfigs,
  weaponEngagementRangeWorldForRotatingMountEntry,
  wrapPi,
} from "@battlefleet/shared";
import { VisualColorTokens } from "../runtime/materialLibrary";
import { assignToOverlayLayer } from "../runtime/renderOverlayLayers";
import { OVERLAY_RENDER_ORDER } from "./createGameScene";

const ARC_SEGMENTS = 32;
/** Wie historisch: `DECK_Y (1.2) + 1.2` für den klassenweiten Bogen in Schiffs-Lokal. */
const CLASS_ARC_Y = 2.4;

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
    addRay(group, mat, lo, rayLen);
    addRay(group, mat, hi, rayLen);
    const arcPts: THREE.Vector3[] = [];
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS;
      const ang = wrapPi(lo + t * wrapPi(hi - lo));
      arcPts.push(bowDirXZ(ang).clone().multiplyScalar(arcR));
    }
    addPolyline(group, mat, arcPts);
  }
}

function addClassArtilleryArc(
  group: THREE.Group,
  mat: THREE.LineBasicMaterial,
  arcHalf: number,
): void {
  const arcRadius = ARTILLERY_RANGE;
  const arcPts: THREE.Vector3[] = [];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const u = i / ARC_SEGMENTS;
    const ang = -arcHalf + u * (2 * arcHalf);
    arcPts.push(
      new THREE.Vector3(Math.sin(ang) * arcRadius, CLASS_ARC_Y, Math.cos(ang) * arcRadius),
    );
  }
  addPolyline(group, mat, arcPts);
  addPolyline(group, mat, [
    new THREE.Vector3(0, CLASS_ARC_Y, 0),
    new THREE.Vector3(Math.sin(-arcHalf) * arcRadius, CLASS_ARC_Y, Math.cos(-arcHalf) * arcRadius),
  ]);
  addPolyline(group, mat, [
    new THREE.Vector3(0, CLASS_ARC_Y, 0),
    new THREE.Vector3(Math.sin(arcHalf) * arcRadius, CLASS_ARC_Y, Math.cos(arcHalf) * arcRadius),
  ]);
}

export type LocalWeaponGuideOverlayOptions = {
  /** Spiel-Schiffsgruppe (`hullScale` gesetzt). */
  shipGroup: THREE.Group;
  hullModel: THREE.Group | null;
  hullScale: number;
  /**
   * Einheitliche Skalierung des GLB-Rumpfs — wie nach `applyShipVisualRuntimeTuning`:
   * `hullModelBaseUniformScale * (Profil-`spriteScale` ?? Debug-`spriteScale`)`.
   * Welt-Radius = `arcR * hullScale * hullModelUniformScale`.
   */
  hullModelUniformScale: number;
  artilleryArcHalfAngleRad: number;
  mountEntries: RotatingMountWeaponGuideConfig[] | null;
  /** Wenn gesetzt: Reichweite pro Slot aus Loadout/Profil, nicht nur aus `mountEntries[].visualId`. */
  hullProfile?: ShipHullVisualProfile | undefined;
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

  const useMounts =
    opts.hullModel != null && opts.mountEntries != null && opts.mountEntries.length > 0;

  if (useMounts) {
    const denom = opts.hullScale * opts.hullModelUniformScale;
    /** Eine Quelle wie `listRotatingMountWeaponGuideConfigs` — vermeidet abweichende Reichweiten-Heuristiken. */
    const rangeBySlotId =
      opts.hullProfile != null
        ? new Map(
            listRotatingMountWeaponGuideConfigs(opts.hullProfile, opts.artilleryArcHalfAngleRad).map(
              (c) => [c.slotId, c.engagementRangeWorld] as const,
            ),
          )
        : null;
    for (const e of opts.mountEntries!) {
      const rangeWorld =
        rangeBySlotId?.get(e.slotId) ?? weaponEngagementRangeWorldForRotatingMountEntry(opts.hullProfile, e);
      const arcR = denom > 1e-8 ? rangeWorld / denom : rangeWorld;
      const g = new THREE.Group();
      g.name = `weaponSector_${e.slotId}`;
      g.position.set(e.socket.x, e.socket.y, e.socket.z);
      addMountSectorGeometry(g, mat, e.sector, arcR);
      root.add(g);
    }
    opts.hullModel!.add(root);
  } else {
    const invHull = opts.hullScale > 1e-6 ? 1 / opts.hullScale : 1;
    root.scale.setScalar(invHull);
    addClassArtilleryArc(root, mat, opts.artilleryArcHalfAngleRad);
    opts.shipGroup.add(root);
  }

  assignToOverlayLayer(root);
  return root;
}
