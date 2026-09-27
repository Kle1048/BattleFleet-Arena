import { MATCH_PHASE_RUNNING, PROGRESSION_XP_PER_KILL,
  isInSeaControlZone, normalizeShipClassId, participatesInWorldSimulation, progressionLevelFromTotalXp,
  progressionMaxHpForLevel, shipClassBaseMaxHp, shipClassIdForProgressionLevel } from "@battlefleet/shared/rules";
import type { PlayerValues } from "@battlefleet/shared/protocol";
import type { ParticipantState } from "../ParticipantState.js";
import { resetMagazine } from "./magazine.js";

type ProgressionPlayer = Pick<PlayerValues, "id" | "x" | "z" | "lifeState" | "level" | "xp" | "score" | "shipClass" | "hp" | "maxHp">;
type Participants = {
  players: ReadonlyMap<string, ProgressionPlayer>;
  simulations: ReadonlyMap<string, ParticipantState>;
};
export type PassiveXpSettings = { intervalMs: () => number; base: () => number; seaControlMultiplier: () => number };

/** Owns XP/level progression and its cadence; neither transport nor persistence participates. */
export class ProgressionSystem {
  private lastPassiveAtMs = 0;
  constructor(private readonly participants: Participants, private readonly settings: PassiveXpSettings) {}

  resetClock(nowMs: number): void { this.lastPassiveAtMs = nowMs; }

  grant(player: ProgressionPlayer, row: ParticipantState | undefined, amount: number): void {
    if (amount <= 0) return;
    player.xp += amount;
    player.score += amount;
    const targetLevel = progressionLevelFromTotalXp(player.xp);
    // Apply every intermediate level: class changes can refill a magazine along the way.
    while (player.level < targetLevel) {
      player.level++;
      const desired = shipClassIdForProgressionLevel(player.level);
      if (normalizeShipClassId(player.shipClass) !== desired) {
        player.shipClass = desired;
        if (row) resetMagazine(row, desired);
      }
      const maxHp = progressionMaxHpForLevel(player.level, shipClassBaseMaxHp(player.shipClass));
      const delta = maxHp - player.maxHp;
      player.maxHp = maxHp;
      player.hp = Math.min(player.hp + Math.max(0, delta), player.maxHp);
    }
  }

  grantKill(player: ProgressionPlayer): void {
    this.grant(player, this.participants.simulations.get(player.id), PROGRESSION_XP_PER_KILL);
  }

  tick(nowMs: number, matchPhase: string): void {
    if (matchPhase !== MATCH_PHASE_RUNNING || nowMs - this.lastPassiveAtMs < this.settings.intervalMs()) return;
    this.lastPassiveAtMs = nowMs;
    // Read live tuning once per reward pass, not once per participant or render/physics tick.
    const seaControlMultiplier = this.settings.seaControlMultiplier();
    const base = this.settings.base();
    for (const player of this.participants.players.values()) {
      if (!participatesInWorldSimulation(player.lifeState)) continue;
      const multiplier = isInSeaControlZone(player.x, player.z) ? seaControlMultiplier : 1;
      this.grant(player, this.participants.simulations.get(player.id), base * multiplier);
    }
  }
}
