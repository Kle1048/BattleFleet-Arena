import type { PlayerValues } from "@battlefleet/shared/protocol";
import type { ParticipantState } from "./ParticipantState.js";

/** Stable, synchronously borrowed views; subsystems never copy the world for a tick. */
export type CombatParticipants = {
  players: ReadonlyMap<string, PlayerValues>;
  simulations: ReadonlyMap<string, ParticipantState>;
};
export interface ReadSequence<T> extends Iterable<T> {
  readonly length: number;
  at(index: number): T | undefined;
}
export interface MutableSequence<T> extends ReadSequence<T> {
  push(value: T): unknown;
  deleteAt(index: number): unknown;
}
