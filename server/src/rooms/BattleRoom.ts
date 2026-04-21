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
  ASWM_SEEKER_ARM_DELAY_MS,
  type AswmTargetCandidate,
  BattleState,
  ShipWreckState,
  DEFAULT_MAP_ISLAND_POLYGONS,
  DESTROYER_LIKE_MVP,
  FEATURE_MINES_ENABLED,
  MissileState,
  OOB_DESTROY_AFTER_MS,
  TORPEDO_HIT_RADIUS,
  TORPEDO_ISLAND_COLLISION_RADIUS,
  TORPEDO_LIFETIME_MS,
  TorpedoState,
  PlayerLifeState,
  PlayerState,
  type FixedSeaSkimmerLauncherSpec,
  type ShipMovementConfig,
  ShipMovementState,
  assertPlayerLifeInvariant,
  canTakeArtillerySplashDamage,
  canUsePrimaryWeapon,
  classifyArtilleryImpactVisual,
  createShipState,
  ISLAND_SCRAPE_BASE_HP,
  isCircleOverlappingAnyIslandPolygon,
  isInsideOperationalArea,
  MIN_RESPAWN_SEPARATION,
  participatesInWorldSimulation,
  pickAswmAcquisitionTarget,
  AD_SAM_RANGE_SQ,
  AD_SOFTKILL_RANGE_SQ,
  AD_SOFTKILL_SAME_TARGET_REACQUIRE_BLOCK_MS,
  type AirDefenseHardkillLayer,
  applyHardkillCooldownAfterRoll,
  isHardkillLayerInRange,
  pickHardkillEngagementLayer,
  rollHardkillHit,
  trySoftkillBreakLock,
  computeSamPdInterceptTravelMs,
  resolveShipIslandCollisions,
  resolveShipAndWreckObbOverlaps,
  resolveShipShipCollisions,
  type ShipCollisionParticipant,
  accumulateShipRamDamage,
  accumulateWreckRamDamage,
  RESPAWN_DELAY_MS,
  SPAWN_PROTECTION_DURATION_MS,
  smoothRudder,
  ASWM_SHOT_INTERVAL_MS,
  pickFixedSeaSkimmerLauncherWithAmmo,
  pickFixedSeaSkimmerLauncherWithAmmoForForcedSide,
  pickAswmSideForFallbackFire,
  pickAswmSideForFallbackFireForced,
  spawnAswmFromFixedLauncher,
  spawnAswmFromFireDirection,
  spawnTorpedoFromFireDirection,
  stepAswmMissile,
  stepTorpedoStraight,
  movementConfigForPlayer,
  stepMovement,
  tryComputeArtillerySalvo,
  tryPickRespawnPosition,
  pickRimSpawnDeterministic,
  MATCH_DURATION_MS,
  MATCH_PASSIVE_XP_BASE,
  MATCH_PASSIVE_XP_INTERVAL_MS,
  MATCH_PHASE_ENDED,
  MATCH_PHASE_RUNNING,
  isValidKillAttribution,
  PROGRESSION_XP_PER_KILL,
  progressionIncomingDamageFactor,
  progressionLevelFromTotalXp,
  progressionMaxHpForLevel,
  progressionMinXpForLevel,
  progressionPrimaryCooldownMs,
  progressionTorpedoCooldownMs,
  sanitizePlayerDisplayName,
  getShipClassProfile,
  getAswmMagazineFromProfile,
  getAswmMagicReloadMsFromProfile,
  getAuthoritativeShipHullProfile,
  hullProvidesAirDefenseCiwsLayer,
  hullProvidesAirDefensePdLayer,
  hullProvidesAirDefenseSamLayer,
  listPrimaryArtilleryMountConfigs,
  shipClassBaseMaxHp,
  normalizeShipClassId,
  SHIP_CLASS_CRUISER,
  SHIP_CLASS_DESTROYER,
  SHIP_CLASS_FAC,
  shipClassIdForProgressionLevel,
  wreckVariantFromSessionId,
  WRECK_DURATION_MS,
  circleIntersectsAnyWreckHitboxFootprintXZ,
  circleIntersectsShipHitboxFootprintXZ,
  minDistSqPointToShipHitboxFootprintXZ,
  shipOverlapsAnyIslandPolygons,
  shipOverlapsAnyWreck,
  twoShipsObbOverlap,
  shipLocalToWorldXZ,
  isInSeaControlZone,
  missileBearingInHardkillLayerMountSector,
  SEA_CONTROL_XP_MULTIPLIER,
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
  /** Optional: ASuM von fester Seite (Mobile) — überschreibt Aim-basierte Rail-Wahl. */
  aswmFireSide?: "port" | "starboard";
  /** Torpedo (Task 8): Mausrad-Klick gehalten oder Taste Q. */
  torpedoFire?: boolean;
  /** Debug-Tuning: Minen-Ablage entlang Schiffs-Längsachse (lokales -Z = Heck). */
  mineSpawnLocalZ?: number;
  /** Suchrad an/aus — steuert ESM-Sichtbarkeit für Gegner (repliziert). */
  radarActive?: boolean;
};

