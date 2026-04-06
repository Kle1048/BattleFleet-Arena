import type * as THREE from "three";
import { playAirDefenseFire, playAirDefenseHitBurst, showAirDefenseScreenPulse } from "../effects/airDefenseFx";
import {
  parseAirDefenseEvent,
  parseArtyFiredEvent,
  parseArtyImpactEvent,
  parseOwnerEvent,
  parseSimpleImpactEvent,
} from "./matchEventAdapter";
import { findPlayerPositionById } from "./networkStateAdapter";

type RoomLike = {
  state: unknown;
  onMessage: (type: string, cb: (msgTypeOrPayload: unknown, maybePayload?: unknown) => void) => void;
  onError: (cb: (code: number, message?: string) => void) => void;
  onLeave: (cb: (code: number, reason?: string) => void) => void;
  send: (type: string, payload: unknown) => void;
};

type NetPlayerLike = {
  id: string;
  x: number;
  z: number;
};

type ArtilleryFxLike = {
  onFired: (msg: {
    shellId: number;
    ownerId: string;
    fromX: number;
    fromZ: number;
    toX: number;
    toZ: number;
    flightMs: number;
  }) => void;
  onImpact: (
    msg: { shellId: number; x: number; z: number; kind?: "water" | "hit" | "island" },
    options?: { skipSplash?: boolean },
  ) => void;
};

type ImpactFxLike = {
  flashImpact: (x: number, z: number, kind: string) => void;
};

type RegisterNetworkHandlersOptions<TPlayerList> = {
  room: RoomLike;
  mySessionId: string;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  artilleryFx: ArtilleryFxLike;
  missileFx: ImpactFxLike;
  torpedoFx: ImpactFxLike;
  shouldRenderArtyFiredClientVfx: (fromX: number, fromZ: number, toX: number, toZ: number) => boolean;
  isArtyWorldPointInCullRange: (x: number, z: number) => boolean;
  playerListOf: (room: { state: unknown }) => TPlayerList;
  findPlayerBySessionId: (list: TPlayerList, sessionId: string) => NetPlayerLike | undefined;
  setPingMs: (next: number | null) => void;
  setColyseusWarn: (next: string) => void;
  onPrimaryFireByLocalPlayer: () => void;
  onHitNearLocalPlayer: () => void;
  onMissileFireByLocalPlayer: () => void;
  onTorpedoFireByLocalPlayer: () => void;
};

export function registerNetworkHandlers<TPlayerList>(
  options: RegisterNetworkHandlersOptions<TPlayerList>,
): void {
  const {
    room,
    mySessionId,
    camera,
    scene,
    artilleryFx,
    missileFx,
    torpedoFx,
    shouldRenderArtyFiredClientVfx,
    isArtyWorldPointInCullRange,
    playerListOf,
    findPlayerBySessionId,
    setPingMs,
    setColyseusWarn,
    onPrimaryFireByLocalPlayer,
    onHitNearLocalPlayer,
    onMissileFireByLocalPlayer,
    onTorpedoFireByLocalPlayer,
  } = options;

  room.onMessage("pong", (payloadUnknown) => {
    const payload = payloadUnknown as { clientTime?: number };
    const t = Number(payload?.clientTime);
    if (Number.isFinite(t)) {
      setPingMs(performance.now() - t);
    }
  });

  const pingIntervalId = window.setInterval(() => {
    room.send("ping", { clientTime: performance.now() });
  }, 2_000);
  room.send("ping", { clientTime: performance.now() });

  room.onError((code, message) => {
    const line = `[${code}] ${message ?? ""}`.trim();
    setColyseusWarn(line.length > 0 ? line : `Fehler-Code ${code}`);
    console.warn("[colyseus]", code, message);
  });

  /** @colyseus/core Protocol.WS_CLOSE_WITH_ERROR */
  const WS_CLOSE_WITH_ERROR = 4002;
  room.onLeave((code, reason) => {
    window.clearInterval(pingIntervalId);
    setPingMs(null);
    const r = String(reason ?? "");
    if (code === WS_CLOSE_WITH_ERROR && r.includes("left_operational_area")) {
      setColyseusWarn("Destroyed: left the Area of Operations. Reload the page to play again.");
    } else if (code === WS_CLOSE_WITH_ERROR && r.includes("destroyed_in_combat")) {
      setColyseusWarn("Destroyed in combat. Reload the page to play again.");
    } else {
      setColyseusWarn(`Verbindung beendet (${code}). Seite neu laden.`);
    }
  });

  room.onMessage("artyFired", (msg) => {
    const m = parseArtyFiredEvent(msg);
    if (m) {
      if (!shouldRenderArtyFiredClientVfx(m.fromX, m.fromZ, m.toX, m.toZ)) return;
      artilleryFx.onFired({
        shellId: m.shellId,
        ownerId: m.ownerId,
        fromX: m.fromX,
        fromZ: m.fromZ,
        toX: m.toX,
        toZ: m.toZ,
        flightMs: m.flightMs,
      });
      if (m.ownerId === mySessionId) onPrimaryFireByLocalPlayer();
    }
  });

  room.onMessage("artyImpact", (msg) => {
    const m = parseArtyImpactEvent(msg);
    if (m) {
      const kind = m.kind;
      const skipSplash = !isArtyWorldPointInCullRange(m.x, m.z);
      artilleryFx.onImpact({ shellId: m.shellId, x: m.x, z: m.z, kind }, { skipSplash });
      if (kind === "hit") {
        const loc = findPlayerBySessionId(playerListOf(room), mySessionId);
        if (loc) {
          const dx = m.x - loc.x;
          const dz = m.z - loc.z;
          if (dx * dx + dz * dz < 300 * 300) onHitNearLocalPlayer();
        }
      }
    }
  });

  room.onMessage("aswmFired", (msg) => {
    const m = parseOwnerEvent(msg);
    if (m && m.ownerId === mySessionId) {
      onMissileFireByLocalPlayer();
    }
  });

  room.onMessage("torpedoFired", (msg) => {
    const m = parseOwnerEvent(msg);
    if (m && m.ownerId === mySessionId) {
      onTorpedoFireByLocalPlayer();
    }
  });

  room.onMessage("aswmImpact", (msg) => {
    const m = parseSimpleImpactEvent(msg);
    if (m) {
      if (!isArtyWorldPointInCullRange(m.x, m.z)) return;
      missileFx.flashImpact(m.x, m.z, m.kind);
    }
  });

  room.onMessage("torpedoImpact", (msg) => {
    const m = parseSimpleImpactEvent(msg);
    if (m) {
      if (!isArtyWorldPointInCullRange(m.x, m.z)) return;
      torpedoFx.flashImpact(m.x, m.z, m.kind);
    }
  });

  room.onMessage("*", (type, msg) => {
    const parsed = parseAirDefenseEvent(type, msg);
    if (!parsed) return;
    const { x, z, layer } = parsed;

    if (parsed.type === "airDefenseIntercept") {
      showAirDefenseScreenPulse(camera, document.body, x, z, layer);
      playAirDefenseHitBurst(scene, x, z, layer);
      return;
    }

    let fromX = parsed.defenderX;
    let fromZ = parsed.defenderZ;
    if (fromX == null || fromZ == null) {
      if (!parsed.defenderId) return;
      const pos = findPlayerPositionById(playerListOf(room) as Iterable<NetPlayerLike>, parsed.defenderId);
      if (!pos) return;
      fromX = pos.x;
      fromZ = pos.z;
    }
    playAirDefenseFire(scene, layer, fromX, fromZ, x, z);
  });
}
