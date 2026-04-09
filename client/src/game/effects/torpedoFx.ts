import * as THREE from "three";
import type { GameRenderer } from "../runtime/rendererContracts";
import { worldToRenderX, worldToRenderYaw } from "../runtime/renderCoords";
import type { FxSystem } from "./fxSystem";

const MINE_Y = 2.1;
const MINE_RADIUS = 5.4;
const MINE_HORN_COUNT = 8;

export type TorpedoPose = {
  torpedoId: number;
  x: number;
  z: number;
  headingRad: number;
};

type Entry = {
  group: THREE.Group;
  parts: THREE.Mesh[];
};

/**
 * Mine: statisch liegender Körper mit Hörnern; Trigger-/Impact-Logik serverseitig.
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
    for (const p of e.parts) {
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    }
    byId.delete(id);
  }

  function ensure(id: number): Entry {
    let e = byId.get(id);
    if (e) return e;

    const group = new THREE.Group();
    const parts: THREE.Mesh[] = [];
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(MINE_RADIUS, 14, 10),
      new THREE.MeshStandardMaterial({
        color: 0x2b3945,
        emissive: 0x0d1b24,
        emissiveIntensity: 0.28,
        metalness: 0.62,
        roughness: 0.46,
        fog: false,
      }),
    );
    core.position.y = MINE_Y;
    group.add(core);
    parts.push(core);

    for (let i = 0; i < MINE_HORN_COUNT; i++) {
      const a = (i / MINE_HORN_COUNT) * Math.PI * 2;
      const horn = new THREE.Mesh(
        new THREE.ConeGeometry(0.55, 2.3, 8),
        new THREE.MeshStandardMaterial({
          color: 0x96a8b6,
          metalness: 0.5,
          roughness: 0.4,
          fog: false,
        }),
      );
      horn.rotation.x = Math.PI / 2;
      horn.rotation.z = -a;
      horn.position.set(Math.cos(a) * (MINE_RADIUS + 0.75), MINE_Y, Math.sin(a) * (MINE_RADIUS + 0.75));
      group.add(horn);
      parts.push(horn);
    }

    scene.add(group);
    e = { group, parts };
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
