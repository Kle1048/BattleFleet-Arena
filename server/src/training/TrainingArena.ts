import { createBotController, DecisionTreeStrategy, encodePolicyObservation, observeWorld, orient,
  POLICY_ACTIONS, POLICY_FEATURES, PlayerLifeState, type BotDecisionStrategy, type BotProfile, profileControllerVersion, MATCH_PASSIVE_XP_BASE, MATCH_PASSIVE_XP_INTERVAL_MS, SEA_CONTROL_XP_MULTIPLIER, isInSeaControlZone } from "@battlefleet/shared/rules";
import { GameSimulation } from "../simulation/GameSimulation.js";
import { SHIP_SENSOR_CONTRACT } from "@battlefleet/shared/rules";
import type { SimulationSettings } from "../simulation/SimulationSettings.js";

export const TRAINING_SPEC = {
  sensorContract: SHIP_SENSOR_CONTRACT,
  version: "bfa-duel-v3-sensors", tickSeconds: 0.05, ticksPerDecision: 3,
  episodeSeconds: 180, halfExtent: 1200, islands: false, shipClass: "fac",
  reward: { hpDropDifference: 1, terminalWin: 5, terminalLoss: -5, collision: -0.01 },
};

const PROFILE_REWARDS = {
  aggressive: { score: 0.015, damage: 2, received: -1.2, kill: 2, death: -3, zoneSecond: 0.015, closeSecond: 0 },
  cautious: { score: 0.015, damage: 1.2, received: -2.4, kill: 0.5, death: -5, zoneSecond: 0.02, closeSecond: -0.005 },
  objective: { score: 0.015, damage: 1.5, received: -1.8, kill: 1, death: -4, zoneSecond: 0.045, closeSecond: 0 },
};
const metrics = () => ({ radarSeconds: 0, zoneSeconds: 0, closeSeconds: 0, rearSeconds: 0,
  aliveSeconds: 0, deaths: 0, gunShots: 0, missileShots: 0 });
const distanceToZone = (p: { x: number; z: number }) => Math.max(0, Math.max(Math.abs(p.x), Math.abs(p.z)) - 420);

/** Reproducible duel or four-player free-for-all using the real simulation. */
export class TrainingArena {
  private game!: GameSimulation;
  private now = 10000;
  private elapsed = 0;
  private randomState = 1;
  private action = 0;
  private done = true;
  private collisions = 0;
  private learner!: ReturnType<typeof createBotController>;
  private opponents: ReturnType<typeof createBotController>[] = [];
  private get opponentIds() { return this.ffaOpponents ? ["opponent", "opponent2", "opponent3"] : ["opponent"]; }
  private get ids() { return ["learner", ...this.opponentIds]; }
  private readonly rules = new DecisionTreeStrategy();
  private useRules = false;
  private netHpLost = [0, 0];

  private kills = 0;
  private get duration() { return this.evaluationSeconds ?? (this.ffaOpponents ? 300 : this.profile === "standard" ? TRAINING_SPEC.episodeSeconds : 600); }
  private metrics = metrics();
  constructor(private readonly deployedStrategy?: BotDecisionStrategy, readonly profile: BotProfile = deployedStrategy?.profile ?? "standard",
    private readonly opponentStrategy?: BotDecisionStrategy, private readonly evaluationSeconds?: number,
    private readonly ffaOpponents?: readonly BotDecisionStrategy[]) {
    if (ffaOpponents && (ffaOpponents.length !== 3 || profile === "standard" || opponentStrategy))
      throw new Error("FFA requires a personality learner, exactly three opponents and no duel opponent");
    if (evaluationSeconds !== undefined && (!Number.isInteger(evaluationSeconds) || evaluationSeconds < 30 || evaluationSeconds > 600))
      throw new Error("Evaluation duration must be 30..600 whole seconds");
  }
  get specification() { return this.profile === "standard" ? TRAINING_SPEC : {
    ...TRAINING_SPEC, version: this.ffaOpponents ? "bfa-ffa4-v1" : "bfa-personalities-v2.1-balanced",
    ...(this.ffaOpponents ? { participants: 4, teams: false, spawnRotation: "seed-mod-4", damageAttribution: "no-enemy-hp-reward" } : {}), profileControllerVersion: profileControllerVersion(this.profile),
    episodeSeconds: this.duration, respawnSeconds: 5, spawnProtectionSeconds: 3, profile: this.profile,
    halfExtent: 2000, passiveXpBase: MATCH_PASSIVE_XP_BASE, passiveXpIntervalMs: MATCH_PASSIVE_XP_INTERVAL_MS,
    seaControlMultiplier: SEA_CONTROL_XP_MULTIPLIER, endsOnDeath: false,
    reward: { ...PROFILE_REWARDS[this.profile], ...(this.ffaOpponents ? { damage: 0 } : {}), rearSecond: 0.002, approachZonePerMetre: 0.002, collision: -0.01,
      ...(this.opponentStrategy ? { opponentScore: -0.015 } : {}) },
  }; }

