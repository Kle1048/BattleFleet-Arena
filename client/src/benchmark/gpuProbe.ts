import type { WebGLRenderer } from "three";
import { summarize } from "./metrics";

/** Separate static-scene GPU measurement; never mix these queries into CPU comparison runs. */
export function measureGpuFrames(renderer: WebGLRenderer, render: () => void, signal: AbortSignal) {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const extension = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  if (!extension) return Promise.resolve({ supported: false as const });
  return new Promise<{ supported: true; gpuMs: ReturnType<typeof summarize>; warmupFrames: number }>((resolve, reject) => {
    const pending: { query: WebGLQuery; measured: boolean }[] = [];
    const samples: number[] = [];
    let frame = 0, raf = 0, settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true; cancelAnimationFrame(raf); clearTimeout(deadline);
      signal.removeEventListener("abort", abort);
      for (const entry of pending) gl.deleteQuery(entry.query);
      pending.length = 0;
      if (error) reject(error);
      else resolve({ supported: true, gpuMs: summarize(samples), warmupFrames: 60 });
    };
    const abort = () => finish(new Error("GPU probe cancelled"));
    const deadline = setTimeout(() => finish(new Error("GPU probe deadline exceeded")), 20_000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    const draw = () => {
      try {
        if (gl.isContextLost() || gl.getParameter(extension.GPU_DISJOINT_EXT)) throw new Error("Invalid GPU timing: context lost or disjoint");
        for (let i = pending.length - 1; i >= 0; i--) {
          const entry = pending[i]!;
          if (!gl.getQueryParameter(entry.query, gl.QUERY_RESULT_AVAILABLE)) continue;
          if (entry.measured) {
            const elapsed = Number(gl.getQueryParameter(entry.query, gl.QUERY_RESULT)) / 1e6;
            if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error("Invalid GPU query result");
            samples.push(elapsed);
          }
          gl.deleteQuery(entry.query); pending.splice(i, 1);
        }
        if (frame < 180 && pending.length < 8) {
          const query = gl.createQuery();
          if (!query) throw new Error("GPU query allocation failed");
          pending.push({ query, measured: frame >= 60 });
          gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
          try { render(); } finally { gl.endQuery(extension.TIME_ELAPSED_EXT); }
          frame++;
        }
        if (frame === 180 && pending.length === 0) finish();
        else raf = requestAnimationFrame(draw);
      } catch (error) { finish(error); }
    };
    raf = requestAnimationFrame(draw);
  });
}
