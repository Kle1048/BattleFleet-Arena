export type ShipDebugTuning = {
  spriteScale: number;
  aimOriginLocalZ: number;
  shipPivotLocalZ: number;
  cameraPivotLocalZ: number;
  artillerySpawnLocalZ: number;
  mineSpawnLocalZ: number;
  wakeSpawnLocalZ: number;
  showWeaponArc: boolean;
};

export const DEFAULT_SHIP_DEBUG_TUNING: Readonly<ShipDebugTuning> = {
  spriteScale: 3,
  aimOriginLocalZ: 46.6,
  shipPivotLocalZ: 23,
  cameraPivotLocalZ: 0.4,
  artillerySpawnLocalZ: -13.8,
  mineSpawnLocalZ: -22,
  wakeSpawnLocalZ: -60,
  showWeaponArc: true,
};

let currentShipDebugTuning: ShipDebugTuning = {
  ...DEFAULT_SHIP_DEBUG_TUNING,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function getShipDebugTuning(): Readonly<ShipDebugTuning> {
  return currentShipDebugTuning;
}

export function applyShipDebugTuning(patch: Partial<ShipDebugTuning>): Readonly<ShipDebugTuning> {
  const next: ShipDebugTuning = {
    spriteScale: clamp(
      patch.spriteScale ?? currentShipDebugTuning.spriteScale,
      0.2,
      8,
    ),
    aimOriginLocalZ: clamp(
      patch.aimOriginLocalZ ?? currentShipDebugTuning.aimOriginLocalZ,
      -80,
      80,
    ),
    shipPivotLocalZ: clamp(
      patch.shipPivotLocalZ ?? currentShipDebugTuning.shipPivotLocalZ,
      -80,
      80,
    ),
    cameraPivotLocalZ: clamp(
      patch.cameraPivotLocalZ ?? currentShipDebugTuning.cameraPivotLocalZ,
      -80,
      80,
    ),
    artillerySpawnLocalZ: clamp(
      patch.artillerySpawnLocalZ ?? currentShipDebugTuning.artillerySpawnLocalZ,
      -80,
      80,
    ),
    mineSpawnLocalZ: clamp(
      patch.mineSpawnLocalZ ?? currentShipDebugTuning.mineSpawnLocalZ,
      -140,
      20,
    ),
    wakeSpawnLocalZ: clamp(
      patch.wakeSpawnLocalZ ?? currentShipDebugTuning.wakeSpawnLocalZ,
      -120,
      40,
    ),
    showWeaponArc:
      typeof patch.showWeaponArc === "boolean"
        ? patch.showWeaponArc
        : currentShipDebugTuning.showWeaponArc,
  };
  currentShipDebugTuning = next;
  return currentShipDebugTuning;
}
