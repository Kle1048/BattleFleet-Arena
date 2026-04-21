import * as THREE from "three";
import { convexHullXZ, type XZ } from "@battlefleet/shared";

const MAX_SAMPLE_VERTS = 48_000;

/**
 * Sammelt alle Mesh-Vertex-Positionen der Gruppe in Welt-XZ (nach `updateMatrixWorld`).
 */
export function collectMeshVerticesWorldXZ(root: THREE.Object3D): XZ[] {
  const out: XZ[] = [];
  const v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geo = obj.geometry;
    const pos = geo.getAttribute("position");
    if (!pos) return;
    const step = pos.count > MAX_SAMPLE_VERTS ? Math.ceil(pos.count / MAX_SAMPLE_VERTS) : 1;
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
      out.push({ x: v.x, z: v.z });
    }
  });
  return out;
}

/** Konvexe XZ-Hülle — gleiche Idee wie Spiel-Kollisionspolygone (konvex). */
export function convexFootprintXZFromIslandRoot(root: THREE.Object3D): XZ[] {
  return convexHullXZ(collectMeshVerticesWorldXZ(root));
}
