import { AD_SAM_RANGE_SQ } from "./airDefense";
import { canTakeArtillerySplashDamage } from "./playerLife";
import { getShipHullProfileByClass } from "./shipProfiles";
import { minDistSqPointToShipHitboxFootprintXZ } from "./shipHitboxCollision";

/**
 * Minimale Spielerdaten für dieselbe „Verteidiger“-Zuordnung wie `BattleRoom.resolveAirDefenseDefenderId`.
 */
export type AirDefensePlayerSnapshot = {
  id: string;
  x: number;
  z: number;
  headingRad: number;
  lifeState: string;
  shipClass: string;
};

export type AirDefenseMissileSnapshot = {
  ownerId: string;
  targetId: string;
  x: number;
  z: number;
};

export function resolveAirDefenseDefenderIdForMissile(
  m: AirDefenseMissileSnapshot,
  players: readonly AirDefensePlayerSnapshot[],
): string | null {
  if (m.targetId !== "") {
    const t = players.find((p) => p.id === m.targetId);
    if (t && canTakeArtillerySplashDamage(t.lifeState)) return m.targetId;
  }
  let best: string | null = null;
  let bestD2 = Infinity;
  for (const pl of players) {
    if (pl.id === m.ownerId) continue;
    if (!canTakeArtillerySplashDamage(pl.lifeState)) continue;
    const hb = getShipHullProfileByClass(pl.shipClass)?.collisionHitbox;
    const d2 = minDistSqPointToShipHitboxFootprintXZ(m.x, m.z, pl.x, pl.z, pl.headingRad, hb);
    if (d2 <= AD_SAM_RANGE_SQ && d2 < bestD2) {
      bestD2 = d2;
      best = pl.id;
    }
  }
  return best;
}

/**
 * Für Layered-Defence-Visual: Flugkörper, der diesen Verteidiger bedroht (gleiche Logik wie Server).
 * Bei mehreren Kandidaten: nächster zum Verteidiger (Schiffsmittelpunkt).
 */
export function pickThreatMissilePositionForDefender(
  missiles: readonly AirDefenseMissileSnapshot[] | null,
  defenderId: string,
  players: readonly AirDefensePlayerSnapshot[],
): { x: number; z: number } | null {
  if (!missiles?.length) return null;
  const def = players.find((p) => p.id === defenderId);
  if (!def) return null;
  let best: { x: number; z: number } | null = null;
  let bestD2 = Infinity;
  for (const m of missiles) {
    if (resolveAirDefenseDefenderIdForMissile(m, players) !== defenderId) continue;
    const dx = m.x - def.x;
    const dz = m.z - def.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = { x: m.x, z: m.z };
    }
  }
  return best;
}
