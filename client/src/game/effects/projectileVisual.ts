import * as THREE from "three";
import ssm from "./projectile-assets/ssm.json";
import sam from "./projectile-assets/sam.json";
import pd from "./projectile-assets/pd.json";

export type ProjectileVisualKind = "ssm" | "sam" | "pd";
export const PROJECTILE_VISUALS = {
  ssm: { asset: ssm, displayLength: 12 },
  sam: { asset: sam, displayLength: 22 },
  pd: { asset: pd, displayLength: 22 },
} as const;

/** Blender-exported single-mesh models, +Z nose / +Y up, centre at origin.
 * Bundled mesh data avoids async IO at launch. GLB counterparts are interchange
 * exports of the same source, not a separately maintained procedural model.
 * Each effect owns its geometry/material and can use its existing disposal path.
 * Lengths retain the previous cosmetic enlargement; never used for collisions.
 */
export function createProjectileBody(
  kind: ProjectileVisualKind,
  displayLength: number = PROJECTILE_VISUALS[kind].displayLength,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const { asset } = PROJECTILE_VISUALS[kind];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(asset.positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(asset.normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(asset.colors, 3));
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.15,
    roughness: 0.64,
    // Small fill keeps dark SSM paint readable without washing out the bands.
    emissive: 0xffffff,
    emissiveIntensity: 0.025,
    fog: false,
    depthTest: kind === "ssm", // Preserve existing SAM/PD overlay behaviour.
  });
  const body = new THREE.Mesh(geometry, material);
  body.name = asset.name;
  body.scale.setScalar(displayLength / asset.length);
  return body;
}
