const STORAGE_KEY = "bfa.wakeRuntimeTuning.v1";

export type WakeRuntimeTuning = {
  /**
   * Mindestabstand zwischen zwei Stützpunkten der Heck-Spur (Welt-Einheiten).
   * Größerer Wert → bei voller Punktanzahl eine **längere** geografische Spur; kleiner → feinere, kürzere Gesamtlänge.
   */
  sampleMinDist: number;
};

export const DEFAULT_WAKE_RUNTIME_TUNING: Readonly<WakeRuntimeTuning> = {
  sampleMinDist: 3,
};

let current: WakeRuntimeTuning = { ...DEFAULT_WAKE_RUNTIME_TUNING };

function load(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const p = JSON.parse(raw) as Partial<WakeRuntimeTuning>;
    if (p && typeof p === "object") {
      current = { ...DEFAULT_WAKE_RUNTIME_TUNING, ...p };
    }
  } catch {
    // ignore
  }
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
}

load();

export function getWakeRuntimeTuning(): WakeRuntimeTuning {
  return { ...current };
}

export function getWakeSampleMinDistSq(): number {
  const d = current.sampleMinDist;
  return d * d;
}

export function applyWakeRuntimeTuning(patch: Partial<WakeRuntimeTuning>): WakeRuntimeTuning {
  current = { ...current, ...patch };
  save();
  return { ...current };
}

export function resetWakeRuntimeTuning(): void {
  current = { ...DEFAULT_WAKE_RUNTIME_TUNING };
  save();
}
