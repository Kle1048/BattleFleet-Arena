/** Priorität: Mobile-SSM-Tasten, sonst Q/E (feste Rails), sonst Zielrichtung (RMB, kein Side). */
export function mergeAswmFireSide(opts: {
  mobileActive: boolean;
  mobileSecondaryFire: boolean;
  mobileAswmSide?: "port" | "starboard";
  keyQ: boolean;
  keyE: boolean;
}): "port" | "starboard" | undefined {
  const { mobileActive, mobileSecondaryFire, mobileAswmSide, keyQ, keyE } = opts;
  if (mobileActive && mobileSecondaryFire && mobileAswmSide) return mobileAswmSide;
  if (keyQ && !keyE) return "port";
  if (keyE && !keyQ) return "starboard";
  if (keyQ && keyE) return "port";
  return undefined;
}
