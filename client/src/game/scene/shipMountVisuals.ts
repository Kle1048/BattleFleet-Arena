import * as THREE from "three";
import type {
  FixedSeaSkimmerLauncherSpec,
  MountFireSector,
  MountSlotDefinition,
  RotatingMountWeaponGuideConfig,
  ShipHullVisualProfile,
} from "@battlefleet/shared";
import {
  getShipClassProfile,
  inferMountTrainBaseYawFromBow,
  resolveEffectiveMountFireSector,
  ROTATING_WEAPON_GUIDE_KINDS,
  weaponEngagementRangeWorldForMountVisualId,
} from "@battlefleet/shared";
import { resolveMountGltfUrl } from "../runtime/mountGltfUrls";
import { renderToWorldX } from "../runtime/renderCoords";
import { cloneMeshMaterialsDeep, collectHullMeshMaterials } from "./shipGltfHull";
import { readMarkedSocketTransformsFromHullGltf } from "./shipSocketGltf";

/** Blender/gltf Empty am Rohrende / Startpunkt — Artillerie (`mount_artillery_turret.glb`), PDMS (`mount_PDMS_box.glb`). */
export const ARTILLERY_MUZZLE_NODE_NAME = "bf_muzzle";

const _muzzleWorldScratch = new THREE.Vector3();

type SocketLike = {
  position: { x: number; y: number; z: number };
  eulerRad?: { x: number; y: number; z: number };
};

function mergeMountSlotSocket(
  slot: MountSlotDefinition,
  fromGltf: Map<string, { position: { x: number; y: number; z: number }; eulerRad?: { x: number; y: number; z: number } }>,
): SocketLike {
  const g = fromGltf.get(slot.id);
  if (!g) return slot.socket;
  const eulerMeaningful =
    g.eulerRad &&
    Math.abs(g.eulerRad.x) + Math.abs(g.eulerRad.y) + Math.abs(g.eulerRad.z) > 1e-6;
  return {
    position: g.position,
    eulerRad: eulerMeaningful ? g.eulerRad : slot.socket.eulerRad,
  };
}

function mergeRailSocket(
  launcher: FixedSeaSkimmerLauncherSpec,
  fromGltf: Map<string, { position: { x: number; y: number; z: number }; eulerRad?: { x: number; y: number; z: number } }>,
): SocketLike {
  const g = fromGltf.get(launcher.id);
  if (!g) return launcher.socket;
  const eulerMeaningful =
    g.eulerRad &&
    Math.abs(g.eulerRad.x) + Math.abs(g.eulerRad.y) + Math.abs(g.eulerRad.z) > 1e-6;
  return {
    position: g.position,
    eulerRad: eulerMeaningful ? g.eulerRad : launcher.socket.eulerRad,
  };
}

/** Zusätzlicher Faktor auf das geklonte GLB (nach inversem Hull-Scale). */
const MOUNT_VISUAL_EXTRA_SCALE: Partial<Record<string, number>> = {
  visual_artillery: 100,
  visual_ciws: 100,
  visual_sam: 100,
  visual_pdms: 100,
};

/** SAM / CIWS / PDMS — Train folgt bei Layered Defence dem Flugkörper, nicht dem Aim-Punkt. */
function isAirDefenseMountVisualId(visualId: string): boolean {
  return (
    visualId === "visual_ciws" ||
    visualId === "visual_sam" ||
    visualId === "visual_pdms"
  );
}

/** Ein drehbarer Mount mit Train-Gruppe — vorher 5 parallele Arrays + separater Weapon-Guide-Eintrag. */
export type ClientRotatingMountTrainBinding = {
  slotId: string;
  train: THREE.Group;
  anchor: THREE.Group;
  isAirDefense: boolean;
  /** Bug=0 / Heck=π — Modell-Basis am Socket (nicht in `weaponGuide`). */
  baseYawFromBow: number;
  /** Feuerbogen-Overlay; Sektor für Train-Klemme: `weaponGuide.sector`. */
  weaponGuide: RotatingMountWeaponGuideConfig;
  /** Optional: Kind `ARTILLERY_MUZZLE_NODE_NAME` im Mount-Clone — Muzzle-Flash-Position. */
  muzzleRef: THREE.Object3D | null;
};

