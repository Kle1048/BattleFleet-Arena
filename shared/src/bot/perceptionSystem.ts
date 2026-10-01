import { PlayerLifeState } from "../playerLife";
import { PROJECTILE_DETECTION_RANGE, esmDetectionRange, canIdentifyShip } from "../sensors";
import type {
  BotPlayerList,
  BotVisibleMissile,
  BotVisibleTorpedo,
  PerceptionSnapshot,
} from "./types";

export function observeWorld(
  now: number,
  playerList: BotPlayerList,
  mySessionId: string,
  missileList: readonly BotVisibleMissile[],
  torpedoList: readonly BotVisibleTorpedo[],
  operationalHalfExtent: number,
): PerceptionSnapshot | null {
  const players = [...playerList];
  const self = players.find(p => p.id === mySessionId && p.lifeState !== PlayerLifeState.AwaitingRespawn);
  if (!self) return null;
  const enemies: PerceptionSnapshot["enemies"] = [];
  const esmBearings: NonNullable<PerceptionSnapshot["esmBearings"]> = [];
  for (const p of players) {
    if (p.lifeState === PlayerLifeState.AwaitingRespawn) continue;
    if (p.id === mySessionId) continue;
    const distance = Math.hypot(p.x - self.x, p.z - self.z);
    if (canIdentifyShip(self, p)) enemies.push({ ...p });
    if (p.radarActive !== false && distance <= esmDetectionRange(p.shipClass)) {
      esmBearings.push({ id: p.id, bearingRad: Math.atan2(p.x - self.x, p.z - self.z) });
    }
  }
  const missiles: BotVisibleMissile[] = [];
  for (let i = 0; i < missileList.length; i++) {
    const m = missileList[i];
    if (m && m.ownerId !== mySessionId && Math.hypot(m.x - self.x, m.z - self.z) <= PROJECTILE_DETECTION_RANGE) missiles.push({ ...m });
  }
  const torpedoes: BotVisibleTorpedo[] = [];
  for (let i = 0; i < torpedoList.length; i++) {
    const t = torpedoList[i];
    if (t && t.ownerId !== mySessionId && self.radarActive !== false &&
        Math.hypot(t.x - self.x, t.z - self.z) <= PROJECTILE_DETECTION_RANGE) torpedoes.push({ ...t });
  }
  return {
    timestamp: now,
    operationalHalfExtent,
    self: { ...self },
    enemies,
    esmBearings,
    missiles,
    torpedoes,
  };
}
