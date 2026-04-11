export const AssetKeys = {
  waterPatternGrid: "water_pattern_grid",
  hudCommandIcon: "hud_command_icon",
  shipSchnellboot256: "ship_schnellboot_256",
  shipS143AGlb: "ship_s143a_glb",
} as const;

const BASE_URL = import.meta.env.BASE_URL;

export const AssetUrls = {
  waterPatternGrid: `${BASE_URL}assets/water-pattern.svg`,
  hudCommandIcon: `${BASE_URL}assets/hud-command-icon.svg`,
  shipSchnellboot256: `${BASE_URL}assets/schnellboot-256.png`,
  shipS143AGlb: `${BASE_URL}assets/S143A.glb`,
} as const;
