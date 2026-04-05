import { Room } from "@colyseus/core";
import type { Client } from "@colyseus/core";
import {
  AREA_OF_OPERATIONS_HALF_EXTENT,
  ARTILLERY_DAMAGE,
  ARTILLERY_PLAYER_MAX_HP,
  ARTILLERY_PRIMARY_COOLDOWN_MS,
  ARTILLERY_SPLASH_RADIUS,
  ASWM_COOLDOWN_MS,
  ASWM_DAMAGE,
  ASWM_HIT_RADIUS,
  ASWM_ISLAND_COLLISION_RADIUS,
  ASWM_LIFETIME_MS,
  ASWM_MAX_PER_OWNER,
  type AswmTargetCandidate,
  BattleState,
  DEFAULT_MAP_ISLANDS,
  DESTROYER_LIKE_MVP,
  MissileState,
  OOB_DESTROY_AFTER_MS,
  TORPEDO_COOLDOWN_MS,
  TORPEDO_DAMAGE,
  TORPEDO_HIT_RADIUS,
  TORPEDO_ISLAND_COLLISION_RADIUS,
  TORPEDO_LIFETIME_MS,
  TORPEDO_MAX_PER_OWNER,
  TorpedoState,
  PlayerLifeState,
  PlayerState,
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
  RESPAWN_DELAY_MS,
  SPAWN_PROTECTION_DURATION_MS,
  smoothRudder,
  spawnAswmFromFireDirection,
  spawnTorpedoFromFireDirection,
  stepAswmMissile,
  stepTorpedoStraight,
  stepMovement,
  tryComputeArtillerySalvo,
  tryPickRespawnPosition,
} from "@battlefleet/shared";

const TICK_HZ = 20;

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
};

