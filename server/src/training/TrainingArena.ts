import { createBotController, DecisionTreeStrategy, encodePolicyObservation, observeWorld, orient,
  POLICY_ACTIONS, POLICY_FEATURES, PlayerLifeState, type BotDecisionStrategy } from "@battlefleet/shared/rules";
import { GameSimulation } from "../simulation/GameSimulation.js";
import type { SimulationSettings } from "../simulation/SimulationSettings.js";

export const TRAINING_SPEC = {
  version: "bfa-duel-v1", tickSeconds: 0.05, ticksPerDecision: 3,
  episodeSeconds: 180, halfExtent: 1200, islands: false, shipClass: "fac",
  reward: { hpDropDifference: 1, terminalWin: 5, terminalLoss: -5, collision: -0.01 },
};

/** One isolated, reproducible 1v1. Uses the real combat simulation and bot planner. */
export class TrainingArena {
  private game!: GameSimulation;
  private now = 10000;
  private elapsed = 0;
  private randomState = 1;
  private action = 0;
  private done = true;
  private collisions = 0;
  private learner!: ReturnType<typeof createBotController>;
  private opponent!: ReturnType<typeof createBotController>;
  private readonly rules = new DecisionTreeStrategy();
  private useRules = false;
  private netHpLost = [0, 0];

  constructor(private readonly deployedStrategy?: BotDecisionStrategy) {}

  private random = (): number => {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 2 ** 32;
  };

  reset(seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("seed must be a uint32");
    this.close();
    this.now = 10000; this.elapsed = 0; this.randomState = seed; this.collisions = 0;
    this.netHpLost = [0, 0]; this.done = false; this.useRules = false;
    const settings: SimulationSettings = {
      getIslandsEnabled: () => false,
      getMatchDurationMs: () => (TRAINING_SPEC.episodeSeconds + 1) * 1000,
      getMinRoomPlayers: () => 0, getOobDestroyAfterMs: () => 10000,
      getOperationalAreaHalfExtent: () => TRAINING_SPEC.halfExtent,
      getPassiveXpBase: () => 0, getPassiveXpIntervalMs: () => 4000,
      getRespawnDelayMs: () => 60000, getSamCooldownMs: () => 3000,
      getSeaControlXpMultiplier: () => 1, getSpawnProtectionMs: () => 0,
    };
    this.game = new GameSimulation({ nowMs: () => this.now, random: this.random }, settings,
      { broadcast: () => {}, send: (id, type) => { if (id === "learner" && type === "collisionContact") this.collisions++; } },
      () => 2, () => this.now, () => {}, () => "training");
    this.game.start();
    this.game.join("learner", "Learner"); this.game.join("opponent", "Rule opponent");
    const angle = this.random() * Math.PI * 2;
    const separation = 300 + this.random() * 500;
    const centerX = (this.random() - 0.5) * 400, centerZ = (this.random() - 0.5) * 400;
    ["learner", "opponent"].forEach((id, index) => {
      const p = this.game.findPlayer(id)!, row = this.game.participants.simulations.get(id)!;
      const sign = index === 0 ? -1 : 1;
      p.x = row.ship.x = centerX + Math.sin(angle) * separation * sign / 2;
      p.z = row.ship.z = centerZ + Math.cos(angle) * separation * sign / 2;
      p.headingRad = row.ship.headingRad = this.random() * Math.PI * 2;
      row.aimX = p.aimX = p.x; row.aimZ = p.aimZ = p.z + 80;
    });
    const clock = { wallNow: () => this.now, monotonicNow: () => this.now };
    this.learner = createBotController(clock, this.deployedStrategy ?? {
      decide: input => this.useRules ? this.rules.decide(input) : POLICY_ACTIONS[this.action]!,
    });
    this.opponent = createBotController(clock);
    this.learner.enable(); this.opponent.enable();
    return { observation: this.observation(), info: { seed } };
  }

  private observation(): number[] {
    const s = this.game.state;
    const snapshot = observeWorld(this.now, s.playerList, "learner", s.missileList, s.torpedoList, s.operationalAreaHalfExtent);
    if (!snapshot) return Array(POLICY_FEATURES.length).fill(0);
    snapshot.islandsEnabled = false;
    const memory = { lastIntent: this.learner.getDebugState().intent, lastIntentChangeAt: 0, lastTargetId: null, lastThreatId: null };
    return encodePolicyObservation({ snapshot, context: orient(snapshot, memory), memory });
  }

  step(action: number) {
    if (this.done) throw new Error("reset required before step");
    if (!Number.isInteger(action) || action < -1 || action >= POLICY_ACTIONS.length) throw new Error("Invalid action");
    this.action = Math.max(0, action); this.useRules = action === -1;
    let reward = 0;
    const collisionsBefore = this.collisions;
    for (let i = 0; i < TRAINING_SPEC.ticksPerDecision; i++) {
      const state = this.game.state;
      // Both controllers see a detached pre-input projection, just like BotSystem.
      const players = state.playerList.map(p => ({ ...p }));
      const missiles = state.missileList.map(p => ({ ...p }));
      const mines = state.torpedoList.map(p => ({ ...p }));
      const before = ["learner", "opponent"].map(id => {
        const p = this.game.findPlayer(id)!; return { hp: p.hp, maxHp: p.maxHp };
      });
      for (const [id, brain] of [["learner", this.learner], ["opponent", this.opponent]] as const) {
        const input = brain.update(this.now, players, id, missiles, mines, state.operationalAreaHalfExtent, false);
        if (input) this.game.applyInput(id, {
          throttle: input.throttle, rudderInput: input.rudderInput,
          aimX: input.aimWorldX, aimZ: input.aimWorldZ, primaryFire: input.primaryFire,
          secondaryFire: input.secondaryFire, torpedoFire: input.torpedoFire, radarActive: input.radarActive,
        });
      }
      this.now += 50; this.elapsed += 50;
      this.game.step(TRAINING_SPEC.tickSeconds);
      ["learner", "opponent"].forEach((id, index) => {
        // Net HP decrease after regeneration, not exact attributed damage.
        const lost = Math.max(0, before[index]!.hp - this.game.findPlayer(id)!.hp) / before[index]!.maxHp;
        this.netHpLost[index]! += lost;
        reward += index === 0 ? -lost : lost;
      });
      if (this.isDead("learner") || this.isDead("opponent")) break;
    }
    const dead = this.isDead("learner"), opponentDead = this.isDead("opponent");
    const terminated = dead || opponentDead;
    const truncated = !terminated && this.elapsed >= TRAINING_SPEC.episodeSeconds * 1000;
    const outcome = dead && opponentDead ? "draw" : dead ? "loss" : opponentDead ? "win" : truncated ? "draw" : "running";
    if (outcome === "win") reward += 5;
    if (outcome === "loss") reward -= 5;
    reward -= (this.collisions - collisionsBefore) * 0.01;
    this.done = terminated || truncated;
    return { observation: this.observation(), reward, terminated, truncated,
      info: { outcome, seconds: this.elapsed / 1000, collisions: this.collisions,
        selfNetHpLost: this.netHpLost[0], opponentNetHpLost: this.netHpLost[1] } };
  }

  private isDead(id: string): boolean { return this.game.findPlayer(id)!.lifeState === PlayerLifeState.AwaitingRespawn; }
  close(): void { this.learner?.disable(); this.opponent?.disable(); this.game?.dispose(); this.done = true; }
}
