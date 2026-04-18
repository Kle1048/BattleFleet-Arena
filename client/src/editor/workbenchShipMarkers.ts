/**
 * Nur Workbench: Referenzkugeln + senkrechte Hilfslinien (+Y, Schiff „hoch“) für Modellmittelpunkt,
 * Simulations-Drehpunkt und Mount-Sockets.
 */

import * as THREE from "three";
import type {
  FixedSeaSkimmerLauncherSpec,
  MountFireSector,
  MountSlotDefinition,
  ShipHullVisualProfile,
} from "@battlefleet/shared";
import {
  getShipClassProfile,
  inferMountTrainBaseYawFromBow,
  resolveEffectiveMountFireSector,
  wrapPi,
} from "@battlefleet/shared";
import type { ShipVisual } from "../game/scene/shipVisual";
import { getShipDebugTuning } from "../game/runtime/shipDebugTuning";

const NAME_ROOT = "workbenchShipMarkers";
const NAME_HULL = "workbenchHullMarkers";

/** Modell-Schwerpunkt (GLB-Meshes, ohne nachträglich angehängte Mount-/SSM-Gruppen) */
const COLOR_MODEL_CENTER = 0x33e6aa;
/** yaw-/Hitbox-Bezug: shipPivotLocalZ entlang +Z (Schiffskoordinaten) */
const COLOR_PIVOT = 0xff7722;
/** Mount-Slots (drehbare Systeme etc.) */
const COLOR_MOUNT_SLOT = 0xcc66ff;
/** Feste Seezielflugkörper-Rails */
const COLOR_SSM = 0xffcc44;
/** Horizontale Abstrahlrichtung (Azimut) der Rail */
const COLOR_SSM_AZIMUTH = 0xfff2aa;
/** LW-Mount: Mittellinie = Richtung Sektor-Mitte (Bug=0, +Z = Bug). */
const COLOR_MOUNT_CENTERLINE = 0x44ffaa;
/** LW-Mount: Feuersektor (Rand + Bogen in XZ). */
const COLOR_MOUNT_SECTOR = 0xffaa44;
/** Halbe Länge der Azimut-Linie durch den Socket (Schiffslokal). */
const SSM_AZIMUTH_HALF_LEN = 52;
/** Mittellinie: kurzes Stück „zurück“, längeres vorwärts in Blickrichtung Sektor-Mitte. */
const MOUNT_CENTER_BACK = 12;
const MOUNT_CENTER_FWD = 78;
/** Radius des Sektorbogens / Randstrahlen (Schiffslokal XZ). */
const MOUNT_SECTOR_ARC_RADIUS = 58;
const MOUNT_SECTOR_ARC_SEGMENTS = 40;

const SPHERE_R = 2.1;
/** Halbe Länge der senkrechten Hilfslinie (+/−Y, Schiff hoch) — reicht durch typische Rumpfhöhen. */
const PLUMB_HALF_LEN = 88;

function makeMarkerSphere(color: number): THREE.Mesh {
  const geom = new THREE.SphereGeometry(SPHERE_R, 18, 14);
  const mat = new THREE.MeshBasicMaterial({
    color,
    depthTest: true,
    transparent: true,
    opacity: 0.9,
  });
  const m = new THREE.Mesh(geom, mat);
  m.renderOrder = 5;
  return m;
}

/** Kugel + senkrechte Linie durch den Mittelpunkt (lokal +Y), damit die Lage auch „durch“ den Rumpf erkennbar ist. */
function makeWorkbenchMarker(color: number): THREE.Group {
  const g = new THREE.Group();
  const lineGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -PLUMB_HALF_LEN, 0),
    new THREE.Vector3(0, PLUMB_HALF_LEN, 0),
  ]);
  const lineMat = new THREE.LineBasicMaterial({
    color,
    depthTest: true,
    transparent: true,
    opacity: 0.78,
  });
  const plumb = new THREE.Line(lineGeom, lineMat);
  plumb.renderOrder = 4;
  g.add(plumb);
  g.add(makeMarkerSphere(color));
  return g;
}

/** Bounding Box nur über GLB-Meshes, nicht über `mount_*` / `ssm_*`-Anker. */
function hullMeshBoundingBoxWorld(hullModel: THREE.Group): THREE.Box3 {
  const box = new THREE.Box3();
  let any = false;
  hullModel.updateWorldMatrix(true, true);
  hullModel.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    let p: THREE.Object3D | null = o;
    while (p && p !== hullModel) {
      if (
        p.name.startsWith("mount_") ||
        p.name.startsWith("ssm_") ||
        p.name.startsWith("SOCKET_") ||
        p.name.startsWith("RAIL_")
      ) {
        return;
      }
      p = p.parent;
    }
    const b = new THREE.Box3().setFromObject(o);
    if (!any) {
      box.copy(b);
      any = true;
    } else {
      box.union(b);
    }
  });
  if (!any) {
    return new THREE.Box3().setFromObject(hullModel);
  }
  return box;
}

