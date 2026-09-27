import type { MatchPresentationEvent } from "../presentation/MatchPresentationEvent";
import { decodeMatchEvent, decodePong } from "./matchEventDecoder";
import { createRoomSignalScope, type RoomSignal } from "./roomSignalScope";

type ErrorCallback = (code: number, message?: string) => void;
type LeaveCallback = (code: number, reason?: string) => void;

export interface EventRoom {
  onMessage(type: "*", callback: (type: unknown, payload: unknown) => void): () => void;
  onError: RoomSignal<ErrorCallback>;
  /** Colyseus clears its signals when the room leaves. */
  onLeave: RoomSignal<LeaveCallback>;
  send(type: string, payload: unknown): void;
}

export interface RoomEventAdapterOptions {
  room: EventRoom;
  now(): number;
  /** Scheduler returns an idempotent cancellation function. */
  every(callback: () => void, ms: number): () => void;
  onEvent(event: MatchPresentationEvent): void;
  onPing(ms: number | null): void;
  onError: ErrorCallback;
  onLeave: LeaveCallback;
}

/** Owns exactly one message route and one heartbeat, independent of rendering and DOM. */
export function createRoomEventAdapter(options: RoomEventAdapterOptions): { dispose(): void } {
  const { room } = options;
  let disposed = false;
  let left = false;
  const signals = createRoomSignalScope(room.onLeave);
  let stopHeartbeat = () => {};
  let unsubscribeMessage = () => {};

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    stopHeartbeat();
    if (!left) unsubscribeMessage();
    signals.dispose();
  }
  function onLeave(code: number, reason?: string): void {
    left = true;
    if (disposed) return;
    dispose();
    options.onPing(null);
    options.onLeave(code, reason);
  }
  const ping = () => { if (!disposed) room.send("ping", { clientTime: options.now() }); };

  unsubscribeMessage = room.onMessage("*", (type, payload) => {
    if (disposed) return;
    if (type === "pong") {
      const clientTime = decodePong(payload);
      if (clientTime !== null) options.onPing(options.now() - clientTime);
      return;
    }
    const event = decodeMatchEvent(type, payload);
    if (event) options.onEvent(event);
  });
  signals.listen(room.onError, options.onError);
  signals.listen(room.onLeave, onLeave);
  try {
    stopHeartbeat = options.every(ping, 2000);
    ping();
  } catch (error) {
    dispose();
    throw error;
  }
  return { dispose };
}
