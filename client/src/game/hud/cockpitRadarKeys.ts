import type { RadarBlipNorm } from "./radarHudMath";

export type CockpitEsmLine = { x1: number; y1: number; x2: number; y2: number };

/** Stabiler String zum Erkennen von Änderungen am Plan-Radar (kein DOM-Rebuild bei gleichem Kontaktbild). */
export function cockpitRadarBlipsKey(blips: readonly RadarBlipNorm[]): string {
  if (blips.length === 0) return "";
  return blips.map((b) => `${b.nx.toFixed(3)}_${b.ny.toFixed(3)}`).join("|");
}

export function cockpitRadarEsmKey(lines: readonly CockpitEsmLine[]): string {
  if (lines.length === 0) return "";
  return lines.map((l) => `${l.x1.toFixed(2)}_${l.y1.toFixed(2)}_${l.x2.toFixed(2)}_${l.y2.toFixed(2)}`).join("|");
}