function removeByName(parent: THREE.Object3D, name: string): void {
  const o = parent.getObjectByName(name);
  if (o) parent.remove(o);
}

/** Horizontale Einheitsrichtung: yaw vom Bug in Radiant, +Z = Bug (`forwardXZ`-Konvention). */
function bowDirXZ(yawFromBow: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(yawFromBow), 0, Math.cos(yawFromBow));
}

function effectiveSectorCenterYaw(slot: MountSlotDefinition, sector: MountFireSector): number {
  if (sector.kind === "symmetric") {
    return sector.centerYawRadFromBow ?? inferMountTrainBaseYawFromBow(slot);
  }
  return wrapPi((sector.minYawRadFromBow + sector.maxYawRadFromBow) * 0.5);
}

function makeHorizontalLine(
  a: THREE.Vector3,
  b: THREE.Vector3,
  color: number,
  opacity: number,
): THREE.Line {
  const geom = new THREE.BufferGeometry().setFromPoints([a, b]);
  const mat = new THREE.LineBasicMaterial({
    color,
    depthTest: true,
    transparent: true,
    opacity,
  });
  const line = new THREE.Line(geom, mat);
  line.renderOrder = 7;
  return line;
}

/**
 * Mittellinie (Sektor-Mitte) + Feuersektor in der XZ-Ebene am Socket — wie `resolveEffectiveMountFireSector` / Spiel.
 */
function addMountCenterlineAndSector(
  hullMarkers: THREE.Group,
  slot: MountSlotDefinition,
  profile: ShipHullVisualProfile,
  classArcHalfAngleRad: number,
): void {
  const p = slot.socket.position;
  const sector = resolveEffectiveMountFireSector(slot, profile, classArcHalfAngleRad);
  const g = new THREE.Group();
  g.name = `workbenchMountAim_${slot.id}`;
  g.position.set(p.x, p.y, p.z);

  const centerYaw = effectiveSectorCenterYaw(slot, sector);
  const dirC = bowDirXZ(centerYaw);
  g.add(
    makeHorizontalLine(
      dirC.clone().multiplyScalar(-MOUNT_CENTER_BACK),
      dirC.clone().multiplyScalar(MOUNT_CENTER_FWD),
      COLOR_MOUNT_CENTERLINE,
      0.92,
    ),
  );

  const rayLen = MOUNT_SECTOR_ARC_RADIUS * 1.08;
  const R = MOUNT_SECTOR_ARC_RADIUS;

  if (sector.kind === "symmetric") {
    const c = sector.centerYawRadFromBow ?? inferMountTrainBaseYawFromBow(slot);
    const h = sector.halfAngleRadFromBow;
    const a0 = c - h;
    const a1 = c + h;
    const arcPts: THREE.Vector3[] = [];
    for (let i = 0; i <= MOUNT_SECTOR_ARC_SEGMENTS; i++) {
      const t = i / MOUNT_SECTOR_ARC_SEGMENTS;
      const ang = a0 + t * (a1 - a0);
      const d = bowDirXZ(ang);
      arcPts.push(d.clone().multiplyScalar(R));
    }
    const arcGeom = new THREE.BufferGeometry().setFromPoints(arcPts);
    const arcMat = new THREE.LineBasicMaterial({
      color: COLOR_MOUNT_SECTOR,
      depthTest: true,
      transparent: true,
      opacity: 0.88,
    });
    const arc = new THREE.Line(arcGeom, arcMat);
    arc.renderOrder = 7;
    g.add(arc);

    const d0 = bowDirXZ(a0);
    const d1 = bowDirXZ(a1);
    g.add(makeHorizontalLine(new THREE.Vector3(0, 0, 0), d0.clone().multiplyScalar(rayLen), COLOR_MOUNT_SECTOR, 0.85));
    g.add(makeHorizontalLine(new THREE.Vector3(0, 0, 0), d1.clone().multiplyScalar(rayLen), COLOR_MOUNT_SECTOR, 0.85));
  } else {
    const lo = sector.minYawRadFromBow;
    const hi = sector.maxYawRadFromBow;
    const dLo = bowDirXZ(lo);
    const dHi = bowDirXZ(hi);
    g.add(makeHorizontalLine(new THREE.Vector3(0, 0, 0), dLo.clone().multiplyScalar(rayLen), COLOR_MOUNT_SECTOR, 0.85));
    g.add(makeHorizontalLine(new THREE.Vector3(0, 0, 0), dHi.clone().multiplyScalar(rayLen), COLOR_MOUNT_SECTOR, 0.85));
    const arcPts: THREE.Vector3[] = [];
    for (let i = 0; i <= MOUNT_SECTOR_ARC_SEGMENTS; i++) {
      const t = i / MOUNT_SECTOR_ARC_SEGMENTS;
      const ang = wrapPi(lo + t * wrapPi(hi - lo));
      arcPts.push(bowDirXZ(ang).multiplyScalar(R));
    }
    const arcGeom = new THREE.BufferGeometry().setFromPoints(arcPts);
    const arcMat = new THREE.LineBasicMaterial({
      color: COLOR_MOUNT_SECTOR,
      depthTest: true,
      transparent: true,
      opacity: 0.88,
    });
    const arc = new THREE.Line(arcGeom, arcMat);
    arc.renderOrder = 7;
    g.add(arc);
  }

  hullMarkers.add(g);
}

