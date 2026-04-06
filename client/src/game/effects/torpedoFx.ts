import * as THREE from "three";
import type { GameRenderer } from "../runtime/rendererContracts";
import { createTorpedoBodyMaterial } from "../runtime/materialLibrary";
import { worldToRenderX, worldToRenderYaw } from "../runtime/renderCoords";
import type { FxSystem } from "./fxSystem";

const BODY_Y = 2.65;
const TORPEDO_LENGTH = 16;
const TORPEDO_RADIUS = 2.2;

export type TorpedoPose = {
  torpedoId: number;
  x: number;
  z: number;
  headingRad: number;
};

type Entry = {
  group: THREE.Group;
  body: THREE.Mesh;
};

/**
 * Torpedo: Zylinder aus State; Einschlag über gemeinsames Partikel-FX.
 */
export function createTorpedoFx(scene: THREE.Scene, fx: FxSystem): {
  sync: (torpedoes: readonly TorpedoPose[]) => void;
  update: (nowMs: number, dtMs: number) => void;
  dispose: () => void;
  flashImpact: (x: number, z: number, kind: string) => void;
  getStats: () => { activeTorpedoes: number };
} & GameRenderer<TorpedoPose> {
  const byId = new Map<number, Entry>();

  function removeEntry(id: number): void {
    const e = byId.get(id);
    if (!e) return;
    scene.remove(e.group);
    e.body.geometry.dispose();
    (e.body.material as THREE.Material).dispose();
    byId.delete(id);
  }

  function ensure(id: number): Entry {
    let e = byId.get(id);
    if (e) return e;

    const group = new THREE.Group();
    const geo = new THREE.CylinderGeometry(TORPEDO_RADIUS, TORPEDO_RADIUS, TORPEDO_LENGTH, 10);
    const mat = createTorpedoBodyMaterial();
    const body = new THREE.Mesh(geo, mat);
    body.rotation.x = Math.PI / 2;
    body.position.y = BODY_Y;
    group.add(body);

    scene.add(group);
    e = { group, body };
    byId.set(id, e);
    return e;
  }

  function sync(torpedoes: readonly TorpedoPose[]): void {
    const keep = new Set<number>();
    for (const t of torpedoes) {
      keep.add(t.torpedoId);
      const e = ensure(t.torpedoId);
      e.group.position.set(worldToRenderX(t.x), 0, t.z);
      e.group.rotation.y = worldToRenderYaw(t.headingRad);
    }
    for (const id of byId.keys()) {
      if (!keep.has(id)) {
        removeEntry(id);
      }
    }
  }

  function update(_nowMs: number, _dtMs: number): void {
    // Partikel: `fxSystem.update` zentral in main (einmal pro Frame).
  }

  function dispose(): void {
    for (const id of Array.from(byId.keys())) {
      removeEntry(id);
    }
  }

  return {
    sync,
    update,
    dispose,
    getStats() {
      return { activeTorpedoes: byId.size };
    },
    flashImpact(x, z, kind) {
      fx.spawnTorpedoImpact(x, z, kind);
    },
  };
}
