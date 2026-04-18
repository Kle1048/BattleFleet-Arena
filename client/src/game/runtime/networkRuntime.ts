import type * as THREE from "three";
import { playAirDefenseFire, playAirDefenseHitBurst, showAirDefenseScreenPulse } from "../effects/airDefenseFx";
import {
  type AirDefenseFxLayer,
  parseAirDefenseEvent,
  parseArtyFiredEvent,
  parseArtyImpactEvent,
  parseOwnerEvent,
  parseSimpleImpactEvent,
} from "./matchEventAdapter";
import { findPlayerPositionById } from "./networkStateAdapter";

function airDefenseLayerLabelDe(layer: AirDefenseFxLayer): string {
  if (layer === "sam") return "SAM";
  if (layer === "pd") return "PDMS";
  return "CIWS";
}

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

type PdmsMuzzleSeekCoords = { x: number; y: number; z: number };

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
  onMineImpactNearLocalPlayer: (distance: number) => void;
  onConnectionClosed: () => void;
  /** Optional: Hardkill-Schichten — Feuer und Intercept (`airDefenseFire` / `airDefenseIntercept`). */
  onAirDefenseSound?: (ev: { phase: "fire" | "intercept"; layer: "sam" | "pd" | "ciws" }) => void;
  /** Server `collisionContact`: Schiff↔Schiff / Schiff↔Insel (Kontaktbeginn). */
  onCollisionContact?: (kind: "ship" | "island") => void;
  /** Server `missileLockOn`: eigene ASuM hat Ziel erfasst. */
  onMissileLockOn?: () => void;
  /** Server `aswmMagazineReloaded`: Magazin nach Magic Reload wieder voll. */
  onAswmMagazineReloaded?: () => void;
  /** Server `softkillResult`: nur Verteidiger — ECM-Versuch gegen eingehende ASuM. */
  onSoftkillResult?: (success: boolean) => void;
  /** Direkter Waffentreffer (`kind === "hit"`) — Artillerie / ASuM / Torpedo. */
  onWeaponHitAt?: (worldX: number, worldZ: number) => void;
  /** PDMS `airDefenseFire`: Mündung `bf_muzzle` am `visual_pdms`-Mount; nach `createVisualRuntime` setzen. */
  getPdmsMuzzleSeek?: (defenderId: string) => PdmsMuzzleSeekCoords | null;
  /** Comms-Room: Flugabwehr Feuer / erfolgreicher Abfang. */
  appendAirDefenseComms?: (entry: { text: string; kind?: "info" | "danger" }) => void;
  /** Kurzname für Spieler-ID (Anzeige im Comms-Text). */
  formatPlayerLabel?: (sessionId: string) => string;
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
    onMineImpactNearLocalPlayer,
    onConnectionClosed,
    onAirDefenseSound,
    onCollisionContact,
    onWeaponHitAt,
    onMissileLockOn,
    onAswmMagazineReloaded,
    onSoftkillResult,
    getPdmsMuzzleSeek,
    appendAirDefenseComms,
    formatPlayerLabel,
  } = options;

  room.onMessage("collisionContact", (msg) => {
    const k = (msg as { kind?: string })?.kind;
    if (k === "ship" || k === "island") {
      onCollisionContact?.(k);
    }
  });

  room.onMessage("missileLockOn", () => {
    onMissileLockOn?.();
  });

  room.onMessage("aswmMagazineReloaded", () => {
    onAswmMagazineReloaded?.();
  });

  room.onMessage("softkillResult", (msg) => {
    const rec = msg as { success?: unknown };
    const ok = rec?.success === true;
    onSoftkillResult?.(ok);
  });

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
    onConnectionClosed();
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
      if (kind === "hit" && !skipSplash) {
        onWeaponHitAt?.(m.x, m.z);
      }
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
      if (m.kind === "hit") {
        onWeaponHitAt?.(m.x, m.z);
      }
    }
  });

  room.onMessage("torpedoImpact", (msg) => {
    const m = parseSimpleImpactEvent(msg);
    if (m) {
      if (!isArtyWorldPointInCullRange(m.x, m.z)) return;
      torpedoFx.flashImpact(m.x, m.z, m.kind);
      if (m.kind === "hit") {
        onWeaponHitAt?.(m.x, m.z);
      }
      const loc = findPlayerBySessionId(playerListOf(room), mySessionId);
      if (loc) {
        const dx = m.x - loc.x;
        const dz = m.z - loc.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 360) onMineImpactNearLocalPlayer(dist);
      }
    }
  });

  room.onMessage("*", (type, msg) => {
    const parsed = parseAirDefenseEvent(type, msg);
    if (!parsed) return;
    const { x, z, layer } = parsed;

    const defenderName =
      parsed.defenderId != null
        ? (formatPlayerLabel?.(parsed.defenderId) ?? parsed.defenderId.slice(0, 8))
        : "Verteidiger";
    const ziel =
      parsed.missileId != null ? ` (Ziel ASuM #${parsed.missileId})` : "";

    if (parsed.type === "airDefenseIntercept") {
      appendAirDefenseComms?.({
        text: `LW: ${airDefenseLayerLabelDe(layer)} Abfang ERFOLG — ${defenderName}${ziel}`,
        kind: "info",
      });
      onAirDefenseSound?.({ phase: "intercept", layer });
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
    let pdLaunchY: number | undefined;
    if (layer === "pd" && parsed.defenderId && getPdmsMuzzleSeek) {
      const muzzle = getPdmsMuzzleSeek(parsed.defenderId);
      if (muzzle) {
        fromX = muzzle.x;
        fromZ = muzzle.z;
        pdLaunchY = muzzle.y;
      }
    }
    appendAirDefenseComms?.({
      text: `LW: ${airDefenseLayerLabelDe(layer)} Feuer — ${defenderName}${ziel}`,
      kind: "info",
    });
    onAirDefenseSound?.({ phase: "fire", layer });
    playAirDefenseFire(scene, layer, fromX, fromZ, x, z, pdLaunchY);
  });
}
