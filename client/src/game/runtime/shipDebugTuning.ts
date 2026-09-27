
export type ShipDebugTuning = {
  cameraPivotLocalZ: number;
  mineSpawnLocalZ: number;
  /** Zusatz zum Heck der Hitbox (min Z der AABB); negativ = weiter achtern — siehe Wake. */
  /** Zusatz zu GLB-Rumpf-Y (negativ = tiefer ins Wasser / weniger „Schweben“). */
  showWeaponArc: boolean;
  /** Lokaler Spieler: konzentrische 100-m-Abstandsringe (Luftverteidigung / Reichweiten-Debug). */
  showRangeRings: boolean;
  /** Debug-Linien von Geschütz-Mounts zum Zielpunkt (Maus / Aim). */
  showMountAimLines: boolean;
  /** Welt: Insel-Kollisions-Polygone (shared, konvex) als Umriss. */
  showIslandCollisionPolygons: boolean;
};

export const DEFAULT_SHIP_DEBUG_TUNING: Readonly<ShipDebugTuning> = {
  cameraPivotLocalZ: 0.4,
  mineSpawnLocalZ: -22,
  showWeaponArc: false,
  showRangeRings: false,
  showMountAimLines: false,
  showIslandCollisionPolygons: false,
};

let currentShipDebugTuning: ShipDebugTuning = {
  ...DEFAULT_SHIP_DEBUG_TUNING,
};

/** Erhöht sich bei jedem `applyShipDebugTuning` — für bedingtes Neu-Anwenden auf Meshes. */
let shipDebugTuningGeneration = 0;

export function getShipDebugTuningGeneration(): number {
  return shipDebugTuningGeneration;
}


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
export function getShipDebugTuningForVisualClass(_shipClassId: unknown): Readonly<ShipDebugTuning> {
  return currentShipDebugTuning;
}

export function applyShipDebugTuning(patch: Partial<ShipDebugTuning>): Readonly<ShipDebugTuning> {
  const next: ShipDebugTuning = {
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
    showIslandCollisionPolygons:
      typeof patch.showIslandCollisionPolygons === "boolean"
        ? patch.showIslandCollisionPolygons
        : currentShipDebugTuning.showIslandCollisionPolygons,
  };
  currentShipDebugTuning = next;
  shipDebugTuningGeneration += 1;
  return currentShipDebugTuning;
}
