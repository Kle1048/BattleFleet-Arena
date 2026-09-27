import { MATCH_DURATION_SEC, MATCH_PHASE_RUNNING, operationalHalfExtentFromParticipantCount } from "@battlefleet/shared/rules";
import type { PlayerValues, MissileValues, TorpedoValues, WreckValues, MatchValues } from "@battlefleet/shared/protocol";
import { ParticipantRegistry } from "./ParticipantRegistry.js";
import type { ParticipantState } from "./ParticipantState.js";
import type { MutableSequence } from "./CombatTypes.js";

/** Ordered domain collection. Removal preserves iteration order, unlike swap-with-last pools. */
export class EntityList<T> extends Array<T> implements MutableSequence<T> {
  deleteAt(index: number): void { this.splice(index, 1); }
}

/** Canonical domain state. No schema object or network reference may enter this graph. */
export class SimulationState implements MatchValues {
  readonly participants = new ParticipantRegistry<PlayerValues, ParticipantState>();
  readonly playerList = this.participants.ordered;
  readonly missileList = new EntityList<MissileValues>();
  readonly torpedoList = new EntityList<TorpedoValues>();
  readonly wreckList = new EntityList<WreckValues>();
  matchPhase: string = MATCH_PHASE_RUNNING;
  islandsEnabled = true;
  matchRemainingSec = MATCH_DURATION_SEC;
  operationalAreaHalfExtent = operationalHalfExtentFromParticipantCount(0);
}
