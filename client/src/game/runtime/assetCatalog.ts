export const AssetKeys = {
  waterPatternGrid: "water_pattern_grid",
  hudCommandIcon: "hud_command_icon",
  shipSchnellboot256: "ship_schnellboot_256",
} as const;

const BASE_URL = import.meta.env.BASE_URL;

export const AssetUrls = {
  waterPatternGrid: `${BASE_URL}assets/water-pattern.svg`,
  hudCommandIcon: `${BASE_URL}assets/hud-command-icon.svg`,
  shipSchnellboot256: `${BASE_URL}assets/schnellboot-256.png`,
} as const;
