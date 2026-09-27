import { Room, type Client } from "@colyseus/core";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { BattleState } from "@battlefleet/shared/protocol/schema";
import type { GameEventSink } from "@battlefleet/shared/protocol";
import { sanitizePlayerDisplayName, SHIP_CLASS_FAC, SHIP_CLASS_DESTROYER, SHIP_CLASS_CRUISER } from "@battlefleet/shared/rules";
import { GameSimulation } from "../simulation/GameSimulation.js";
import type { SimulationEnvironment } from "../simulation/SimulationEnvironment.js";
import type { MatchPlayerResult } from "../simulation/SimulationSettings.js";
import { systemEnvironment } from "../application/systemEnvironment.js";
import { simulationSettings } from "../application/simulationSettings.js";
import { SchemaPublisher } from "../adapters/SchemaPublisher.js";
import { decodeInputCommand } from "../adapters/inputCommand.js";
import { getMinRoomPlayers, isMaintenanceMode } from "../adminConfig.js";
import { MAX_HUMAN_CLIENTS_IN_ROOM } from "../serverBotPopulation.js";
import { normalizePlayerToken } from "../leaderboardStore.js";
import { matchResultService } from "../application/storageServices.js";
import { storageErrorCode } from "../persistence/storageErrors.js";
import { TickMetrics } from "../tickMetrics.js";

export type { InputCommand as InputPayload } from "@battlefleet/shared/protocol";
const TICK_HZ = 20;
const COMM_INPUT_LOG_SAMPLE_MS = 2000;

/** Nur exakte Klassen-IDs — kein `normalizeShipClassId`-Fallback auf FAC. */
function parseDebugShipClassPayload(raw: unknown): typeof SHIP_CLASS_FAC | typeof SHIP_CLASS_DESTROYER | typeof SHIP_CLASS_CRUISER | null {
  const s = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  if (s === SHIP_CLASS_FAC || s === SHIP_CLASS_DESTROYER || s === SHIP_CLASS_CRUISER) return s;
  return null;
}


/** Colyseus lifecycle and transport only; all authoritative gameplay belongs to GameSimulation. */
export class BattleRoom extends Room<BattleState> {
  private static readonly activeRooms = new Set<BattleRoom>();

  static activeRoomSummaries(): {
    roomId: string;
    clients: number;
    bots: number;
    matchPhase: string;
    matchRemainingSec: number;
    tickMs: ReturnType<TickMetrics["snapshot"]>;
  }[] {
    return [...BattleRoom.activeRooms].map((room) => ({
      roomId: room.roomId,
      clients: room.clients.length,
      bots: room.simulation.bots.ids.size,
      matchPhase: room.state.matchPhase,
      matchRemainingSec: room.state.matchRemainingSec,
      tickMs: room.tickMetrics.snapshot(),
    }));
  }

  static restartActiveRounds(): { rooms: number; restarted: number } {
    let restarted = 0;
    for (const room of BattleRoom.activeRooms) {
      room.restartRoundFromAdmin();
      restarted++;
    }
    return { rooms: BattleRoom.activeRooms.size, restarted };
  }


  private readonly tickMetrics = new TickMetrics();
  private readonly clientsById = new Map<string, Client>();
  private readonly playerKeyBySessionId = new Map<string, string>();
  private readonly lastCommsInputLogAtMsBySession = new Map<string, number>();
  private readonly simulation: GameSimulation;
  private publisher!: SchemaPublisher;
  private readonly gameEvents: GameEventSink = {
    broadcast: (type, payload) => this.broadcast(type, payload),
    send: (id, type, payload) => this.clientsById.get(id)?.send(type, payload),
  };

  constructor(private readonly environment: SimulationEnvironment = systemEnvironment) {
    super();
    this.simulation = new GameSimulation(environment, simulationSettings, this.gameEvents,
      () => this.clients.length, () => performance.now(), (results, matchId) => this.persistMatchResults(results, matchId), randomUUID);
  }

