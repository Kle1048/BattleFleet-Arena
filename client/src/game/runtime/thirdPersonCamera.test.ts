import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import { applyFollowCameraTuning, getFollowCameraTuning, resetFollowCameraTuning } from "./followCameraTuning";
import { resetThirdPersonCamera, rotateThirdPersonCamera, zoomThirdPersonCamera } from "./thirdPersonCamera";
import { updateFollowCamera, resetFollowCameraSmoothing } from "../scene/createGameScene";

const camera = new PerspectiveCamera();
try {
  for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    resetThirdPersonCamera();
    applyFollowCameraTuning({ mode: "thirdPerson", orbitDistance: 240, orbitPitchDeg: 18 });
    updateFollowCamera(camera, 100, 200, heading, 16);
    const target = new Vector3(-100, 12, 200);
    assert.ok(Math.abs(camera.position.distanceTo(target) - 240) < 1e-8);
    const travel = new Vector3(-Math.sin(heading), 0, Math.cos(heading));
    assert.ok(camera.position.clone().sub(target).dot(travel) < 0, "initial camera is astern");
    const offset = camera.position.clone().sub(target);
    updateFollowCamera(camera, 130, 220, heading + 0.5, 16);
    assert.ok(camera.position.clone().sub(new Vector3(-130, 12, 220)).distanceTo(offset) < 1e-8,
      "orbit follows position but is independent of ship rotation");
    rotateThirdPersonCamera(100, 50);
    updateFollowCamera(camera, 100, 200, heading, 16);
    assert.ok(camera.position.clone().sub(target).distanceTo(offset) > 10);
    assert.ok(camera.getWorldDirection(new Vector3()).dot(target.clone().sub(camera.position).normalize()) > 0.999999);
  }
  rotateThirdPersonCamera(0, -1e6);
  assert.equal(getFollowCameraTuning().orbitPitchDeg, 8);
  zoomThirdPersonCamera(-1e6); zoomThirdPersonCamera(-1e6); zoomThirdPersonCamera(-1e6);
  assert.equal(getFollowCameraTuning().orbitDistance, 80);
  applyFollowCameraTuning({ orbitDistance: NaN, orbitPitchDeg: Infinity });
  assert.equal(getFollowCameraTuning().orbitDistance, 80);
  assert.equal(getFollowCameraTuning().orbitPitchDeg, 8);
  applyFollowCameraTuning({ mode: "map" });
  updateFollowCamera(camera, 0, 0, 0, 16);
  assert.ok(camera.position.y > 800, "original map defaults are untouched");
  applyFollowCameraTuning({ mode: "thirdPerson" });
  updateFollowCamera(camera, 0, 0, 0, 16);
  assert.ok(Math.abs(camera.position.x) < 1e-8, "re-entry starts astern again");
} finally {
  resetFollowCameraTuning(); resetFollowCameraSmoothing();
}
console.log("third-person orbit follows ship, stays above sea, bounds zoom/pitch and restores map camera");
