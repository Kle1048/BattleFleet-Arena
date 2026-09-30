import * as THREE from "three";
import { resizeCamera } from "../scene/createGameScene";
import { createLifetime } from "./lifetime";

function sizeFromRoot(root: HTMLElement): { w: number; h: number } {
  const w = Math.max(1, root.clientWidth || window.innerWidth);
  const h = Math.max(1, root.clientHeight || window.innerHeight);
  return { w, h };
}

export function createGameRenderer(root: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  try {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const { w, h } = sizeFromRoot(root);
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    root.appendChild(renderer.domElement);
    return renderer;
  } catch (error) {
    renderer.domElement.remove();
    renderer.dispose();
    throw error;
  }
}

/**
 * @param sizeRoot Wenn gesetzt (z. B. `#app` in der Workbench), Canvas-Größe = Container — sonst volles Fenster.
 *   Verhindert, dass die WebGL-Fläche unter ein seitliches Panel zeichnet.
 */
export function bindRendererResize(
  camera: THREE.PerspectiveCamera,
  renderer: Pick<THREE.WebGLRenderer, "setSize">,
  sizeRoot?: HTMLElement,
): () => void {
  const lifetime = createLifetime();
  const sync = (): void => {
    if (lifetime.disposed) return;
    const w = sizeRoot ? Math.max(1, sizeRoot.clientWidth) : window.innerWidth;
    const h = sizeRoot ? Math.max(1, sizeRoot.clientHeight) : window.innerHeight;
    resizeCamera(camera, w, h);
    renderer.setSize(w, h);
  };
  try {
    sync();
    window.addEventListener("resize", sync);
    lifetime.defer(() => window.removeEventListener("resize", sync));
    if (sizeRoot && typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(sync);
      lifetime.defer(() => ro.disconnect());
      ro.observe(sizeRoot);
    }
    return lifetime.dispose;
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}
