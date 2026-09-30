import { ARTILLERY_ARC_HALF_ANGLE_RAD } from "../artillery";
import {
  BOT_ASWM_MAX_BORE_YAW_ERR_RAD,
  minFixedSeaSkimmerLauncherYawErrorRad,
} from "../aswmShipAim";
import { isInSeaControlZone } from "../seaControl";
import type { BotMemory, PerceptionSnapshot, TacticalContext } from "./types";

function wrapPi(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function distSq(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function orient(snapshot: PerceptionSnapshot, memory: BotMemory): TacticalContext {
  const self = snapshot.self;
  let bestTargetId: string | null = null;
  let closestEnemyDistSq = Infinity;
  let bestScore = Infinity;
  for (const e of snapshot.enemies) {
    const d2 = distSq(self.x, self.z, e.x, e.z);
    const profile = snapshot.profile;
    const score = profile && profile !== "standard"
      ? Math.sqrt(d2) + (profile === "aggressive" ? 360 : 160) * e.hp / Math.max(1, e.maxHp)
        - (e.id === memory.lastTargetId ? (profile === "aggressive" ? 280 : 80) : 0)
        - (isInSeaControlZone(e.x, e.z) ? (profile === "objective" ? 300 : 140) : 0)
      : d2;
    if (score < bestScore) {
      bestScore = score;
      closestEnemyDistSq = d2;
      bestTargetId = e.id;
    }
  }

  const bestEnemy = snapshot.enemies.find((e) => e.id === bestTargetId) ?? null;
  // Stable identity order, never choose passive contacts using their unknown distance.
  const esm = [...(snapshot.esmBearings ?? [])].sort((a, b) => a.id.localeCompare(b.id))[0];
  const bestTargetDistSq: number | null = bestEnemy ? closestEnemyDistSq : null;
  let targetInGunArc = false;
  let targetInMissileArc = false;
  if (bestEnemy) {
    const yawToTarget = Math.atan2(bestEnemy.x - self.x, bestEnemy.z - self.z);
    const rel = Math.abs(wrapPi(yawToTarget - self.headingRad));
    targetInGunArc = rel <= ARTILLERY_ARC_HALF_ANGLE_RAD;
    const boreErr = minFixedSeaSkimmerLauncherYawErrorRad(
      self.shipClass,
      self.x,
      self.z,
      self.headingRad,
      bestEnemy.x,
      bestEnemy.z,
    );
    targetInMissileArc =
      boreErr !== null && boreErr <= BOT_ASWM_MAX_BORE_YAW_ERR_RAD;
  }

  const selfInSeaControlZone = isInSeaControlZone(self.x, self.z);

  const incomingMissileCount = snapshot.missiles.filter((m) => {
    return distSq(self.x, self.z, m.x, m.z) <= 240 * 240;
  }).length;
  const incomingMissileThreat = incomingMissileCount > 0;

  const hpPercent = self.maxHp > 0 ? self.hp / self.maxHp : 0;
  const enemyPressure = clamp01(snapshot.enemies.length / 4);
  const lowHpPressure = clamp01(1 - hpPercent);
  const missilePressure = clamp01(incomingMissileCount / 3);
  const dangerScore = clamp01(lowHpPressure * 0.45 + enemyPressure * 0.25 + missilePressure * 0.55);
  const aggressionScore = clamp01((1 - dangerScore) * 0.6 + (targetInGunArc ? 0.3 : 0));
  const survivalScore = clamp01(1 - dangerScore + (incomingMissileThreat ? 0.12 : 0));

  let preferredRange: TacticalContext["preferredRange"] = "medium";
  if (hpPercent < 0.35) preferredRange = "long";
  if (hpPercent > 0.75 && snapshot.enemies.length <= 1) preferredRange = "close";

  let situationTag: TacticalContext["situationTag"] = "safe";
  if (hpPercent < 0.25) situationTag = "retreat_needed";
  else if (incomingMissileThreat) situationTag = "missile_threat";
  else if (dangerScore > 0.62) situationTag = "pressure";
  else if (aggressionScore > 0.65) situationTag = "advantage";

  return {
    dangerScore,
    aggressionScore,
    survivalScore,
    bestTargetId,
    esmTargetId: esm?.id ?? null,
    esmBearingRad: esm?.bearingRad ?? null,
    bestTargetDistSq,
    targetInGunArc,
    targetInMissileArc,
    selfInSeaControlZone,
    incomingMissileThreat,
    incomingMissileCount,
    preferredRange,
    situationTag,
  };
}
