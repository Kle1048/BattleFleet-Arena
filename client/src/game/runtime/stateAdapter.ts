import type { ArraySchema } from "@colyseus/schema";
import type { MissileState, PlayerState, ShipWreckState, TorpedoState } from "@battlefleet/shared";
import { MATCH_DURATION_SEC, operationalHalfExtentFromParticipantCount } from "@battlefleet/shared";

export type NetPlayer = Pick<
  PlayerState,
  | "id"
  | "x"
  | "z"
  | "headingRad"
  | "speed"
  | "rudder"
  | "aimX"
  | "aimZ"
  | "oobCountdownSec"
  | "hp"
  | "maxHp"
  | "primaryCooldownSec"
  | "lifeState"
  | "respawnCountdownSec"
  | "spawnProtectionSec"
  | "secondaryCooldownSec"
  | "torpedoCooldownSec"
  | "score"
  | "kills"
  | "level"
  | "xp"
  | "shipClass"
  | "displayName"
  | "deathAtMs"
  | "killedBySessionId"
  | "radarActive"
  | "aswmRemainingPort"
  | "aswmRemainingStarboard"
  | "adHudIncomingAswm"
>;

export type NetMissile = Pick<
  MissileState,
  "missileId" | "ownerId" | "targetId" | "x" | "z" | "headingRad"
>;

export type NetTorpedo = Pick<TorpedoState, "torpedoId" | "ownerId" | "x" | "z" | "headingRad">;

type WireBattleState = {
  playerList: ArraySchema<NetPlayer>;
  missileList?: ArraySchema<NetMissile>;
  torpedoList?: ArraySchema<NetTorpedo>;
  wreckList?: ArraySchema<ShipWreckState>;
  matchPhase?: string;
  matchRemainingSec?: number;
  operationalAreaHalfExtent?: number;
};

export function playerListOf(room: { state: unknown }): ArraySchema<NetPlayer> {
  const st = room.state as Partial<WireBattleState> | null | undefined;
  if (!st?.playerList) {
    throw new Error("room.state.playerList fehlt — Snapshot nicht angekommen oder Schema passt nicht.");
  }
  return st.playerList;
}

export function missileListOf(room: { state: unknown }): ArraySchema<NetMissile> | null {
  const st = room.state as Partial<WireBattleState> | null | undefined;
  return st?.missileList ?? null;
}

export function torpedoListOf(room: { state: unknown }): ArraySchema<NetTorpedo> | null {
  const st = room.state as Partial<WireBattleState> | null | undefined;
  return st?.torpedoList ?? null;
}

export function wreckListOf(room: { state: unknown }): ArraySchema<ShipWreckState> | null {
  const st = room.state as Partial<WireBattleState> | null | undefined;
  return st?.wreckList ?? null;
}

export function readMatchTimer(room: { state: unknown }): { phase: string; remainingSec: number } {
  const st = room.state as Partial<WireBattleState> | null | undefined;
  const phase = typeof st?.matchPhase === "string" ? st.matchPhase : "running";
  const raw = st?.matchRemainingSec;
  const remainingSec = typeof raw === "number" && Number.isFinite(raw) ? raw : MATCH_DURATION_SEC;
  return { phase, remainingSec };
}

/** Halbe AO-Kante (m): repliziert, sonst aus `playerList.length` geschätzt. */
export function readOperationalAreaHalfExtent(room: { state: unknown }): number {
  const st = room.state as Partial<WireBattleState> | null | undefined;
  const raw = st?.operationalAreaHalfExtent;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  const n = st?.playerList?.length ?? 0;
  return operationalHalfExtentFromParticipantCount(n);
}

export function getPlayer(
  list: ArraySchema<NetPlayer>,
  sessionId: string,
): NetPlayer | undefined {
  for (const p of list) {
    if (p.id === sessionId) return p;
  }
  return undefined;
}
