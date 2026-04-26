import { PlayerLifeState } from "../playerLife";
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
  const missiles: BotVisibleMissile[] = [];
  for (let i = 0; i < missileList.length; i++) {
    const m = missileList[i];
    if (m && m.ownerId !== mySessionId) missiles.push(m);
  }
  const torpedoes: BotVisibleTorpedo[] = [];
  for (let i = 0; i < torpedoList.length; i++) {
    const t = torpedoList[i];
    if (t && t.ownerId !== mySessionId) torpedoes.push(t);
  }
  return {
    timestamp: now,
    operationalHalfExtent,
    self,
    enemies,
    missiles,
    torpedoes,
  };
}
