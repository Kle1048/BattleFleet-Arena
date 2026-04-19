import { normalizeShipClassId, SHIP_CLASS_FAC } from "@battlefleet/shared";
import { getAuthoritativeHullProfile } from "./shipProfileRuntime";

export type ShipDebugTuning = {
  spriteScale: number;
  shipPivotLocalZ: number;
  cameraPivotLocalZ: number;
  mineSpawnLocalZ: number;
  /** Zusatz zum Heck der Hitbox (min Z der AABB); negativ = weiter achtern — siehe Wake. */
  wakeSpawnLocalZ: number;
  /** Zusatz zu GLB-Rumpf-Y (negativ = tiefer ins Wasser / weniger „Schweben“). */
  gltfHullYOffset: number;
  showWeaponArc: boolean;
  /** Lokaler Spieler: konzentrische 100-m-Abstandsringe (Luftverteidigung / Reichweiten-Debug). */
  showRangeRings: boolean;
  /** Debug-Linien von Geschütz-Mounts zum Zielpunkt (Maus / Aim). */
  showMountAimLines: boolean;
};

export const DEFAULT_SHIP_DEBUG_TUNING: Readonly<ShipDebugTuning> = {
  spriteScale: 3,
  shipPivotLocalZ: 23,
  cameraPivotLocalZ: 0.4,
  mineSpawnLocalZ: -22,
  wakeSpawnLocalZ: -1.5,
  gltfHullYOffset: -470,
  showWeaponArc: true,
  showRangeRings: false,
  showMountAimLines: true,
};

let currentShipDebugTuning: ShipDebugTuning = {
  ...DEFAULT_SHIP_DEBUG_TUNING,
};

/** Erhöht sich bei jedem `applyShipDebugTuning` — für bedingtes Neu-Anwenden auf Meshes. */
let shipDebugTuningGeneration = 0;

export function getShipDebugTuningGeneration(): number {
  return shipDebugTuningGeneration;
}

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
  const o = getAuthoritativeHullProfile(normalizeShipClassId(shipClassId ?? SHIP_CLASS_FAC))?.clientVisualTuningDefaults;
  if (
    !o ||
    (o.spriteScale === undefined &&
      o.gltfHullYOffset === undefined &&
      o.gltfHullOffsetX === undefined &&
      o.gltfHullOffsetZ === undefined &&
      o.shipPivotLocalZ === undefined &&
      o.wakeSpawnLocalZ === undefined)
  ) {
    return user;
  }
  return {
    ...user,
    spriteScale: o.spriteScale ?? user.spriteScale,
    gltfHullYOffset: o.gltfHullYOffset ?? user.gltfHullYOffset,
    shipPivotLocalZ: o.shipPivotLocalZ ?? user.shipPivotLocalZ,
    wakeSpawnLocalZ: o.wakeSpawnLocalZ ?? user.wakeSpawnLocalZ,
  };
}

export function applyShipDebugTuning(patch: Partial<ShipDebugTuning>): Readonly<ShipDebugTuning> {
  const next: ShipDebugTuning = {
    spriteScale: clamp(
      patch.spriteScale ?? currentShipDebugTuning.spriteScale,
      0.2,
      8,
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
    mineSpawnLocalZ: clamp(
      patch.mineSpawnLocalZ ?? currentShipDebugTuning.mineSpawnLocalZ,
      -140,
      20,
    ),
    wakeSpawnLocalZ: clamp(
      patch.wakeSpawnLocalZ ?? currentShipDebugTuning.wakeSpawnLocalZ,
      -35,
      30,
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
    showRangeRings:
      typeof patch.showRangeRings === "boolean"
        ? patch.showRangeRings
        : currentShipDebugTuning.showRangeRings,
    showMountAimLines:
      typeof patch.showMountAimLines === "boolean"
        ? patch.showMountAimLines
        : currentShipDebugTuning.showMountAimLines,
  };
  currentShipDebugTuning = next;
  shipDebugTuningGeneration += 1;
  return currentShipDebugTuning;
}
