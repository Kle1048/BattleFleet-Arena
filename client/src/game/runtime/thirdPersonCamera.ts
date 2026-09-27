import type { PerspectiveCamera } from "three";
import { applyFollowCameraTuning, getFollowCameraTuning } from "./followCameraTuning";
import { worldToRenderX } from "./renderCoords";

// Session-local orbit heading: world-stable while the ship turns, initially astern.
let yaw: number | null = null;
export function resetThirdPersonCamera(): void { yaw = null; }

export function rotateThirdPersonCamera(dx: number, dy: number): void {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  if (yaw !== null) yaw = Math.atan2(Math.sin(yaw - dx * 0.005), Math.cos(yaw - dx * 0.005));
  applyFollowCameraTuning({ orbitPitchDeg: getFollowCameraTuning().orbitPitchDeg + dy * 0.15 });
}

export function zoomThirdPersonCamera(delta: number): void {
  if (!Number.isFinite(delta)) return;
  applyFollowCameraTuning({ orbitDistance: getFollowCameraTuning().orbitDistance * Math.exp(Math.max(-1, Math.min(1, delta * 0.001))) });
}

export function updateThirdPersonCamera(camera: PerspectiveCamera, x: number, z: number, heading: number): void {
  yaw ??= -heading;
  const { orbitDistance, orbitPitchDeg } = getFollowCameraTuning();
  const pitch = orbitPitchDeg * Math.PI / 180;
  const back = orbitDistance * Math.cos(pitch);
  const targetY = 12;
  camera.up.set(0, 1, 0);
  camera.position.set(worldToRenderX(x) - Math.sin(yaw) * back,
    targetY + Math.sin(pitch) * orbitDistance, z - Math.cos(yaw) * back);
  camera.lookAt(worldToRenderX(x), targetY, z);
  camera.updateMatrixWorld();
}
