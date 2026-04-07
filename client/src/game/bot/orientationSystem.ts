import type { BotMemory, PerceptionSnapshot, TacticalContext } from "./types";

const GUN_ARC_HALF_ANGLE = (40 * Math.PI) / 180;
const MISSILE_ARC_HALF_ANGLE = (65 * Math.PI) / 180;

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

export function orient(snapshot: PerceptionSnapshot, _memory: BotMemory): TacticalContext {
  const self = snapshot.self;
  let bestTargetId: string | null = null;
  let bestTargetDistSq = Infinity;
  for (const e of snapshot.enemies) {
    const d2 = distSq(self.x, self.z, e.x, e.z);
    if (d2 < bestTargetDistSq) {
      bestTargetDistSq = d2;
      bestTargetId = e.id;
    }
  }

  const bestEnemy = snapshot.enemies.find((e) => e.id === bestTargetId) ?? null;
  let targetInGunArc = false;
  let targetInMissileArc = false;
  if (bestEnemy) {
    const yawToTarget = Math.atan2(bestEnemy.x - self.x, bestEnemy.z - self.z);
    const rel = Math.abs(wrapPi(yawToTarget - self.headingRad));
    targetInGunArc = rel <= GUN_ARC_HALF_ANGLE;
    targetInMissileArc = rel <= MISSILE_ARC_HALF_ANGLE;
  }

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
    targetInGunArc,
    targetInMissileArc,
    incomingMissileThreat,
    incomingMissileCount,
    preferredRange,
    situationTag,
  };
}
