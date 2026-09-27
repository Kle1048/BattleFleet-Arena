export type Summary = { count: number; p50: number | null; p95: number | null; max: number | null };

/** Nearest-rank quantiles; no fake zero when the browser could not collect a sample. */
export function summarize(samples: readonly number[]): Summary {
  const sorted = samples.filter(Number.isFinite).sort((a, b) => a - b);
  const rank = (fraction: number) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
  return { count: sorted.length, p50: rank(0.5), p95: rank(0.95), max: sorted.at(-1) ?? null };
}

export type FrameMeasurement = {
  intervalMs: number; runtimeCpuMs: number; fxCpuMs: number; renderCpuMs: number;
  drawCalls: number; triangles: number; activeParticles: number; pooledParticles: number;
};
export type ResourceSample = {
  frame: number; geometries: number; textures: number; programs: number; sceneObjects: number;
  heapBytes: number | null;
};

/** Fixed sample capacity: diagnostics must not turn a soak test into an unbounded allocation. */
export function createMeasurements(capacity: number) {
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error("invalid sample capacity");
  const frames: FrameMeasurement[] = [];
  const resources: ResourceSample[] = [];
  return {
    frame(sample: FrameMeasurement): void {
      if (frames.length >= capacity) throw new Error("measurement capacity exceeded");
      frames.push({ ...sample });
    },
    resources(sample: ResourceSample): void {
      if (resources.length >= capacity + 1) throw new Error("resource sample capacity exceeded");
      resources.push({ ...sample });
    },
    report() {
      const field = (key: keyof FrameMeasurement) => summarize(frames.map(frame => frame[key]));
      return {
        frames: frames.length, longFramesOver50Ms: frames.filter(f => f.intervalMs > 50).length,
        intervalMs: field("intervalMs"), runtimeCpuMs: field("runtimeCpuMs"), fxCpuMs: field("fxCpuMs"),
        renderCpuMs: field("renderCpuMs"), drawCalls: field("drawCalls"), triangles: field("triangles"),
        activeParticles: field("activeParticles"), pooledParticles: field("pooledParticles"),
        resources: resources.map(sample => ({ ...sample })),
      };
    },
  };
}
