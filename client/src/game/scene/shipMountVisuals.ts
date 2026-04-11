import * as THREE from "three";
import type { ShipHullVisualProfile } from "@battlefleet/shared";
import { collectHullMeshMaterials } from "./shipGltfHull";

type SocketLike = {
  position: { x: number; y: number; z: number };
  eulerRad?: { x: number; y: number; z: number };
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
): THREE.Material[] {
  const materials: THREE.Material[] = [];
  const loadout = profile.defaultLoadout ?? {};
  const sx = hullModel.scale.x;
  const inv = sx > 1e-8 ? 1 / sx : 1;

  const attachAtSocket = (
    name: string,
    socket: SocketLike,
    visualId: string,
    launchYaw?: number,
  ): void => {
    const tpl = getTemplate(visualId);
    if (!tpl) return;
    const anchor = new THREE.Group();
    anchor.name = name;
    const p = socket.position;
    anchor.position.set(p.x, p.y, p.z);
    const e = socket.eulerRad;
    if (e) anchor.rotation.set(e.x, e.y, e.z);
    else if (launchYaw !== undefined) anchor.rotation.y = launchYaw;
    anchor.scale.setScalar(inv);
    const clone = tpl.clone(true);
    clone.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    anchor.add(clone);
    hullModel.add(anchor);
    materials.push(...collectHullMeshMaterials(clone));
  };

  for (const slot of profile.mountSlots) {
    const vid = loadout[slot.id] ?? slot.defaultVisualId;
    if (!vid) continue;
    attachAtSocket(`mount_${slot.id}`, slot.socket, vid);
  }

  for (const L of profile.fixedSeaSkimmerLaunchers ?? []) {
    const vid = L.visualId;
    if (!vid) continue;
    attachAtSocket(`ssm_${L.id}`, L.socket, vid, L.launchYawRadFromBow);
  }

  return materials;
}
