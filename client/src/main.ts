/**
 * Task 2: Colyseus-Client — autoritative Pose vom Server, Input per Message „input“.
 *
 * Join **ohne** Root-Schema-Argument: State per **Reflection** (vom Server-Handshake).
 * Kein `BattleState` aus `@battlefleet/shared` übergeben — mit Vite-Alias + zweiter Schema-Kopie
 * entsteht sonst „getNextUniqueId“ / kaputtes `$changes.root` beim Decode.
 * `playerList`-Referenz nach jedem State-Wechsel neu binden (stale ArraySchema).
 */
import * as THREE from "three";
import type { ArraySchema } from "@colyseus/schema";
import { Client } from "colyseus.js";
import type { PlayerState } from "@battlefleet/shared";
import { DESTROYER_LIKE_MVP } from "@battlefleet/shared";
import {
  createGameScene,
  resizeCamera,
  updateFollowCamera,
} from "./game/scene/createGameScene";
import { createShipVisual, rudderRotationRad, type ShipVisual } from "./game/scene/shipVisual";
import { createInputHandlers } from "./game/input/keyboardMouse";
import { createCockpitHud } from "./game/hud/cockpitHud";
import { createDebugOverlay } from "./game/hud/debugOverlay";

/**
 * Colyseus-HTTP-Basis (Matchmaking + WS-Auflösung).
 * „localhost“ → oft IPv6 (::1) in Firefox; viele Node-Bindings lauschen nur IPv4 → kein Join.
 * Loopback daher immer 127.0.0.1; CORS ist ok (Server spiegelt den echten Origin).
 * Nur bei echtem LAN-Host (z. B. Tablet) Seiten-Hostnamen verwenden.
 */
function colyseusHttpBase(): string {
  const fromEnv = import.meta.env.VITE_COLYSEUS_URL;
  if (fromEnv != null && String(fromEnv).length > 0) {
    return String(fromEnv).replace(/\/$/, "");
  }
  const pageHost =
    typeof window !== "undefined" && window.location.hostname.length > 0
      ? window.location.hostname
      : "127.0.0.1";
  const gameHost = normalizeHostForColyseus(pageHost);
  return `http://${gameHost}:2567`;
}

function normalizeHostForColyseus(pageHostname: string): string {
  const h = pageHostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    h === "localhost" ||
    h === "::1" ||
    h === "0:0:0:0:0:0:0:1" ||
    h === "127.0.0.1"
  ) {
    return "127.0.0.1";
  }
  return pageHostname;
}

const COLYSEUS_URL = colyseusHttpBase();

const root = document.getElementById("app");
if (!root) throw new Error("#app missing");

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
root.appendChild(renderer.domElement);

const bundle = createGameScene();
const { scene, camera } = bundle;
const cfg = DESTROYER_LIKE_MVP;

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();

function getGroundPoint(ndcX: number, ndcY: number): { x: number; z: number } | null {
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const out = new THREE.Vector3();
  const ok = raycaster.ray.intersectPlane(groundPlane, out);
  if (!ok) return null;
  return { x: out.x, z: out.z };
}

const input = createInputHandlers(renderer.domElement, getGroundPoint);
const cockpit = createCockpitHud();
const debugOverlay = createDebugOverlay();

resizeCamera(camera, window.innerWidth, window.innerHeight);
window.addEventListener("resize", () => {
  resizeCamera(camera, window.innerWidth, window.innerHeight);
  renderer.setSize(window.innerWidth, window.innerHeight);
});

type NetPlayer = Pick<
  PlayerState,
  "id" | "x" | "z" | "headingRad" | "speed" | "rudder" | "aimX" | "aimZ"
>;

type WireBattleState = { playerList: ArraySchema<NetPlayer> };

function playerListOf(room: { state: unknown }): ArraySchema<NetPlayer> {
  const st = room.state as Partial<WireBattleState> | null | undefined;
  if (!st?.playerList) {
    throw new Error(
      "room.state.playerList fehlt — Snapshot nicht angekommen oder Schema passt nicht.",
    );
  }
  return st.playerList;
}

