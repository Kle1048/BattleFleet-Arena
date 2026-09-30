import { PlayerLifeState, isInsideOperationalArea, MATCH_PHASE_RUNNING, normalizeShipClassId, shipClassBaseMaxHp, progressionMaxHpForLevel,
  type BotVisibleMissile, type BotVisiblePlayer, type BotVisibleTorpedo } from "@battlefleet/shared/rules";
import type { InputCommand as InputPayload, GameEventSink, PlayerValues } from "@battlefleet/shared/protocol";
import type { SimulationEnvironment } from "./SimulationEnvironment.js";
import type { SimulationSettings, MatchPlayerResult } from "./SimulationSettings.js";
import { SimulationState } from "./SimulationState.js";
import { DEFAULT_MAP_ISLAND_POLYGONS } from "@battlefleet/shared/rules";
import { createParticipant } from "./createParticipant.js";
import { resetMagazine } from "./systems/magazine.js";
import { BotSystem } from "./systems/BotSystem.js";
import { ProgressionSystem } from "./systems/ProgressionSystem.js";
import { LifeSystem } from "./systems/LifeSystem.js";
import { MatchSystem } from "./systems/MatchSystem.js";
import { MovementSystem } from "./systems/MovementSystem.js";
import { ArtillerySystem } from "./systems/ArtillerySystem.js";
import { MissileSystem } from "./systems/MissileSystem.js";
import { MineSystem } from "./systems/MineSystem.js";
import { AirDefenseSystem } from "./systems/AirDefenseSystem.js";
import type { BotDecisionStrategy } from "@battlefleet/shared/rules";

const NO_ISLANDS: typeof DEFAULT_MAP_ISLAND_POLYGONS = [];

function clampUnit(n: number): number {
  return Math.max(-1, Math.min(1, n));
}

