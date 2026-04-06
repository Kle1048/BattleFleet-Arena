import type * as THREE from "three";
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
): GameRenderer<ShipSyncItem> & {
  getVisuals: () => ReadonlyMap<string, ShipVisual>;
  ensureShip: (sessionId: string, shipClassId?: string) => void;
  removeShip: (sessionId: string) => boolean;
} {
  const visuals = new Map<string, ShipVisual>();

  function ensureShip(sessionId: string, shipClassId?: string): void {
    if (visuals.has(sessionId)) return;
    const vis = createShipVisual({
      isLocal: sessionId === mySessionId,
      shipClassId,
    });
    scene.add(vis.group);
    visuals.set(sessionId, vis);
  }

  function removeShip(sessionId: string): boolean {
    const vis = visuals.get(sessionId);
    if (!vis) return false;
    clearShipVisual(scene, vis);
    visuals.delete(sessionId);
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
    },
    getVisuals() {
      return visuals;
    },
    ensureShip,
    removeShip,
  };
}
