import type * as THREE from "three";
import { summarize } from "./metrics";

/** Diagnostic only: instrument CPU submission by camera/material, never gameplay. */
export async function profileRender(renderer: THREE.WebGLRenderer, scene: THREE.Scene,
  camera: THREE.Camera, signal: AbortSignal) {
  const originalDraw = renderer.renderBufferDirect, originalUpdate = scene.updateMatrixWorld;
  const buckets = new Map<string, { calls: number; cpuMs: number }>();
  const total: number[] = [], matrices: number[] = [];
  let frame = 0, matrixMs = 0;
  renderer.renderBufferDirect = function (...args) {
    const [drawCamera, , , material, object] = args;
    const pass = /Depth|Distance/.test(material.type) ? "shadow" : drawCamera === camera ? "main" : "reflection";
    const kind = object.name === "particle_billboards" ? "particles" : material.type;
    const key = `${pass}/${kind}`;
    const start = performance.now();
    try { return originalDraw.apply(this, args); }
    finally {
      if (frame >= 20) {
        const bucket = buckets.get(key) ?? { calls: 0, cpuMs: 0 };
        bucket.calls++; bucket.cpuMs += performance.now() - start; buckets.set(key, bucket);
      }
    }
  };
  scene.updateMatrixWorld = function (...args) {
    const start = performance.now();
    try { return originalUpdate.apply(this, args); }
    finally { matrixMs += performance.now() - start; }
  };
  try {
    for (frame = 0; frame < 140; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (signal.aborted || document.hidden || renderer.getContext().isContextLost()) throw new Error("Invalid/aborted render profile");
      matrixMs = 0;
      const start = performance.now(); renderer.render(scene, camera);
      if (frame >= 20) { total.push(performance.now() - start); matrices.push(matrixMs); }
    }
    return { samples: total.length, instrumentedRenderCpuMs: summarize(total), matrixUpdateCpuMs: summarize(matrices),
      draws: [...buckets].map(([key, b]) => ({ key, callsPerFrame: b.calls / total.length, cpuMsPerFrame: b.cpuMs / total.length }))
        .sort((a, b) => b.cpuMsPerFrame - a.cpuMsPerFrame),
      note: "Instrumented static CPU submission; includes timer overhead, not GPU time or animated replay" };
  } finally { renderer.renderBufferDirect = originalDraw; scene.updateMatrixWorld = originalUpdate; }
}
