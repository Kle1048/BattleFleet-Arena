import * as THREE from "three";

/** Fixed light count avoids shader recompilation during combat. Never casts shadows. */
export function createImpactLights(scene: THREE.Scene, camera?: THREE.Camera) {
  const slots = Array.from({ length: 2 }, () => {
    const light = new THREE.PointLight(0xffb36b, 0, 85, 2);
    light.name = "impact_light";
    light.castShadow = false;
    scene.add(light);
    return { light, remaining: 0, peak: 0 };
  });
  const frustum = new THREE.Frustum(), matrix = new THREE.Matrix4();
  const sphere = new THREE.Sphere(new THREE.Vector3(), 35);
  let disposed = false;
  return {
    flash(x: number, z: number, strength = 1) {
      if (disposed || !Number.isFinite(x + z + strength)) return;
      if (camera) {
        camera.updateMatrixWorld();
        frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        sphere.center.set(x, 8, z);
        if (!frustum.intersectsSphere(sphere)) return;
        if (Math.hypot(camera.position.x - x, camera.position.z - z) > 1100) return;
      }
      // Merge simultaneous sub-bursts at one impact; preserve the other light.
      const slot = slots.find(s => s.remaining > 0 && Math.hypot(s.light.position.x - x, s.light.position.z - z) < 24)
        ?? slots.reduce((a, b) => a.remaining < b.remaining ? a : b);
      slot.light.position.set(x, 9, z);
      slot.remaining = 160;
      slot.peak = 1600 * Math.max(.5, Math.min(1.6, strength));
      slot.light.intensity = slot.peak;
    },
    update(dtMs: number) {
      if (disposed) return;
      for (const slot of slots) {
        slot.remaining = Math.max(0, slot.remaining - Math.max(0, dtMs));
        slot.light.intensity = slot.peak * (slot.remaining / 160) ** 2;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const slot of slots) { slot.light.removeFromParent(); slot.light.dispose(); }
    },
  };
}