type SimEntry = {
  ship: ShipMovementState;
  lastRudderInput: number;
  aimX: number;
  aimZ: number;
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

  onCreate() {
    this.setState(new BattleState());
    this.setSeatReservationTime(60);
    console.log("[BattleRoom] onCreate, roomId=%s", this.roomId);

    this.onMessage("ping", (client, payload: { clientTime?: number }) => {
      const t = Number(payload?.clientTime);
      client.send("pong", { clientTime: Number.isFinite(t) ? t : 0 });
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

  onJoin(client: Client) {
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
    ps.hp = ARTILLERY_PLAYER_MAX_HP;
    ps.maxHp = ARTILLERY_PLAYER_MAX_HP;
    ps.primaryCooldownSec = 0;
    ps.lifeState = PlayerLifeState.Alive;
    ps.respawnCountdownSec = 0;
    ps.spawnProtectionSec = 0;
    ps.secondaryCooldownSec = 0;
    ps.torpedoCooldownSec = 0;
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

  private enterAwaitingRespawn(sessionId: string, now: number): void {
    const row = this.sim.get(sessionId);
    const p = this.findPlayer(sessionId);
    if (!row || !p) return;

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
    p.hp = ARTILLERY_PLAYER_MAX_HP;
    p.maxHp = ARTILLERY_PLAYER_MAX_HP;
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
    const p = this.findPlayer(client.sessionId);
    if (!p || !canUsePrimaryWeapon(p.lifeState)) return;

    const now = Date.now();
    if (now < row.primaryReadyAtMs) return;

    const salvo = tryComputeArtillerySalvo(
      row.ship.x,
      row.ship.z,
      row.ship.headingRad,
      row.aimX,
      row.aimZ,
    );
    if (!salvo.ok) return;

    row.primaryReadyAtMs = now + ARTILLERY_PRIMARY_COOLDOWN_MS;
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
      fromX: row.ship.x,
      fromZ: row.ship.z,
      toX: salvo.landX,
      toZ: salvo.landZ,
      flightMs: salvo.flightMs,
    });
  }

  private trySecondaryFire(client: Client, row: SimEntry): void {
    const p = this.findPlayer(client.sessionId);
    if (!p || !canUsePrimaryWeapon(p.lifeState)) return;

    const now = Date.now();
    if (now < row.secondaryReadyAtMs) return;

    let owned = 0;
    for (const m of this.state.missileList) {
      if (m.ownerId === client.sessionId) owned++;
    }
    if (owned >= ASWM_MAX_PER_OWNER) return;

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
    row.secondaryReadyAtMs = now + ASWM_COOLDOWN_MS;
    this.broadcast("aswmFired", { missileId, ownerId: client.sessionId });
  }

  private tryTorpedoFire(client: Client, row: SimEntry): void {
    const p = this.findPlayer(client.sessionId);
    if (!p || !canUsePrimaryWeapon(p.lifeState)) return;

    const now = Date.now();
    if (now < row.torpedoReadyAtMs) return;

    let owned = 0;
    for (const t of this.state.torpedoList) {
      if (t.ownerId === client.sessionId) owned++;
    }
    if (owned >= TORPEDO_MAX_PER_OWNER) return;

    const pose = spawnTorpedoFromFireDirection(
      row.ship.x,
      row.ship.z,
      row.aimX,
      row.aimZ,
      row.ship.headingRad,
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
    row.torpedoReadyAtMs = now + TORPEDO_COOLDOWN_MS;
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
      const dx = pl.x - mx;
      const dz = pl.z - mz;
      const d2 = dx * dx + dz * dz;
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
    const hitSq = ASWM_HIT_RADIUS * ASWM_HIT_RADIUS;

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
          const dx = tgt.x - m.x;
          const dz = tgt.z - m.z;
          const distSq = dx * dx + dz * dz;
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
        const dx = pl.x - m.x;
        const dz = pl.z - m.z;
        if (dx * dx + dz * dz <= hitSq) {
          hitId = pl.id;
          break;
        }
      }

      if (hitId != null) {
        const victim = this.findPlayer(hitId);
        if (victim) {
          const wasNotDead = victim.lifeState !== PlayerLifeState.AwaitingRespawn;
          victim.hp = Math.max(0, victim.hp - ASWM_DAMAGE);
          if (victim.hp <= 0 && wasNotDead) {
            this.enterAwaitingRespawn(victim.id, now);
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
    const hitSq = TORPEDO_HIT_RADIUS * TORPEDO_HIT_RADIUS;

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
        if (pl.id === t.ownerId) continue;
        if (!canTakeArtillerySplashDamage(pl.lifeState)) continue;
        const dx = pl.x - t.x;
        const dz = pl.z - t.z;
        if (dx * dx + dz * dz <= hitSq) {
          hitId = pl.id;
          break;
        }
      }

      if (hitId != null) {
        const victim = this.findPlayer(hitId);
        if (victim) {
          const wasNotDead = victim.lifeState !== PlayerLifeState.AwaitingRespawn;
          victim.hp = Math.max(0, victim.hp - TORPEDO_DAMAGE);
          if (victim.hp <= 0 && wasNotDead) {
            this.enterAwaitingRespawn(victim.id, now);
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
    const splashSq = ARTILLERY_SPLASH_RADIUS * ARTILLERY_SPLASH_RADIUS;
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
        const dx = p.x - sh.landX;
        const dz = p.z - sh.landZ;
        if (dx * dx + dz * dz > splashSq) continue;
        const wasNotDead = p.lifeState !== PlayerLifeState.AwaitingRespawn;
        p.hp = Math.max(0, p.hp - ARTILLERY_DAMAGE);
        if (p.hp <= 0 && wasNotDead) {
          this.enterAwaitingRespawn(p.id, now);
        }
        damagedAnyEnemy = true;
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

    this.resolveShellImpacts(now);
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
        stepMovement(row.ship, this.cfg, dt);
        resolveShipIslandCollisions(row.ship, DEFAULT_MAP_ISLANDS);
      }

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

    this.stepMissiles(dt, now);
    this.stepTorpedoes(dt, now);
  }
}
