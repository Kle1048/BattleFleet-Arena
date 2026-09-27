import type { ArraySchema, Schema } from "@colyseus/schema";
import { BattleState, PlayerState, MissileState, TorpedoState, ShipWreckState } from "@battlefleet/shared/protocol/schema";
import type { PlayerValues, MissileValues, TorpedoValues, WreckValues } from "@battlefleet/shared/protocol";
import { playerFields, missileFields, torpedoFields, wreckFields } from "@battlefleet/shared/protocol";
import type { SimulationState } from "../simulation/SimulationState.js";


type Entry<T, S> = { source: T; target: S; seen: number };

/** One-way incremental projection: never lends schema objects back to the simulation. */
class SequencePublisher<T extends object, S extends Schema & T, K> {
  private readonly entries = new Map<K, Entry<T, S>>();
  private revision = 0;
  constructor(private readonly target: ArraySchema<S>, private readonly create: () => S,
    private readonly key: (value: T) => K, private readonly fields: readonly (keyof T)[]) {}

  publish(source: Iterable<T>): void {
    const revision = ++this.revision;
    for (const value of source) {
      const key = this.key(value);
      let entry = this.entries.get(key);
      // Remove/rejoin must replace identity even when a session ID is reused.
      if (entry && entry.source !== value) {
        const index = this.target.indexOf(entry.target);
        if (index >= 0) this.target.deleteAt(index);
        this.entries.delete(key);
        entry = undefined;
      }
      if (!entry) {
        entry = { source: value, target: this.create(), seen: revision };
        this.entries.set(key, entry);
        this.copy(value, entry.target);
        this.target.push(entry.target);
      } else {
        entry.seen = revision;
        this.copy(value, entry.target);
      }
    }
    // Reverse removal preserves list order. No full snapshots or temporary maps per publish.
    for (let i = this.target.length - 1; i >= 0; i--) {
      const value = this.target.at(i)!;
      const key = this.key(value);
      if (this.entries.get(key)?.seen !== revision) {
        this.target.deleteAt(i);
        this.entries.delete(key);
      }
    }
  }

  private copy(source: T, target: S): void {
    // Schema's index signature obscures the structural value type from TypeScript.
    const values = target as unknown as T;
    for (const key of this.fields) {
      if (values[key] !== source[key]) values[key] = source[key];
    }
  }
}

/** Sole production writer of replicated values, called after each synchronous simulation operation. */
export class SchemaPublisher {
  private readonly players;
  private readonly missiles;
  private readonly torpedoes;
  private readonly wrecks;
  constructor(private readonly target: BattleState) {
    this.players = new SequencePublisher<PlayerValues, PlayerState, string>(target.playerList,
      () => new PlayerState(), p => p.id, playerFields);
    this.missiles = new SequencePublisher<MissileValues, MissileState, number>(target.missileList,
      () => new MissileState(), m => m.missileId, missileFields);
    this.torpedoes = new SequencePublisher<TorpedoValues, TorpedoState, number>(target.torpedoList,
      () => new TorpedoState(), t => t.torpedoId, torpedoFields);
    this.wrecks = new SequencePublisher<WreckValues, ShipWreckState, string>(target.wreckList,
      () => new ShipWreckState(), w => w.wreckId, wreckFields);
  }

  publish(source: SimulationState): void {
    this.players.publish(source.playerList);
    this.missiles.publish(source.missileList);
    this.torpedoes.publish(source.torpedoList);
    this.wrecks.publish(source.wreckList);
    this.target.matchPhase = source.matchPhase;
    this.target.matchRemainingSec = source.matchRemainingSec;
    this.target.operationalAreaHalfExtent = source.operationalAreaHalfExtent;
    this.target.islandsEnabled = source.islandsEnabled;
  }
}
