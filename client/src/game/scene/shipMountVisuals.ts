import * as THREE from "three";
import {
  equippedMount, getShipClassProfile, resolveEffectiveMountFireSector, weaponSystem,
  type MountFireSector, type MountSlotDefinition, type MountedWeapon, type AirDefenseHardkillLayer,
  type RotatingMountWeaponGuideConfig, type ShipHullVisualProfile, type ShipSocketTransform,
} from "@battlefleet/shared";
import { renderToWorldX } from "../runtime/renderCoords";
import { cloneMeshMaterialsDeep, collectHullMeshMaterials } from "./shipGltfHull";
import { instanceStaticMounts } from "./staticMountInstances";

export const ARTILLERY_MUZZLE_NODE_NAME = "bf_muzzle";
const muzzleWorld = new THREE.Vector3();

export type ClientRotatingMountTrainBinding = {
  slotId: string;
  train: THREE.Object3D;
  anchor: THREE.Group;
  isAirDefense: boolean;
  weaponGuide: RotatingMountWeaponGuideConfig;
  muzzleRef: THREE.Object3D | null;
};
export type ClientAimLineMountBinding = {
  anchor: THREE.Group;
  slotId: string;
  mountFireSector: MountFireSector | null;
};
export type AttachMountVisualsResult = {
  materials: THREE.Material[];
  rotatingMountTrains: ClientRotatingMountTrainBinding[];
  aimLineMounts: ClientAimLineMountBinding[];
};

function muzzleSeekCoords(
  vis: { rotatingMountTrains: ClientRotatingMountTrainBinding[] } | null | undefined,
  weaponId: MountedWeapon["weaponId"], slotId: string,
): { x: number; y: number; z: number } | null {
  const binding = vis?.rotatingMountTrains.find(m =>
    m.weaponGuide.weaponId === weaponId && m.slotId === slotId);
  if (!binding?.muzzleRef) return null;
  binding.muzzleRef.getWorldPosition(muzzleWorld);
  return { x: renderToWorldX(muzzleWorld.x), y: muzzleWorld.y, z: muzzleWorld.z };
}

export function getPrimaryArtilleryMuzzleSeekCoords(
  vis: { rotatingMountTrains: ClientRotatingMountTrainBinding[] } | null | undefined, slotId: string,
): { x: number; y: number; z: number } | null {
  return muzzleSeekCoords(vis, "artillery", slotId);
}
export function getAirDefenseMuzzleSeekCoords(
  vis: { rotatingMountTrains: ClientRotatingMountTrainBinding[] } | null | undefined, slotId: string, layer: AirDefenseHardkillLayer,
): { x: number; y: number; z: number } | null {
  return muzzleSeekCoords(vis, layer === "pd" ? "pdms" : layer, slotId);
}

export function getFixedLauncherMuzzleSeekCoords(
  vis: { hullModel: THREE.Group | null } | null | undefined, launcherId: string,
): { x: number; y: number; z: number } | null {
  const muzzle = vis?.hullModel?.getObjectByName(`ssm_${launcherId}`)?.getObjectByName("bf_muzzle");
  if (!muzzle) return null;
  muzzle.getWorldPosition(muzzleWorld);
  return { x: renderToWorldX(muzzleWorld.x), y: muzzleWorld.y, z: muzzleWorld.z };
}

/** Metres throughout. Placement comes from the same generated metadata as the server. */
export function attachMountVisualsToHullModel(
  hullModel: THREE.Group, profile: ShipHullVisualProfile,
  getTemplate: (modelId: string) => THREE.Group | null,
): AttachMountVisualsResult {
  const materials: THREE.Material[] = [];
  const rotatingMountTrains: ClientRotatingMountTrainBinding[] = [];
  const aimLineMounts: ClientAimLineMountBinding[] = [];
  const fixedClones: THREE.Object3D[] = [];
  // Sharing is strictly hull-local; life-state changes must never affect another ship.
  const fixedMaterials = new Map<THREE.Material, THREE.Material>();
  const classArc = getShipClassProfile(profile.shipClassId).artilleryArcHalfAngleRad;
  function attach(name: string, socket: ShipSocketTransform, equipment: MountedWeapon, slot?: MountSlotDefinition): void {
    const template = getTemplate(equipment.modelId);
    if (!template) return; // Asset lifecycle rebuilds the visual when its templates settle.
    const system = weaponSystem(equipment.weaponId);
    const clone = template.clone(true);
    const muzzle = clone.getObjectByName("bf_muzzle");
    const train = system.rotating ? clone.getObjectByName("bf_yaw") : undefined;
    if (!muzzle || (system.rotating && !train)) throw new Error(`Invalid canonical mount model: ${equipment.modelId}`);
    cloneMeshMaterialsDeep(clone, slot ? undefined : fixedMaterials);
    clone.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    const anchor = new THREE.Group();
    anchor.name = name;
    const p = socket.position, e = socket.eulerRad;
    anchor.position.set(p.x, p.y, p.z);
    if (e) anchor.rotation.set(e.x, e.y, e.z, "XYZ");
    anchor.add(clone);
    hullModel.add(anchor);
    if (!slot && !system.rotating) fixedClones.push(clone);
    if (slot) {
      const sector = resolveEffectiveMountFireSector(slot, profile, classArc);
      aimLineMounts.push({ anchor, slotId: slot.id, mountFireSector: sector });
      if (train) rotatingMountTrains.push({
        slotId: slot.id, train, anchor, isAirDefense: system.airDefenseLayer !== null,
        muzzleRef: muzzle,
        weaponGuide: { slotId: slot.id, ...equipment, engagementRangeWorld: system.engagementRange,
          socket: { ...p }, sector },
      });
    }
    materials.push(...collectHullMeshMaterials(clone));
  }
  for (const slot of profile.mountSlots) {
    const equipment = equippedMount(slot, profile);
    if (equipment) attach(`mount_${slot.id}`, slot.socket, equipment, slot);
  }
  for (const launcher of profile.fixedSeaSkimmerLaunchers ?? []) {
    if (launcher.equipment) attach(`ssm_${launcher.id}`, launcher.socket, launcher.equipment);
  }
  instanceStaticMounts(hullModel, fixedClones);
  return { materials, rotatingMountTrains, aimLineMounts };
}
