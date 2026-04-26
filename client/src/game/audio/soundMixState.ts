/**
 * Einstellbare Client-Mix-Regler (Debug-Panel), mit optionaler localStorage-Persistenz.
 * Werte sind Multiplikatoren auf die jeweiligen Basis-Pegel (1 = Standard).
 */

const STORAGE_KEY = "bfa.soundMix.v1";

export type SoundMixState = {
  music: number;
  engine: number;
  sfx: number;
};

const DEFAULT: SoundMixState = {
  music: 1,
  engine: 1,
  sfx: 1,
};

let state: SoundMixState = { ...DEFAULT };

function clamp01ish(v: number, max: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(max, v));
}

function load(): SoundMixState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const p = JSON.parse(raw) as Partial<SoundMixState>;
    if (!p || typeof p !== "object") return { ...DEFAULT };
    return {
      music: clamp01ish(typeof p.music === "number" ? p.music : DEFAULT.music, 2.5),
      engine: clamp01ish(typeof p.engine === "number" ? p.engine : DEFAULT.engine, 2.5),
      sfx: clamp01ish(typeof p.sfx === "number" ? p.sfx : DEFAULT.sfx, 2.5),
    };
  } catch {
    return { ...DEFAULT };
  }
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* */
  }
}

state = load();

export function getSoundMix(): Readonly<SoundMixState> {
  return state;
}

export function setSoundMix(partial: Partial<SoundMixState>): void {
  if (typeof partial.music === "number")
    state.music = clamp01ish(partial.music, 2.5);
  if (typeof partial.engine === "number")
    state.engine = clamp01ish(partial.engine, 2.5);
  if (typeof partial.sfx === "number") state.sfx = clamp01ish(partial.sfx, 2.5);
  save();
}

export function getMusicUserMult(): number {
  return state.music;
}
export function getEngineUserMult(): number {
  return state.engine;
}
export function getSfxUserMult(): number {
  return state.sfx;
}

export function resetSoundMixToDefaults(): void {
  state = { ...DEFAULT };
  save();
}
