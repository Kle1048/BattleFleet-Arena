/**
 * Zentrales quadratisches „Sea Control“-Gebiet (Kartenmitte).
 * Spieler in der Zone erhalten **mehrfachen** passiven Score-Tick (Server `match.ts`).
 */

import { OPERATIONAL_AREA_HALF_EXTENT_MIN } from "./mapBounds";

/**
 * Halbe Kantenlänge des Quadrats in Welt-XZ (|x|,|z| ≤ half).
 * Muss kleiner als die **kleinste** AO-Halbkante sein (damit die Zone bei wenigen Spielern gültig bleibt).
 */
export const SEA_CONTROL_ZONE_HALF_EXTENT = 420;

/** Multiplikator für passives XP in der Zone (Server). */
export const SEA_CONTROL_XP_MULTIPLIER = 5;

export function assertSeaControlZoneFitsMap(): void {
  if (SEA_CONTROL_ZONE_HALF_EXTENT > OPERATIONAL_AREA_HALF_EXTENT_MIN) {
    throw new Error("SEA_CONTROL_ZONE_HALF_EXTENT must be <= OPERATIONAL_AREA_HALF_EXTENT_MIN");
  }
}

/** True, wenn (x,z) im Sea-Control-Quadrat um den Ursprung liegt. */
export function isInSeaControlZone(x: number, z: number): boolean {
  const h = SEA_CONTROL_ZONE_HALF_EXTENT;
  return Math.abs(x) <= h && Math.abs(z) <= h;
}

assertSeaControlZoneFitsMap();
