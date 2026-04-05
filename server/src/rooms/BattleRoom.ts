import { Protocol, Room } from "@colyseus/core";
import type { Client } from "@colyseus/core";
import {
  AREA_OF_OPERATIONS_HALF_EXTENT,
  ARTILLERY_DAMAGE,
  ARTILLERY_PLAYER_MAX_HP,
  ARTILLERY_PRIMARY_COOLDOWN_MS,
  ARTILLERY_SPLASH_RADIUS,
  BattleState,
  DEFAULT_MAP_ISLANDS,
  DESTROYER_LIKE_MVP,
  OOB_DESTROY_AFTER_MS,
  PlayerState,
  ShipMovementState,
  createShipState,
  isInsideOperationalArea,
  resolveShipIslandCollisions,
  smoothRudder,
  stepMovement,
  tryComputeArtillerySalvo,
  classifyArtilleryImpactVisual,
} from "@battlefleet/shared";

const TICK_HZ = 20;

export type InputPayload = {
  throttle: number;
  rudderInput: number;
  aimX?: number;
  aimZ?: number;
  /** True solange LMB gehalten (Client); `tryPrimaryFire` feuert nur nach Ablauf des Cooldowns. */
  primaryFire?: boolean;
};

type SimEntry = {
  ship: ShipMovementState;
  lastRudderInput: number;
  aimX: number;
  aimZ: number;
  oobSinceMs: number | null;
  /** Date.now() ab dem Primärfeuer erlaubt ist. */
  primaryReadyAtMs: number;
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

export class BattleRoom extends Room<BattleState> {
  private readonly cfg = DESTROYER_LIKE_MVP;
  private sim = new Map<string, SimEntry>();
  private pendingShells: PendingShell[] = [];
  private nextShellId = 1;

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
      row.ship.throttle = clampUnit(Number(payload.throttle) || 0);
      row.lastRudderInput = clampUnit(Number(payload.rudderInput) || 0);
      const ax = payload.aimX;
      const az = payload.aimZ;
      if (typeof ax === "number" && Number.isFinite(ax)) row.aimX = ax;
      if (typeof az === "number" && Number.isFinite(az)) row.aimZ = az;

      if (payload.primaryFire === true) {
        this.tryPrimaryFire(client, row);
      }
    });

    this.setSimulationInterval((timeDelta) => {
      const dtSec = timeDelta / 1000;
      this.physicsStep(dtSec);
    }, 1000 / TICK_HZ);

    this.maxClients = 16;
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
    this.state.playerList.push(ps);
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
  }

  private tryPrimaryFire(client: Client, row: SimEntry): void {
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

  private resolveShellImpacts(now: number): Client[] {
    const toKill: Client[] = [];
    const stay: PendingShell[] = [];
    const splashSq = ARTILLERY_SPLASH_RADIUS * ARTILLERY_SPLASH_RADIUS;

    for (const sh of this.pendingShells) {
      if (sh.impactAtMs > now) {
        stay.push(sh);
        continue;
      }

      let damagedAnyEnemy = false;
      for (const p of this.state.playerList) {
        if (p.id === sh.ownerSessionId) continue;
        if (p.hp <= 0) continue;
        const dx = p.x - sh.landX;
        const dz = p.z - sh.landZ;
        if (dx * dx + dz * dz > splashSq) continue;
        damagedAnyEnemy = true;
        p.hp = Math.max(0, p.hp - ARTILLERY_DAMAGE);
        if (p.hp <= 0) {
          const c = this.clients.getById(p.id);
          if (c) toKill.push(c);
        }
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
    return toKill;
  }

  private physicsStep(dt: number): void {
    const now = Date.now();
    const half = AREA_OF_OPERATIONS_HALF_EXTENT;

    const killFromArtillery = this.resolveShellImpacts(now);
    const artKillClients = new Set(killFromArtillery);
    const clientsToObliterate: Client[] = [...artKillClients];

    for (const [sessionId, row] of this.sim) {
      row.ship.rudder = smoothRudder(
        row.ship.rudder,
        row.lastRudderInput,
        this.cfg.rudderResponsiveness,
        dt,
      );
      stepMovement(row.ship, this.cfg, dt);
      resolveShipIslandCollisions(row.ship, DEFAULT_MAP_ISLANDS);

      let p: PlayerState | undefined;
      for (const entry of this.state.playerList) {
        if (entry.id === sessionId) {
          p = entry;
          break;
        }
      }
      if (p) {
        p.x = row.ship.x;
        p.z = row.ship.z;
        p.headingRad = row.ship.headingRad;
        p.speed = row.ship.speed;
        p.rudder = row.ship.rudder;
        p.aimX = row.aimX;
        p.aimZ = row.aimZ;

        p.primaryCooldownSec = Math.max(
          0,
          (row.primaryReadyAtMs - now) / 1000,
        );

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
            const c = this.clients.getById(sessionId);
            if (c) {
              clientsToObliterate.push(c);
            }
          } else {
            p.oobCountdownSec = Math.max(0, (OOB_DESTROY_AFTER_MS - elapsed) / 1000);
          }
        }
      }
    }

    const kicked = new Set<Client>();
    for (const c of clientsToObliterate) {
      if (kicked.has(c)) continue;
      kicked.add(c);
      const reason = artKillClients.has(c)
        ? "destroyed_in_combat"
        : "left_operational_area";
      c.leave(Protocol.WS_CLOSE_WITH_ERROR, reason);
    }
  }
}
