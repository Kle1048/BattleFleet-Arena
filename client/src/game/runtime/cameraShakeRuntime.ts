import type * as THREE from "three";

type Shake = { remainMs: number; totalMs: number; amplitude: number };

let active: Shake | null = null;

/**
 * Kurzer Kamera-Ruckler (Position-Jitter nach `updateFollowCamera`).
 */
export function triggerCameraShake(opts?: { durationMs?: number; amplitude?: number }): void {
  const durationMs = Math.max(40, opts?.durationMs ?? 380);
  const amplitude = Math.max(0, opts?.amplitude ?? 12);
  if (!active) {
    active = { remainMs: durationMs, totalMs: durationMs, amplitude };
    return;
  }
  active.remainMs = Math.max(active.remainMs, durationMs);
  active.totalMs = Math.max(active.totalMs, durationMs);
  active.amplitude = Math.max(active.amplitude, amplitude);
}

export function applyCameraShakeStep(camera: THREE.PerspectiveCamera, dtMs: number): void {
  if (!active || active.remainMs <= 0) {
    active = null;
    return;
  }
  active.remainMs -= dtMs;
  const env = active.totalMs > 1 ? Math.max(0, active.remainMs / active.totalMs) : 0;
  const amp = active.amplitude * (0.18 + 0.82 * env);
  camera.position.x += (Math.random() - 0.5) * 2 * amp;
  camera.position.y += (Math.random() - 0.5) * 2 * amp * 0.48;
  camera.position.z += (Math.random() - 0.5) * 2 * amp;
  if (active.remainMs <= 0) active = null;
}

export function disposeCameraShake(): void {
  active = null;
}
