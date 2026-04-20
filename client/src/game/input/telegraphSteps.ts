/** Sieben symmetrische Stufen −1 … 1 (Telegraf / Ruder-Wiederholer). */
export const TELEGRAPH_THROTTLE_STEPS = Object.freeze([
  -1,
  -2 / 3,
  -1 / 3,
  0,
  1 / 3,
  2 / 3,
  1,
] as const);

export const TELEGRAPH_RUDDER_STEPS = Object.freeze([
  -1,
  -2 / 3,
  -1 / 3,
  0,
  1 / 3,
  2 / 3,
  1,
] as const);

export const TELEGRAPH_STOP_INDEX = 3;

export function snapToNearestStep(value: number, steps: readonly number[]): number {
  let best = steps[0] ?? 0;
  let bestD = Infinity;
  for (const s of steps) {
    const d = Math.abs(s - value);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

export function valueToStepIndex(value: number, steps: readonly number[]): number {
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < steps.length; i++) {
    const d = Math.abs(steps[i]! - value);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return bestI;
}
