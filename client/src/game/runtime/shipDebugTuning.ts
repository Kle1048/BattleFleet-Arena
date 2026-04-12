import { normalizeShipClassId, SHIP_CLASS_FAC } from "@battlefleet/shared";
import { getEffectiveHullProfile } from "./shipProfileRuntime";

export type ShipDebugTuning = {
  spriteScale: number;
  aimOriginLocalZ: number;
  shipPivotLocalZ: number;
  cameraPivotLocalZ: number;
  artillerySpawnLocalZ: number;
  mineSpawnLocalZ: number;
  wakeSpawnLocalZ: number;
  /** Zusatz zu GLB-Rumpf-Y (negativ = tiefer ins Wasser / weniger „Schweben“). */
  gltfHullYOffset: number;
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
  gltfHullYOffset: -470,
  showWeaponArc: true,
};

let currentShipDebugTuning: ShipDebugTuning = {
  ...DEFAULT_SHIP_DEBUG_TUNING,
};

/** Debug-Slider „GLB Rumpf Y“ — großer Bereich für falsch ausgerichtete GLBs. */
export const GLTF_HULL_Y_OFFSET_MIN = -6000;
export const GLTF_HULL_Y_OFFSET_MAX = 4000;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function getShipDebugTuning(): Readonly<ShipDebugTuning> {
  return currentShipDebugTuning;
}

/**
 * Volles Tuning inkl. klassenspezifischer Rumpf-Defaults (selten nötig — Hot Path nutzt
 * `applyShipVisualRuntimeTuning` ohne zusätzliches Objekt).
 */
export function getShipDebugTuningForVisualClass(shipClassId: unknown): Readonly<ShipDebugTuning> {
  const user = getShipDebugTuning();
  const o = getEffectiveHullProfile(normalizeShipClassId(shipClassId ?? SHIP_CLASS_FAC))?.clientVisualTuningDefaults;
  if (!o || (o.spriteScale === undefined && o.gltfHullYOffset === undefined)) return user;
  return {
    ...user,
    spriteScale: o.spriteScale ?? user.spriteScale,
    gltfHullYOffset: o.gltfHullYOffset ?? user.gltfHullYOffset,
  };
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
    gltfHullYOffset: clamp(
      patch.gltfHullYOffset ?? currentShipDebugTuning.gltfHullYOffset,
      GLTF_HULL_Y_OFFSET_MIN,
      GLTF_HULL_Y_OFFSET_MAX,
    ),
    showWeaponArc:
      typeof patch.showWeaponArc === "boolean"
        ? patch.showWeaponArc
        : currentShipDebugTuning.showWeaponArc,
  };
  currentShipDebugTuning = next;
  return currentShipDebugTuning;
}
