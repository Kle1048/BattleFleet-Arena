import * as THREE from "three";
import type { GameRenderer } from "../runtime/rendererContracts";
import { VisualColorTokens, createMissileBodyMaterial } from "../runtime/materialLibrary";

const BODY_Y = 2.8;
const MISSILE_CONE_HEIGHT = 12;
const MAX_ACTIVE_IMPACT_RINGS = 48;

export type MissilePose = {
  missileId: number;
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
 * ASuM: Körper aus repliziertem State; Einschlag-Ring bei Messages. (MVP: kein Schweif/Rauch.)
 */
export function createMissileFx(scene: THREE.Scene): {
  sync: (missiles: readonly MissilePose[]) => void;
  update: (nowMs: number, dtMs: number) => void;
  dispose: () => void;
  flashImpact: (x: number, z: number, kind: string) => void;
  getStats: () => { activeMissiles: number; activeImpactRings: number; pooledImpactRings: number };
} & GameRenderer<MissilePose> {
  const byId = new Map<number, Entry>();
  const impactRingPool: ImpactRing[] = [];
  const activeImpactRings: ImpactRing[] = [];

  function removeMissileEntry(id: number): void {
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
    const geo = new THREE.ConeGeometry(3.5, MISSILE_CONE_HEIGHT, 6);
    const mat = createMissileBodyMaterial();
    const body = new THREE.Mesh(geo, mat);
    body.rotation.x = Math.PI / 2;
    body.position.y = BODY_Y;
    group.add(body);

    scene.add(group);
    e = { group, body };
    byId.set(id, e);
    return e;
  }

  function sync(missiles: readonly MissilePose[]): void {
      const keep = new Set<number>();
      for (const m of missiles) {
        keep.add(m.missileId);
        const e = ensure(m.missileId);
        e.group.position.set(m.x, 0, m.z);
        e.group.rotation.y = m.headingRad;
      }
      for (const id of byId.keys()) {
        if (!keep.has(id)) {
          removeMissileEntry(id);
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
      removeMissileEntry(id);
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
        activeMissiles: byId.size,
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
          new THREE.RingGeometry(6, 18, 24),
          new THREE.MeshBasicMaterial({
            color: hit ? VisualColorTokens.missileImpactHit : VisualColorTokens.missileImpactWater,
            transparent: true,
            opacity: 0.85,
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
          maxAgeMs: 320,
          initialOpacity: 0.85,
          growthPerMs: 0.004,
          active: false,
        };
        impactRingPool.push(ringEntry);
      }

      const ring = ringEntry.mesh;
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.color.setHex(hit ? VisualColorTokens.missileImpactHit : VisualColorTokens.missileImpactWater);
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
