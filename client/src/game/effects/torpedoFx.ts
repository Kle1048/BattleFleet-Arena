import * as THREE from "three";
import type { GameRenderer } from "../runtime/rendererContracts";
import { VisualColorTokens, createTorpedoBodyMaterial } from "../runtime/materialLibrary";

const BODY_Y = 2.65;
const TORPEDO_LENGTH = 16;
const TORPEDO_RADIUS = 2.2;
const MAX_ACTIVE_IMPACT_RINGS = 48;

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

type ImpactRing = {
  mesh: THREE.Mesh;
  bornMs: number;
  maxAgeMs: number;
  initialOpacity: number;
  growthPerMs: number;
  active: boolean;
};

/**
 * Task 8 — Torpedo: langer Zylinder, geradeaus; Einschlag-Ring bei `torpedoImpact`.
 */
export function createTorpedoFx(scene: THREE.Scene): {
  sync: (torpedoes: readonly TorpedoPose[]) => void;
  update: (nowMs: number, dtMs: number) => void;
  dispose: () => void;
  flashImpact: (x: number, z: number, kind: string) => void;
  getStats: () => { activeTorpedoes: number; activeImpactRings: number; pooledImpactRings: number };
} & GameRenderer<TorpedoPose> {
  const byId = new Map<number, Entry>();
  const impactRingPool: ImpactRing[] = [];
  const activeImpactRings: ImpactRing[] = [];

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
        e.group.position.set(t.x, 0, t.z);
        e.group.rotation.y = t.headingRad;
      }
      for (const id of byId.keys()) {
        if (!keep.has(id)) {
          removeEntry(id);
        }
      }
  }

  function update(_nowMs: number, _dtMs: number): void {
    for (let i = activeImpactRings.length - 1; i >= 0; i--) {
      const r = activeImpactRings[i]!;
      const age = _nowMs - r.bornMs;
      const mat = r.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, r.initialOpacity * (1 - age / r.maxAgeMs));
      r.mesh.scale.setScalar(1 + age * r.growthPerMs);
      if (age >= r.maxAgeMs) {
        r.active = false;
        r.mesh.visible = false;
        activeImpactRings.splice(i, 1);
      }
    }
  }

  function dispose(): void {
    for (const id of Array.from(byId.keys())) {
      removeEntry(id);
    }
    for (const r of [...impactRingPool, ...activeImpactRings]) {
      scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      (r.mesh.material as THREE.Material).dispose();
    }
    impactRingPool.length = 0;
    activeImpactRings.length = 0;
  }

  return {
    sync,
    update,
    dispose,
    getStats() {
      return {
        activeTorpedoes: byId.size,
        activeImpactRings: activeImpactRings.length,
        pooledImpactRings: impactRingPool.length - activeImpactRings.length,
      };
    },
    flashImpact(x, z, kind) {
      while (activeImpactRings.length >= MAX_ACTIVE_IMPACT_RINGS) {
        const dropped = activeImpactRings.shift();
        if (!dropped) break;
        dropped.active = false;
        dropped.mesh.visible = false;
      }
      const hit = kind === "hit";
      let ringEntry = impactRingPool.find((r) => !r.active);
      if (!ringEntry) {
        const mesh = new THREE.Mesh(
          new THREE.RingGeometry(7, 20, 24),
          new THREE.MeshBasicMaterial({
            color: hit ? VisualColorTokens.torpedoImpactHit : VisualColorTokens.torpedoImpactWater,
            transparent: true,
            opacity: 0.88,
            side: THREE.DoubleSide,
            depthTest: false,
            fog: false,
          }),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.visible = false;
        scene.add(mesh);
        ringEntry = {
          mesh,
          bornMs: 0,
          maxAgeMs: 340,
          initialOpacity: 0.88,
          growthPerMs: 0.0035,
          active: false,
        };
        impactRingPool.push(ringEntry);
      }

      const ring = ringEntry.mesh;
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.color.setHex(hit ? VisualColorTokens.torpedoImpactHit : VisualColorTokens.torpedoImpactWater);
      mat.opacity = ringEntry.initialOpacity;
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.35, z);
      ring.scale.setScalar(1);
      ring.visible = true;
      ringEntry.bornMs = performance.now();
      ringEntry.active = true;
      if (!activeImpactRings.includes(ringEntry)) {
        activeImpactRings.push(ringEntry);
      }
    },
  };
}