  private random = (): number => {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 2 ** 32;
  };

  reset(seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("seed must be a uint32");
    this.close();
    this.now = 10000; this.elapsed = 0; this.randomState = seed; this.collisions = 0;
    this.now += Math.floor(this.random() * 8000); // Train across the entire radar search cycle.
    this.kills = 0;
    this.metrics = metrics();
    this.netHpLost = this.ids.map(() => 0); this.done = false; this.useRules = false;
    const settings: SimulationSettings = {
      getIslandsEnabled: () => false,
      getMatchDurationMs: () => (this.duration + 1) * 1000,
      getMinRoomPlayers: () => 0, getOobDestroyAfterMs: () => 10000,
      getOperationalAreaHalfExtent: () => this.specification.halfExtent,
      getPassiveXpBase: () => this.profile === "standard" ? 0 : MATCH_PASSIVE_XP_BASE, getPassiveXpIntervalMs: () => MATCH_PASSIVE_XP_INTERVAL_MS,
      getRespawnDelayMs: () => this.profile === "standard" ? 60000 : 5000, getSamCooldownMs: () => 3000,
      getSeaControlXpMultiplier: () => SEA_CONTROL_XP_MULTIPLIER, getSpawnProtectionMs: () => this.profile === "standard" ? 0 : 3000,
    };
    this.game = new GameSimulation({ nowMs: () => this.now, random: this.random }, settings,
      { broadcast: (type, payload) => {
        if ("ownerId" in payload && payload.ownerId === "learner") {
          if (type === "artyFired") this.metrics.gunShots++;
          if (type === "aswmFired") this.metrics.missileShots++;
        }
      }, send: (id, type) => { if (id === "learner" && type === "collisionContact") this.collisions++; } },
      () => this.ids.length, () => this.now, () => {}, () => "training");
    this.game.start();
    this.ids.forEach(id => this.game.join(id, id));
    const angle = this.random() * Math.PI * 2;
    const separation = 300 + this.random() * 500;
    const spread = this.profile === "standard" ? 400 : 1400;
    const centerX = (this.random() - 0.5) * spread, centerZ = (this.random() - 0.5) * spread;
    this.ids.forEach((id, index) => {
      const p = this.game.findPlayer(id)!, row = this.game.participants.simulations.get(id)!;
      const sign = index === 0 ? -1 : 1;
      const seatAngle = angle + ((index + seed % 4) % 4) * Math.PI / 2;
      const radius = 450 + separation / 2;
      p.x = row.ship.x = centerX + (this.ffaOpponents ? Math.sin(seatAngle) * radius : Math.sin(angle) * separation * sign / 2);
      p.z = row.ship.z = centerZ + (this.ffaOpponents ? Math.cos(seatAngle) * radius : Math.cos(angle) * separation * sign / 2);
      p.headingRad = row.ship.headingRad = this.random() * Math.PI * 2;
      row.aimX = p.aimX = p.x; row.aimZ = p.aimZ = p.z + 80;
    });
    const clock = { wallNow: () => this.now, monotonicNow: () => this.now };
    this.learner = createBotController(clock, this.deployedStrategy ?? {
      profile: this.profile,
      decide: input => this.useRules ? this.rules.decide(input) : POLICY_ACTIONS[this.action]!,
    });
    this.opponents = this.opponentIds.map((_, i) => createBotController(clock, this.ffaOpponents?.[i] ?? this.opponentStrategy));
    this.learner.enable(); this.opponents.forEach(brain => brain.enable());
    return { observation: this.observation(), info: { seed } };
  }

