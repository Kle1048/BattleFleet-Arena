import type { RadarBlipNorm, CockpitEsmLine, CockpitRadarThreatLine, CockpitSsmRailLine } from "../presentation/CockpitModel";
export type { CockpitEsmLine, CockpitRadarThreatLine, CockpitSsmRailLine } from "../presentation/CockpitModel";

/** Stabiler String zum Erkennen von Änderungen am Plan-Radar (kein DOM-Rebuild bei gleichem Kontaktbild). */
export function cockpitRadarBlipsKey(blips: readonly RadarBlipNorm[]): string {
  if (blips.length === 0) return "";
  return blips.map((b) => `${b.nx.toFixed(3)}_${b.ny.toFixed(3)}`).join("|");
}

export function cockpitRadarEsmKey(lines: readonly CockpitEsmLine[]): string {
  if (lines.length === 0) return "";
  return lines
    .map(
      (l) =>
        `${l.x1.toFixed(2)}_${l.y1.toFixed(2)}_${l.x2.toFixed(2)}_${l.y2.toFixed(2)}_${l.stroke ?? ""}`,
    )
    .join("|");
}

export function cockpitRadarThreatKey(lines: readonly CockpitRadarThreatLine[]): string {
  if (lines.length === 0) return "";
  return lines
    .map(
      (l) =>
        `${l.x1.toFixed(2)}_${l.y1.toFixed(2)}_${l.x2.toFixed(2)}_${l.y2.toFixed(2)}_${l.dashed ? "d" : "s"}`,
    )
    .join("|");
}

export function cockpitRadarSsmRailsKey(lines: readonly CockpitSsmRailLine[]): string {
  if (lines.length === 0) return "";
  return lines
    .map(
      (l) =>
        `${l.x1.toFixed(2)}_${l.y1.toFixed(2)}_${l.x2.toFixed(2)}_${l.y2.toFixed(2)}_${l.stroke ?? ""}`,
    )
    .join("|");
}
