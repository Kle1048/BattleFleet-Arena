import type { MissileValues, PlayerValues, TorpedoValues, WreckValues } from "@battlefleet/shared/protocol";

export type PlayerView = Readonly<PlayerValues>;
export type MissileView = Readonly<MissileValues>;
export type TorpedoView = Readonly<TorpedoValues>;
export type WreckView = Readonly<WreckValues>;

/**
 * Session-owned, normalized presentation data, updated at network-patch cadence.
 * Collections and surviving entity identities are stable. Borrow only synchronously:
 * interpolation history / asynchronous work must take their own value snapshots.
 */
export interface BattleReadModel {
  readonly playerList: readonly PlayerView[];
  readonly playersById: ReadonlyMap<string, PlayerView>;
  readonly missileList: readonly MissileView[];
  readonly missilesById: ReadonlyMap<number, MissileView>;
  readonly torpedoList: readonly TorpedoView[];
  readonly wreckList: readonly WreckView[];
  readonly matchPhase: string;
  readonly matchRemainingSec: number;
  readonly operationalAreaHalfExtent: number;
  readonly islandsEnabled: boolean;
  readonly stateSyncCount: number;
}

export interface BattleStateObserver {
  onPlayerAdded?(player: PlayerView): void;
  onPlayerRemoved?(player: PlayerView): void;
  /** All collections and scalars have been projected before this callback runs. */
  onState?(receivedAtMs: number): void;
}

export interface BattleStateSource {
  readonly model: BattleReadModel;
  /** No replay: callers hydrate from model, then subscribe for subsequent patches. */
  subscribe(observer: BattleStateObserver): () => void;
}
