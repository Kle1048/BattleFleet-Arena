import * as THREE from "three";
import ssm from "./projectile-assets/ssm.json";
import sam from "./projectile-assets/sam.json";
import pd from "./projectile-assets/pd.json";

export type ProjectileVisualKind = "ssm" | "sam" | "pd";
// Keep SSM readability at 12 units; apply the same enlargement to every model.
const PROJECTILE_DISPLAY_SCALE = 12 / ssm.length;
export const PROJECTILE_VISUALS = {
  ssm: { asset: ssm, displayLength: 12 },
  sam: { asset: sam, displayLength: sam.length * PROJECTILE_DISPLAY_SCALE },
  pd: { asset: pd, displayLength: pd.length * PROJECTILE_DISPLAY_SCALE },
} as const;

/** Blender-exported single-mesh models, +Z nose / +Y up, centre at origin.
 * Bundled mesh data avoids async IO at launch. GLB counterparts are interchange
 * exports of the same source, not a separately maintained procedural model.
 * Each effect owns its geometry/material and can use its existing disposal path.
 * One cosmetic enlargement preserves relative model sizes; never used for collisions.
 */
export function createProjectileBody(
  kind: ProjectileVisualKind,
  displayLength: number = PROJECTILE_VISUALS[kind].displayLength,
  options: { exhaust?: boolean } = {},
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const { asset } = PROJECTILE_VISUALS[kind];
  const positions = [...asset.positions], normals = [...asset.normals], colors = [...asset.colors];
  if (options.exhaust && kind !== "pd") {
    // Compact HDR-coloured flame in the existing mesh: no extra material,
    // draw call or per-frame allocation. Authored missiles face +Z.
    let tail = Infinity;
    for (let i = 2; i < positions.length; i += 3) tail = Math.min(tail, positions[i]!);
    const length = asset.length * .17, radius = asset.length * .027;
    const vertex = (angle: number, r: number, z: number, color: readonly number[]) => {
      positions.push(Math.cos(angle) * r, Math.sin(angle) * r, z);
      normals.push(Math.cos(angle), Math.sin(angle), 0);
      colors.push(...color);
    };
    const core = [12, 8, 2.5], outer = [5, .9, .035], tip = [.9, .035, .001];
    for (let side = 0; side < 6; side++) {
      const a = side * Math.PI / 3, b = (side + 1) * Math.PI / 3;
      const nozzle = tail + asset.length * .003, shoulder = tail - length * .22;
      vertex(a, radius * .55, nozzle, core); vertex(a, radius, shoulder, outer); vertex(b, radius * .55, nozzle, core);
      vertex(b, radius * .55, nozzle, core); vertex(a, radius, shoulder, outer); vertex(b, radius, shoulder, outer);
      vertex(a, radius, shoulder, outer); vertex((a+b)/2, 0, tail-length, tip); vertex(b, radius, shoulder, outer);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
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
  // Use the same program for every missile kind, including bodies without fire.
  // Only HDR flame vertices emit light themselves; authored paint stays <= 1.
  // The session's SSM warmup retains both main/reflection variants for SAM too.
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `
      #include <emissivemap_fragment>
      float exhaustGlow = smoothstep(1.0, 2.0, max(vColor.r, max(vColor.g, vColor.b)));
      totalEmissiveRadiance += vColor.rgb * exhaustGlow;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.0), exhaustGlow);
    `);
  };
  const body = new THREE.Mesh(geometry, material);
  body.name = asset.name;
  body.scale.setScalar(displayLength / asset.length);
  return body;
}