  private observation(): number[] {
    const s = this.game.state;
    const snapshot = observeWorld(this.now, s.playerList, "learner", s.missileList, s.torpedoList, s.operationalAreaHalfExtent);
    if (!snapshot) return Array(POLICY_FEATURES.length).fill(0);
    snapshot.islandsEnabled = false;
    snapshot.profile = this.profile;
    const memory = this.learner.getMemory();
    return encodePolicyObservation({ snapshot, context: orient(snapshot, memory), memory });
  }

  step(action: number) {
    if (this.done) throw new Error("reset required before step");
    if (!Number.isInteger(action) || action < -1 || action >= POLICY_ACTIONS.length) throw new Error("Invalid action");
    this.action = Math.max(0, action); this.useRules = action === -1;
    let reward = 0;
    const collisionsBefore = this.collisions;
    for (let i = 0; i < TRAINING_SPEC.ticksPerDecision; i++) {
      const learnerWasDead = this.isDead("learner");
      const beforeSelf = this.game.findPlayer("learner")!;
      const beforeScore = beforeSelf.score, beforeKills = beforeSelf.kills;
      const beforeOpponentScore = this.game.findPlayer("opponent")!.score;
      const beforeDistanceToZone = distanceToZone(beforeSelf);
      const state = this.game.state;
      // Both controllers see a detached pre-input projection, just like BotSystem.
      const players = state.playerList.map(p => ({ ...p }));
      const missiles = state.missileList.map(p => ({ ...p }));
      const mines = state.torpedoList.map(p => ({ ...p }));
      const before = this.ids.map(id => {
        const p = this.game.findPlayer(id)!; return { hp: p.hp, maxHp: p.maxHp };
      });
      for (const [index, id] of this.ids.entries()) {
        const brain = index === 0 ? this.learner : this.opponents[index - 1]!;
        const input = brain.update(this.now, players, id, missiles, mines, state.operationalAreaHalfExtent, false);
        if (input) this.game.applyInput(id, {
          throttle: input.throttle, rudderInput: input.rudderInput,
          aimX: input.aimWorldX, aimZ: input.aimWorldZ, primaryFire: input.primaryFire,
          secondaryFire: input.secondaryFire, torpedoFire: input.torpedoFire, radarActive: input.radarActive,
        });
      }
      this.now += 50; this.elapsed += 50;
      this.game.step(TRAINING_SPEC.tickSeconds);
      this.ids.forEach((id, index) => {
        // Net HP decrease after regeneration, not exact attributed damage.
        const lost = Math.max(0, before[index]!.hp - this.game.findPlayer(id)!.hp) / before[index]!.maxHp;
        this.netHpLost[index]! += lost;
        const weights = this.profile === "standard" ? [-1, 1] :
          [PROFILE_REWARDS[this.profile].received, PROFILE_REWARDS[this.profile].damage];
        // In FFA, damage between two opponents must never reward the learner.
        reward += (index === 0 ? weights[0]! : this.ffaOpponents ? 0 : weights[1]!) * lost;
      });
      const own = this.game.findPlayer("learner")!;
      const enemies = this.opponentIds.map(id => this.game.findPlayer(id)!);
      const enemy = enemies.filter(p => !this.isDead(p.id)).sort((a,b) =>
        Math.hypot(a.x-own.x,a.z-own.z)-Math.hypot(b.x-own.x,b.z-own.z))[0] ?? enemies[0]!;
      const killsGained = own.kills - beforeKills;
      this.kills += killsGained;
      const died = !learnerWasDead && this.isDead("learner");
      if (died) this.metrics.deaths++;
      const alive = !this.isDead("learner");
      const dt = TRAINING_SPEC.tickSeconds;
      const zone = alive && isInSeaControlZone(own.x, own.z);
      const dx = own.x - enemy.x, dz = own.z - enemy.z;
      const distance = Math.hypot(dx, dz);
      const close = alive && !this.isDead(enemy.id) && distance < 300;
      const rear = close && (dx * Math.sin(enemy.headingRad) + dz * Math.cos(enemy.headingRad)) / Math.max(1, distance) < -0.7;
      if (alive) this.metrics.aliveSeconds += dt;
      if (alive && own.radarActive) this.metrics.radarSeconds += dt;
      if (zone) this.metrics.zoneSeconds += dt;
      if (close) this.metrics.closeSeconds += dt;
      if (rear) this.metrics.rearSeconds += dt;
      if (this.profile !== "standard") {
        const weights = PROFILE_REWARDS[this.profile];
        reward += (own.score - beforeScore) * weights.score + killsGained * weights.kill + Number(died) * weights.death;
        if (this.opponentStrategy) reward -= (enemy.score - beforeOpponentScore) * 0.015;
        reward += dt * (Number(zone) * weights.zoneSecond + Number(rear) * 0.002 + Number(close && distance < 150) * weights.closeSecond);
        // Signed potential difference; no free bonus for a respawn teleport or oscillating at the boundary.
        if (alive && !learnerWasDead) reward += (beforeDistanceToZone - distanceToZone(own)) * 0.002;
      }
      if (this.profile === "standard" && (this.isDead("learner") || this.isDead("opponent"))) break;
      if (this.elapsed >= this.duration * 1000) break;
      // End the external action window at a life transition. The runtime controller
      // resumes its decision clock on respawn; Python must observe that same boundary.
      if (this.profile !== "standard" && learnerWasDead !== this.isDead("learner")) break;
    }
    const dead = this.isDead("learner"), opponentDead = this.isDead("opponent");
    const terminated = this.profile === "standard" && (dead || opponentDead);
    const truncated = !terminated && this.elapsed >= this.duration * 1000;
    const selfScore = this.game.findPlayer("learner")!.score;
    const opponentScores = this.opponentIds.map(id => this.game.findPlayer(id)!.score);
    const opponentScore = Math.max(...opponentScores);
    const outcome = this.profile !== "standard" ? (truncated ? (selfScore > opponentScore ? "win" : selfScore < opponentScore ? "loss" : "draw") : "running")
      : dead && opponentDead ? "draw" : dead ? "loss" : opponentDead ? "win" : truncated ? "draw" : "running";
    if (this.profile === "standard") {
      if (outcome === "win") reward += 5;
      if (outcome === "loss") reward -= 5;
    }
    reward -= (this.collisions - collisionsBefore) * 0.01;
    this.done = terminated || truncated;
    return { observation: this.observation(), reward, terminated, truncated,
      info: { outcome, selfScore, opponentScore,
        ...(this.ffaOpponents ? { rank: 1 + opponentScores.filter(score => score > selfScore).length,
          participants: this.ids.map(id => { const p = this.game.findPlayer(id)!; return { id, score: p.score, kills: p.kills, hp: p.hp, lifeState: p.lifeState }; }) } : {}), kills: this.kills, ...this.metrics, seconds: this.elapsed / 1000, collisions: this.collisions,
        selfNetHpLost: this.netHpLost[0], opponentNetHpLost: this.netHpLost.slice(1).reduce((sum,v) => sum+v,0) } };
  }

  private isDead(id: string): boolean { return this.game.findPlayer(id)!.lifeState === PlayerLifeState.AwaitingRespawn; }
  close(): void { this.learner?.disable(); this.opponents.forEach(brain => brain.disable()); this.opponents = []; this.game?.dispose(); this.done = true; }
}