function clampRange(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Composition and explicit phase order for a headless authoritative match. */
export class GameSimulation {
  readonly state = new SimulationState();
  readonly participants = this.state.participants;
  private readonly getIslandPolygons = () => this.state.islandsEnabled ? DEFAULT_MAP_ISLAND_POLYGONS : NO_ISLANDS;
  private readonly progression = new ProgressionSystem(this.participants, {
    intervalMs: () => this.settings.getPassiveXpIntervalMs(),
    base: () => this.settings.getPassiveXpBase(),
    seaControlMultiplier: () => this.settings.getSeaControlXpMultiplier(),
  });
  private match!: MatchSystem;
  private readonly life = new LifeSystem(this.participants, {
    respawnDelayMs: () => this.settings.getRespawnDelayMs(),
    spawnProtectionMs: () => this.settings.getSpawnProtectionMs(),
    operationalHalfExtent: () => this.getOperationalHalfExtent(),
  }, {
    isCombatActive: () => this.isMatchCombatActive(),
    grantKill: (player) => this.progression.grantKill(player),
    clearOwnedShells: (id) => this.artillery.removeOwner(id),
    addWreck: (values) => { this.state.wreckList.push(values); },
  }, () => this.environment.random(), this.getIslandPolygons);
  private readonly movement = new MovementSystem(this.participants, this.life,
    (id, kind) => this.events.send(id, "collisionContact", { kind }), this.getIslandPolygons);

  readonly bots: BotSystem;
  private artillery!: ArtillerySystem;
  private missiles!: MissileSystem;
  private mines!: MineSystem;
  private defense!: AirDefenseSystem;

  constructor(
    private readonly environment: SimulationEnvironment,
    private readonly settings: SimulationSettings,
    private readonly events: GameEventSink,
    private readonly humanCount: () => number,
    diagnosticNowMs: () => number,
    private readonly completeMatch: (results: readonly MatchPlayerResult[], matchId: string) => void,
    private readonly nextMatchId: () => string,
    createBotStrategy?: () => BotDecisionStrategy,
  ) {
    this.bots = new BotSystem({
      environment, diagnosticNowMs, createStrategy: createBotStrategy,
      joinParticipant: (id, name) => this.join(id, name),
      removeParticipant: id => this.remove(id),
      applyInput: (id, input) => this.applyInput(id, input),
    });
  }

  start(): void {
    this.state.islandsEnabled = this.settings.getIslandsEnabled();
    this.syncOperationalAreaHalfExtent();
    this.defense = new AirDefenseSystem(this.participants, this.environment, this.events, () => this.settings.getSamCooldownMs());
    this.mines = new MineSystem(this.participants, this.state.torpedoList, this.state.wreckList,
      this.life, this.environment, this.events,
      () => this.isMatchCombatActive(), () => this.getOperationalHalfExtent(), this.getIslandPolygons);
    this.missiles = new MissileSystem(this.participants, this.state.missileList, this.state.wreckList,
      this.life, this.defense, this.environment, this.events,
      () => this.isMatchCombatActive(), () => this.getOperationalHalfExtent(), this.getIslandPolygons);
    this.artillery = new ArtillerySystem(this.participants, this.life, this.environment, this.events,
      () => this.isMatchCombatActive(), (x, z) => this.mines.disarmAt(x, z), this.getIslandPolygons);
    this.match = new MatchSystem(this.state, this.nextMatchId);
    this.match.start(this.environment.nowMs(), this.settings.getMatchDurationMs(), false);
    this.progression.resetClock(this.environment.nowMs());
  }

  dispose(): void {
    this.bots.dispose();
    this.participants.clear();
    // A failed host startup may dispose before start has finished constructing the systems.
    this.artillery?.clear();
    this.missiles?.clear();
    this.mines?.clear();
    this.movement.dispose();
    this.state.wreckList.length = 0;
  }

  join(sessionId: string, displayName: string): void {
    if (this.participants.players.has(sessionId)) throw new Error("Participant already joined");
    const { player, simulation } = createParticipant(sessionId, displayName, this.state.playerList,
      this.settings.getOperationalAreaHalfExtent(this.state.playerList.length + 1), this.environment.random, this.getIslandPolygons());
    this.participants.add(player, simulation);
    this.syncOperationalAreaHalfExtent();
  }

  /** Authorization and exact class parsing remain at the host boundary. */
  setDebugShipClass(sessionId: string, nextClass: string): void {
    const ps = this.findPlayer(sessionId);
    const row = this.participants.simulations.get(sessionId);
    if (!ps || !row) return;
    if (ps.lifeState === PlayerLifeState.AwaitingRespawn) return;
    if (normalizeShipClassId(ps.shipClass) === nextClass) return;

    ps.shipClass = nextClass;
    const baseHp = shipClassBaseMaxHp(nextClass);
    const mx = progressionMaxHpForLevel(ps.level, baseHp);
    const ratio = ps.maxHp > 0 ? ps.hp / ps.maxHp : 1;
    ps.maxHp = mx;
    ps.hp = Math.max(1, Math.min(mx, Math.round(mx * ratio)));
    resetMagazine(row, nextClass);
  }

  private getOperationalHalfExtent(): number {
    const raw = this.state.operationalAreaHalfExtent;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return raw;
    }
    return this.settings.getOperationalAreaHalfExtent(this.state.playerList.length);
  }

  private syncOperationalAreaHalfExtent(): void {
    const next = this.settings.getOperationalAreaHalfExtent(this.state.playerList.length);
    if (this.state.operationalAreaHalfExtent !== next) {
      this.state.operationalAreaHalfExtent = next;
    }
  }

  findPlayer(sessionId: string): PlayerValues | undefined {
    return this.participants.players.get(sessionId);
  }

  applyInput(sessionId: string, payload: InputPayload): void {
    const row = this.participants.simulations.get(sessionId);
    if (!row) return;
    const ps = this.findPlayer(sessionId);
    if (!ps || ps.lifeState === PlayerLifeState.AwaitingRespawn) return;

    row.ship.throttle = clampUnit(payload.throttle);
    row.lastRudderInput = clampUnit(payload.rudderInput);
    const ax = payload.aimX;
    const az = payload.aimZ;
    if (ax !== undefined) row.aimX = ax;
    if (az !== undefined) row.aimZ = az;
    const mineSpawnLocalZ = payload.mineSpawnLocalZ;
    if (mineSpawnLocalZ !== undefined) {
      row.mineSpawnLocalZ = clampRange(mineSpawnLocalZ, -140, 20);
    }
    if (payload.radarActive !== undefined) {
      row.radarActive = payload.radarActive;
    }

    if (payload.primaryFire === true) {
      this.artillery.fire(sessionId, row);
    }
    if (payload.secondaryFire === true) {
      this.missiles.fire(sessionId, row, payload.aswmFireSide);
    }
    if (payload.torpedoFire === true) {
      this.mines.fire(sessionId, row);
    }
  }

  private reconcileServerBots(now: number): void {
    this.bots.reconcile(now, this.settings.getMinRoomPlayers(), this.humanCount());
  }

  private buildBotVisiblePlayerList(): BotVisiblePlayer[] {
    const out: BotVisiblePlayer[] = [];
    for (const p of this.state.playerList) {
      out.push({
        id: p.id,
        x: p.x,
        z: p.z,
        headingRad: p.headingRad,
        shipClass: p.shipClass,
        hp: p.hp,
        maxHp: p.maxHp,
        lifeState: p.lifeState,
        primaryCooldownSec: p.primaryCooldownSec,
        secondaryCooldownSec: p.secondaryCooldownSec,
        torpedoCooldownSec: p.torpedoCooldownSec,
        adHudIncomingAswm: p.adHudIncomingAswm,
      });
    }
    return out;
  }

  private buildBotMissileList(): BotVisibleMissile[] {
    const out: BotVisibleMissile[] = [];
    for (const m of this.state.missileList) {
      out.push({
        missileId: m.missileId,
        ownerId: m.ownerId,
        x: m.x,
        z: m.z,
      });
    }
    return out;
  }

  private buildBotTorpedoList(): BotVisibleTorpedo[] {
    const out: BotVisibleTorpedo[] = [];
    for (const t of this.state.torpedoList) {
      out.push({
        torpedoId: t.torpedoId,
        ownerId: t.ownerId,
        x: t.x,
        z: t.z,
      });
    }
    return out;
  }

  private tickServerBotBrains(now: number): void {
    if (this.bots.ids.size === 0) return;
    const players = this.buildBotVisiblePlayerList();
    const missiles = this.buildBotMissileList();
    const torpedoes = this.buildBotTorpedoList();
    this.bots.tick(now, players, missiles, torpedoes, this.getOperationalHalfExtent(), this.state.islandsEnabled);
  }

  remove(sessionId: string): void {
    this.participants.remove(sessionId);
    this.movement.remove(sessionId);
    this.artillery.removeOwner(sessionId);
    this.missiles.removeOwner(sessionId);
    this.mines.removeOwner(sessionId);
    this.syncOperationalAreaHalfExtent();
  }

  private applyPassiveXpTick(now: number): void {
    this.progression.tick(now, this.state.matchPhase);
  }

  private isMatchCombatActive(): boolean {
    return this.state.matchPhase === MATCH_PHASE_RUNNING;
  }

  private updateMatchTimer(now: number): void {
    if (this.match.tick(now)) this.onMatchEnded();
  }

  private onMatchEnded(): void {
    this.completeMatch(this.matchResults(), this.match.matchId);
    this.artillery.clear();
    this.missiles.clear();
    this.mines.clear();
    this.clearWreckList();
    this.events.broadcast("matchEnded", {} as Record<string, never>);
  }

  private matchResults(): MatchPlayerResult[] {
    const humanPlayers: PlayerValues[] = [];
    for (const p of this.state.playerList) {
      if (!this.bots.ids.has(p.id)) humanPlayers.push(p);
    }
    if (humanPlayers.length < 1) return [];
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const p of humanPlayers) {
      if (p.score > bestScore) bestScore = p.score;
    }
    const rows = humanPlayers.map((p) => ({
      sessionId: p.id,
      displayName: p.displayName,
      kills: p.kills,
      score: p.score,
      xp: p.xp,
      won: p.score === bestScore,
    }));
    return rows;
  }

  reset(now: number, force = false): void {
    if (!this.match.canRestart(force)) return;
    this.state.islandsEnabled = this.settings.getIslandsEnabled();

    this.artillery.clear();
    this.missiles.clear();
    this.mines.clear();
    this.clearWreckList();
    this.movement.resetRoundContacts();
    this.match.start(now, this.settings.getMatchDurationMs(), true);
    this.progression.resetClock(now);

    this.life.resetPlayers(now);

    this.syncOperationalAreaHalfExtent();
    this.events.broadcast("matchRestarted", {} as Record<string, never>);
  }

  private processLifeTransitions(now: number): void {
    this.life.tick(now);
  }

  private pruneExpiredWrecks(now: number): void {
    const wl = this.state.wreckList;
    for (let i = wl.length - 1; i >= 0; i--) {
      const w = wl.at(i);
      if (w && now >= w.expiresAtMs) {
        wl.deleteAt(i);
      }
    }
  }

  private clearWreckList(): void {
    const wl = this.state.wreckList;
    while (wl.length > 0) {
      wl.deleteAt(wl.length - 1);
    }
  }

  step(dt: number): void {
    const now = this.environment.nowMs();
    const half = this.getOperationalHalfExtent();

    this.updateMatchTimer(now);
    this.reconcileServerBots(now);
    this.tickServerBotBrains(now);
    this.applyPassiveXpTick(now);
    const combatActive = this.isMatchCombatActive();
    if (combatActive) {
      this.artillery.resolveImpacts(now);
    } else {
      this.artillery.clear();
    }
    this.processLifeTransitions(now);
    this.missiles.reloadMagazines(now);
    this.pruneExpiredWrecks(now);

    const oobDestroyAfterMs = this.settings.getOobDestroyAfterMs();
    this.movement.step(dt, now, combatActive, this.state.wreckList);

    for (const [sessionId, row] of this.participants.simulations) {
      const p = this.findPlayer(sessionId);
      if (!p) continue;

      p.x = row.ship.x;
      p.z = row.ship.z;
      p.headingRad = row.ship.headingRad;
      p.speed = row.ship.speed;
      p.rudder = row.ship.rudder;
      p.aimX = row.aimX;
      p.aimZ = row.aimZ;
      p.radarActive = row.radarActive;

      p.primaryCooldownSec = Math.max(0, (row.primaryReadyAtMs - now) / 1000);
      p.secondaryCooldownSec = Math.max(
        0,
        (Math.max(row.aswmReloadUntilMs, row.aswmNextShotAtMs) - now) / 1000,
      );
      p.torpedoCooldownSec = Math.max(0, (row.torpedoReadyAtMs - now) / 1000);
      p.aswmRemainingPort = row.aswmRemainingPort;
      p.aswmRemainingStarboard = row.aswmRemainingStarboard;

      this.life.regenerate(p, dt);

      if (p.lifeState === PlayerLifeState.AwaitingRespawn) {
        p.oobCountdownSec = 0;
        continue;
      }

      const inside = isInsideOperationalArea(row.ship.x, row.ship.z, half);
      if (inside) {
        row.oobSinceMs = null;
        p.oobCountdownSec = 0;
      } else {
        if (row.oobSinceMs == null) {
          row.oobSinceMs = now;
        }
        const elapsed = now - row.oobSinceMs;
        if (elapsed >= oobDestroyAfterMs) {
          p.oobCountdownSec = 0;
          this.life.destroy(sessionId, now);
        } else {
          p.oobCountdownSec = Math.max(0, (oobDestroyAfterMs - elapsed) / 1000);
        }
      }
    }

    if (combatActive) {
      this.missiles.step(dt, now);
      this.mines.step(dt, now);
    }
    this.defense.syncHud(this.state.missileList);
  }
}
