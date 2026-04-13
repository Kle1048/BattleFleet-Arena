import * as THREE from "three";
import type {
  MountFireSector,
  MountSlotDefinition,
  MountVisualKind,
  RotatingMountWeaponGuideConfig,
  ShipHullVisualProfile,
} from "@battlefleet/shared";
import {
  getShipClassProfile,
  inferMountTrainBaseYawFromBow,
  resolveEffectiveMountFireSector,
} from "@battlefleet/shared";
import { resolveMountGltfUrl } from "../runtime/mountGltfUrls";
import { cloneMeshMaterialsDeep, collectHullMeshMaterials } from "./shipGltfHull";

type SocketLike = {
  position: { x: number; y: number; z: number };
  eulerRad?: { x: number; y: number; z: number };
};

/** Zusätzlicher Faktor auf das geklonte GLB (nach inversem Hull-Scale). */
const MOUNT_VISUAL_EXTRA_SCALE: Partial<Record<string, number>> = {
  visual_artillery: 200,
  visual_ciws: 200,
  visual_sam: 200,
  visual_pdms: 200,
};

/** SAM / CIWS / PDMS — Train folgt bei Layered Defence dem Flugkörper, nicht dem Aim-Punkt. */
function isAirDefenseMountVisualId(visualId: string): boolean {
  return (
    visualId === "visual_ciws" ||
    visualId === "visual_sam" ||
    visualId === "visual_pdms"
  );
}

/** Horizontale Zielrichtung (Yaw) wie beim Bug-Peilen — drehbare Geschütz-/LW-Systeme. */
const ROTATING_MOUNT_KINDS: readonly MountVisualKind[] = [
  "artillery",
  "ciws",
  "sam_launcher",
  "pdms",
];

export type AttachMountVisualsResult = {
  materials: THREE.Material[];
  /** Horizontale Drehung zur Feuerrichtung (wie `aimLine`), nur für Artillerie-Slots. */
  artilleryTrainGroups: THREE.Group[];
  /** Parallel zu `artilleryTrainGroups`: Socket-`Group` (Parent der Train-Gruppe) für Welt→lokal. */
  artilleryTrainMountAnchors: THREE.Group[];
  /** Parallel: `true` = Flugabwehr-Mount (Ziel bei Layered Defence: ASuM, nicht Aim). */
  artilleryTrainIsAirDefense: boolean[];
  /** Parallel zu `artilleryTrainGroups` — Feuersektor für Train-Klemme (Client). */
  mountTrainFireSectors: MountFireSector[];
  /** Parallel: Bug=0 / Heck=π — Basis für Geschützmodell am Socket. */
  mountTrainBaseYawFromBow: number[];
  /** Alle `mount_*`-Sockets in Profil-Reihenfolge — je eine Debug-Ziellinie Mündung→Ziel. */
  aimLineMountAnchors: THREE.Group[];
  /** Parallel zu `aimLineMountAnchors`: Slot-ID (`mountSlots[i].id`) für autoritative Sektor-Resolution. */
  aimLineMountSlotIds: string[];
  /** Parallel zu `aimLineMountAnchors`: Feuersektor falls drehbarer Mount, sonst `null`. */
  aimLineMountFireSectors: Array<MountFireSector | null>;
  /** Parallel zu `aimLineMountAnchors`: Nullrichtung des Mounts (Bug=0, Heck=π). */
  aimLineMountBaseYawFromBow: number[];
  /** Alle erfolgreich geladenen drehbaren Mounts — Feuerbogen (Socket + Sektor wie Profil). */
  rotatingMountWeaponGuideEntries: RotatingMountWeaponGuideConfig[];
};

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
  const artilleryTrainGroups: THREE.Group[] = [];
  const artilleryTrainMountAnchors: THREE.Group[] = [];
  const artilleryTrainIsAirDefense: boolean[] = [];
  const mountTrainFireSectors: MountFireSector[] = [];
  const mountTrainBaseYawFromBow: number[] = [];
  const aimLineMountAnchors: THREE.Group[] = [];
  const aimLineMountSlotIds: string[] = [];
  const aimLineMountFireSectors: Array<MountFireSector | null> = [];
  const aimLineMountBaseYawFromBow: number[] = [];
  const rotatingMountWeaponGuideEntries: RotatingMountWeaponGuideConfig[] = [];
  const loadout = profile.defaultLoadout ?? {};
  const classArc = getShipClassProfile(profile.shipClassId).artilleryArcHalfAngleRad;
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
      artilleryTrainGroups.push(train);
      artilleryTrainMountAnchors.push(anchor);
      artilleryTrainIsAirDefense.push(isAirDefenseMountVisualId(visualId));
      if (opts.trainSlot) {
        mountTrainFireSectors.push(
          resolveEffectiveMountFireSector(opts.trainSlot, profile, classArc),
        );
        mountTrainBaseYawFromBow.push(inferMountTrainBaseYawFromBow(opts.trainSlot));
        rotatingMountWeaponGuideEntries.push({
          slotId: opts.trainSlot.id,
          socket: { x: p.x, y: p.y, z: p.z },
          sector: resolveEffectiveMountFireSector(opts.trainSlot, profile, classArc),
        });
      }
    }
    parent.add(clone);
    hullModel.add(anchor);
    if (name.startsWith("mount_")) {
      aimLineMountAnchors.push(anchor);
      aimLineMountSlotIds.push(opts?.trainSlot?.id ?? name.slice("mount_".length));
      aimLineMountFireSectors.push(
        opts?.trainSlot
          ? resolveEffectiveMountFireSector(opts.trainSlot, profile, classArc)
          : null,
      );
      aimLineMountBaseYawFromBow.push(
        opts?.trainSlot ? inferMountTrainBaseYawFromBow(opts.trainSlot) : 0,
      );
    }
    materials.push(...collectHullMeshMaterials(clone));
  };

  for (const slot of profile.mountSlots) {
    const vid = loadout[slot.id] ?? slot.defaultVisualId;
    if (!vid) continue;
    const addArtilleryTrain = slot.compatibleKinds.some((k) =>
      ROTATING_MOUNT_KINDS.includes(k),
    );
    attachAtSocket(`mount_${slot.id}`, slot.socket, vid, {
      addArtilleryTrain,
      trainSlot: addArtilleryTrain ? slot : undefined,
    });
  }

  for (const L of profile.fixedSeaSkimmerLaunchers ?? []) {
    const vid = L.visualId;
    if (!vid) continue;
    attachAtSocket(`ssm_${L.id}`, L.socket, vid, {
      launchYawRad: L.launchYawRadFromBow,
    });
  }

  return {
    materials,
    artilleryTrainGroups,
    artilleryTrainMountAnchors,
    artilleryTrainIsAirDefense,
    mountTrainFireSectors,
    mountTrainBaseYawFromBow,
    aimLineMountAnchors,
    aimLineMountSlotIds,
    aimLineMountFireSectors,
    aimLineMountBaseYawFromBow,
    rotatingMountWeaponGuideEntries,
  };
}
