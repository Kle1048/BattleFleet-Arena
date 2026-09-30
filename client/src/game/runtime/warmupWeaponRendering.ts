import * as THREE from "three";

/** Run under the session-loading backdrop, before input/frame scheduling starts.
 * A real draw prepares buffers, shadow and water-reflection variants too; compile()
 * alone does not upload geometry or exercise the reflection render target.
 * Mesh resources remain owned by their effect system. Never emit combat events.
 */
export function warmupWeaponRendering(renderer: THREE.WebGLRenderer, scene: THREE.Scene,
  camera: THREE.Camera, meshes: readonly THREE.Mesh[]): void {
  const probes = new THREE.Group();
  probes.name = "weapon_shader_warmup";
  for (const mesh of meshes) { mesh.frustumCulled = false; probes.add(mesh); }
  scene.add(probes);
  try { renderer.render(scene, camera); }
  finally { probes.removeFromParent(); }
  // Clear probe pixels before the loading backdrop can be removed.
  renderer.render(scene, camera);
}
