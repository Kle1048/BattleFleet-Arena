import type { Room } from "colyseus.js";
import type { BattleState } from "@battlefleet/shared/protocol/schema";
import type { ShipClassId } from "@battlefleet/shared/rules";
import { createBattleStateAdapter } from "../adapters/battleStateAdapter";
import { createRoomEventAdapter } from "../adapters/roomEventAdapter";
import { closeRoomConnection } from "../adapters/closeRoomConnection";
import { connectionClosedMessage, connectionErrorMessage } from "../presentation/connectionStatus";
import type { BattleStateSource } from "../presentation/BattleReadModel";
import type { MatchPresentationEvent } from "../presentation/MatchPresentationEvent";
import type { FrameInputPayload } from "../runtime/frameInput";
import { createLifetime } from "../runtime/lifetime";

/** Session-facing ports expose intent, never the mutable transport/schema. */
export type SessionConnection = {
  readonly roomId: string;
  readonly mySessionId: string;
  readonly pingMs: number | null;
  readonly warning: string;
  sendInput(payload: FrameInputPayload): void;
  setDebugShipClass(id: ShipClassId): void;
};
export type SessionPresentation = {
  frame(now: number, dtMs: number): void;
  present(event: MatchPresentationEvent): void;
  dispose(): void;
};

/** One connection, read model and presentation graph. Leave first makes transport
 * callbacks inert, then releases the graph; a retained frame callback is inert too. */
export function createGameSession(
  room: Room<BattleState>,
  createPresentation: (source: BattleStateSource, connection: SessionConnection) => SessionPresentation,
) {
  const subscriptions = createLifetime();
  const resources = createLifetime();
  let disposed = false;
  let connectionClosed = false;
  let resolveEnded!: () => void;
  const ended = new Promise<void>(resolve => { resolveEnded = resolve; });
  let presentation: SessionPresentation;
  const connection = {
    roomId: room.roomId, mySessionId: room.sessionId,
    pingMs: null as number | null, warning: "",
    sendInput(payload: FrameInputPayload) { if (!disposed) room.send("input", payload); },
    setDebugShipClass(id: ShipClassId) { if (!disposed) room.send("debugSetShipClass", { shipClass: id }); },
  };

  function dispose() {
    if (disposed) return;
    disposed = true;
    subscriptions.dispose();
    // The connection must not keep delivering work while presentation is released.
    try { if (!connectionClosed) closeRoomConnection(room); }
    finally { resources.dispose(); resolveEnded(); }
  }

  try {
    const source = subscriptions.use(createBattleStateAdapter(room, () => performance.now()));
    presentation = resources.use(createPresentation(source, connection));
    subscriptions.use(createRoomEventAdapter({
      room, now: () => performance.now(),
      every(callback, ms) {
        const timer = setInterval(callback, ms);
        return () => clearInterval(timer);
      },
      onEvent: event => { if (!disposed) presentation.present(event); },
      onPing: value => { connection.pingMs = value; },
      onError(code, message) {
        connection.warning = connectionErrorMessage(code, message);
        console.warn("[colyseus]", code, message);
      },
      onLeave(code, reason) {
        connectionClosed = true;
        connection.warning = connectionClosedMessage(code, reason);
        dispose();
      },
    }));
  } catch (error) { dispose(); throw error; }

  return {
    ended, dispose,
    get disposed() { return disposed; },
    frame(now: number, dtMs: number) { if (!disposed) presentation.frame(now, dtMs); },
  };
}

export type GameSession = ReturnType<typeof createGameSession>;
