/**
 * Test-entry-only bridge for existing FX that still read global clocks/randomness.
 * Overrides exist only during a synchronous replay step, never across an await or browser task.
 * Real CPU timings use a previously bound native clock, not these simulated timestamps.
 */
export function withFixtureClock<T>(nowMs: number, random: () => number, action: () => T): T {
  const randomBefore = Math.random;
  const dateBefore = Date.now;
  const nowBefore = Object.getOwnPropertyDescriptor(performance, "now");
  Object.defineProperty(performance, "now", { configurable: true, value: () => nowMs });
  Math.random = random;
  Date.now = () => 1_800_000_000_000 + nowMs;
  try { return action(); }
  finally {
    Math.random = randomBefore;
    Date.now = dateBefore;
    if (nowBefore) Object.defineProperty(performance, "now", nowBefore);
    else Reflect.deleteProperty(performance, "now");
  }
}
