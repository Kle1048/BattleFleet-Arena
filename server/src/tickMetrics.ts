/** Bounded rolling self-time samples. Percentiles are computed only when requested by admin. */
export class TickMetrics {
  private readonly samples = new Float64Array(200);
  private count = 0;
  private cursor = 0;

  record(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
    this.samples[this.cursor] = milliseconds;
    this.cursor = (this.cursor + 1) % this.samples.length;
    this.count = Math.min(this.count + 1, this.samples.length);
  }

  snapshot(): { samples: number; mean: number; p95: number; max: number } {
    const sorted = Array.from(this.samples.subarray(0, this.count)).sort((a, b) => a - b);
    return {
      samples: this.count,
      mean: this.count ? sorted.reduce((sum, n) => sum + n, 0) / this.count : 0,
      p95: sorted[Math.max(0, Math.ceil(this.count * 0.95) - 1)] ?? 0,
      max: sorted[this.count - 1] ?? 0,
    };
  }
}
