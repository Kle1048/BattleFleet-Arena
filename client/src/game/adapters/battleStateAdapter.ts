import type { BattleState } from "@battlefleet/shared/protocol/schema";
import {
  playerFields, missileFields, torpedoFields, wreckFields,
  type PlayerValues, type MissileValues, type TorpedoValues, type WreckValues,
} from "@battlefleet/shared/protocol";
import { MATCH_DURATION_SEC, operationalHalfExtentFromParticipantCount } from "@battlefleet/shared/rules";
import type { BattleStateObserver, BattleStateSource } from "../presentation/BattleReadModel";
import { createRoomSignalScope, type RoomLeaveSignal } from "./roomSignalScope";

type StateRoom = {
  readonly state: BattleState;
  onLeave: RoomLeaveSignal;
  onStateChange: {
    (callback: () => void): unknown;
    remove(callback: () => void): void;
  };
};

/** Maintains owned scalar objects, never leaking a Schema or its callbacks to presentation. */
class ReadCollection<T extends object, K> {
  readonly list: T[] = [];
  readonly byId = new Map<K, T>();
  private readonly sources = new Map<K, T>();
  private readonly seen = new Set<K>();
  private previousCollection: Iterable<T> | undefined;
  readonly added: T[] = [];
  readonly removed: T[] = [];

  constructor(private readonly key: (value: T) => K, private readonly fields: readonly (keyof T)[]) {}

  sync(source: Iterable<T>): void {
    const snapshotReplaced = source !== this.previousCollection;
    this.previousCollection = source;
    this.seen.clear();
    this.added.length = this.removed.length = 0;
    let index = 0;
    for (const value of source) {
      const id = this.key(value);
      this.seen.add(id);
      let target = this.byId.get(id);
      if (!target || (!snapshotReplaced && this.sources.get(id) !== value)) {
        // Rejoining with a reused ID must not retain old interpolation or presentation identity.
        if (target) this.removed.push(target);
        target = {} as T;
        this.byId.set(id, target);
        this.added.push(target);
      }
      // A full snapshot rebind is not a leave/rejoin: preserve surviving IDs and do not reannounce.
      this.sources.set(id, value);
      for (const field of this.fields) {
        if (target[field] !== value[field]) target[field] = value[field];
      }
      this.list[index++] = target;
    }
    this.list.length = index;
    for (const [id, target] of this.byId) {
      if (this.seen.has(id)) continue;
      this.removed.push(target);
      this.byId.delete(id);
      this.sources.delete(id);
    }
  }

  clear(): void {
    this.list.length = this.added.length = this.removed.length = 0;
    this.byId.clear();
    this.sources.clear();
    this.seen.clear();
    this.previousCollection = undefined;
  }
}

/** One projection per received state, no frame polling or full-world snapshots. */
export function createBattleStateAdapter(room: StateRoom, now: () => number): BattleStateSource & { dispose(): void } {
  const players = new ReadCollection<PlayerValues, string>(p => p.id, playerFields);
  const missiles = new ReadCollection<MissileValues, number>(m => m.missileId, missileFields);
  const torpedoes = new ReadCollection<TorpedoValues, number>(t => t.torpedoId, torpedoFields);
  const wrecks = new ReadCollection<WreckValues, string>(w => w.wreckId, wreckFields);
  const model = {
    playerList: players.list, playersById: players.byId,
    missileList: missiles.list, missilesById: missiles.byId,
    torpedoList: torpedoes.list, wreckList: wrecks.list,
    matchPhase: "running", matchRemainingSec: MATCH_DURATION_SEC,
    operationalAreaHalfExtent: operationalHalfExtentFromParticipantCount(0), stateSyncCount: 0,
  };
  const observers = new Set<BattleStateObserver>();
  let disposed = false;

  const project = (): void => {
    // Re-read all collection references: a full ROOM_STATE may replace ArraySchema instances.
    const state = room.state;
    players.sync(state.playerList);
    missiles.sync(state.missileList ?? []);
    torpedoes.sync(state.torpedoList ?? []);
    wrecks.sync(state.wreckList ?? []);
    model.matchPhase = typeof state.matchPhase === "string" ? state.matchPhase : "running";
    model.matchRemainingSec = Number.isFinite(state.matchRemainingSec) ? state.matchRemainingSec : MATCH_DURATION_SEC;
    const extent = state.operationalAreaHalfExtent;
    model.operationalAreaHalfExtent = Number.isFinite(extent) && extent > 0
      ? extent : operationalHalfExtentFromParticipantCount(players.list.length);
  };
  const onState = (): void => {
    if (disposed) return;
    const receivedAt = now();
    project();
    model.stateSyncCount++;
    // Notify only after a coherent projection; removal precedes re-add of the same ID.
    for (const player of players.removed) for (const observer of observers) observer.onPlayerRemoved?.(player);
    for (const player of players.added) for (const observer of observers) observer.onPlayerAdded?.(player);
    for (const observer of observers) observer.onState?.(receivedAt);
  };
  project();
  const signals = createRoomSignalScope(room.onLeave);
  signals.listen(room.onStateChange, onState);

  return {
    model,
    subscribe(observer) {
      if (disposed) return () => {};
      observers.add(observer);
      return () => { observers.delete(observer); };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      signals.dispose();
      observers.clear();
      players.clear(); missiles.clear(); torpedoes.clear(); wrecks.clear();
    },
  };
}
