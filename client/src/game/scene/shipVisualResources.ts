import * as THREE from "three";

// Templates own geometry and textures; a ship only owns cloned materials and overlays.
const sharedGeometries = new WeakSet<THREE.BufferGeometry>();
const disposedRoots = new WeakSet<THREE.Object3D>();

export function markSharedGeometry(geometry: THREE.BufferGeometry): void {
  sharedGeometries.add(geometry);
}

export function disposeVisualResources(root: THREE.Object3D, ownsSharedAssets = false): void {
  if (disposedRoots.has(root)) return;
  disposedRoots.add(root);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    const renderable = object as THREE.Mesh;
    if (renderable.geometry && (ownsSharedAssets || !sharedGeometries.has(renderable.geometry))) {
      geometries.add(renderable.geometry);
    }
    const material = renderable.material;
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      materials.add(m);
      if (ownsSharedAssets) {
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
  root.removeFromParent();
  root.clear();
}