function getPlayer(list: ArraySchema<NetPlayer>, sessionId: string): NetPlayer | undefined {
  for (const p of list) {
    if (p.id === sessionId) return p;
  }
  return undefined;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => {
      reject(
        new Error(
          `${label} Prüfe: Server läuft? Firewall? Adresse ${COLYSEUS_URL}`,
        ),
      );
    }, ms);
    promise.then(
      (v) => {
        window.clearTimeout(id);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(id);
        reject(e);
      },
    );
  });
}

async function bootstrap(): Promise<void> {
  let colyseusWarn = "";

  debugOverlay.update({
    fps: 0,
    roomId: "…",
    playerCount: 0,
    pingMs: null,
    diag: "In Konsole: „Warnungen“ aktivieren (Filter).",
    warn: `Verbinde…\n${COLYSEUS_URL}`,
  });

  const client = new Client(COLYSEUS_URL);
  const room = await withTimeout(
    client.joinOrCreate("battle"),
    15_000,
    "Keine Antwort vom Spiel-Server.",
  );
  const mySessionId = room.sessionId;
  const joinedAt = performance.now();
  let stateSyncCount = 0;
  let playerListHandlersBoundTo: ArraySchema<NetPlayer> | null = null;
  let pingMs: number | null = null;

  room.onMessage("pong", (payload: { clientTime?: number }) => {
    const t = Number(payload?.clientTime);
    if (Number.isFinite(t)) {
      pingMs = performance.now() - t;
    }
  });
  const pingIntervalId = window.setInterval(() => {
    room.send("ping", { clientTime: performance.now() });
  }, 2_000);
  room.send("ping", { clientTime: performance.now() });

  room.onError((code, message) => {
    const line = `[${code}] ${message ?? ""}`.trim();
    colyseusWarn = line.length > 0 ? line : `Fehler-Code ${code}`;
    console.warn("[colyseus]", code, message);
  });

  room.onLeave((code) => {
    window.clearInterval(pingIntervalId);
    pingMs = null;
    colyseusWarn = `Verbindung beendet (${code}). Seite neu laden.`;
  });

  const visuals = new Map<string, ShipVisual>();

  const addVisual = (sessionId: string): void => {
    if (visuals.has(sessionId)) return;
    const vis = createShipVisual({ isLocal: sessionId === mySessionId });
    scene.add(vis.group);
    visuals.set(sessionId, vis);
  };

  /** Nach Reflection-Decode kann `state.playerList` die Instanz wechseln — Listener an die aktuelle Liste. */
  const bindPlayerListHandlers = (): void => {
    const list = playerListOf(room);
    if (list === playerListHandlersBoundTo) return;
    playerListHandlersBoundTo = list;
    /** Zweites Argument `true`: bestehende Einträge sofort (z. B. nach Ersatz der ArraySchema). */
    list.onAdd((player) => {
      addVisual(player.id);
    }, true);
    list.onRemove((player) => {
      const vis = visuals.get(player.id);
      if (vis) {
        scene.remove(vis.group);
        vis.group.clear();
      }
      visuals.delete(player.id);
    });
  };

  room.onStateChange(() => {
    stateSyncCount += 1;
    bindPlayerListHandlers();
  });
  bindPlayerListHandlers();

  let fpsFrames = 0;
  let lastFpsTick = performance.now();

  function frame(now: number): void {
    const playerList = playerListOf(room);
    fpsFrames += 1;
    if (now - lastFpsTick >= 500) {
      const fps = fpsFrames / ((now - lastFpsTick) / 1000);
      fpsFrames = 0;
      lastFpsTick = now;
      let warn = colyseusWarn;
      if (!warn && now - joinedAt > 4_000 && stateSyncCount === 0) {
        warn =
          "Kein ROOM_STATE (Sync 0): WebSocket-ACK? Server-Terminal prüfen. Konsole: Filter „Warnungen“.";
      } else if (!warn && playerList.length === 0 && now - joinedAt > 2_500 && stateSyncCount > 0) {
        warn =
          "Sync ok, playerList leer: Server-Log onJoin? Oder zweiten Tab testen.";
      } else if (!warn && playerList.length === 0 && now - joinedAt > 2_500) {
        warn =
          "Spieler 0: Sync wartet oder fehlt — siehe graue Diagnose, Server-Terminal.";
      }
      const jsonKeys =
        room.state && typeof room.state === "object"
          ? Object.keys(room.state as object)
              .filter((k) => !k.startsWith("$") && k !== "constructor")
              .join(", ")
          : "—";
      debugOverlay.update({
        fps,
        roomId: room.roomId ? room.roomId.slice(0, 8) : "—",
        playerCount: playerList.length,
        pingMs,
        diag: `STATE ${stateSyncCount} | keys: ${jsonKeys}\nKonsole → __BFA`,
        warn: warn || undefined,
      });
    }

    /** Nach ROOM_STATE können Callbacks fehlen — fehlende Meshes nachziehen. */
    if (visuals.size !== playerList.length) {
      for (const p of playerList) {
        addVisual(p.id);
      }
    }

    const samp = input.sample();
    const me = getPlayer(playerList, mySessionId);

    for (const [sessionId, vis] of visuals) {
      const p = getPlayer(playerList, sessionId);
      if (!p) continue;
      vis.group.position.set(p.x, 0, p.z);
      vis.group.rotation.y = p.headingRad;
      vis.rudderLine.rotation.y = rudderRotationRad(p.rudder);

      /** Local: Maus (sofort); Remote: `aimX/aimZ` aus Server (~20 Hz) — gleiche Peilung für alle sichtbar. */
      const aimWx = sessionId === mySessionId ? samp.aimWorldX : p.aimX;
      const aimWz = sessionId === mySessionId ? samp.aimWorldZ : p.aimZ;
      const yawAim = Math.atan2(aimWx - p.x, aimWz - p.z);
      vis.aimLine.rotation.y = yawAim - p.headingRad;

      if (sessionId === mySessionId && me) {
        updateFollowCamera(camera, p.x, p.z, p.headingRad);

        room.send("input", {
          throttle: samp.throttle,
          rudderInput: samp.rudderInput,
          aimX: samp.aimWorldX,
          aimZ: samp.aimWorldZ,
        });

        cockpit.update({
          speed: p.speed,
          maxSpeed: cfg.maxSpeed,
          throttle: samp.throttle,
          rudder: p.rudder,
          headingRad: p.headingRad,
        });
      }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  (window as unknown as { __BFA: unknown }).__BFA = {
    colyseusUrl: COLYSEUS_URL,
    room,
    mySessionId,
    get playerListLength(): number {
      return playerListOf(room).length;
    },
    get stateSyncCount(): number {
      return stateSyncCount;
    },
    get pingMs(): number | null {
      return pingMs;
    },
  };
}

bootstrap().catch((err) => {
  console.error(err);
  const detail = err instanceof Error ? err.message : String(err);
  debugOverlay.update({
    fps: 0,
    roomId: "FEHLER",
    playerCount: 0,
    pingMs: null,
    diag: undefined,
    warn: `${detail}\n→ npm run dev -w server`,
  });
  const banner = document.createElement("div");
  banner.style.cssText =
    "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#5ec8f5;color:#102030;font-family:system-ui;padding:24px;text-align:center;z-index:9999;";
  banner.textContent = `Keine Verbindung (${COLYSEUS_URL}): ${detail} — Server: „npm run dev -w server“.`;
  document.body.appendChild(banner);
});

window.addEventListener("unhandledrejection", (ev) => {
  const msg = ev.reason instanceof Error ? ev.reason.message : String(ev.reason);
  console.error("unhandledrejection", ev.reason);
  debugOverlay.update({
    fps: 0,
    roomId: "FEHLER",
    playerCount: 0,
    pingMs: null,
    diag: undefined,
    warn: `Unhandled: ${msg}`,
  });
});
