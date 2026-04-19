/**
 * Zentrales quadratisches „Sea Control“-Gebiet (Kartenmitte).
 * Spieler in der Zone erhalten **mehrfachen** passiven Score-Tick (Server `match.ts`).
 */

import { AREA_OF_OPERATIONS_HALF_EXTENT } from "./mapBounds";

/**
 * Halbe Kantenlänge des Quadrats in Welt-XZ (|x|,|z| ≤ half).
 * Muss kleiner als `AREA_OF_OPERATIONS_HALF_EXTENT` sein.
 */
export const SEA_CONTROL_ZONE_HALF_EXTENT = 420;

/** Multiplikator für passives XP in der Zone (Server). */
export const SEA_CONTROL_XP_MULTIPLIER = 5;

export function assertSeaControlZoneFitsMap(): void {
  if (SEA_CONTROL_ZONE_HALF_EXTENT > AREA_OF_OPERATIONS_HALF_EXTENT) {
    throw new Error("SEA_CONTROL_ZONE_HALF_EXTENT must be <= AREA_OF_OPERATIONS_HALF_EXTENT");
  }
}

/** True, wenn (x,z) im Sea-Control-Quadrat um den Ursprung liegt. */
export function isInSeaControlZone(x: number, z: number): boolean {
  const h = SEA_CONTROL_ZONE_HALF_EXTENT;
  return Math.abs(x) <= h && Math.abs(z) <= h;
}

assertSeaControlZoneFitsMap();
