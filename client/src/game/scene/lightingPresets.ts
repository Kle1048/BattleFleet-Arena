export type LightingPresetId = "midday_clear" | "golden_hour" | "stormy_haze";

export type LightingPreset = {
  background: number;
  fogColor: number | null;
  fogNear: number;
  fogFar: number;
  ambientColor: number;
  groundColor: number;
  ambientIntensity: number;
  sunColor: number;
  sunIntensity: number;
  sunPos: readonly [number, number, number];
};

export const LIGHTING_PRESETS: Record<LightingPresetId, LightingPreset> = {
  midday_clear: {
    background: 0x53bce8,
    fogColor: null,
    fogNear: 0,
    fogFar: 0,
    ambientColor: 0xcfe9ff,
    groundColor: 0x7c919e,
    ambientIntensity: 1.35,
    sunColor: 0xffffff,
    sunIntensity: 2.1,
    sunPos: [140, 1500, 220],
  },
  golden_hour: {
    background: 0x66b9d8,
    fogColor: 0xc6ad90,
    fogNear: 380,
    fogFar: 2100,
    ambientColor: 0xbcd6ef,
    groundColor: 0x8b999e,
    ambientIntensity: 1.25,
    sunColor: 0xffd4a0,
    sunIntensity: 2.25,
    sunPos: [620, 520, 260],
  },
  stormy_haze: {
    background: 0x3f6f8c,
    fogColor: 0x55748b,
    fogNear: 160,
    fogFar: 1200,
    ambientColor: 0x9ab6c8,
    groundColor: 0x657887,
    ambientIntensity: 1.05,
    sunColor: 0xbdd6ea,
    sunIntensity: 0.95,
    sunPos: [-260, 720, -180],
  },
};