/** Ein `mount_*`-Socket mit Debug-Aim-Linie — vorher 4 parallele Arrays. */
export type ClientAimLineMountBinding = {
  anchor: THREE.Group;
  slotId: string;
  /** Beim Montieren gesetzt; drehbare Slots haben Sektor, sonst `null`. */
  mountFireSector: MountFireSector | null;
  baseYawFromBow: number;
};

export type AttachMountVisualsResult = {
  materials: THREE.Material[];
  rotatingMountTrains: ClientRotatingMountTrainBinding[];
  aimLineMounts: ClientAimLineMountBinding[];
};

/**
 * Erstes Geschütz-Mount (nicht LW) mit `muzzleRef`: Weltposition in Seekarten-XZ + Szenen-Y.
 * `x`/`z` passen zu Server-`fromX`/`fromZ`; `y` aus Three.js für Partikel.
 */
export function getPrimaryArtilleryMuzzleSeekCoords(vis: {
  rotatingMountTrains: ClientRotatingMountTrainBinding[];
} | null | undefined): { x: number; y: number; z: number } | null {
  if (!vis?.rotatingMountTrains?.length) return null;
  for (const m of vis.rotatingMountTrains) {
    if (m.isAirDefense) continue;
    const ref = m.muzzleRef;
    if (!ref) return null;
    ref.getWorldPosition(_muzzleWorldScratch);
    return {
      x: renderToWorldX(_muzzleWorldScratch.x),
      y: _muzzleWorldScratch.y,
      z: _muzzleWorldScratch.z,
    };
  }
  return null;
}

/** PDMS-Start (`visual_pdms`) am Empty `ARTILLERY_MUZZLE_NODE_NAME` — gleiche Konvention wie Artillerie. */
export function getPdmsMuzzleSeekCoords(vis: {
  rotatingMountTrains: ClientRotatingMountTrainBinding[];
} | null | undefined): { x: number; y: number; z: number } | null {
  if (!vis?.rotatingMountTrains?.length) return null;
  for (const m of vis.rotatingMountTrains) {
    if (m.weaponGuide.visualId !== "visual_pdms") continue;
    const ref = m.muzzleRef;
    if (!ref) return null;
    ref.getWorldPosition(_muzzleWorldScratch);
    return {
      x: renderToWorldX(_muzzleWorldScratch.x),
      y: _muzzleWorldScratch.y,
      z: _muzzleWorldScratch.z,
    };
  }
  return null;
}

/**
 * Montagepunkte aus dem Profil: Kind von `hullModel`, mit inversem Hull-Scale,
 * damit Waffen-GLBs in Rumpf-Lokaleinheiten (wie Vertex-Koordinaten) sitzen
 * und nicht mit dem Rumpf mitgestreckt werden.
 */
