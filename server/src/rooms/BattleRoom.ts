import { Room } from "@colyseus/core";
import type { Client } from "@colyseus/core";
import {
  AREA_OF_OPERATIONS_HALF_EXTENT,
  ARTILLERY_DAMAGE,
  ARTILLERY_PLAYER_MAX_HP,
  ARTILLERY_SPLASH_RADIUS,
  ASWM_DAMAGE,
  ASWM_HIT_RADIUS,
  ASWM_ISLAND_COLLISION_RADIUS,
  ASWM_LIFETIME_MS,
  type AswmTargetCandidate,
  BattleState,
  DEFAULT_MAP_ISLANDS,
  DESTROYER_LIKE_MVP,
  MissileState,
  OOB_DESTROY_AFTER_MS,
  TORPEDO_HIT_RADIUS,
  TORPEDO_ISLAND_COLLISION_RADIUS,
  TORPEDO_LIFETIME_MS,
  TorpedoState,
  PlayerLifeState,
  PlayerState,
  type ShipMovementConfig,
  ShipMovementState,
  assertPlayerLifeInvariant,
  canTakeArtillerySplashDamage,
  canUsePrimaryWeapon,
  classifyArtilleryImpactVisual,
  createShipState,
  isInsideAnyIslandCircle,
  isInsideOperationalArea,
  MIN_RESPAWN_SEPARATION,
  participatesInWorldSimulation,
  pickAswmAcquisitionTarget,
  AD_SAM_RANGE_SQ,
  type AirDefenseLayer,
  applyAirDefenseCooldownAfterRoll,
  isAirDefenseLayerInRange,
  pickAirDefenseEngagementLayer,
  rollAirDefenseHit,
  resolveShipIslandCollisions,
  resolveShipShipCollisions,
  type ShipCollisionParticipant,
  accumulateShipRamDamage,
  RESPAWN_DELAY_MS,
  SPAWN_PROTECTION_DURATION_MS,
  smoothRudder,
  spawnAswmFromFireDirection,
  spawnTorpedoFromFireDirection,
  stepAswmMissile,
  stepTorpedoStraight,
  movementConfigForPlayer,
  stepMovement,
  tryComputeArtillerySalvo,
  tryPickRespawnPosition,
  MATCH_DURATION_MS,
  MATCH_PHASE_ENDED,
  MATCH_PHASE_RUNNING,
  SCORE_PER_KILL,
  isValidKillAttribution,
  PROGRESSION_XP_PER_KILL,
  progressionIncomingDamageFactor,
  progressionLevelFromTotalXp,
  progressionMaxHpForLevel,
  progressionPrimaryCooldownMs,
  progressionSecondaryCooldownMs,
  progressionTorpedoCooldownMs,
  sanitizePlayerDisplayName,
  getShipClassProfile,
  getShipHullProfileByClass,
  shipClassBaseMaxHp,
  normalizeShipClassId,
  circleIntersectsShipHitboxFootprintXZ,
  minDistSqPointToShipHitboxFootprintXZ,
} from "@battlefleet/shared";

const TICK_HZ = 20;
const HP_REGEN_PER_SEC_FACTOR = 0.01;

export type InputPayload = {
  throttle: number;
  rudderInput: number;
  aimX?: number;
  aimZ?: number;
  /** True solange LMB gehalten (Client); `tryPrimaryFire` feuert nur nach Ablauf des Cooldowns. */
  primaryFire?: boolean;
  /** True solange RMB gehalten — ASuM mit Cooldown / Limit aktiv. */
  secondaryFire?: boolean;
  /** Torpedo (Task 8): Mausrad-Klick gehalten oder Taste Q. */
  torpedoFire?: boolean;
  /** Debug-Tuning: Mündungs-Offset entlang Schiffs-Längsachse (lokales +Z = Bug). */
  artillerySpawnLocalZ?: number;
  /** Debug-Tuning: Minen-Ablage entlang Schiffs-Längsachse (lokales -Z = Heck). */
  mineSpawnLocalZ?: number;
};

type SimEntry = {
  ship: ShipMovementState;
  lastRudderInput: number;
  aimX: number;
  aimZ: number;
  artillerySpawnLocalZ: number;
  mineSpawnLocalZ: number;
  oobSinceMs: number | null;
  /** Date.now() ab dem Primärfeuer erlaubt ist. */
  primaryReadyAtMs: number;
  /** Date.now() ab ASuM-Start erlaubt ist. */
  secondaryReadyAtMs: number;
  /** Date.now() ab Torpedo-Start erlaubt ist. */
  torpedoReadyAtMs: number;
  /** Task 9 — SAM/CIWS: früheste nächste Schusszeit (0 = sofort verfügbar). */
  adSamNextAtMs: number;
  adCiwsNextAtMs: number;
  /** Nach Tod: Zeitpunkt des Respawns; `null` wenn nicht wartend. */
  respawnAtMs: number | null;
  /** Nach Respawn: Ende der Schutzphase; `0` = keine Invulnerabilität. */
  invulnerableUntilMs: number;
};

type PendingShell = {
  impactAtMs: number;
  landX: number;
  landZ: number;
  ownerSessionId: string;
  shellId: number;
};

function clampUnit(n: number): number {
  return Math.max(-1, Math.min(1, n));
}