/**
 * Lokale Abstrahlrichtung wie `attachMountVisualsToHullModel`: zuerst `socket.eulerRad`,
 * sonst `launchYawRadFromBow` (XZ-Ebene, 0 = +Z Bug), sonst +Z.
 */
function ssmLaunchDirectionLocal(L: FixedSeaSkimmerLauncherSpec): THREE.Vector3 {
  const e = L.socket.eulerRad;
  if (e) {
    const euler = new THREE.Euler(e.x, e.y, e.z, "XYZ");
    return new THREE.Vector3(0, 0, 1)
      .applyQuaternion(new THREE.Quaternion().setFromEuler(euler))
      .normalize();
  }
  if (L.launchYawRadFromBow !== undefined) {
    const y = L.launchYawRadFromBow;
    return new THREE.Vector3(Math.sin(y), 0, Math.cos(y)).normalize();
  }
  return new THREE.Vector3(0, 0, 1);
}

function addSsmRailMarker(hullMarkers: THREE.Group, L: FixedSeaSkimmerLauncherSpec): void {
  const p = L.socket.position;
  const g = new THREE.Group();
  g.name = `workbenchSsm_${L.id}`;
  g.position.set(p.x, p.y, p.z);

  g.add(makeWorkbenchMarker(COLOR_SSM));

  const dir = ssmLaunchDirectionLocal(L);
  const azGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3().copy(dir).multiplyScalar(-SSM_AZIMUTH_HALF_LEN),
    new THREE.Vector3().copy(dir).multiplyScalar(SSM_AZIMUTH_HALF_LEN),
  ]);
  const azMat = new THREE.LineBasicMaterial({
    color: COLOR_SSM_AZIMUTH,
    depthTest: true,
    transparent: true,
    opacity: 0.95,
  });
  const azLine = new THREE.Line(azGeom, azMat);
  azLine.name = "workbenchSsmAzimuth";
  azLine.renderOrder = 6;
  g.add(azLine);

  hullMarkers.add(g);
}

/**
 * Aktualisiert Marker nach `createShipVisual` / Remount. Nutzt `getEffectiveHullProfile` (Workbench-Entwurf).
 */
export function replaceWorkbenchShipMarkers(
  vis: ShipVisual,
  profile: ShipHullVisualProfile | undefined,
): void {
  removeByName(vis.group, NAME_ROOT);
  if (vis.hullModel) {
    removeByName(vis.hullModel, NAME_HULL);
  }

  const root = new THREE.Group();
  root.name = NAME_ROOT;

  const userPivot = getShipDebugTuning().shipPivotLocalZ;
  const pivotZ =
    (profile?.clientVisualTuningDefaults?.shipPivotLocalZ ?? userPivot) / vis.shipHullScale;
  const pivot = makeWorkbenchMarker(COLOR_PIVOT);
  pivot.name = "workbenchPivot";
  pivot.position.set(0, 0, pivotZ);
  root.add(pivot);

  if (vis.hullModel && profile) {
    const hullMarkers = new THREE.Group();
    hullMarkers.name = NAME_HULL;

    const boxW = hullMeshBoundingBoxWorld(vis.hullModel);
    const centerW = boxW.getCenter(new THREE.Vector3());
    const centerLocal = centerW.clone();
    vis.hullModel.worldToLocal(centerLocal);
    const modelCenter = makeWorkbenchMarker(COLOR_MODEL_CENTER);
    modelCenter.name = "workbenchModelCenter";
    modelCenter.position.copy(centerLocal);
    hullMarkers.add(modelCenter);

    const classArc = getShipClassProfile(profile.shipClassId).artilleryArcHalfAngleRad;
    for (const slot of profile.mountSlots) {
      const p = slot.socket.position;
      const m = makeWorkbenchMarker(COLOR_MOUNT_SLOT);
      m.name = `workbenchMount_${slot.id}`;
      m.position.set(p.x, p.y, p.z);
      hullMarkers.add(m);
      addMountCenterlineAndSector(hullMarkers, slot, profile, classArc);
    }

    for (const L of profile.fixedSeaSkimmerLaunchers ?? []) {
      addSsmRailMarker(hullMarkers, L);
    }

    vis.hullModel.add(hullMarkers);
  }

  vis.group.add(root);
}
