/**
 * Passive ESM: Detektionsreichweite der Gegner-Radaremission skaliert mit Schiffsklasse
 * (kleineres FAC kürzer, Zerstörer +50 % vs. FAC, Kreuzer 2× FAC).
 */

import {
  SHIP_CLASS_CRUISER,
  SHIP_CLASS_DESTROYER,
  SHIP_CLASS_FAC,
  type ShipClassId,
  normalizeShipClassId,
} from "./shipClass";

/** Relativ zu FAC (= 1): Zerstörer +50 %, Kreuzer 2× Reichweite. */
export const ESM_DETECTION_RANGE_MUL: Record<ShipClassId, number> = {
  [SHIP_CLASS_FAC]: 1,
  [SHIP_CLASS_DESTROYER]: 1.5,
  [SHIP_CLASS_CRUISER]: 2,
};

export function esmDetectionRangeMul(shipClass: unknown): number {
  const id = normalizeShipClassId(shipClass);
  return ESM_DETECTION_RANGE_MUL[id] ?? ESM_DETECTION_RANGE_MUL[SHIP_CLASS_FAC];
}

/**
 * SVG/CSS-Streifenfarbe pro Emitter-Klasse (Simulation verschiedener Radaranlagen).
 */
export const ESM_EMITTER_STROKE_CSS: Record<ShipClassId, string> = {
  [SHIP_CLASS_FAC]: "#22d3ee",
  [SHIP_CLASS_DESTROYER]: "#fbbf24",
  [SHIP_CLASS_CRUISER]: "#c084fc",
};

export function esmEmitterStrokeCss(shipClass: unknown): string {
  const id = normalizeShipClassId(shipClass);
  return ESM_EMITTER_STROKE_CSS[id] ?? ESM_EMITTER_STROKE_CSS[SHIP_CLASS_FAC];
}
