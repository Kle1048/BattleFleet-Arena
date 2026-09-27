import type { GameEventMap } from "@battlefleet/shared/protocol";

/** Old replay frames can omit mount identity; never guess a different mount for them. */
export type ArtilleryFired = Omit<GameEventMap["artyFired"], "slotId" | "fromY"> & { slotId?: string; fromY?: number };
export type ArtilleryImpact = Omit<GameEventMap["artyImpact"], "kind"> & {
  /** Older senders can omit an impact kind. Keep the existing FX fallback. */
  kind?: GameEventMap["artyImpact"]["kind"];
};
export type WeaponImpact = { x: number; z: number; kind: string };
export type MissileFired = GameEventMap["aswmFired"];
export type AirDefenseLayer = GameEventMap["airDefenseFire"]["layer"];
export type AirDefenseNotice = {
  x: number;
  z: number;
  layer: AirDefenseLayer;
  defenderX: number | null;
  defenderZ: number | null;
  defenderId: string | null;
  missileId: number | null;
  slotId?: string;
  fromX?: number;
  fromY?: number;
  fromZ?: number;
};

/** Owned, normalized values, not Room callbacks. Match/life transitions come from the read model. */
export type MatchPresentationEvent =
  | { type: "artyFired"; payload: ArtilleryFired }
  | { type: "artyImpact"; payload: ArtilleryImpact }
  | { type: "aswmFired"; payload: { ownerId: string } & Partial<MissileFired> }
  | { type: "torpedoFired"; payload: { ownerId: string } }
  | { type: "aswmImpact" | "torpedoImpact"; payload: WeaponImpact }
  | { type: "airDefenseFire" | "airDefenseIntercept"; payload: AirDefenseNotice }
  | { type: "collisionContact"; payload: GameEventMap["collisionContact"] }
  | { type: "softkillResult"; payload: GameEventMap["softkillResult"] }
  | { type: "missileLockOn" | "aswmMagazineReloaded" };

/** Renderer input stays in world coordinates. Mirroring belongs only to the render boundary. */
export type AirDefenseFireRequest = {
  layer: AirDefenseLayer;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  launchY?: number;
  trackedMissileId?: number;
};

export interface AirDefenseOutput {
  fire(request: AirDefenseFireRequest): void;
  intercept(x: number, z: number, layer: AirDefenseLayer): void;
}
