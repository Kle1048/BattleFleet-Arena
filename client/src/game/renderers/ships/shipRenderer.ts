import type * as THREE from "three";
import { normalizeShipClassId, SHIP_CLASS_FAC } from "@battlefleet/shared";
import type { ShipClassId } from "@battlefleet/shared";
import { createShipVisual, type ShipVisual } from "../../scene/shipVisual";
import type { GameRenderer } from "../../runtime/rendererContracts";

export type ShipSyncItem = {
  id: string;
  shipClass?: string;
};

function clearShipVisual(scene: THREE.Scene, vis: ShipVisual): void {
  scene.remove(vis.group);
  vis.group.clear();
}

export function createShipRenderer(
  scene: THREE.Scene,
  mySessionId: string,
  options?: {
    /** Pro Schiffsklasse geklontes GLB-Template (aus Cache). */
    getHullGltfTemplate?: (shipClassId: ShipClassId) => THREE.Group | null;
    /** Pro `visual_*`-Id (Mount-Loadout) — geklontes GLB aus Cache. */
    getMountGltfTemplate?: (visualId: string) => THREE.Group | null;
    /** @deprecated Nutze getHullGltfTemplate */
    shipHullGltf?: THREE.Group | null;
  },
): GameRenderer<ShipSyncItem> & {
  getVisuals: () => ReadonlyMap<string, ShipVisual>;
  ensureShip: (sessionId: string, shipClassId?: string) => void;
  removeShip: (sessionId: string) => boolean;
} {
  const visuals = new Map<string, ShipVisual>();
  /** Zuletzt gebaute Klasse pro Session — bei Wechsel (Progression) Rumpf neu laden. */
  const shipClassBySession = new Map<string, ShipClassId>();

  function ensureShip(sessionId: string, shipClassId?: string): void {
    const cid = normalizeShipClassId(shipClassId ?? SHIP_CLASS_FAC);
    if (visuals.has(sessionId)) {
      if (shipClassBySession.get(sessionId) === cid) return;
      removeShip(sessionId);
    }
    const template =
      options?.getHullGltfTemplate?.(cid) ?? options?.shipHullGltf ?? undefined;
    const vis = createShipVisual({
      isLocal: sessionId === mySessionId,
      shipClassId: cid,
      hullGltfSource: template ?? undefined,
      getMountGltfTemplate: options?.getMountGltfTemplate,
    });
    vis.group.userData.bfaShipSessionId = sessionId;
    scene.add(vis.group);
    visuals.set(sessionId, vis);
    shipClassBySession.set(sessionId, cid);
  }

  function removeShip(sessionId: string): boolean {
    const vis = visuals.get(sessionId);
    if (!vis) return false;
    clearShipVisual(scene, vis);
    visuals.delete(sessionId);
    shipClassBySession.delete(sessionId);
    return true;
  }

  return {
    sync(data) {
      const keep = new Set<string>();
      for (const item of data) {
        keep.add(item.id);
        ensureShip(item.id, item.shipClass);
      }
      for (const id of Array.from(visuals.keys())) {
        if (!keep.has(id)) {
          removeShip(id);
        }
      }
    },
    update(_nowMs, _dtMs) {
      // Pose/material updates are orchestrated by frame runtime.
    },
    dispose() {
      for (const vis of visuals.values()) {
        clearShipVisual(scene, vis);
      }
      visuals.clear();
      shipClassBySession.clear();
    },
    getVisuals() {
      return visuals;
    },
    ensureShip,
    removeShip,
  };
}
