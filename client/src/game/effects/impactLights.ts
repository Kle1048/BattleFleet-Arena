import * as THREE from "three";

/** Fixed light count avoids shader recompilation during combat. Never casts shadows. */
export function createImpactLights(scene: THREE.Scene, camera?: THREE.Camera) {
  const slots = Array.from({ length: 2 }, () => {
    const light = new THREE.PointLight(0xffb36b, 0, 85, 2);
    light.name = "impact_light";
    light.castShadow = false;
    scene.add(light);
    return { light, remaining: 0, peak: 0, duration: 160, muzzle: false };
  });
  const frustum = new THREE.Frustum(), matrix = new THREE.Matrix4();
  const sphere = new THREE.Sphere(new THREE.Vector3(), 35);
  let disposed = false;
  function pulse(x: number, y: number, z: number, strength: number, muzzle: boolean) {
      if (disposed || !Number.isFinite(x + y + z + strength)) return;
      if (camera) {
        camera.updateMatrixWorld();
        frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        sphere.center.set(x, y, z);
        if (!frustum.intersectsSphere(sphere)) return;
        if (Math.hypot(camera.position.x - x, camera.position.z - z) > (muzzle ? 700 : 1100)) return;
      }
      // Merge simultaneous sub-bursts at one impact; preserve the other light.
      // Muzzle flashes cannot evict active impact lights. No per-shot allocations.
      let slot = slots.find(s => s.remaining > 0 && s.muzzle === muzzle && Math.hypot(s.light.position.x - x, s.light.position.z - z) < 24);
      if (!slot) {
        for (const candidate of slots) {
          if (muzzle && candidate.remaining > 0 && !candidate.muzzle) continue;
          if (!slot || candidate.remaining < slot.remaining) slot = candidate;
        }
      }
      if (!slot) return;
      slot.muzzle = muzzle;
      slot.light.position.set(x, y, z);
      slot.light.distance = muzzle ? 55 : 85;
      slot.duration = muzzle ? 85 : 160;
      slot.remaining = slot.duration;
      slot.peak = (muzzle ? 1000 : 1600) * Math.max(.5, Math.min(1.6, strength));
      slot.light.intensity = slot.peak;
  }
  return {
    flash(x: number, z: number, strength = 1) {
      pulse(x, 9, z, strength, false);
    },
    muzzle(x: number, y: number, z: number, strength = 1) {
      pulse(x, y, z, strength, true);
    },
    update(dtMs: number) {
      if (disposed) return;
      for (const slot of slots) {
        slot.remaining = Math.max(0, slot.remaining - Math.max(0, dtMs));
        slot.light.intensity = slot.peak * (slot.remaining / slot.duration) ** 2;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const slot of slots) { slot.light.removeFromParent(); slot.light.dispose(); }
    },
  };
}
