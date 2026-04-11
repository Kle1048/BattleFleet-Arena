import { sunAnglesFromPosition } from "../scene/environmentSun";
import { LIGHTING_PRESETS, type LightingPresetId } from "../scene/lightingPresets";

const STORAGE_KEY = "bfa.environmentTuning.v1";

const GOLDEN_ANG = sunAnglesFromPosition(LIGHTING_PRESETS.golden_hour.sunPos);

export type EnvironmentTuning = {
  skyEnabled: boolean;
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  elevationDeg: number;
  azimuthDeg: number;
  waterDistortionScale: number;
  waterSize: number;
  waterAlpha: number;
  waterColorHex: number;
  waterSunColorHex: number;
  reflectionTextureSize: number;
  lightingPreset: LightingPresetId;
  ambientIntensityMul: number;
  sunIntensityMul: number;
  fogStrength: number;
};

export const DEFAULT_ENVIRONMENT_TUNING: Readonly<EnvironmentTuning> = {
  skyEnabled: true,
  turbidity: 4,
  rayleigh: 1.2,
  mieCoefficient: 0.006,
  mieDirectionalG: 0.75,
  elevationDeg: GOLDEN_ANG.elevationDeg,
  azimuthDeg: GOLDEN_ANG.azimuthDeg,
  waterDistortionScale: 4.2,
  waterSize: 1.15,
  waterAlpha: 0.92,
  waterColorHex: 0x0a3d5c,
  waterSunColorHex: 0xfff2dd,
  reflectionTextureSize: 512,
  lightingPreset: "golden_hour",
  ambientIntensityMul: 1,
  sunIntensityMul: 1,
  fogStrength: 1,
};

export function loadPersistedEnvironmentTuning(): Partial<EnvironmentTuning> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<EnvironmentTuning>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function savePersistedEnvironmentTuning(patch: Partial<EnvironmentTuning>): void {
  try {
    const cur = { ...DEFAULT_ENVIRONMENT_TUNING, ...loadPersistedEnvironmentTuning(), ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
  } catch {
    // ignore
  }
}