function clampRange(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function playerIndexInList(list: BattleState["playerList"], sessionId: string): number {
  for (let i = 0; i < list.length; i++) {
    const q = list.at(i);
    if (q?.id === sessionId) return i;
  }
  return 0;
}

export class BattleRoom extends Room<BattleState> {
  private readonly cfg = DESTROYER_LIKE_MVP;
  private sim = new Map<string, SimEntry>();
  private pendingShells: PendingShell[] = [];
  private nextShellId = 1;
  private nextMissileId = 1;
  private nextTorpedoId = 1;
  private readonly missileSpawnedAt = new Map<number, number>();
  private readonly torpedoSpawnedAt = new Map<number, number>();
  /** Nächster Tick: Wurf nach `airDefenseFire` (Raketen-ID → Verteidiger + Layer). */
  private readonly adPendingRollByMissileId = new Map<
    number,
    { defenderId: string; layer: AirDefenseLayer }
  >();
  /** Task 10 — absolutes Ende (Date.now()); läuft ab Raum-Erstellung. */
  private matchEndsAtMs = 0;
  private matchEndBroadcastSent = false;

  onCreate() {
    this.setState(new BattleState());
    this.matchEndsAtMs = Date.now() + MATCH_DURATION_MS;
    this.matchEndBroadcastSent = false;
    this.setSeatReservationTime(60);
    console.log("[BattleRoom] onCreate, roomId=%s", this.roomId);

    this.onMessage("ping", (client, payload: { clientTime?: number }) => {
      const t = Number(payload?.clientTime);
      client.send("pong", { clientTime: Number.isFinite(t) ? t : 0 });
    });

    this.onMessage("playAgain", () => {
      this.resetMatchForNewRound(Date.now());
    });

    this.onMessage("input", (client, payload: InputPayload) => {
      const row = this.sim.get(client.sessionId);
      if (!row) return;
      const ps = this.findPlayer(client.sessionId);
      if (!ps || ps.lifeState === PlayerLifeState.AwaitingRespawn) return;

      row.ship.throttle = clampUnit(Number(payload.throttle) || 0);
      row.lastRudderInput = clampUnit(Number(payload.rudderInput) || 0);
      const ax = payload.aimX;
      const az = payload.aimZ;
      if (typeof ax === "number" && Number.isFinite(ax)) row.aimX = ax;
      if (typeof az === "number" && Number.isFinite(az)) row.aimZ = az;
      const spawnLocalZ = payload.artillerySpawnLocalZ;
      if (typeof spawnLocalZ === "number" && Number.isFinite(spawnLocalZ)) {
        row.artillerySpawnLocalZ = clampRange(spawnLocalZ, -80, 80);
      }
      const mineSpawnLocalZ = payload.mineSpawnLocalZ;
      if (typeof mineSpawnLocalZ === "number" && Number.isFinite(mineSpawnLocalZ)) {
        row.mineSpawnLocalZ = clampRange(mineSpawnLocalZ, -140, 20);
      }

      if (payload.primaryFire === true) {
        this.tryPrimaryFire(client, row);
      }
      if (payload.secondaryFire === true) {
        this.trySecondaryFire(client, row);
      }
      if (payload.torpedoFire === true) {
        this.tryTorpedoFire(client, row);
      }
    });

    this.setSimulationInterval((timeDelta) => {
      const dtSec = timeDelta / 1000;
      this.physicsStep(dtSec);
    }, 1000 / TICK_HZ);

    this.maxClients = 16;
  }

  private findPlayer(sessionId: string): PlayerState | undefined {
    for (const p of this.state.playerList) {
      if (p.id === sessionId) return p;
    }
    return undefined;
  }

  private movementCfgForPlayer(p: PlayerState): ShipMovementConfig {
    return movementConfigForPlayer(
      this.cfg,
      getShipClassProfile(p.shipClass),
      p.level,
      getShipHullProfileByClass(p.shipClass)?.movement ?? null,
    );
  }

  /** Task 11 — nach Kill (serverseitig, nur Leben-Progression). */
  private grantXpForKill(killer: PlayerState): void {
    const baseHp = shipClassBaseMaxHp(killer.shipClass);
    killer.xp += PROGRESSION_XP_PER_KILL;
    const targetLevel = progressionLevelFromTotalXp(killer.xp);
    while (killer.level < targetLevel) {
      killer.level += 1;
      const mx = progressionMaxHpForLevel(killer.level, baseHp);
      const d = mx - killer.maxHp;
      killer.maxHp = mx;
      killer.hp = Math.min(killer.hp + d, killer.maxHp);
    }
  }

  onJoin(client: Client, options?: { shipClass?: string; displayName?: string }) {
    const shipClass = normalizeShipClassId(options?.shipClass);
    const displayName = sanitizePlayerDisplayName(options?.displayName);
    const index = this.clients.length - 1;
    const angle = index * 2.5132741228718345;
    const r = 140;
    const spawnX = Math.cos(angle) * r;
    const spawnZ = Math.sin(angle) * r;

    const ship = createShipState(spawnX, spawnZ);
    const aimX = spawnX;
    const aimZ = spawnZ + 80;
    this.sim.set(client.sessionId, {
      ship,
      lastRudderInput: 0,
      aimX,
      aimZ,
      artillerySpawnLocalZ: 0,
      mineSpawnLocalZ: -22,
      oobSinceMs: null,
      primaryReadyAtMs: 0,
      secondaryReadyAtMs: 0,
      torpedoReadyAtMs: 0,
      adSamNextAtMs: 0,
      adCiwsNextAtMs: 0,
      respawnAtMs: null,
      invulnerableUntilMs: 0,
    });

    const ps = new PlayerState();
    ps.id = client.sessionId;
    ps.x = ship.x;
    ps.z = ship.z;
    ps.headingRad = ship.headingRad;
    ps.speed = ship.speed;
    ps.rudder = ship.rudder;
    ps.aimX = aimX;
    ps.aimZ = aimZ;
    ps.oobCountdownSec = 0;
    ps.shipClass = shipClass;
    ps.displayName = displayName;
    ps.level = 1;
    ps.xp = 0;
    const baseHp = shipClassBaseMaxHp(shipClass);
    ps.maxHp = progressionMaxHpForLevel(1, baseHp);
    ps.hp = ps.maxHp;
    ps.primaryCooldownSec = 0;
    ps.lifeState = PlayerLifeState.Alive;
    ps.respawnCountdownSec = 0;
    ps.spawnProtectionSec = 0;
    ps.secondaryCooldownSec = 0;
    ps.torpedoCooldownSec = 0;
    ps.score = 0;
    ps.kills = 0;
    this.state.playerList.push(ps);
    assertPlayerLifeInvariant(ps.lifeState, ps.hp, ps.maxHp);
    console.log(
      "[BattleRoom] onJoin sessionId=%s playerList.length=%d roomId=%s",
      client.sessionId,
      this.state.playerList.length,
      this.roomId,
    );
  }

  onLeave(client: Client) {
    this.sim.delete(client.sessionId);
    const list = this.state.playerList;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list.at(i);
      if (p?.id === client.sessionId) {
        list.deleteAt(i);
        break;
      }
    }
    this.pendingShells = this.pendingShells.filter(
      (s) => s.ownerSessionId !== client.sessionId,
    );
    const ml = this.state.missileList;
    for (let i = ml.length - 1; i >= 0; i--) {
      const m = ml.at(i);
      if (m?.ownerId === client.sessionId) {
        this.missileSpawnedAt.delete(m.missileId);
        ml.deleteAt(i);
      }
    }
    const tl = this.state.torpedoList;
    for (let i = tl.length - 1; i >= 0; i--) {
      const t = tl.at(i);
      if (t?.ownerId === client.sessionId) {
        this.torpedoSpawnedAt.delete(t.torpedoId);
        tl.deleteAt(i);
      }
    }
  }

  private enterAwaitingRespawn(
    sessionId: string,
    now: number,
    opts?: { killerSessionId?: string },
  ): void {
    const row = this.sim.get(sessionId);
    const p = this.findPlayer(sessionId);
    if (!row || !p) return;

    const killerId = opts?.killerSessionId;
    if (
      this.state.matchPhase === MATCH_PHASE_RUNNING &&
      killerId != null &&
      isValidKillAttribution(killerId, sessionId)
    ) {
      const killer = this.findPlayer(killerId);
      if (killer) {
        killer.score += SCORE_PER_KILL;
        killer.kills += 1;
        this.grantXpForKill(killer);
      }
    }

    p.level = 1;
    p.xp = 0;
    p.maxHp = progressionMaxHpForLevel(1, shipClassBaseMaxHp(p.shipClass));
    p.hp = 0;
    p.lifeState = PlayerLifeState.AwaitingRespawn;
    p.respawnCountdownSec = RESPAWN_DELAY_MS / 1000;
    p.spawnProtectionSec = 0;
    row.respawnAtMs = now + RESPAWN_DELAY_MS;
    row.invulnerableUntilMs = 0;
    row.ship.speed = 0;
    row.ship.throttle = 0;
    row.ship.rudder = 0;
    row.oobSinceMs = null;
    row.primaryReadyAtMs = 0;
    row.secondaryReadyAtMs = 0;
    row.torpedoReadyAtMs = 0;
    row.adSamNextAtMs = 0;
    row.adCiwsNextAtMs = 0;
    this.pendingShells = this.pendingShells.filter((s) => s.ownerSessionId !== sessionId);
    assertPlayerLifeInvariant(p.lifeState, p.hp, p.maxHp);
  }

  private isMatchCombatActive(): boolean {
    return this.state.matchPhase === MATCH_PHASE_RUNNING;
  }

  private updateMatchTimer(now: number): void {
    if (this.matchEndBroadcastSent) {
      this.state.matchRemainingSec = 0;
      return;
    }
    const remMs = this.matchEndsAtMs - now;
    this.state.matchRemainingSec = Math.max(0, Math.ceil(remMs / 1000));
    if (now >= this.matchEndsAtMs) {
      this.endMatch();
    }
  }

  private clearAllMissilesAndTorpedoes(): void {
    const ml = this.state.missileList;
    while (ml.length > 0) {
      const i = ml.length - 1;
      const m = ml.at(i);
      if (m) this.removeMissileAt(i, m.missileId);
      else ml.deleteAt(i);
    }
    const tl = this.state.torpedoList;
    while (tl.length > 0) {
      const i = tl.length - 1;
      const t = tl.at(i);
      if (t) this.removeTorpedoAt(i, t.torpedoId);
      else tl.deleteAt(i);
    }
    this.adPendingRollByMissileId.clear();
  }

  /** Kein weiterer Kampf-Schaden / Projektile; Clients zeigen Scoreboard. */
  private endMatch(): void {
    if (this.matchEndBroadcastSent) return;
    this.matchEndBroadcastSent = true;
    this.state.matchPhase = MATCH_PHASE_ENDED;
    this.state.matchRemainingSec = 0;
    this.pendingShells = [];
    this.clearAllMissilesAndTorpedoes();
    this.broadcast("matchEnded", {} as Record<string, never>);
    console.log("[BattleRoom] match ended roomId=%s", this.roomId);
  }

  /**
   * Nach Task-10-Ende: neue Runde im **gleichen** Raum (vermeidet „Reload → sofort wieder Scoreboard“).
   * Nur gültig, wenn das Match bereits beendet war.
   */
  private resetMatchForNewRound(now: number): void {
    if (this.state.matchPhase !== MATCH_PHASE_ENDED) return;

    this.pendingShells = [];
    this.clearAllMissilesAndTorpedoes();
    this.matchEndBroadcastSent = false;
    this.matchEndsAtMs = now + MATCH_DURATION_MS;
    this.state.matchPhase = MATCH_PHASE_RUNNING;
    const remMs = this.matchEndsAtMs - now;
    this.state.matchRemainingSec = Math.max(0, Math.ceil(remMs / 1000));

    let idx = 0;
    for (const p of this.state.playerList) {
      const row = this.sim.get(p.id);
      if (!row) continue;

      const angle = idx * 2.5132741228718345;
      const r = 140;
      const spawnX = Math.cos(angle) * r;
      const spawnZ = Math.sin(angle) * r;
      const headingRad = Math.atan2(-spawnX, -spawnZ);

      row.ship.x = spawnX;
      row.ship.z = spawnZ;
      row.ship.headingRad = headingRad;
      row.ship.speed = 0;
      row.ship.throttle = 0;
      row.ship.rudder = 0;
      row.lastRudderInput = 0;
      row.aimX = spawnX;
      row.aimZ = spawnZ + 80;
      row.artillerySpawnLocalZ = 0;
      row.mineSpawnLocalZ = -22;
      row.oobSinceMs = null;
      row.primaryReadyAtMs = 0;
      row.secondaryReadyAtMs = 0;
      row.torpedoReadyAtMs = 0;
      row.adSamNextAtMs = 0;
      row.adCiwsNextAtMs = 0;
      row.respawnAtMs = null;
      row.invulnerableUntilMs = now + SPAWN_PROTECTION_DURATION_MS;

      p.x = spawnX;
      p.z = spawnZ;
      p.headingRad = headingRad;
      p.speed = 0;
      p.rudder = 0;
      p.aimX = row.aimX;
      p.aimZ = row.aimZ;
      p.oobCountdownSec = 0;
      p.level = 1;
      p.xp = 0;
      const baseHpR = shipClassBaseMaxHp(p.shipClass);
      p.maxHp = progressionMaxHpForLevel(1, baseHpR);
      p.hp = p.maxHp;
      p.primaryCooldownSec = 0;
      p.secondaryCooldownSec = 0;
      p.torpedoCooldownSec = 0;
      p.lifeState = PlayerLifeState.SpawnProtected;
      p.respawnCountdownSec = 0;
      p.spawnProtectionSec = SPAWN_PROTECTION_DURATION_MS / 1000;
      p.score = 0;
      p.kills = 0;

      assertPlayerLifeInvariant(p.lifeState, p.hp, p.maxHp);
      idx++;
    }

    this.broadcast("matchRestarted", {} as Record<string, never>);
    console.log("[BattleRoom] match restarted roomId=%s", this.roomId);
  }

  private performRespawn(sessionId: string, now: number): void {
    const row = this.sim.get(sessionId);
    const p = this.findPlayer(sessionId);
    if (!row || !p || p.lifeState !== PlayerLifeState.AwaitingRespawn) return;
    if (row.respawnAtMs == null || now < row.respawnAtMs) return;

    const others: { x: number; z: number }[] = [];
    for (const q of this.state.playerList) {
      if (q.id === sessionId) continue;
      if (q.lifeState === PlayerLifeState.AwaitingRespawn) continue;
      others.push({ x: q.x, z: q.z });
    }

    let spawn = tryPickRespawnPosition(
      AREA_OF_OPERATIONS_HALF_EXTENT,
      DEFAULT_MAP_ISLANDS,
      others,
      MIN_RESPAWN_SEPARATION,
      Math.random,
    );

    if (!spawn) {
      const idx = playerIndexInList(this.state.playerList, sessionId);
      const angle = idx * 2.5132741228718345 + sessionId.length * 0.37;
      const r = 140;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      spawn = { x, z, headingRad: Math.atan2(-x, -z) };
    }

    row.ship.x = spawn.x;
    row.ship.z = spawn.z;
    row.ship.headingRad = spawn.headingRad;
    row.ship.speed = 0;
    row.ship.throttle = 0;
    row.ship.rudder = 0;
    row.aimX = spawn.x + Math.sin(spawn.headingRad) * 80;
    row.aimZ = spawn.z + Math.cos(spawn.headingRad) * 80;
    row.artillerySpawnLocalZ = 0;
    row.mineSpawnLocalZ = -22;
    row.respawnAtMs = null;
    row.oobSinceMs = null;
    row.primaryReadyAtMs = 0;
    row.secondaryReadyAtMs = 0;
    row.torpedoReadyAtMs = 0;
    row.adSamNextAtMs = 0;
    row.adCiwsNextAtMs = 0;
    row.invulnerableUntilMs = now + SPAWN_PROTECTION_DURATION_MS;

    p.x = row.ship.x;
    p.z = row.ship.z;
    p.headingRad = row.ship.headingRad;
    p.speed = 0;
    p.rudder = 0;
    p.aimX = row.aimX;
    p.aimZ = row.aimZ;
    p.level = 1;
    p.xp = 0;
    const baseHpResp = shipClassBaseMaxHp(p.shipClass);
    p.maxHp = progressionMaxHpForLevel(1, baseHpResp);
    p.hp = p.maxHp;
    p.lifeState = PlayerLifeState.SpawnProtected;
    p.respawnCountdownSec = 0;
    p.spawnProtectionSec = SPAWN_PROTECTION_DURATION_MS / 1000;

    assertPlayerLifeInvariant(p.lifeState, p.hp, p.maxHp);
  }

  private processLifeTransitions(now: number): void {
    for (const [sessionId, row] of this.sim) {
      const p = this.findPlayer(sessionId);
      if (!p) continue;

      if (p.lifeState === PlayerLifeState.AwaitingRespawn) {
        if (row.respawnAtMs != null && now >= row.respawnAtMs) {
          this.performRespawn(sessionId, now);
        } else if (row.respawnAtMs != null) {
          p.respawnCountdownSec = Math.max(0, (row.respawnAtMs - now) / 1000);
        }
        continue;
      }

      if (p.lifeState === PlayerLifeState.SpawnProtected) {
        p.spawnProtectionSec = Math.max(0, (row.invulnerableUntilMs - now) / 1000);
        if (now >= row.invulnerableUntilMs) {
          p.lifeState = PlayerLifeState.Alive;
          p.spawnProtectionSec = 0;
          row.invulnerableUntilMs = 0;
          assertPlayerLifeInvariant(p.lifeState, p.hp, p.maxHp);
        }
        continue;
      }

      if (p.lifeState === PlayerLifeState.Alive) {
        p.respawnCountdownSec = 0;
        p.spawnProtectionSec = 0;
      }
    }
  }

  private tryPrimaryFire(client: Client, row: SimEntry): void {
    if (!this.isMatchCombatActive()) return;
    const p = this.findPlayer(client.sessionId);
    if (!p || !canUsePrimaryWeapon(p.lifeState)) return;

    const now = Date.now();
    if (now < row.primaryReadyAtMs) return;

    const arc = getShipClassProfile(p.shipClass).artilleryArcHalfAngleRad;
    const muzzleLocalZ = row.artillerySpawnLocalZ;
    const muzzleX = row.ship.x + Math.sin(row.ship.headingRad) * muzzleLocalZ;
    const muzzleZ = row.ship.z + Math.cos(row.ship.headingRad) * muzzleLocalZ;
    const salvo = tryComputeArtillerySalvo(
      muzzleX,
      muzzleZ,
      row.ship.headingRad,
      row.aimX,
      row.aimZ,
      Math.random,
      arc,
    );
    if (!salvo.ok) return;

    row.primaryReadyAtMs = now + progressionPrimaryCooldownMs(p.level);
    const shellId = this.nextShellId++;
    this.pendingShells.push({
      impactAtMs: now + salvo.flightMs,
      landX: salvo.landX,
      landZ: salvo.landZ,
      ownerSessionId: client.sessionId,
      shellId,
    });

    this.broadcast("artyFired", {
      shellId,
      ownerId: client.sessionId,
      fromX: muzzleX,
      fromZ: muzzleZ,
      toX: salvo.landX,
      toZ: salvo.landZ,
      flightMs: salvo.flightMs,
    });
  }

  private trySecondaryFire(client: Client, row: SimEntry): void {
    if (!this.isMatchCombatActive()) return;
    const p = this.findPlayer(client.sessionId);
    if (!p || !canUsePrimaryWeapon(p.lifeState)) return;

    const now = Date.now();
    if (now < row.secondaryReadyAtMs) return;

    const aswmCap = getShipClassProfile(p.shipClass).aswmMaxPerOwner;
    let owned = 0;
    for (const m of this.state.missileList) {
      if (m.ownerId === client.sessionId) owned++;
    }
    if (owned >= aswmCap) return;

    const pose = spawnAswmFromFireDirection(
      row.ship.x,
      row.ship.z,
      row.aimX,
      row.aimZ,
      row.ship.headingRad,
    );
    const missileId = this.nextMissileId++;
    const ms = new MissileState();
    ms.missileId = missileId;
    ms.ownerId = client.sessionId;
    ms.targetId = "";
    ms.x = pose.x;
    ms.z = pose.z;
    ms.headingRad = pose.headingRad;
    this.state.missileList.push(ms);
    this.missileSpawnedAt.set(missileId, now);
    const profS = getShipClassProfile(p.shipClass);
    const secCd = Math.round(
      progressionSecondaryCooldownMs(p.level) * profS.aswmCooldownFactor,
    );
    row.secondaryReadyAtMs = now + Math.max(900, secCd);
    this.broadcast("aswmFired", { missileId, ownerId: client.sessionId });
  }

  private tryTorpedoFire(client: Client, row: SimEntry): void {
    if (!this.isMatchCombatActive()) return;
    const p = this.findPlayer(client.sessionId);
    if (!p || !canUsePrimaryWeapon(p.lifeState)) return;

    const now = Date.now();
    if (now < row.torpedoReadyAtMs) return;

    const torpCap = getShipClassProfile(p.shipClass).torpedoMaxPerOwner;
    let owned = 0;
    for (const t of this.state.torpedoList) {
      if (t.ownerId === client.sessionId) owned++;
    }
    if (owned >= torpCap) return;

    const pose = spawnTorpedoFromFireDirection(
      row.ship.x,
      row.ship.z,
      row.aimX,
      row.aimZ,
      row.ship.headingRad,
      row.mineSpawnLocalZ,
    );
    const torpedoId = this.nextTorpedoId++;
    const ts = new TorpedoState();
    ts.torpedoId = torpedoId;
    ts.ownerId = client.sessionId;
    ts.x = pose.x;
    ts.z = pose.z;
    ts.headingRad = pose.headingRad;
    this.state.torpedoList.push(ts);
    this.torpedoSpawnedAt.set(torpedoId, now);
    const profT = getShipClassProfile(p.shipClass);
    const torpCd = Math.round(
      progressionTorpedoCooldownMs(p.level) * profT.torpedoCooldownFactor,
    );
    row.torpedoReadyAtMs = now + Math.max(1000, torpCd);
    this.broadcast("torpedoFired", { torpedoId, ownerId: client.sessionId });
  }

  private removeMissileAt(index: number, missileId: number): void {
    this.missileSpawnedAt.delete(missileId);
    this.adPendingRollByMissileId.delete(missileId);
    this.state.missileList.deleteAt(index);
  }

  private removeTorpedoAt(index: number, torpedoId: number): void {
    this.torpedoSpawnedAt.delete(torpedoId);
    this.state.torpedoList.deleteAt(index);
  }

  /** Nächster Gegner in SAM-Reichweite zur Rakete (wenn kein Homing-`targetId`). */
  private findClosestAirDefenseDefenderForMissile(
    mx: number,
    mz: number,
    ownerId: string,
  ): string | null {
    let best: string | null = null;
    let bestD2 = Infinity;
    for (const pl of this.state.playerList) {
      if (pl.id === ownerId) continue;
      if (!canTakeArtillerySplashDamage(pl.lifeState)) continue;
      const hb = getShipHullProfileByClass(pl.shipClass)?.collisionHitbox;
      const d2 = minDistSqPointToShipHitboxFootprintXZ(mx, mz, pl.x, pl.z, pl.headingRad, hb);
      if (d2 <= AD_SAM_RANGE_SQ && d2 < bestD2) {
        bestD2 = d2;
        best = pl.id;
      }
    }
    return best;
  }

  private stepMissiles(dt: number, now: number): void {
    const half = AREA_OF_OPERATIONS_HALF_EXTENT;
    const list = this.state.missileList;

    for (let i = list.length - 1; i >= 0; i--) {
      const m = list.at(i);
      if (!m) continue;

      const spawned = this.missileSpawnedAt.get(m.missileId) ?? now;
      if (now - spawned > ASWM_LIFETIME_MS) {
        this.removeMissileAt(i, m.missileId);
        continue;
      }

      const candidates: AswmTargetCandidate[] = [];
      for (const q of this.state.playerList) {
        candidates.push({
          id: q.id,
          x: q.x,
          z: q.z,
          lifeState: q.lifeState,
        });
      }
      const acquired = pickAswmAcquisitionTarget(
        m.x,
        m.z,
        m.headingRad,
        m.ownerId,
        candidates,
      );
      let tx: number | null = null;
      let tz: number | null = null;
      if (acquired != null) {
        const tgt = this.findPlayer(acquired);
        if (tgt && tgt.lifeState !== PlayerLifeState.AwaitingRespawn) {
          tx = tgt.x;
          tz = tgt.z;
        }
      }
      m.targetId = acquired ?? "";

      const step = stepAswmMissile(m.x, m.z, m.headingRad, dt, tx, tz);
      m.x = step.x;
      m.z = step.z;
      m.headingRad = step.headingRad;

      if (!isInsideOperationalArea(m.x, m.z, half)) {
        this.broadcast("aswmImpact", {
          missileId: m.missileId,
          x: m.x,
          z: m.z,
          kind: "oob",
        });
        this.removeMissileAt(i, m.missileId);
        continue;
      }

      if (isInsideAnyIslandCircle(m.x, m.z, DEFAULT_MAP_ISLANDS, ASWM_ISLAND_COLLISION_RADIUS)) {
        this.broadcast("aswmImpact", {
          missileId: m.missileId,
          x: m.x,
          z: m.z,
          kind: "island",
        });
        this.removeMissileAt(i, m.missileId);
        continue;
      }

      let adDefenderId: string | null = null;
      if (m.targetId !== "") {
        const t = this.findPlayer(m.targetId);
        if (t && canTakeArtillerySplashDamage(t.lifeState)) {
          adDefenderId = m.targetId;
        }
      }
      if (adDefenderId == null) {
        adDefenderId = this.findClosestAirDefenseDefenderForMissile(m.x, m.z, m.ownerId);
      }
      if (adDefenderId != null) {
        const tgt = this.findPlayer(adDefenderId);
        const defRow = this.sim.get(adDefenderId);
        if (!tgt || !defRow || !canTakeArtillerySplashDamage(tgt.lifeState)) {
          this.adPendingRollByMissileId.delete(m.missileId);
        } else {
          const hb = getShipHullProfileByClass(tgt.shipClass)?.collisionHitbox;
          const distSq = minDistSqPointToShipHitboxFootprintXZ(m.x, m.z, tgt.x, tgt.z, tgt.headingRad, hb);
          const adInput = {
            distSq,
            nowMs: now,
            samNextAtMs: defRow.adSamNextAtMs,
            ciwsNextAtMs: defRow.adCiwsNextAtMs,
          };

          let airDefenseConsumed = false;
          const pending = this.adPendingRollByMissileId.get(m.missileId);
          if (pending != null) {
            if (pending.defenderId !== adDefenderId) {
              this.adPendingRollByMissileId.delete(m.missileId);
            } else {
              airDefenseConsumed = true;
              if (!isAirDefenseLayerInRange(pending.layer, distSq)) {
                const cdMiss = applyAirDefenseCooldownAfterRoll(
                  pending.layer,
                  now,
                  defRow.adSamNextAtMs,
                  defRow.adCiwsNextAtMs,
                );
                defRow.adSamNextAtMs = cdMiss.samNextAtMs;
                defRow.adCiwsNextAtMs = cdMiss.ciwsNextAtMs;
              } else {
                const hit = rollAirDefenseHit(pending.layer, Math.random);
                const cd = applyAirDefenseCooldownAfterRoll(
                  pending.layer,
                  now,
                  defRow.adSamNextAtMs,
                  defRow.adCiwsNextAtMs,
                );
                defRow.adSamNextAtMs = cd.samNextAtMs;
                defRow.adCiwsNextAtMs = cd.ciwsNextAtMs;
                if (hit) {
                  this.broadcast("airDefenseIntercept", {
                    weapon: "aswm",
                    id: m.missileId,
                    defenderId: adDefenderId,
                    defenderX: tgt.x,
                    defenderZ: tgt.z,
                    layer: pending.layer,
                    x: m.x,
                    z: m.z,
                  });
                  this.adPendingRollByMissileId.delete(m.missileId);
                  this.removeMissileAt(i, m.missileId);
                  continue;
                }
              }
              this.adPendingRollByMissileId.delete(m.missileId);
            }
          }

          if (!airDefenseConsumed) {
            const layer = pickAirDefenseEngagementLayer(adInput);
            if (layer != null) {
              this.adPendingRollByMissileId.set(m.missileId, {
                defenderId: adDefenderId,
                layer,
              });
              this.broadcast("airDefenseFire", {
                weapon: "aswm",
                id: m.missileId,
                defenderId: adDefenderId,
                defenderX: tgt.x,
                defenderZ: tgt.z,
                layer,
                x: m.x,
                z: m.z,
              });
            }
          }
        }
      } else {
        this.adPendingRollByMissileId.delete(m.missileId);
      }

      let hitId: string | null = null;
      for (const pl of this.state.playerList) {
        if (pl.id === m.ownerId) continue;
        if (!canTakeArtillerySplashDamage(pl.lifeState)) continue;
        const hb = getShipHullProfileByClass(pl.shipClass)?.collisionHitbox;
        if (
          circleIntersectsShipHitboxFootprintXZ(m.x, m.z, ASWM_HIT_RADIUS, pl.x, pl.z, pl.headingRad, hb)
        ) {
          hitId = pl.id;
          break;
        }
      }

      if (hitId != null) {
        const victim = this.findPlayer(hitId);
        if (victim) {
          const wasNotDead = victim.lifeState !== PlayerLifeState.AwaitingRespawn;
          const aswmDmg = Math.round(
            ASWM_DAMAGE *
              progressionIncomingDamageFactor(victim.level) *
              getShipClassProfile(victim.shipClass).incomingDamageTakenMul,
          );
          victim.hp = Math.max(0, victim.hp - aswmDmg);
          if (victim.hp <= 0 && wasNotDead) {
            this.enterAwaitingRespawn(victim.id, now, { killerSessionId: m.ownerId });
          }
        }
        this.broadcast("aswmImpact", {
          missileId: m.missileId,
          x: m.x,
          z: m.z,
          kind: "hit",
        });
        this.removeMissileAt(i, m.missileId);
      }
    }
  }

  private stepTorpedoes(dt: number, now: number): void {
    const half = AREA_OF_OPERATIONS_HALF_EXTENT;
    const list = this.state.torpedoList;

    for (let i = list.length - 1; i >= 0; i--) {
      const t = list.at(i);
      if (!t) continue;

      const spawned = this.torpedoSpawnedAt.get(t.torpedoId) ?? now;
      if (now - spawned > TORPEDO_LIFETIME_MS) {
        this.removeTorpedoAt(i, t.torpedoId);
        continue;
      }

      const step = stepTorpedoStraight(t.x, t.z, t.headingRad, dt);
      t.x = step.x;
      t.z = step.z;
      t.headingRad = step.headingRad;

      if (!isInsideOperationalArea(t.x, t.z, half)) {
        this.broadcast("torpedoImpact", {
          torpedoId: t.torpedoId,
          x: t.x,
          z: t.z,
          kind: "oob",
        });
        this.removeTorpedoAt(i, t.torpedoId);
        continue;
      }

      if (isInsideAnyIslandCircle(t.x, t.z, DEFAULT_MAP_ISLANDS, TORPEDO_ISLAND_COLLISION_RADIUS)) {
        this.broadcast("torpedoImpact", {
          torpedoId: t.torpedoId,
          x: t.x,
          z: t.z,
          kind: "island",
        });
        this.removeTorpedoAt(i, t.torpedoId);
        continue;
      }

      let hitId: string | null = null;
      for (const pl of this.state.playerList) {
        // Minen sind Flächen-Trigger: alles außer bereits respawnenden Zielen kann auslösen.
        if (pl.lifeState === PlayerLifeState.AwaitingRespawn) continue;
        const hb = getShipHullProfileByClass(pl.shipClass)?.collisionHitbox;
        if (
          circleIntersectsShipHitboxFootprintXZ(t.x, t.z, TORPEDO_HIT_RADIUS, pl.x, pl.z, pl.headingRad, hb)
        ) {
          hitId = pl.id;
          break;
        }
      }

      if (hitId != null) {
        const victim = this.findPlayer(hitId);
        if (victim) {
          const wasNotDead = victim.lifeState !== PlayerLifeState.AwaitingRespawn;
          // Mine verursacht 90% der Max-HP des Opfers, damit sie meist kampfunfähig macht,
          // aber bei voller HP nicht zwingend sofort tötet.
          const torpDmg = Math.max(1, Math.round(victim.maxHp * 0.9));
          victim.hp = Math.max(0, victim.hp - torpDmg);
          if (victim.hp <= 0 && wasNotDead) {
            this.enterAwaitingRespawn(victim.id, now, { killerSessionId: t.ownerId });
          }
        }
        this.broadcast("torpedoImpact", {
          torpedoId: t.torpedoId,
          x: t.x,
          z: t.z,
          kind: "hit",
        });
        this.removeTorpedoAt(i, t.torpedoId);
      }
    }
  }

  private resolveShellImpacts(now: number): void {
    const stay: PendingShell[] = [];

    for (const sh of this.pendingShells) {
      if (sh.impactAtMs > now) {
        stay.push(sh);
        continue;
      }

      let damagedAnyEnemy = false;
      for (const p of this.state.playerList) {
        if (p.id === sh.ownerSessionId) continue;
        if (!canTakeArtillerySplashDamage(p.lifeState)) continue;
        const hb = getShipHullProfileByClass(p.shipClass)?.collisionHitbox;
        if (
          !circleIntersectsShipHitboxFootprintXZ(
            sh.landX,
            sh.landZ,
            ARTILLERY_SPLASH_RADIUS,
            p.x,
            p.z,
            p.headingRad,
            hb,
          )
        ) {
          continue;
        }
        const wasNotDead = p.lifeState !== PlayerLifeState.AwaitingRespawn;
        const artyDmg = Math.round(
          ARTILLERY_DAMAGE *
            progressionIncomingDamageFactor(p.level) *
            getShipClassProfile(p.shipClass).incomingDamageTakenMul,
        );
        p.hp = Math.max(0, p.hp - artyDmg);
        if (p.hp <= 0 && wasNotDead) {
          this.enterAwaitingRespawn(p.id, now, { killerSessionId: sh.ownerSessionId });
        }
        damagedAnyEnemy = true;
      }

      // Minen im Artillerie-Splash werden entschärft und aus dem Spiel entfernt.
      const torpedoes = this.state.torpedoList;
      const splashSq = ARTILLERY_SPLASH_RADIUS * ARTILLERY_SPLASH_RADIUS;
      for (let i = torpedoes.length - 1; i >= 0; i--) {
        const t = torpedoes.at(i);
        if (!t) continue;
        const dx = t.x - sh.landX;
        const dz = t.z - sh.landZ;
        if (dx * dx + dz * dz > splashSq) continue;
        this.broadcast("torpedoImpact", {
          torpedoId: t.torpedoId,
          x: t.x,
          z: t.z,
          kind: "water",
        });
        this.removeTorpedoAt(i, t.torpedoId);
      }

      const kind = classifyArtilleryImpactVisual(
        sh.landX,
        sh.landZ,
        damagedAnyEnemy,
        DEFAULT_MAP_ISLANDS,
      );
      this.broadcast("artyImpact", {
        shellId: sh.shellId,
        x: sh.landX,
        z: sh.landZ,
        kind,
      });
    }

    this.pendingShells = stay;
  }

  private physicsStep(dt: number): void {
    const now = Date.now();
    const half = AREA_OF_OPERATIONS_HALF_EXTENT;

    this.updateMatchTimer(now);
    const combatActive = this.isMatchCombatActive();
    if (combatActive) {
      this.resolveShellImpacts(now);
    } else {
      this.pendingShells = [];
    }
    this.processLifeTransitions(now);

    for (const [sessionId, row] of this.sim) {
      const p = this.findPlayer(sessionId);
      if (!p) continue;

      if (participatesInWorldSimulation(p.lifeState)) {
        row.ship.rudder = smoothRudder(
          row.ship.rudder,
          row.lastRudderInput,
          this.cfg.rudderResponsiveness,
          dt,
        );
        stepMovement(row.ship, this.movementCfgForPlayer(p), dt);
        resolveShipIslandCollisions(
          row.ship,
          DEFAULT_MAP_ISLANDS,
          getShipHullProfileByClass(p.shipClass)?.collisionHitbox,
        );
      }
    }

    const shipShipParticipants: ShipCollisionParticipant[] = [];
    for (const [sessionId, row] of this.sim) {
      const p = this.findPlayer(sessionId);
      if (!p || !participatesInWorldSimulation(p.lifeState)) continue;
      shipShipParticipants.push({
        ship: row.ship,
        hitbox: getShipHullProfileByClass(p.shipClass)?.collisionHitbox,
        sessionId,
      });
    }
    if (combatActive) {
      const ram = accumulateShipRamDamage(shipShipParticipants, dt);
      for (const [sessionId, raw] of ram.rawDamageBySessionId) {
        const p = this.findPlayer(sessionId);
        if (!p || !canTakeArtillerySplashDamage(p.lifeState)) continue;
        const wasNotDead = p.lifeState !== PlayerLifeState.AwaitingRespawn;
        const dmg = Math.round(
          raw *
            progressionIncomingDamageFactor(p.level) *
            getShipClassProfile(p.shipClass).incomingDamageTakenMul,
        );
        if (dmg <= 0) continue;
        p.hp = Math.max(0, p.hp - dmg);
        if (p.hp <= 0 && wasNotDead) {
          const killer = ram.killerByVictimSessionId.get(sessionId);
          this.enterAwaitingRespawn(sessionId, now, {
            killerSessionId: killer,
          });
        }
      }
    }
    resolveShipShipCollisions(shipShipParticipants);

    for (const [sessionId, row] of this.sim) {
      const p = this.findPlayer(sessionId);
      if (!p) continue;

      p.x = row.ship.x;
      p.z = row.ship.z;
      p.headingRad = row.ship.headingRad;
      p.speed = row.ship.speed;
      p.rudder = row.ship.rudder;
      p.aimX = row.aimX;
      p.aimZ = row.aimZ;

      p.primaryCooldownSec = Math.max(0, (row.primaryReadyAtMs - now) / 1000);
      p.secondaryCooldownSec = Math.max(0, (row.secondaryReadyAtMs - now) / 1000);
      p.torpedoCooldownSec = Math.max(0, (row.torpedoReadyAtMs - now) / 1000);

      if (
        (p.lifeState === PlayerLifeState.Alive || p.lifeState === PlayerLifeState.SpawnProtected) &&
        p.hp > 0 &&
        p.hp < p.maxHp
      ) {
        const regen = p.maxHp * HP_REGEN_PER_SEC_FACTOR * dt;
        p.hp = Math.min(p.maxHp, p.hp + regen);
      }

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
        if (elapsed >= OOB_DESTROY_AFTER_MS) {
          p.oobCountdownSec = 0;
          this.enterAwaitingRespawn(sessionId, now);
        } else {
          p.oobCountdownSec = Math.max(0, (OOB_DESTROY_AFTER_MS - elapsed) / 1000);
        }
      }
    }

    if (combatActive) {
      this.stepMissiles(dt, now);
      this.stepTorpedoes(dt, now);
    }
  }
}
