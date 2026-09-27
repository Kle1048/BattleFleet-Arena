import type { Mesh, ShaderMaterial, WebGLRenderer } from "three";

/** Three r170 Water hides its reflection target in a constructor closure and has
 * no dispose method. Capture that target through the renderer's public API on
 * its first reflection pass; afterwards the original render hook runs unchanged.
 * Disposing only mirrorSampler would leak the target's framebuffer/depth buffer. */
export function ownWaterReflectionTarget(water: Mesh) {
  const originalHook = water.onBeforeRender;
  let target: { dispose(): void } | undefined;
  let disposed = false;
  const capture: typeof water.onBeforeRender = function(renderer, ...args) {
    if (disposed) return;
    const setTarget = renderer.setRenderTarget;
    const mirrorTexture = (water.material as ShaderMaterial).uniforms.mirrorSampler?.value;
    const wrapped: WebGLRenderer["setRenderTarget"] = function(this: WebGLRenderer, next, ...rest) {
      if (next && next.texture === mirrorTexture) target = next;
      return setTarget.call(this, next, ...rest);
    };
    renderer.setRenderTarget = wrapped;
    try { originalHook.call(water, renderer, ...args); }
    finally {
      renderer.setRenderTarget = setTarget;
      if (target) water.onBeforeRender = originalHook;
    }
  };
  water.onBeforeRender = capture;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      target?.dispose();
      target = undefined;
      water.onBeforeRender = () => {};
    },
  };
}
