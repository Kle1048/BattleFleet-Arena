import * as THREE from "three";

/** Normale Welt: Inseln, Schiffe, Wasser, Sky — erscheint in der Wasser-Reflexion. */
export const WORLD_LAYER = 0;
/**
 * UI-/Debug-Overlays (Kartenrand, Hitbox, Feuerbögen, Zielhilfen) — **nicht** in der Reflexion.
 * Layers werden von Kindern nicht geerbt; `assignToOverlayLayer` traversiert den Baum.
 */
export const OVERLAY_LAYER = 1;

export function assignToOverlayLayer(root: THREE.Object3D): void {
  root.traverse((o) => {
    o.layers.set(OVERLAY_LAYER);
  });
}

/** Spielkamera: Welt + Overlays (Standard ist nur Layer 0 sichtbar). */
export function configureMainCameraForGameplay(camera: THREE.PerspectiveCamera): void {
  camera.layers.enable(WORLD_LAYER);
  camera.layers.enable(OVERLAY_LAYER);
}

export type ReflectionLayerMaskHandle = { dispose: () => void };

/**
 * `Water` rendert mit einer internen Spiegel-Perspektive (`camera !== mainCamera`).
 * Kurz vor jedem solchen Render nur Layer 0 aktivieren, danach Mask wiederherstellen —
 * so landen Overlays nicht im Reflexions-RenderTarget.
 */
export function installReflectionCameraLayerMask(
  renderer: THREE.WebGLRenderer,
  mainCamera: THREE.Camera,
): ReflectionLayerMaskHandle {
  type RenderFn = (scene: THREE.Object3D, camera: THREE.Camera) => void;
  const orig = renderer.render.bind(renderer) as RenderFn;
  const patched: RenderFn = (scene, camera) => {
    if (camera !== mainCamera) {
      const prevMask = camera.layers.mask;
      camera.layers.disableAll();
      camera.layers.enable(WORLD_LAYER);
      try {
        orig(scene, camera);
      } finally {
        camera.layers.mask = prevMask;
      }
    } else {
      orig(scene, camera);
    }
  };
  renderer.render = patched as typeof renderer.render;
  return {
    dispose() {
      renderer.render = orig as typeof renderer.render;
    },
  };
}
