import * as THREE from "three";
import { markSharedGeometry } from "./shipVisualResources";

/** Fixed launcher clones never animate relative to their hull. Share their draws,
 * retaining authored nodes (including muzzle markers) as logical transform sources.
 * Moving turrets, transparent materials and skinned/morphed meshes stay separate. */
export function instanceStaticMounts(hull: THREE.Object3D, fixedClones: readonly THREE.Object3D[]): void {
  const groups: THREE.Mesh[][] = [];
  for (const clone of fixedClones) clone.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh || object instanceof THREE.InstancedMesh ||
      object.morphTargetInfluences?.length || !object.visible || Array.isArray(object.material) || object.material.transparent) return;
    // All ancestors of a candidate must be visible at construction.
    for (let p: THREE.Object3D | null = object.parent; p && p !== hull; p = p.parent) if (!p.visible) return;
    const group = groups.find(([first]) => first!.geometry === object.geometry && first!.material === object.material &&
      first!.castShadow === object.castShadow && first!.receiveShadow === object.receiveShadow &&
      first!.renderOrder === object.renderOrder && first!.layers.mask === object.layers.mask);
    if (group) group.push(object); else groups.push([object]);
  });
  hull.updateWorldMatrix(true, true);
  const inverseHull = hull.matrixWorld.clone().invert(), relative = new THREE.Matrix4();
  for (const meshes of groups) {
    if (meshes.length < 2) continue;
    // Negative instance scales are unsupported by Three; keep the original draws.
    if (meshes.some(mesh => relative.multiplyMatrices(inverseHull, mesh.matrixWorld).determinant() <= 0)) continue;
    const first = meshes[0]!;
    const batch = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
    batch.name = "static_mount_instances";
    batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
    batch.renderOrder = first.renderOrder; batch.layers.mask = first.layers.mask;
    // Numeric IDs only: safe to serialize; the diagnostic A/B can restore original draws.
    batch.userData.staticMountSourceIds = meshes.map(mesh => mesh.id);
    meshes.forEach((mesh, index) => {
      batch.setMatrixAt(index, relative.multiplyMatrices(inverseHull, mesh.matrixWorld));
      mesh.visible = false;
    });
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingBox(); batch.computeBoundingSphere();
    markSharedGeometry(batch.geometry); // Geometry is still owned by the GLB cache.
    hull.add(batch);
  }
}
