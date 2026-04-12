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
  /** Deterministische schnelle Oszillation statt Math.random — wirkt weniger wie Rauschen/Flimmern. */
  const phase = (active.totalMs - active.remainMs) * 0.001;
  const jx = Math.sin(phase * 71.3) * Math.cos(phase * 23.1);
  const jy = Math.sin(phase * 59.7 + 2.1);
  const jz = Math.cos(phase * 67.9 + 0.4);
  camera.position.x += jx * amp * 0.92;
  camera.position.y += jy * amp * 0.48;
  camera.position.z += jz * amp * 0.92;
  if (active.remainMs <= 0) active = null;
}

export function disposeCameraShake(): void {
  active = null;
}
