import * as THREE from "three";
import { summarize } from "./metrics";

/** Same scene/materials/cameras, toggling only separate versus instanced draws. */
export async function compareStaticMountDraws(renderer: THREE.WebGLRenderer, scene: THREE.Scene,
  camera: THREE.Camera, signal: AbortSignal) {
  const pairs: { batch: THREE.InstancedMesh; sources: THREE.Object3D[] }[] = [];
  scene.traverse(object => {
    if (!(object instanceof THREE.InstancedMesh) || !Array.isArray(object.userData.staticMountSourceIds)) return;
    pairs.push({ batch: object, sources: (object.userData.staticMountSourceIds as number[]).map(id => {
      const source = scene.getObjectById(id); if (!source) throw new Error("Missing static mount source"); return source;
    }) });
  });
  // The pre-optimization path cloned one material per launcher, too. Reproduce
  // that ownership in the reference, rather than giving it half the optimization.
  const referenceMaterials = pairs.flatMap(({ sources }) => sources.map(object => {
    const source = object as THREE.Mesh;
    if (Array.isArray(source.material)) throw new Error("Unexpected multi-material static mount");
    return { source, shared: source.material, separate: source.material.clone() };
  }));
  const mode = (instanced: boolean) => pairs.forEach(({ batch, sources }) => {
    batch.visible = instanced; sources.forEach(source => { source.visible = !instanced; });
  });
  const gl = renderer.getContext(), width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
  const pixels = [new Uint8Array(width * height * 4), new Uint8Array(width * height * 4)];
  const times: number[][] = [[], []], draws: number[] = [], triangles: number[] = [];
  try {
    for (let frame = 0; frame < 140; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (signal.aborted || document.hidden || gl.isContextLost() || gl.drawingBufferWidth !== width || gl.drawingBufferHeight !== height)
        throw new Error("Invalid/aborted static mount comparison");
      for (const index of frame % 2 ? [1, 0] : [0, 1]) {
        for (const entry of referenceMaterials) entry.source.material = index ? entry.shared : entry.separate;
        mode(index === 1); renderer.info.reset();
        const start = performance.now(); renderer.render(scene, camera); const elapsed = performance.now() - start;
        if (frame >= 20) times[index]!.push(elapsed);
        if (frame === 139) {
          draws[index] = renderer.info.render.calls; triangles[index] = renderer.info.render.triangles;
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels[index]!);
        }
      }
    }
    let max = 0, sum = 0, changed = 0;
    for (let i = 0; i < pixels[0]!.length; i += 4) for (let c = 0; c < 3; c++) {
      const delta = Math.abs(pixels[0]![i + c]! - pixels[1]![i + c]!);
      max = Math.max(max, delta); sum += delta; if (delta > 2) changed++;
    }
    return { batches: pairs.length, separate: { cpuMs: summarize(times[0]!), draws: draws[0], triangles: triangles[0] },
      instanced: { cpuMs: summarize(times[1]!), draws: draws[1], triangles: triangles[1] },
      rgb: { meanError: sum / (width * height * 3), maxError: max, fractionOver2: changed / (width * height * 3) },
      note: "Alternating CPU renders of one static scene; 20 warmup + 120 samples each. No GPU timing/FPS claim." };
  } finally {
    mode(true);
    for (const entry of referenceMaterials) { entry.source.material = entry.shared; entry.separate.dispose(); }
  }
}
