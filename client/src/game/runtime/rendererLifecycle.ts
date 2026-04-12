import * as THREE from "three";
import { resizeCamera } from "../scene/createGameScene";

export function createGameRenderer(root: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  root.appendChild(renderer.domElement);
  return renderer;
}

export function bindRendererResize(
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
): void {
  const sync = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    resizeCamera(camera, w, h);
    renderer.setSize(w, h);
  };
  sync();
  window.addEventListener("resize", sync);
}
