import type { ShipClassId } from "@battlefleet/shared/rules";

/** Plain presentation output shared by the frame builder and DOM view.
 * Neither side imports the other's implementation; a field has one contract. */
export type RadarBlipNorm = { nx: number; ny: number; designated?: boolean };

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

export type CockpitHudUpdate = {
  targetStatus?: { name: string; shipClass: string; canEngage: boolean };
  gunStatus?: { autofire: boolean; inRange: boolean | null; inArc: boolean | null };
  airDefense?: { system: "CIWS" | "PDMS" | "SAM" | "SOFTKILL"; status: "Active" | "Cooldown" | "Radar off" | "Offline" | "—" }[];
  scoreboard?: { id: string; name: string; shipClass: string; shipClassId: ShipClassId; rank: string; level: number; score: number; kills: number; isMe: boolean }[];
  speed: number;
  maxSpeed: number;
  headingRad: number;
  /** Welt XZ — Kartenmitte-Marker auf dem Nord-Radar. */
  worldX: number;
  worldZ: number;
  /** Hauptgeschütz-Richtung relativ Bug (Train). */
  mainMountTrainRad: number;
  /** Magazin-Kapazität / Seite (Profil). */
  aswmMagPortCap: number;
  aswmMagStarboardCap: number;
  /** Server: verbleibende Runden. */
  aswmRemainingPort: number;
  aswmRemainingStarboard: number;
  hp: number;
  maxHp: number;
  primaryCooldownSec: number;
  secondaryCooldownSec: number;
  torpedoCooldownSec: number;
  mineCount: number;
  mineMaxCount: number;
  respawnCountdownSec: number;
  spawnProtectionSec: number;
  matchRemainingSec: number;
  score: number;
  kills: number;
  rankLabelEn: string;
  xpLine: string;
  shipClassLabel: string;
  playerDisplayName: string;
  shipClassId: ShipClassId;
  radarBlips: RadarBlipNorm[];
  radarVisible: boolean;
  ownRadarActive: boolean;
  esmLines: CockpitEsmLine[];
  /** Hostile ASuM — Peilung (gestrichelt / durchgezogen je nach Lock). */
  radarThreatLines: CockpitRadarThreatLine[];
  /** Feste SSM-Rails — kurze Peiler-Ticks (Nord oben). */
  ssmRailLines: CockpitSsmRailLine[];
};