  onCreate() {
    BattleRoom.activeRooms.add(this);
    this.setState(new BattleState());
    this.publisher = new SchemaPublisher(this.state);
    this.simulation.start();
    this.publish();
    this.setSeatReservationTime(60);
    console.log(
      "[BattleRoom] onCreate, roomId=%s minTotalParticipants=%d (admin config)",
      this.roomId,
      getMinRoomPlayers(),
    );
    if (this.isCommsLoggingEnabled()) {
      console.log("[BattleRoom] comms logging enabled (BFA_LOG_COMMS=1) roomId=%s", this.roomId);
    }

    this.onMessage("ping", (client, payload: { clientTime?: number }) => {
      this.logComm("ping", client.sessionId);
      const t = Number(payload?.clientTime);
      client.send("pong", { clientTime: Number.isFinite(t) ? t : 0 });
    });

    this.onMessage("playAgain", () => {
      this.logComm("playAgain");
      this.simulation.reset(this.environment.nowMs());
      this.publish();
    });

    this.onMessage("input", (client, payload: unknown) => {
      this.logInputCommSampled(client.sessionId);
      this.applyInputPayload(client.sessionId, payload);
    });

    this.onMessage("debugSetShipClass", (client, payload: { shipClass?: string }) => {
      this.logComm("debugSetShipClass", client.sessionId, {
        shipClass: payload?.shipClass,
      });
      if (process.env.NODE_ENV === "production" && process.env.BFA_DEBUG_SHIP_SWITCH !== "1") {
        return;
      }
      const nextClass = parseDebugShipClassPayload(payload?.shipClass);
      if (!nextClass) return;
      this.simulation.setDebugShipClass(client.sessionId, nextClass);
      this.publish();
    });

    this.setSimulationInterval((timeDelta) => {
      const dtSec = timeDelta / 1000;
      const started = performance.now();
      try { this.physicsStep(dtSec); }
      finally { this.tickMetrics.record(performance.now() - started); }
    }, 1000 / TICK_HZ);

    this.maxClients = MAX_HUMAN_CLIENTS_IN_ROOM;
  }


  onDispose(): void {
    BattleRoom.activeRooms.delete(this);
    this.simulation.dispose();
    this.clientsById.clear();
    this.playerKeyBySessionId.clear();
    this.lastCommsInputLogAtMsBySession.clear();
  }

  private publish(): void { this.publisher.publish(this.simulation.state); }

  /** Input still executes synchronously between ticks; no added command queue or frame of latency. */
  private applyInputPayload(id: string, payload: unknown): void {
    const command = decodeInputCommand(payload);
    if (!command) return;
    this.simulation.applyInput(id, command);
    this.publish();
  }

  private physicsStep(dt: number): void {
    this.simulation.step(dt);
    this.publish();
  }

  public restartRoundFromAdmin(): void {
    this.simulation.reset(this.environment.nowMs(), true);
    this.publish();
  }

  private persistMatchResults(results: readonly MatchPlayerResult[], matchId: string): void {
    if (results.length === 0) return;
    void matchResultService.submit({ matchId, completedAtMs: Date.now(), rows: results.map(({ sessionId, ...result }) => ({
      playerKey: this.playerKeyBySessionId.get(sessionId) ?? `session:${sessionId}`,
      ...result,
    })) }).catch(error => {
      console.error("[match-results] commit failed match=%s code=%s", matchId, storageErrorCode(error));
    });
  }

  private isCommsLoggingEnabled(): boolean {
    return process.env.BFA_LOG_COMMS === "1";
  }

  private logComm(event: string, sessionId?: string, extra?: Record<string, unknown>): void {
    if (!this.isCommsLoggingEnabled()) return;
    const parts: string[] = [];
    parts.push(`event=${event}`);
    if (sessionId) parts.push(`sessionId=${sessionId}`);
    parts.push(`roomId=${this.roomId}`);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        parts.push(`${k}=${String(v)}`);
      }
    }
    console.log(`[BattleRoom][comms] ${parts.join(" ")}`);
  }

  private logInputCommSampled(sessionId: string): void {
    if (!this.isCommsLoggingEnabled()) return;
    const now = this.environment.nowMs();
    const last = this.lastCommsInputLogAtMsBySession.get(sessionId) ?? 0;
    if (now - last < COMM_INPUT_LOG_SAMPLE_MS) return;
    this.lastCommsInputLogAtMsBySession.set(sessionId, now);
    this.logComm("input(sampled)", sessionId);
  }

  onJoin(client: Client, options?: { shipClass?: string; displayName?: string; playerToken?: string }) {
    if (isMaintenanceMode()) {
      throw new Error("Server is in maintenance mode.");
    }
    const displayName = sanitizePlayerDisplayName(options?.displayName);
    const playerKey = normalizePlayerToken(options?.playerToken, client.sessionId);
    this.playerKeyBySessionId.set(client.sessionId, playerKey);
    this.simulation.join(client.sessionId, displayName);
    this.publish();
    this.clientsById.set(client.sessionId, client);
    this.logComm("join", client.sessionId, { displayName });
    console.log(
      "[BattleRoom] onJoin sessionId=%s playerList.length=%d roomId=%s",
      client.sessionId,
      this.state.playerList.length,
      this.roomId,
    );
  }

  onLeave(client: Client) {
    this.logComm("leave", client.sessionId);
    this.lastCommsInputLogAtMsBySession.delete(client.sessionId);
    this.playerKeyBySessionId.delete(client.sessionId);
    this.clientsById.delete(client.sessionId);
    this.simulation.remove(client.sessionId);
    this.publish();
  }

}