type SimEntry = {
  ship: ShipMovementState;
  lastRudderInput: number;
  aimX: number;
  aimZ: number;
  mineSpawnLocalZ: number;
  oobSinceMs: number | null;
  /** Date.now() ab dem Primärfeuer erlaubt ist. */
  primaryReadyAtMs: number;
  /** ASuM-Runden Magazin (Backbord / Steuerbord). */
  aswmRemainingPort: number;
  aswmRemainingStarboard: number;
  /** Date.now() ab dem nächsten ASuM-Schuss erlaubt ist (bei Magazin > 0). */
  aswmNextShotAtMs: number;
  /** Date.now() bis Magic Reload fertig; 0 = nicht im Reload. */
  aswmReloadUntilMs: number;
  /** Date.now() ab Torpedo-Start erlaubt ist. */
  torpedoReadyAtMs: number;
  /** Hardkill-Schichten: früheste nächste Schusszeit (0 = sofort verfügbar). */
  adSamNextAtMs: number;
  adPdNextAtMs: number;
  adCiwsNextAtMs: number;
  /** Softkill (ECM): letzter Versuch (Date.now()). */
  adSoftkillLastUsedAtMs: number;
  /** Nach Tod: Zeitpunkt des Respawns; `null` wenn nicht wartend. */
  respawnAtMs: number | null;
  /** Nach Respawn: Ende der Schutzphase; `0` = keine Invulnerabilität. */
  invulnerableUntilMs: number;
  /** Suchrad — ESM-Emission für Gegner. */
  radarActive: boolean;
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

/** Nur exakte Klassen-IDs — kein `normalizeShipClassId`-Fallback auf FAC. */
function parseDebugShipClassPayload(raw: unknown): typeof SHIP_CLASS_FAC | typeof SHIP_CLASS_DESTROYER | typeof SHIP_CLASS_CRUISER | null {
  const s = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  if (s === SHIP_CLASS_FAC || s === SHIP_CLASS_DESTROYER || s === SHIP_CLASS_CRUISER) return s;
  return null;
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
  /**
   * Nach `airDefenseFire`: SAM/PD warten `rollReadyAtMs` (Flug bis ASuM), dann Trefferwurf;
   * CIWS: `rollReadyAtMs === now` → nächster Tick.
   */
  private readonly adPendingRollByMissileId = new Map<
    number,
    { defenderId: string; layer: AirDefenseHardkillLayer; rollReadyAtMs: number }
  >();
  /** Softkill: höchstens ein Versuch pro Rakete+Verteidiger. */
  private readonly adSoftkillAttemptedMissileDefender = new Set<string>();
  /** Nach erfolgreichem Softkill: Seeker-Ziel `defenderId` bis `untilMs` nicht wieder annehmen. */
  private readonly aswmSoftkillReacquireBlockByMissileId = new Map<
    number,
    { defenderId: string; untilMs: number }
  >();
  /** Task 10 — absolutes Ende (Date.now()); läuft ab Raum-Erstellung. */
  private matchEndsAtMs = 0;
  private matchEndBroadcastSent = false;
  /** Letzter Zeitpunkt für passives Score-Tick (alle Spieler). */
  private lastPassiveXpAtMs = 0;
  /** Pro Spieler: Insel-Overlap vor `resolveShipIslandCollisions` (Vor-Frame für Kanten-SFX). */
  private collisionIslandOverlapPrev = new Map<string, boolean>();
  /** Pro Spieler: Wrack-OBB-Overlap (Vor-Frame für Kanten-SFX, gleicher „ship“-Kontakt wie Rumpf). */
  private collisionWreckOverlapPrev = new Map<string, boolean>();
  /** OBB-überlappende Schiff-Paare (`idA|idB`), Vor-Frame für Kanten-SFX bei Schiff-Schiff. */
  private collisionShipPairPrev = new Set<string>();

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
      const mineSpawnLocalZ = payload.mineSpawnLocalZ;
      if (typeof mineSpawnLocalZ === "number" && Number.isFinite(mineSpawnLocalZ)) {
        row.mineSpawnLocalZ = clampRange(mineSpawnLocalZ, -140, 20);
      }
      if (typeof payload.radarActive === "boolean") {
        row.radarActive = payload.radarActive;
      }

      if (payload.primaryFire === true) {
        this.tryPrimaryFire(client, row);
      }
      if (payload.secondaryFire === true) {
        const s = payload.aswmFireSide;
        this.trySecondaryFire(
          client,
          row,
          s === "port" || s === "starboard" ? s : undefined,
        );
      }
      if (payload.torpedoFire === true) {
        this.tryTorpedoFire(client, row);
      }
    });

    this.onMessage("debugSetShipClass", (client, payload: { shipClass?: string }) => {
      if (process.env.NODE_ENV === "production" && process.env.BFA_DEBUG_SHIP_SWITCH !== "1") {
        return;
      }
      const nextClass = parseDebugShipClassPayload(payload?.shipClass);
      if (!nextClass) return;
      const ps = this.findPlayer(client.sessionId);
      const row = this.sim.get(client.sessionId);
      if (!ps || !row) return;
      if (ps.lifeState === PlayerLifeState.AwaitingRespawn) return;
      if (normalizeShipClassId(ps.shipClass) === nextClass) return;

      ps.shipClass = nextClass;
      const baseHp = shipClassBaseMaxHp(nextClass);
      const mx = progressionMaxHpForLevel(ps.level, baseHp);
      const ratio = ps.maxHp > 0 ? ps.hp / ps.maxHp : 1;
      ps.maxHp = mx;
      ps.hp = Math.max(1, Math.min(mx, Math.round(mx * ratio)));
      this.resetAswmMagazineFromClass(row, nextClass);
    });

    this.setSimulationInterval((timeDelta) => {
      const dtSec = timeDelta / 1000;
      this.physicsStep(dtSec);
    }, 1000 / TICK_HZ);

    this.lastPassiveXpAtMs = Date.now();
    this.maxClients = 16;
  }

  private findPlayer(sessionId: string): PlayerState | undefined {
    for (const p of this.state.playerList) {
      if (p.id === sessionId) return p;
    }
    return undefined;
  }

  private resetAswmMagazineFromClass(row: SimEntry, shipClass: string): void {
    const id = normalizeShipClassId(shipClass);
    const m = getAswmMagazineFromProfile(getAuthoritativeShipHullProfile(id), id);
    row.aswmRemainingPort = m.port;
    row.aswmRemainingStarboard = m.starboard;
    row.aswmNextShotAtMs = 0;
    row.aswmReloadUntilMs = 0;
  }

  private clearAswmMagazine(row: SimEntry): void {
    row.aswmRemainingPort = 0;
    row.aswmRemainingStarboard = 0;
    row.aswmNextShotAtMs = 0;
    row.aswmReloadUntilMs = 0;
  }

  private consumeOneAswmRound(row: SimEntry, launcher: FixedSeaSkimmerLauncherSpec): void {
    if (launcher.side === "port") {
      row.aswmRemainingPort--;
      return;
    }
    if (launcher.side === "starboard") {
      row.aswmRemainingStarboard--;
      return;
    }
    if (row.aswmRemainingPort > 0) row.aswmRemainingPort--;
    else row.aswmRemainingStarboard--;
  }

  private processAswmMagazineReload(now: number): void {
    for (const [sessionId, row] of this.sim) {
      if (row.aswmReloadUntilMs <= 0 || now < row.aswmReloadUntilMs) continue;
      const p = this.findPlayer(sessionId);
      if (!p) continue;
      row.aswmReloadUntilMs = 0;
      this.resetAswmMagazineFromClass(row, p.shipClass);
      const client = this.clients.find((c) => c.sessionId === sessionId);
      client?.send("aswmMagazineReloaded", {} as Record<string, never>);
    }
  }

  private movementCfgForPlayer(p: PlayerState): ShipMovementConfig {
    return movementConfigForPlayer(
      this.cfg,
      getShipClassProfile(p.shipClass),
      p.level,
      getAuthoritativeShipHullProfile(p.shipClass)?.movement ?? null,
    );
  }

  /**
   * Nach Levelaufstieg: Schiffsklasse zu Level (5→DD, 7→CG) und maxHp wie bei `grantXpForKill`.
   */
  private syncShipClassAndHpAfterLevelUp(p: PlayerState, row: SimEntry | undefined): void {
    const desired = shipClassIdForProgressionLevel(p.level);
    if (normalizeShipClassId(p.shipClass) !== desired) {
      p.shipClass = desired;
      if (row) this.resetAswmMagazineFromClass(row, desired);
    }
    const baseHp = shipClassBaseMaxHp(p.shipClass);
    const mx = progressionMaxHpForLevel(p.level, baseHp);
    const d = mx - p.maxHp;
    p.maxHp = mx;
    p.hp = Math.min(p.hp + Math.max(0, d), p.maxHp);
  }

  /** Leben-XP + Runden-Score + Level; gleiche Logik für Kills und passives Tick. */
  private grantXpAndProgress(p: PlayerState, row: SimEntry | undefined, amount: number): void {
    if (amount <= 0) return;
    p.xp += amount;
    p.score += amount;
    const targetLevel = progressionLevelFromTotalXp(p.xp);
    while (p.level < targetLevel) {
      p.level += 1;
      this.syncShipClassAndHpAfterLevelUp(p, row);
    }
  }

  /** Task 11 — nach Kill (serverseitig, nur Leben-Progression + Score). */
  private grantXpForKill(killer: PlayerState): void {
    const row = this.sim.get(killer.id);
    this.grantXpAndProgress(killer, row, PROGRESSION_XP_PER_KILL);
  }

  /** Passives XP für alle im Kampf simulierten Spieler; Sea Control ×5. */
  private applyPassiveXpTick(now: number): void {
    if (this.state.matchPhase !== MATCH_PHASE_RUNNING) return;
    if (now - this.lastPassiveXpAtMs < MATCH_PASSIVE_XP_INTERVAL_MS) return;
    this.lastPassiveXpAtMs = now;

    for (const p of this.state.playerList) {
      if (!participatesInWorldSimulation(p.lifeState)) continue;
      const row = this.sim.get(p.id);
      const mult = isInSeaControlZone(p.x, p.z) ? SEA_CONTROL_XP_MULTIPLIER : 1;
      const amt = MATCH_PASSIVE_XP_BASE * mult;
      this.grantXpAndProgress(p, row, amt);
    }
  }

  onJoin(client: Client, options?: { shipClass?: string; displayName?: string }) {
    const shipClass = SHIP_CLASS_FAC;
    const displayName = sanitizePlayerDisplayName(options?.displayName);
    const others: { x: number; z: number }[] = [];
    for (const q of this.state.playerList) {
      others.push({ x: q.x, z: q.z });
    }
    const angleForFallback =
      this.state.playerList.length * 2.5132741228718345 + client.sessionId.length * 0.37;
    const spawnPick =
      tryPickRespawnPosition(
        AREA_OF_OPERATIONS_HALF_EXTENT,
        DEFAULT_MAP_ISLAND_POLYGONS,
        others,
        MIN_RESPAWN_SEPARATION,
        Math.random,
      ) ??
      pickRimSpawnDeterministic(
        AREA_OF_OPERATIONS_HALF_EXTENT,
        DEFAULT_MAP_ISLAND_POLYGONS,
        others,
        MIN_RESPAWN_SEPARATION,
        angleForFallback,
      );
    const spawnX = spawnPick.x;
    const spawnZ = spawnPick.z;

    const ship = createShipState(spawnX, spawnZ);
    ship.headingRad = spawnPick.headingRad;
    const aimX = spawnX;
    const aimZ = spawnZ + 80;
    const simRow: SimEntry = {
      ship,
      lastRudderInput: 0,
      aimX,
      aimZ,
      mineSpawnLocalZ: -22,
      oobSinceMs: null,
      primaryReadyAtMs: 0,
      aswmRemainingPort: 0,
      aswmRemainingStarboard: 0,
      aswmNextShotAtMs: 0,
      aswmReloadUntilMs: 0,
      torpedoReadyAtMs: 0,
      adSamNextAtMs: 0,
      adPdNextAtMs: 0,
      adCiwsNextAtMs: 0,
      adSoftkillLastUsedAtMs: 0,
      respawnAtMs: null,
      invulnerableUntilMs: 0,
      radarActive: true,
    };
    this.resetAswmMagazineFromClass(simRow, shipClass);
    this.sim.set(client.sessionId, simRow);

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
    ps.radarActive = true;
    ps.adHudIncomingAswm = 0;
    ps.adHudCanCommitHardkill = false;
    ps.adHardkillCommitRemainingSec = 0;
    ps.adHudRadarAffectsSam = false;
    ps.aswmRemainingPort = simRow.aswmRemainingPort;
    ps.aswmRemainingStarboard = simRow.aswmRemainingStarboard;
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
    this.collisionIslandOverlapPrev.delete(client.sessionId);
    this.collisionWreckOverlapPrev.delete(client.sessionId);
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
        killer.kills += 1;
        this.grantXpForKill(killer);
      }
    }

    const newLevel = Math.max(1, p.level - 1);
    const nextClass = shipClassIdForProgressionLevel(newLevel);
    p.level = newLevel;
    p.xp = progressionMinXpForLevel(newLevel);
    // `shipClass` bleibt der zerstörte Rumpf (Wrack-GLB), bis `performRespawn` — nicht sofort degradiert.
    const baseHpDead = shipClassBaseMaxHp(nextClass);
    p.maxHp = progressionMaxHpForLevel(newLevel, baseHpDead);
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
    this.clearAswmMagazine(row);
    row.torpedoReadyAtMs = 0;
    row.adSamNextAtMs = 0;
    row.adPdNextAtMs = 0;
    row.adCiwsNextAtMs = 0;
    row.adSoftkillLastUsedAtMs = 0;
    this.pendingShells = this.pendingShells.filter((s) => s.ownerSessionId !== sessionId);
    p.deathAtMs = now;
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
    this.adSoftkillAttemptedMissileDefender.clear();
    this.aswmSoftkillReacquireBlockByMissileId.clear();
  }

  /** Kein weiterer Kampf-Schaden / Projektile; Clients zeigen Scoreboard. */
  private endMatch(): void {
    if (this.matchEndBroadcastSent) return;
    this.matchEndBroadcastSent = true;
    this.state.matchPhase = MATCH_PHASE_ENDED;
    this.state.matchRemainingSec = 0;
    this.pendingShells = [];
    this.clearAllMissilesAndTorpedoes();
    this.clearWreckList();
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
    this.clearWreckList();
    this.collisionIslandOverlapPrev.clear();
    this.collisionWreckOverlapPrev.clear();
    this.matchEndBroadcastSent = false;
    this.matchEndsAtMs = now + MATCH_DURATION_MS;
    this.lastPassiveXpAtMs = now;
    this.state.matchPhase = MATCH_PHASE_RUNNING;
    const remMs = this.matchEndsAtMs - now;
    this.state.matchRemainingSec = Math.max(0, Math.ceil(remMs / 1000));

    const placed: { x: number; z: number }[] = [];
    for (const p of this.state.playerList) {
      const row = this.sim.get(p.id);
      if (!row) continue;

      const angleSeed =
        placed.length * 2.5132741228718345 + p.id.length * 0.37;
      const spawnPick =
        tryPickRespawnPosition(
          AREA_OF_OPERATIONS_HALF_EXTENT,
          DEFAULT_MAP_ISLAND_POLYGONS,
          placed,
          MIN_RESPAWN_SEPARATION,
          Math.random,
        ) ??
        pickRimSpawnDeterministic(
          AREA_OF_OPERATIONS_HALF_EXTENT,
          DEFAULT_MAP_ISLAND_POLYGONS,
          placed,
          MIN_RESPAWN_SEPARATION,
          angleSeed,
        );
      const spawnX = spawnPick.x;
      const spawnZ = spawnPick.z;
      const headingRad = spawnPick.headingRad;
      placed.push({ x: spawnX, z: spawnZ });

      row.ship.x = spawnX;
      row.ship.z = spawnZ;
      row.ship.headingRad = headingRad;
      row.ship.speed = 0;
      row.ship.throttle = 0;
      row.ship.rudder = 0;
      row.lastRudderInput = 0;
      row.aimX = spawnX;
      row.aimZ = spawnZ + 80;
      row.mineSpawnLocalZ = -22;
      row.oobSinceMs = null;
      row.primaryReadyAtMs = 0;
      this.resetAswmMagazineFromClass(row, p.shipClass);
      row.torpedoReadyAtMs = 0;
      row.adSamNextAtMs = 0;
      row.adPdNextAtMs = 0;
      row.adCiwsNextAtMs = 0;
      row.adSoftkillLastUsedAtMs = 0;
      row.respawnAtMs = null;
      row.invulnerableUntilMs = now + SPAWN_PROTECTION_DURATION_MS;
      row.radarActive = true;

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
      p.shipClass = SHIP_CLASS_FAC;
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
      p.radarActive = true;
      p.deathAtMs = 0;

      assertPlayerLifeInvariant(p.lifeState, p.hp, p.maxHp);
    }

    this.broadcast("matchRestarted", {} as Record<string, never>);
    console.log("[BattleRoom] match restarted roomId=%s", this.roomId);
  }

  private performRespawn(sessionId: string, now: number): void {
    const row = this.sim.get(sessionId);
    const p = this.findPlayer(sessionId);
    if (!row || !p || p.lifeState !== PlayerLifeState.AwaitingRespawn) return;
    if (row.respawnAtMs == null || now < row.respawnAtMs) return;

    const deadShipClass = p.shipClass;
    const deadHeading = row.ship.headingRad;
    const anchorX = row.ship.x;
    const anchorZ = row.ship.z;
    const w = new ShipWreckState();
    w.wreckId = `w-${sessionId}-${now}`;
    w.anchorX = anchorX;
    w.anchorZ = anchorZ;
    w.headingRad = deadHeading;
    w.variant = wreckVariantFromSessionId(sessionId);
    w.shipClass = deadShipClass;
    w.deathAtMs = p.deathAtMs > 0 ? p.deathAtMs : now;
    w.createdAtMs = now;
    w.expiresAtMs = now + WRECK_DURATION_MS;
    this.state.wreckList.push(w);

    const others: { x: number; z: number }[] = [];
    for (const q of this.state.playerList) {
      if (q.id === sessionId) continue;
      if (q.lifeState === PlayerLifeState.AwaitingRespawn) continue;
      others.push({ x: q.x, z: q.z });
    }

    const spawn =
      tryPickRespawnPosition(
        AREA_OF_OPERATIONS_HALF_EXTENT,
        DEFAULT_MAP_ISLAND_POLYGONS,
        others,
        MIN_RESPAWN_SEPARATION,
        Math.random,
      ) ??
      pickRimSpawnDeterministic(
        AREA_OF_OPERATIONS_HALF_EXTENT,
        DEFAULT_MAP_ISLAND_POLYGONS,
        others,
        MIN_RESPAWN_SEPARATION,
        playerIndexInList(this.state.playerList, sessionId) * 2.5132741228718345 +
          sessionId.length * 0.37,
      );

    row.ship.x = spawn.x;
    row.ship.z = spawn.z;
    row.ship.headingRad = spawn.headingRad;
    row.ship.speed = 0;
    row.ship.throttle = 0;
    row.ship.rudder = 0;
    row.aimX = spawn.x + Math.sin(spawn.headingRad) * 80;
    row.aimZ = spawn.z + Math.cos(spawn.headingRad) * 80;
    row.mineSpawnLocalZ = -22;
    row.respawnAtMs = null;
    row.oobSinceMs = null;
    row.primaryReadyAtMs = 0;
    p.shipClass = shipClassIdForProgressionLevel(p.level);
    this.resetAswmMagazineFromClass(row, p.shipClass);
    row.torpedoReadyAtMs = 0;
    row.adSamNextAtMs = 0;
    row.adPdNextAtMs = 0;
    row.adCiwsNextAtMs = 0;
    row.adSoftkillLastUsedAtMs = 0;
    row.invulnerableUntilMs = now + SPAWN_PROTECTION_DURATION_MS;
    row.radarActive = true;

    p.x = row.ship.x;
    p.z = row.ship.z;
    p.headingRad = row.ship.headingRad;
    p.speed = 0;
    p.rudder = 0;
    p.aimX = row.aimX;
    p.aimZ = row.aimZ;
    const baseHpResp = shipClassBaseMaxHp(p.shipClass);
    p.maxHp = progressionMaxHpForLevel(p.level, baseHpResp);
    p.hp = p.maxHp;
    p.lifeState = PlayerLifeState.SpawnProtected;
    p.respawnCountdownSec = 0;
    p.spawnProtectionSec = SPAWN_PROTECTION_DURATION_MS / 1000;
    p.radarActive = true;
    p.deathAtMs = 0;

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

    const classProf = getShipClassProfile(p.shipClass);
    const hull = getAuthoritativeShipHullProfile(p.shipClass);
    const mounts = listPrimaryArtilleryMountConfigs(hull, classProf.artilleryArcHalfAngleRad);
    if (mounts.length === 0) return;

    let anyShell = false;
    for (const m of mounts) {
      const w = shipLocalToWorldXZ(
        row.ship.x,
        row.ship.z,
        row.ship.headingRad,
        m.socket.x,
        m.socket.z,
      );
      const salvo = tryComputeArtillerySalvo(
        row.ship.x,
        row.ship.z,
        row.ship.headingRad,
        row.aimX,
        row.aimZ,
        Math.random,
        m.sector,
        w.x,
        w.z,
      );
      if (!salvo.ok) continue;
      anyShell = true;
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
        fromX: w.x,
        fromZ: w.z,
        toX: salvo.landX,
        toZ: salvo.landZ,
        flightMs: salvo.flightMs,
      });
    }
    if (!anyShell) return;

    row.primaryReadyAtMs = now + progressionPrimaryCooldownMs(p.level);
  }

  private trySecondaryFire(
    client: Client,
    row: SimEntry,
    explicitSide?: "port" | "starboard",
  ): void {
    if (!this.isMatchCombatActive()) return;
    const p = this.findPlayer(client.sessionId);
    if (!p || !canUsePrimaryWeapon(p.lifeState)) return;

    const now = Date.now();
    if (now < row.aswmReloadUntilMs) return;
    if (now < row.aswmNextShotAtMs) return;

    const aswmCap = getShipClassProfile(p.shipClass).aswmMaxPerOwner;
    let owned = 0;
    for (const m of this.state.missileList) {
      if (m.ownerId === client.sessionId) owned++;
    }
    if (owned >= aswmCap) return;

    const hullAswm = getAuthoritativeShipHullProfile(p.shipClass);
    const launchers = hullAswm?.fixedSeaSkimmerLaunchers;
    let pose: { x: number; z: number; headingRad: number } | null = null;

    if (launchers?.length) {
      const launcher =
        explicitSide !== undefined
          ? pickFixedSeaSkimmerLauncherWithAmmoForForcedSide(
              launchers,
              row.aswmRemainingPort,
              row.aswmRemainingStarboard,
              explicitSide,
            )
          : pickFixedSeaSkimmerLauncherWithAmmo(
              launchers,
              row.aimX,
              row.aimZ,
              row.ship.x,
              row.ship.z,
              row.ship.headingRad,
              row.aswmRemainingPort,
              row.aswmRemainingStarboard,
            );
      if (!launcher) return;
      this.consumeOneAswmRound(row, launcher);
      pose = spawnAswmFromFixedLauncher(row.ship.x, row.ship.z, row.ship.headingRad, launcher);
    } else {
      const side =
        explicitSide !== undefined
          ? pickAswmSideForFallbackFireForced(
              row.aswmRemainingPort,
              row.aswmRemainingStarboard,
              explicitSide,
            )
          : pickAswmSideForFallbackFire(
              row.aimX,
              row.aimZ,
              row.ship.x,
              row.ship.z,
              row.ship.headingRad,
              row.aswmRemainingPort,
              row.aswmRemainingStarboard,
            );
      if (!side) return;
      if (side === "port") row.aswmRemainingPort--;
      else row.aswmRemainingStarboard--;
      pose = spawnAswmFromFireDirection(
        row.ship.x,
        row.ship.z,
        row.aimX,
        row.aimZ,
        row.ship.headingRad,
      );
    }

    const totalLeft = row.aswmRemainingPort + row.aswmRemainingStarboard;
    if (totalLeft > 0) {
      row.aswmNextShotAtMs = now + ASWM_SHOT_INTERVAL_MS;
    } else {
      row.aswmNextShotAtMs = 0;
      row.aswmReloadUntilMs = now + getAswmMagicReloadMsFromProfile(hullAswm);
    }

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
    this.broadcast("aswmFired", { missileId, ownerId: client.sessionId });
  }

  private tryTorpedoFire(client: Client, row: SimEntry): void {
    if (!FEATURE_MINES_ENABLED) return;
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
    const prefix = `${missileId}|`;
    for (const k of this.adSoftkillAttemptedMissileDefender) {
      if (k.startsWith(prefix)) this.adSoftkillAttemptedMissileDefender.delete(k);
    }
    this.aswmSoftkillReacquireBlockByMissileId.delete(missileId);
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
      const hb = getAuthoritativeShipHullProfile(pl.shipClass)?.collisionHitbox;
      const d2 = minDistSqPointToShipHitboxFootprintXZ(mx, mz, pl.x, pl.z, pl.headingRad, hb);
      if (d2 <= AD_SAM_RANGE_SQ && d2 < bestD2) {
        bestD2 = d2;
        best = pl.id;
      }
    }
    return best;
  }

  private resolveAirDefenseDefenderId(m: MissileState): string | null {
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
    return adDefenderId;
  }

  private syncAirDefenseHud(now: number): void {
    const incoming = new Map<string, number>();
    const radarHint = new Map<string, boolean>();
    for (let i = 0; i < this.state.missileList.length; i++) {
      const m = this.state.missileList.at(i);
      if (!m) continue;
      const defId = this.resolveAirDefenseDefenderId(m);
      if (!defId) continue;
      incoming.set(defId, (incoming.get(defId) ?? 0) + 1);
      const row = this.sim.get(defId);
      const tgt = this.findPlayer(defId);
      if (!row || !tgt) continue;
      const hb = getAuthoritativeShipHullProfile(tgt.shipClass)?.collisionHitbox;
      const distSq = minDistSqPointToShipHitboxFootprintXZ(
        m.x,
        m.z,
        tgt.x,
        tgt.z,
        tgt.headingRad,
        hb,
      );
      if (!row.radarActive && distSq <= AD_SAM_RANGE_SQ) {
        radarHint.set(defId, true);
      }
    }
    for (const p of this.state.playerList) {
      if (p.lifeState === PlayerLifeState.AwaitingRespawn) {
        p.adHudIncomingAswm = 0;
        p.adHudCanCommitHardkill = false;
        p.adHardkillCommitRemainingSec = 0;
        p.adHudRadarAffectsSam = false;
        continue;
      }
      const row = this.sim.get(p.id);
      p.adHudIncomingAswm = incoming.get(p.id) ?? 0;
      p.adHudCanCommitHardkill = p.adHudIncomingAswm > 0;
      p.adHardkillCommitRemainingSec = 0;
      p.adHudRadarAffectsSam = radarHint.get(p.id) ?? false;
    }
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
      let acquired = pickAswmAcquisitionTarget(
        m.x,
        m.z,
        m.headingRad,
        m.ownerId,
        candidates,
      );
      let reBlock = this.aswmSoftkillReacquireBlockByMissileId.get(m.missileId);
      if (reBlock && now >= reBlock.untilMs) {
        this.aswmSoftkillReacquireBlockByMissileId.delete(m.missileId);
        reBlock = undefined;
      }
      if (reBlock && acquired === reBlock.defenderId) {
        acquired = null;
      }
      if (now - spawned < ASWM_SEEKER_ARM_DELAY_MS) {
        acquired = null;
      }
      let tx: number | null = null;
      let tz: number | null = null;
      if (acquired != null) {
        const tgt = this.findPlayer(acquired);
        if (tgt && tgt.lifeState !== PlayerLifeState.AwaitingRespawn) {
          tx = tgt.x;
          tz = tgt.z;
        }
      }
      const prevTargetId = m.targetId;
      m.targetId = acquired ?? "";
      if (prevTargetId === "" && m.targetId !== "") {
        const ownerClient = this.clients.find((c) => c.sessionId === m.ownerId);
        ownerClient?.send("missileLockOn", {});
      }

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

      if (
        isCircleOverlappingAnyIslandPolygon(
          m.x,
          m.z,
          ASWM_ISLAND_COLLISION_RADIUS,
          DEFAULT_MAP_ISLAND_POLYGONS,
        ) ||
        circleIntersectsAnyWreckHitboxFootprintXZ(
          m.x,
          m.z,
          ASWM_ISLAND_COLLISION_RADIUS,
          this.state.wreckList,
        )
      ) {
        this.broadcast("aswmImpact", {
          missileId: m.missileId,
          x: m.x,
          z: m.z,
          kind: "island",
        });
        this.removeMissileAt(i, m.missileId);
        continue;
      }

      const adDefenderId = this.resolveAirDefenseDefenderId(m);
      if (adDefenderId != null) {
        const tgt = this.findPlayer(adDefenderId);
        const defRow = this.sim.get(adDefenderId);
        if (!tgt || !defRow || !canTakeArtillerySplashDamage(tgt.lifeState)) {
          this.adPendingRollByMissileId.delete(m.missileId);
        } else {
          const hb = getAuthoritativeShipHullProfile(tgt.shipClass)?.collisionHitbox;
          const distSq = minDistSqPointToShipHitboxFootprintXZ(m.x, m.z, tgt.x, tgt.z, tgt.headingRad, hb);

          const skKey = `${m.missileId}|${adDefenderId}`;
          if (distSq <= AD_SOFTKILL_RANGE_SQ && !this.adSoftkillAttemptedMissileDefender.has(skKey)) {
            const sk = trySoftkillBreakLock({
              nowMs: now,
              defenderSoftkillLastUsedAtMs: defRow.adSoftkillLastUsedAtMs,
              random01: Math.random,
            });
            if (sk.attempted) {
              this.adSoftkillAttemptedMissileDefender.add(skKey);
              defRow.adSoftkillLastUsedAtMs = sk.newSoftkillLastUsedAtMs;
              if (sk.brokeLock) {
                m.targetId = "";
                this.aswmSoftkillReacquireBlockByMissileId.set(m.missileId, {
                  defenderId: adDefenderId,
                  untilMs: now + AD_SOFTKILL_SAME_TARGET_REACQUIRE_BLOCK_MS,
                });
              }
              const defClient = this.clients.find((c) => c.sessionId === adDefenderId);
              defClient?.send("softkillResult", { success: sk.brokeLock });
            }
          }

          const defenderHull = getAuthoritativeShipHullProfile(tgt.shipClass);
          const adClassArc = getShipClassProfile(tgt.shipClass).artilleryArcHalfAngleRad;
          const samAllowed =
            defRow.radarActive &&
            hullProvidesAirDefenseSamLayer(defenderHull) &&
            missileBearingInHardkillLayerMountSector(
              defenderHull,
              adClassArc,
              "sam",
              tgt.x,
              tgt.z,
              tgt.headingRad,
              m.x,
              m.z,
            );
          const pdAllowed =
            m.targetId === adDefenderId &&
            hullProvidesAirDefensePdLayer(defenderHull) &&
            missileBearingInHardkillLayerMountSector(
              defenderHull,
              adClassArc,
              "pd",
              tgt.x,
              tgt.z,
              tgt.headingRad,
              m.x,
              m.z,
            );
          const ciwsAllowed =
            hullProvidesAirDefenseCiwsLayer(defenderHull) &&
            missileBearingInHardkillLayerMountSector(
              defenderHull,
              adClassArc,
              "ciws",
              tgt.x,
              tgt.z,
              tgt.headingRad,
              m.x,
              m.z,
            );
          const adInput = {
            distSq,
            nowMs: now,
            samNextAtMs: defRow.adSamNextAtMs,
            pdNextAtMs: defRow.adPdNextAtMs,
            ciwsNextAtMs: defRow.adCiwsNextAtMs,
            samAllowed,
            pdAllowed,
            ciwsAllowed,
          };

          let airDefenseConsumed = false;
          const pending = this.adPendingRollByMissileId.get(m.missileId);
          if (pending != null) {
            if (pending.defenderId !== adDefenderId) {
              this.adPendingRollByMissileId.delete(m.missileId);
            } else {
              airDefenseConsumed = true;
              if (!isHardkillLayerInRange(pending.layer, distSq)) {
                const cdMiss = applyHardkillCooldownAfterRoll(
                  pending.layer,
                  now,
                  defRow.adSamNextAtMs,
                  defRow.adPdNextAtMs,
                  defRow.adCiwsNextAtMs,
                );
                defRow.adSamNextAtMs = cdMiss.samNextAtMs;
                defRow.adPdNextAtMs = cdMiss.pdNextAtMs;
                defRow.adCiwsNextAtMs = cdMiss.ciwsNextAtMs;
                this.adPendingRollByMissileId.delete(m.missileId);
              } else if (
                (pending.layer === "sam" || pending.layer === "pd") &&
                now < pending.rollReadyAtMs
              ) {
                /* SAM/PD: Abfangkörper unterwegs — noch kein Wurf. */
              } else {
                const hit = rollHardkillHit(pending.layer, Math.random);
                const cd = applyHardkillCooldownAfterRoll(
                  pending.layer,
                  now,
                  defRow.adSamNextAtMs,
                  defRow.adPdNextAtMs,
                  defRow.adCiwsNextAtMs,
                );
                defRow.adSamNextAtMs = cd.samNextAtMs;
                defRow.adPdNextAtMs = cd.pdNextAtMs;
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
                this.adPendingRollByMissileId.delete(m.missileId);
              }
            }
          }

          if (!airDefenseConsumed) {
            const layer = pickHardkillEngagementLayer(adInput);
            if (layer != null) {
              const distCenterM = Math.hypot(m.x - tgt.x, m.z - tgt.z);
              const rollReadyAtMs =
                layer === "ciws" ? now : now + computeSamPdInterceptTravelMs(distCenterM);
              this.adPendingRollByMissileId.set(m.missileId, {
                defenderId: adDefenderId,
                layer,
                rollReadyAtMs,
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
        const hb = getAuthoritativeShipHullProfile(pl.shipClass)?.collisionHitbox;
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
    const list = this.state.torpedoList;
    if (!FEATURE_MINES_ENABLED) {
      for (let i = list.length - 1; i >= 0; i--) {
        const t = list.at(i);
        if (t) this.removeTorpedoAt(i, t.torpedoId);
      }
      return;
    }

    const half = AREA_OF_OPERATIONS_HALF_EXTENT;

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

      if (
        isCircleOverlappingAnyIslandPolygon(
          t.x,
          t.z,
          TORPEDO_ISLAND_COLLISION_RADIUS,
          DEFAULT_MAP_ISLAND_POLYGONS,
        ) ||
        circleIntersectsAnyWreckHitboxFootprintXZ(
          t.x,
          t.z,
          TORPEDO_ISLAND_COLLISION_RADIUS,
          this.state.wreckList,
        )
      ) {
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
        const hb = getAuthoritativeShipHullProfile(pl.shipClass)?.collisionHitbox;
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
        const hb = getAuthoritativeShipHullProfile(p.shipClass)?.collisionHitbox;
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

      if (FEATURE_MINES_ENABLED) {
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
      }

      const kind = classifyArtilleryImpactVisual(
        sh.landX,
        sh.landZ,
        damagedAnyEnemy,
        DEFAULT_MAP_ISLAND_POLYGONS,
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

  /** Client-SFX: nur betroffener Spieler (kein Broadcast). */
  private sendCollisionContact(sessionId: string, kind: "island" | "ship"): void {
    const client = this.clients.find((c) => c.sessionId === sessionId);
    client?.send("collisionContact", { kind });
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

  private physicsStep(dt: number): void {
    const now = Date.now();
    const half = AREA_OF_OPERATIONS_HALF_EXTENT;

    this.updateMatchTimer(now);
    this.applyPassiveXpTick(now);
    const combatActive = this.isMatchCombatActive();
    if (combatActive) {
      this.resolveShellImpacts(now);
    } else {
      this.pendingShells = [];
    }
    this.processLifeTransitions(now);
    this.processAswmMagazineReload(now);
    this.pruneExpiredWrecks(now);

    const islandPolys = DEFAULT_MAP_ISLAND_POLYGONS;
    const wreckList = this.state.wreckList;

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
        const islandNow = shipOverlapsAnyIslandPolygons(
          {
            x: row.ship.x,
            z: row.ship.z,
            headingRad: row.ship.headingRad,
            shipClass: p.shipClass,
          },
          islandPolys,
        );
        const islandPrev = this.collisionIslandOverlapPrev.get(sessionId) ?? false;
        if (islandNow && !islandPrev) {
          this.sendCollisionContact(sessionId, "island");
          if (combatActive && canTakeArtillerySplashDamage(p.lifeState)) {
            const wasNotDead = p.lifeState !== PlayerLifeState.AwaitingRespawn;
            const sc = getShipClassProfile(p.shipClass);
            const scrape = Math.round(
              ISLAND_SCRAPE_BASE_HP *
                sc.hullScale *
                progressionIncomingDamageFactor(p.level) *
                sc.incomingDamageTakenMul,
            );
            if (scrape > 0) {
              p.hp = Math.max(0, p.hp - scrape);
              if (p.hp <= 0 && wasNotDead) {
                this.enterAwaitingRespawn(sessionId, now);
              }
            }
          }
        }
        this.collisionIslandOverlapPrev.set(sessionId, islandNow);

        const wreckNow = shipOverlapsAnyWreck(
          {
            x: row.ship.x,
            z: row.ship.z,
            headingRad: row.ship.headingRad,
            shipClass: p.shipClass,
          },
          wreckList,
        );
        const wreckPrev = this.collisionWreckOverlapPrev.get(sessionId) ?? false;
        if (wreckNow && !wreckPrev) {
          this.sendCollisionContact(sessionId, "ship");
        }
        this.collisionWreckOverlapPrev.set(sessionId, wreckNow);

        resolveShipIslandCollisions(
          row.ship,
          [],
          getAuthoritativeShipHullProfile(p.shipClass)?.collisionHitbox,
        );
      } else {
        this.collisionIslandOverlapPrev.delete(sessionId);
        this.collisionWreckOverlapPrev.delete(sessionId);
      }
    }

    const shipShipParticipants: ShipCollisionParticipant[] = [];
    for (const [sessionId, row] of this.sim) {
      const p = this.findPlayer(sessionId);
      if (!p || !participatesInWorldSimulation(p.lifeState)) continue;
      shipShipParticipants.push({
        ship: row.ship,
        hitbox: getAuthoritativeShipHullProfile(p.shipClass)?.collisionHitbox,
        sessionId,
      });
    }
    if (combatActive) {
      const ram = accumulateShipRamDamage(shipShipParticipants, dt);
      const wreckRam = accumulateWreckRamDamage(
        shipShipParticipants,
        wreckList,
        (sc) => getAuthoritativeShipHullProfile(sc)?.collisionHitbox,
        dt,
      );
      const combinedRaw = new Map<string, number>();
      for (const [id, r] of ram.rawDamageBySessionId) {
        combinedRaw.set(id, r);
      }
      for (const [id, r] of wreckRam) {
        combinedRaw.set(id, (combinedRaw.get(id) ?? 0) + r);
      }
      for (const [sessionId, raw] of combinedRaw) {
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

    {
      const nextShipPairs = new Set<string>();
      const n = shipShipParticipants.length;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const A = shipShipParticipants[i]!;
          const B = shipShipParticipants[j]!;
          const idA = A.sessionId;
          const idB = B.sessionId;
          if (!idA || !idB) continue;
          const pa = this.findPlayer(idA);
          const pb = this.findPlayer(idB);
          if (!pa || !pb) continue;
          if (
            !participatesInWorldSimulation(pa.lifeState) ||
            !participatesInWorldSimulation(pb.lifeState)
          ) {
            continue;
          }
          if (!A.hitbox || !B.hitbox) continue;
          if (
            !twoShipsObbOverlap(
              {
                x: A.ship.x,
                z: A.ship.z,
                headingRad: A.ship.headingRad,
                shipClass: pa.shipClass,
              },
              {
                x: B.ship.x,
                z: B.ship.z,
                headingRad: B.ship.headingRad,
                shipClass: pb.shipClass,
              },
            )
          ) {
            continue;
          }
          const key = idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
          nextShipPairs.add(key);
          if (!this.collisionShipPairPrev.has(key)) {
            this.sendCollisionContact(idA, "ship");
            this.sendCollisionContact(idB, "ship");
          }
        }
      }
      this.collisionShipPairPrev = nextShipPairs;
    }

    resolveShipShipCollisions(shipShipParticipants);

    if (wreckList.length > 0) {
      const getWreckHb = (sc: string) => getAuthoritativeShipHullProfile(sc)?.collisionHitbox;
      for (const [sessionId, row] of this.sim) {
        const p = this.findPlayer(sessionId);
        if (!p || !participatesInWorldSimulation(p.lifeState)) continue;
        const hb = getAuthoritativeShipHullProfile(p.shipClass)?.collisionHitbox;
        if (!hb) continue;
        resolveShipAndWreckObbOverlaps(row.ship, hb, wreckList, getWreckHb);
      }
    }

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
      p.radarActive = row.radarActive;

      p.primaryCooldownSec = Math.max(0, (row.primaryReadyAtMs - now) / 1000);
      p.secondaryCooldownSec = Math.max(
        0,
        (Math.max(row.aswmReloadUntilMs, row.aswmNextShotAtMs) - now) / 1000,
      );
      p.torpedoCooldownSec = Math.max(0, (row.torpedoReadyAtMs - now) / 1000);
      p.aswmRemainingPort = row.aswmRemainingPort;
      p.aswmRemainingStarboard = row.aswmRemainingStarboard;

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
    this.syncAirDefenseHud(now);
  }
}
