/** Existing wire event names and payloads; this file contains no transport implementation. */
type Empty = Record<string, never>;
type Impact = { x: number; z: number; kind: "water" | "hit" | "island" | "oob" };
type AirDefenseEvent = {
  weapon: "aswm"; id: number; defenderId: string; defenderX: number; defenderZ: number;
  layer: "sam" | "pd" | "ciws"; x: number; z: number;
};

export interface GameEventMap {
  artyFired: { shellId: number; ownerId: string; fromX: number; fromZ: number; toX: number; toZ: number; flightMs: number };
  artyImpact: { shellId: number; x: number; z: number; kind: "water" | "hit" | "island" };
  aswmFired: { missileId: number; ownerId: string };
  aswmImpact: Impact & { missileId: number };
  torpedoFired: { torpedoId: number; ownerId: string };
  torpedoImpact: Impact & { torpedoId: number };
  airDefenseFire: AirDefenseEvent;
  airDefenseIntercept: AirDefenseEvent;
  collisionContact: { kind: "island" | "ship" };
  missileLockOn: Empty;
  aswmMagazineReloaded: Empty;
  softkillResult: { success: boolean };
  matchEnded: Empty;
  matchRestarted: Empty;
}

/** Recipient is an internal participant ID, never supplied by a player command. */
export type GameEvent = {
  [K in keyof GameEventMap]: { type: K; payload: GameEventMap[K]; recipient: string | null }
}[keyof GameEventMap];

export interface GameEventSink {
  broadcast<K extends keyof GameEventMap>(type: K, payload: GameEventMap[K]): void;
  send<K extends keyof GameEventMap>(recipient: string, type: K, payload: GameEventMap[K]): void;
}
