import * as THREE from "three";
import { resizeCamera } from "../scene/createGameScene";

export function createGameRenderer(root: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  root.appendChild(renderer.domElement);
  return renderer;
}

export function bindRendererResize(
  camera: THREE.OrthographicCamera,
  renderer: THREE.WebGLRenderer,
): void {
  resizeCamera(camera, window.innerWidth, window.innerHeight);
  window.addEventListener("resize", () => {
    resizeCamera(camera, window.innerWidth, window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
