import * as THREE from "three";

const BODY_Y = 2.8;
const MISSILE_CONE_HEIGHT = 12;

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

/**
 * ASuM: Körper aus repliziertem State; Einschlag-Ring bei Messages. (MVP: kein Schweif/Rauch.)
 */
export function createMissileFx(scene: THREE.Scene): {
  syncFromState: (missiles: readonly MissilePose[]) => void;
  flashImpact: (x: number, z: number, kind: string) => void;
} {
  const byId = new Map<number, Entry>();

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
    const mat = new THREE.MeshStandardMaterial({
      color: 0xff3355,
      emissive: 0xff1100,
      emissiveIntensity: 0.65,
      metalness: 0.35,
      roughness: 0.35,
      fog: false,
    });
    const body = new THREE.Mesh(geo, mat);
    body.rotation.x = Math.PI / 2;
    body.position.y = BODY_Y;
    group.add(body);

    scene.add(group);
    e = { group, body };
    byId.set(id, e);
    return e;
  }

  return {
    syncFromState(missiles) {
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
    },

    flashImpact(x, z, kind) {
      const hit = kind === "hit";
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(6, 18, 24),
        new THREE.MeshBasicMaterial({
          color: hit ? 0xff5533 : 0x88aacc,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
          depthTest: false,
          fog: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.35, z);
      scene.add(ring);
      const born = performance.now();
      const fade = (): void => {
        const t = performance.now() - born;
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 0.85 * (1 - t / 320));
        ring.scale.setScalar(1 + t * 0.004);
        if (t >= 320) {
          scene.remove(ring);
          ring.geometry.dispose();
          mat.dispose();
          return;
        }
        requestAnimationFrame(fade);
      };
      requestAnimationFrame(fade);
    },
  };
}
