import type { RadarBlipNorm } from "./radarHudMath";

export type CockpitEsmLine = { x1: number; y1: number; x2: number; y2: number; stroke?: string };

/** ASuM-Bedrohung auf dem Plan-Peiler: gestrichelt vor Lock, durchgezogen bei Lock auf eigenes Schiff. */
export type CockpitRadarThreatLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dashed: boolean;
};

/** Feste SSM-Rail — kurzer Peiler-Tick auf dem Plan-Radar (Nord oben). */
export type CockpitSsmRailLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke?: string;
};

/** Stabiler String zum Erkennen von Änderungen am Plan-Radar (kein DOM-Rebuild bei gleichem Kontaktbild). */
export function cockpitRadarBlipsKey(blips: readonly RadarBlipNorm[]): string {
  if (blips.length === 0) return "";
  return blips.map((b) => `${b.nx.toFixed(3)}_${b.ny.toFixed(3)}`).join("|");
}

export function cockpitRadarPortalMarkersKey(markers: readonly RadarBlipNorm[]): string {
  if (markers.length === 0) return "";
  return markers.map((b) => `${b.nx.toFixed(3)}_${b.ny.toFixed(3)}`).join("|");
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
