import * as THREE from "three";
import { getAuthoritativeShipHullProfile, type ShipWreckState } from "@battlefleet/shared";
import { createShipHitboxWireframe } from "../scene/shipHitboxDebug";
import { assignToOverlayLayer } from "./renderOverlayLayers";
import { worldToRenderX, worldToRenderYaw } from "./renderCoords";
import { isWreckCollisionDebugVisible } from "./shipProfileRuntime";

const rootsByWreckId = new Map<string, THREE.Group>();

type WreckListLike = {
  length: number;
  at: (index: number) => ShipWreckState | undefined;
};

/**
 * Wrack-Kollision-Debug: Hitbox-Drahtmodell (gleiche OBB wie Server: Sim-Punkt + Peilung + `collisionHitbox`).
 */
export function syncWreckCollisionDebugMeshes(
  scene: THREE.Scene,
  wreckList: WreckListLike | null | undefined,
): void {
  const visible = isWreckCollisionDebugVisible();
  const want = new Set<string>();

  if (visible && wreckList) {
    for (let i = 0; i < wreckList.length; i++) {
      const w = wreckList.at(i);
      if (!w) continue;
      want.add(w.wreckId);

      let root = rootsByWreckId.get(w.wreckId);
      if (!root) {
        root = new THREE.Group();
        root.name = "wreckCollisionDebug";
        const hb = getAuthoritativeShipHullProfile(w.shipClass)?.collisionHitbox;
        if (hb) {
          const wf = createShipHitboxWireframe(hb);
          wf.name = "wreckHitboxWireframe";
          if (wf.material instanceof THREE.LineBasicMaterial) {
            wf.material.color.setHex(0x66ccff);
            wf.material.transparent = true;
            wf.material.opacity = 0.55;
            wf.material.depthWrite = false;
          }
          root.add(wf);
        }
        assignToOverlayLayer(root);
        scene.add(root);
        rootsByWreckId.set(w.wreckId, root);
      }

      const yaw = worldToRenderYaw(w.headingRad);
      root.position.set(worldToRenderX(w.anchorX), 0, w.anchorZ);
      root.rotation.order = "YXZ";
      root.rotation.y = yaw;
    }
  }

  for (const id of [...rootsByWreckId.keys()]) {
    if (!want.has(id)) {
      const root = rootsByWreckId.get(id);
      if (root) {
        scene.remove(root);
        root.traverse((o) => {
          if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
            const g = o.geometry;
            if (g) g.dispose();
            const mat = o.material;
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else mat.dispose();
          }
        });
        rootsByWreckId.delete(id);
      }
    }
  }
}

export function disposeWreckCollisionDebug(scene: THREE.Scene): void {
  for (const [, root] of rootsByWreckId) {
    scene.remove(root);
    root.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
  rootsByWreckId.clear();
}
