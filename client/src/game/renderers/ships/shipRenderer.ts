import type * as THREE from "three";
import { normalizeShipClassId, SHIP_CLASS_FAC } from "@battlefleet/shared";
import type { ShipClassId } from "@battlefleet/shared";
import { createShipVisual, disposeShipVisual, type ShipVisual } from "../../scene/shipVisual";
import type { GameRenderer } from "../../runtime/rendererContracts";

export type ShipSyncItem = {
  id: string;
  shipClass?: string;
};

export function createShipRenderer(
  scene: THREE.Scene,
  mySessionId: string,
  options?: {
    /** Pro Schiffsklasse geklontes GLB-Template (aus Cache). */
    getHullGltfTemplate?: (shipClassId: ShipClassId) => THREE.Group | null;
    /** Pro `visual_*`-Id (Mount-Loadout) — geklontes GLB aus Cache. */
    getMountGltfTemplate?: (visualId: string) => THREE.Group | null;
    loadShipAssets?: (shipClassId: ShipClassId) => Promise<void> | undefined;
  },
): GameRenderer<ShipSyncItem> & {
  getVisuals: () => ReadonlyMap<string, ShipVisual>;
  ensureShip: (sessionId: string, shipClassId?: string) => void;
  removeShip: (sessionId: string) => boolean;
} {
  const visuals = new Map<string, ShipVisual>();
  /** Zuletzt gebaute Klasse pro Session — bei Wechsel (Progression) Rumpf neu laden. */
  const shipClassBySession = new Map<string, ShipClassId>();
  let disposed = false;

  function buildVisual(sessionId: string, cid: ShipClassId): ShipVisual {
    const template = options?.getHullGltfTemplate?.(cid);
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
    return vis;
  }

  function ensureShip(sessionId: string, shipClassId?: string): void {
    if (disposed) return;
    const cid = normalizeShipClassId(shipClassId ?? SHIP_CLASS_FAC);
    if (visuals.has(sessionId)) {
      if (shipClassBySession.get(sessionId) === cid) return;
      removeShip(sessionId);
    }
    const initial = buildVisual(sessionId, cid);
    const pendingAssets = options?.loadShipAssets?.(cid);
    void pendingAssets?.then(() => {
      // Ignore late completions after leave, class change, wreck expiry or shutdown.
      if (disposed || visuals.get(sessionId) !== initial) return;
      const replacement = buildVisual(sessionId, cid);
      replacement.group.position.copy(initial.group.position);
      replacement.group.quaternion.copy(initial.group.quaternion);
      replacement.group.visible = initial.group.visible;
      disposeShipVisual(initial);
    }).catch((error: unknown) => console.warn("[BattleFleet] Ship assets unavailable", error));
  }

  function removeShip(sessionId: string): boolean {
    const vis = visuals.get(sessionId);
    if (!vis) return false;
    disposeShipVisual(vis);
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
      disposed = true;
      for (const vis of visuals.values()) {
        disposeShipVisual(vis);
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
