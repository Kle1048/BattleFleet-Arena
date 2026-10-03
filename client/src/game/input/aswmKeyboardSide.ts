/** Priorität: Mobile-SSM-Tasten, sonst Q/E (feste Rails), sonst Mausposition (RMB, vom Aufrufer ergänzt). */
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

/** Side of the original pointer in ship coordinates, independent of fire-control aim. */
export function pointerAswmFireSide(self: { x: number; z: number; headingRad: number }, aimX: number, aimZ: number): "port" | "starboard" {
  const localX = (aimX - self.x) * Math.cos(self.headingRad) - (aimZ - self.z) * Math.sin(self.headingRad);
  return localX < 0 ? "port" : "starboard";
}
