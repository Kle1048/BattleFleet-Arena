import { PlayerLifeState } from "../playerLife";
import type { BotPlayerList, BotVisibleMissile, BotVisibleTorpedo, PerceptionSnapshot } from "./types";

export function observeWorld(
  now: number,
  playerList: BotPlayerList,
  mySessionId: string,
  missileList: readonly BotVisibleMissile[],
  torpedoList: readonly BotVisibleTorpedo[],
  operationalHalfExtent: number,
): PerceptionSnapshot | null {
  let self = null as PerceptionSnapshot["self"] | null;
  const enemies: PerceptionSnapshot["enemies"] = [];
  for (const p of playerList) {
    if (p.lifeState === PlayerLifeState.AwaitingRespawn) continue;
    if (p.id === mySessionId) {
      self = p;
    } else {
      enemies.push(p);
    }
  }
  if (!self) return null;
  return {
    timestamp: now,
    operationalHalfExtent,
    self,
    enemies,
    missiles: missileList.filter((m) => m.ownerId !== mySessionId),
    torpedoes: torpedoList.filter((t) => t.ownerId !== mySessionId),
  };
}
