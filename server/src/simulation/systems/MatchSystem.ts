import { MATCH_PHASE_ENDED, MATCH_PHASE_RUNNING } from "@battlefleet/shared/rules";
import type { MatchValues } from "@battlefleet/shared/protocol";

/** Owns the round deadline and the exactly-once transition to ended. */
export class MatchSystem {
  private deadlineMs = 0;
  private ended = false;
  private id = "";
  constructor(private readonly state: MatchValues, private readonly nextId: () => string) {}

  get endsAtMs(): number { return this.deadlineMs; }
  get matchId(): string { return this.id; }

  start(nowMs: number, durationMs: number, publishRemaining: boolean): void {
    this.id = this.nextId();
    this.deadlineMs = nowMs + durationMs;
    this.ended = false;
    this.state.matchPhase = MATCH_PHASE_RUNNING;
    // Initial room creation historically leaves the schema default until the first tick.
    if (publishRemaining) this.state.matchRemainingSec = Math.max(0, Math.ceil(durationMs / 1000));
  }

  canRestart(force: boolean): boolean { return force || this.state.matchPhase === MATCH_PHASE_ENDED; }

  /** True only for the operation that ends the round; caller delivers its external effects. */
  tick(nowMs: number): boolean {
    if (this.ended) {
      this.state.matchRemainingSec = 0;
      return false;
    }
    this.state.matchRemainingSec = Math.max(0, Math.ceil((this.deadlineMs - nowMs) / 1000));
    if (nowMs < this.deadlineMs) return false;
    this.ended = true;
    this.state.matchPhase = MATCH_PHASE_ENDED;
    this.state.matchRemainingSec = 0;
    return true;
  }
}
