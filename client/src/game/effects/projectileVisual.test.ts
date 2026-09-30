import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Box3, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createProjectileBody, PROJECTILE_VISUALS } from "./projectileVisual";

const renderedLengths: number[] = [];
for (const kind of ["ssm", "sam", "pd"] as const) {
  const spec = PROJECTILE_VISUALS[kind];
  const body = createProjectileBody(kind);
  const other = createProjectileBody(kind);
  const geometry = body.geometry;
  const positions = geometry.getAttribute("position");
  assert.ok(positions.count / 3 < 1000);
  assert.equal(positions.count % 3, 0);
  for (const attribute of ["position", "normal", "color"]) {
    const attr = geometry.getAttribute(attribute);
    assert.equal(attr.count, positions.count);
    assert.ok(Array.from(attr.array).every(Number.isFinite));
  }
  for (let i = 0; i < positions.count; i += 3) {
    const a = new Vector3().fromBufferAttribute(positions, i);
    const b = new Vector3().fromBufferAttribute(positions, i+1);
    const c = new Vector3().fromBufferAttribute(positions, i+2);
    assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-16, "no degenerate triangles");
  }
  assert.notEqual(geometry, other.geometry, "independent disposal ownership");
  assert.notEqual(body.material, other.material);
  assert.equal(body.material.vertexColors, true);
  assert.equal(body.material.depthTest, kind === "ssm");
  const bounds = new Box3().setFromObject(body);
  renderedLengths.push(bounds.getSize(new Vector3()).z);
  assert.ok(Math.abs(body.scale.x - 12 / PROJECTILE_VISUALS.ssm.asset.length) < 1e-10,
    `${kind}: common enlargement preserves relative model proportions`);
  assert.ok(Math.abs(bounds.getSize(new Vector3()).z - spec.displayLength) < .00001);
  assert.ok(bounds.max.z > 0 && bounds.min.z < 0);
  const noseZ = Math.max(...spec.asset.positions.filter((_, i) => i % 3 === 2));
  const tipVertices = spec.asset.positions.reduce<number[]>((out, z, i) => {
    if (i % 3 === 2 && z > noseZ-.00001) out.push(Math.hypot(spec.asset.positions[i-2]!, spec.asset.positions[i-1]!));
    return out;
  }, []);
  assert.ok(tipVertices.length && Math.max(...tipVertices) < .01, "narrow nose faces +Z");

  // Catch accidental export of selected objects from other Blender scenes.
  const filename = {ssm: "ssm_exocet_mm38.glb", sam: "sam_sea_sparrow.glb", pd: "pd_ram.glb"}[kind];
  const bytes = readFileSync(new URL(`../../../public/assets/projectiles/${filename}`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength), "");
  let triangles = 0, meshes = 0;
  gltf.scene.traverse(object => {
    if (!("isMesh" in object) || !object.isMesh) return;
    const mesh = object as typeof body;
    meshes++;
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3;
    assert.ok(mesh.geometry.hasAttribute("color"));
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
  assert.equal(meshes, 1);
  assert.equal(triangles, positions.count/3);
  const glbBounds = new Box3().setFromObject(gltf.scene);
  assert.ok(Math.abs(glbBounds.getSize(new Vector3()).z - spec.asset.length) < .00001);
  body.geometry.dispose(); body.material.dispose();
  other.geometry.dispose(); other.material.dispose();
}
assert.equal(PROJECTILE_VISUALS.ssm.displayLength, 12, "SSM size stays unchanged");
assert.ok(renderedLengths[0]! > renderedLengths[1]! && renderedLengths[1]! > renderedLengths[2]!,
  "rendered lengths must be SSM > SAM > PD");
console.log("Projectile assets: GLB/runtime parity, <1000 triangles, colours, +Z nose, display size and ownership verified");
