import * as THREE from "three";

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
 * Task 8 — Torpedo: langer Zylinder, geradeaus; Einschlag-Ring bei `torpedoImpact`.
 */
export function createTorpedoFx(scene: THREE.Scene): {
  syncFromState: (torpedoes: readonly TorpedoPose[]) => void;
  flashImpact: (x: number, z: number, kind: string) => void;
} {
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
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2d4a5c,
      emissive: 0x0a1820,
      emissiveIntensity: 0.35,
      metalness: 0.5,
      roughness: 0.45,
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
    syncFromState(torpedoes) {
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
    },

    flashImpact(x, z, kind) {
      const hit = kind === "hit";
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(7, 20, 24),
        new THREE.MeshBasicMaterial({
          color: hit ? 0xe08250 : 0x6ec8e8,
          transparent: true,
          opacity: 0.88,
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
        mat.opacity = Math.max(0, 0.88 * (1 - t / 340));
        ring.scale.setScalar(1 + t * 0.0035);
        if (t >= 340) {
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