export function attachMountVisualsToHullModel(
  hullModel: THREE.Group,
  profile: ShipHullVisualProfile,
  getTemplate: (visualId: string) => THREE.Group | null,
): AttachMountVisualsResult {
  const materials: THREE.Material[] = [];
  const rotatingMountTrains: ClientRotatingMountTrainBinding[] = [];
  const aimLineMounts: ClientAimLineMountBinding[] = [];
  const loadout = profile.defaultLoadout ?? {};
  const classArc = getShipClassProfile(profile.shipClassId).artilleryArcHalfAngleRad;
  const { sockets: gltfSockets, rails: gltfRails } = readMarkedSocketTransformsFromHullGltf(hullModel);
  const sx = hullModel.scale.x;
  const inv = sx > 1e-8 ? 1 / sx : 1;

  const attachAtSocket = (
    name: string,
    socket: SocketLike,
    visualId: string,
    opts?: {
      launchYawRad?: number;
      addArtilleryTrain?: boolean;
      /** Gesetzt bei `mount_*` mit Train — für Feuersektor / Basis-Yaw. */
      trainSlot?: MountSlotDefinition;
    },
  ): void => {
    const tpl = getTemplate(visualId);
    if (!tpl) {
      const url = resolveMountGltfUrl(visualId);
      console.warn(
        `[BattleFleet] Mount GLB template missing for visualId "${visualId}" (anchor "${name}"). ` +
          `URL: ${url} — preload failed, 404, or unknown id (see mountGltfUrls.ts).`,
      );
      return;
    }
    const anchor = new THREE.Group();
    anchor.name = name;
    const p = socket.position;
    const mergedTrainSlot: MountSlotDefinition | undefined = opts?.trainSlot
      ? {
          ...opts.trainSlot,
          socket: { ...opts.trainSlot.socket, position: { x: p.x, y: p.y, z: p.z } },
        }
      : undefined;
    anchor.position.set(p.x, p.y, p.z);
    const e = socket.eulerRad;
    const ly = opts?.launchYawRad;
    if (e) anchor.rotation.set(e.x, e.y, e.z);
    else if (ly !== undefined) anchor.rotation.y = ly;
    anchor.scale.setScalar(inv);
    const clone = tpl.clone(true);
    cloneMeshMaterialsDeep(clone);
    const extra = MOUNT_VISUAL_EXTRA_SCALE[visualId];
    if (extra !== undefined && extra !== 1) {
      clone.scale.multiplyScalar(extra);
    }
    clone.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    let parent: THREE.Object3D = anchor;
    if (opts?.addArtilleryTrain) {
      const train = new THREE.Group();
      train.name = `${name}_trainYaw`;
      anchor.add(train);
      parent = train;
      if (mergedTrainSlot) {
        const sector = resolveEffectiveMountFireSector(mergedTrainSlot, profile, classArc);
        const baseYaw = inferMountTrainBaseYawFromBow(mergedTrainSlot);
        const weaponGuide: RotatingMountWeaponGuideConfig = {
          slotId: mergedTrainSlot.id,
          visualId,
          engagementRangeWorld: weaponEngagementRangeWorldForMountVisualId(visualId),
          socket: { x: p.x, y: p.y, z: p.z },
          sector,
        };
        rotatingMountTrains.push({
          slotId: mergedTrainSlot.id,
          train,
          anchor,
          isAirDefense: isAirDefenseMountVisualId(visualId),
          baseYawFromBow: baseYaw,
          weaponGuide,
          muzzleRef: clone.getObjectByName(ARTILLERY_MUZZLE_NODE_NAME) ?? null,
        });
      }
    }
    parent.add(clone);
    hullModel.add(anchor);
    if (name.startsWith("mount_")) {
      const slotId = opts?.trainSlot?.id ?? name.slice("mount_".length);
      const sec = mergedTrainSlot
        ? resolveEffectiveMountFireSector(mergedTrainSlot, profile, classArc)
        : null;
      aimLineMounts.push({
        anchor,
        slotId,
        mountFireSector: sec,
        baseYawFromBow: mergedTrainSlot ? inferMountTrainBaseYawFromBow(mergedTrainSlot) : 0,
      });
    }
    materials.push(...collectHullMeshMaterials(clone));
  };

  for (const slot of profile.mountSlots) {
    const vid = loadout[slot.id] ?? slot.defaultVisualId;
    if (!vid) continue;
    const addArtilleryTrain = slot.compatibleKinds.some((k) =>
      ROTATING_WEAPON_GUIDE_KINDS.includes(k),
    );
    attachAtSocket(`mount_${slot.id}`, mergeMountSlotSocket(slot, gltfSockets), vid, {
      addArtilleryTrain,
      trainSlot: addArtilleryTrain ? slot : undefined,
    });
  }

  for (const L of profile.fixedSeaSkimmerLaunchers ?? []) {
    const vid = L.visualId;
    if (!vid) continue;
    attachAtSocket(`ssm_${L.id}`, mergeRailSocket(L, gltfRails), vid, {
      launchYawRad: L.launchYawRadFromBow,
    });
  }

  return {
    materials,
    rotatingMountTrains,
    aimLineMounts,
  };
}
