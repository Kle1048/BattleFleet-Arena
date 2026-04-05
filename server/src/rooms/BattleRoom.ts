import { Client, Room } from "@colyseus/core";
import {
  BattleState,
  DESTROYER_LIKE_MVP,
  PlayerState,
  ShipMovementState,
  createShipState,
  smoothRudder,
  stepMovement,
} from "@battlefleet/shared";

const TICK_HZ = 20;

export type InputPayload = {
  throttle: number;
  rudderInput: number;
  aimX?: number;
  aimZ?: number;
};

type SimEntry = {
  ship: ShipMovementState;
  lastRudderInput: number;
  aimX: number;
  aimZ: number;
};

function clampUnit(n: number): number {
  return Math.max(-1, Math.min(1, n));
}

export class BattleRoom extends Room<BattleState> {
  private readonly cfg = DESTROYER_LIKE_MVP;
  /** Nicht im Schema: reine Server-Simulation. */
  private sim = new Map<string, SimEntry>();

  onCreate() {
    this.setState(new BattleState());
    /** Matchmaking-Reservierung länger als Default (15s), sonst „seat reservation expired“ bei Dev/HMR/langsamen WS. */
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
    this.sim.set(client.sessionId, { ship, lastRudderInput: 0, aimX, aimZ });

    const ps = new PlayerState();
    ps.id = client.sessionId;
    ps.x = ship.x;
    ps.z = ship.z;
    ps.headingRad = ship.headingRad;
    ps.speed = ship.speed;
    ps.rudder = ship.rudder;
    ps.aimX = aimX;
    ps.aimZ = aimZ;
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
  }

  private physicsStep(dt: number): void {
    for (const [sessionId, row] of this.sim) {
      row.ship.rudder = smoothRudder(
        row.ship.rudder,
        row.lastRudderInput,
        this.cfg.rudderResponsiveness,
        dt,
      );
      stepMovement(row.ship, this.cfg, dt);

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
      }
    }
  }
}
