/**
 * Task 2–5: Colyseus-Client — autoritative Pose, Input (inkl. primaryFire / LMB), Interpolation,
 * OOB-Warnung, Artillerie-VFX (artyFired, artyImpact, Client-Culling, skipSplash).
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
  ARTILLERY_FX_CULL_MARGIN,
  artilleryFxCullRadiusSq,
  cameraPivotXZ,
  createGameScene,
  orthoVisibleHalfExtents,
  resizeCamera,
  updateFollowCamera,
} from "./game/scene/createGameScene";
import { createShipVisual, rudderRotationRad, type ShipVisual } from "./game/scene/shipVisual";
import { createInputHandlers } from "./game/input/keyboardMouse";
import { createCockpitHud } from "./game/hud/cockpitHud";
import { createDebugOverlay } from "./game/hud/debugOverlay";
import { createAreaWarningHud } from "./game/hud/areaWarningHud";
import { createArtilleryFx } from "./game/effects/artilleryFx";
import {
  DEFAULT_INTERPOLATION_DELAY_MS,
  advanceIfPoseChanged,
  createInterpolationBuffer,
  sampleInterpolatedPose,
  type InterpolationBuffer,
} from "./game/network/remoteInterpolation";

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
const areaWarningHud = createAreaWarningHud();
const artilleryFx = createArtilleryFx(scene);

resizeCamera(camera, window.innerWidth, window.innerHeight);
window.addEventListener("resize", () => {
  resizeCamera(camera, window.innerWidth, window.innerHeight);
  renderer.setSize(window.innerWidth, window.innerHeight);
});

type NetPlayer = Pick<
  PlayerState,
  | "id"
  | "x"
  | "z"
  | "headingRad"
  | "speed"
  | "rudder"
  | "aimX"
  | "aimZ"
  | "oobCountdownSec"
  | "hp"
  | "maxHp"
  | "primaryCooldownSec"
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

  /**
   * **Client-VFX-Culling (Artillerie)** — gleiches Muster später für andere Welt-VFX nutzbar:
   *
   * - **Cull-Kreis:** Mitte = eigenes Schiff, Radius = **Maximum** der Abstände Schiff → **jeweils**
   *   eine der vier Ecken des sichtbaren Ortho-Rechtecks (Kamera-Pivot ± Halbexten) + Marge
   *   (`ARTILLERY_FX_CULL_MARGIN`) — das Viewport-Rechteck liegt vollständig im Kreis.
   * - **`artyFired`:** Render **nur**, wenn **Startpunkt ODER Zielpunkt** im Kreis liegt (einer reicht).
   * - **`artyImpact`:** Splash **nur**, wenn **Einschlag (x,z)** im Kreis liegt; die Kugel wird immer
   *   entfernt (`skipSplash`), damit kein Geister-Mesh bleibt.
   */
  let artyFxCullShipX = 0;
  let artyFxCullShipZ = 0;
  let artyFxCullRadiusSq = Number.POSITIVE_INFINITY;

  function isArtyWorldPointInCullRange(wx: number, wz: number): boolean {
    const dx = wx - artyFxCullShipX;
    const dz = wz - artyFxCullShipZ;
    return dx * dx + dz * dz <= artyFxCullRadiusSq;
  }

  function shouldRenderArtyFiredClientVfx(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
  ): boolean {
    return (
      isArtyWorldPointInCullRange(fromX, fromZ) || isArtyWorldPointInCullRange(toX, toZ)
    );
  }

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

  /** @colyseus/core Protocol.WS_CLOSE_WITH_ERROR */
  const WS_CLOSE_WITH_ERROR = 4002;

  room.onLeave((code, reason) => {
    window.clearInterval(pingIntervalId);
    pingMs = null;
    const r = String(reason ?? "");
    if (code === WS_CLOSE_WITH_ERROR && r.includes("left_operational_area")) {
      colyseusWarn =
        "Destroyed: left the Area of Operations. Reload the page to play again.";
    } else if (code === WS_CLOSE_WITH_ERROR && r.includes("destroyed_in_combat")) {
      colyseusWarn = "Destroyed in combat. Reload the page to play again.";
    } else {
      colyseusWarn = `Verbindung beendet (${code}). Seite neu laden.`;
    }
  });

  room.onMessage("artyFired", (msg: unknown) => {
    const m = msg as {
      shellId?: number;
      ownerId?: string;
      fromX?: number;
      fromZ?: number;
      toX?: number;
      toZ?: number;
      flightMs?: number;
    };
    if (
      typeof m?.shellId === "number" &&
      typeof m?.ownerId === "string" &&
      typeof m?.fromX === "number" &&
      typeof m?.fromZ === "number" &&
      typeof m?.toX === "number" &&
      typeof m?.toZ === "number" &&
      typeof m?.flightMs === "number"
    ) {
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
    }
  });

  room.onMessage("artyImpact", (msg: unknown) => {
    const m = msg as { shellId?: number; x?: number; z?: number; kind?: string };
    if (
      typeof m?.shellId === "number" &&
      typeof m?.x === "number" &&
      typeof m?.z === "number"
    ) {
      const raw = m.kind;
      const kind =
        raw === "water" || raw === "hit" || raw === "island" ? raw : undefined;
      const skipSplash = !isArtyWorldPointInCullRange(m.x, m.z);
      artilleryFx.onImpact({ shellId: m.shellId, x: m.x, z: m.z, kind }, { skipSplash });
    }
  });

  const visuals = new Map<string, ShipVisual>();
  /** Nur Fremdspieler: Puffer für Positions-/Peilungs-Interpolation. */
  const remoteInterp = new Map<string, InterpolationBuffer>();

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
      remoteInterp.delete(player.id);
    });
  };

  room.onStateChange(() => {
    stateSyncCount += 1;
    bindPlayerListHandlers();
    const t = performance.now();
    const list = playerListOf(room);
    for (const p of list) {
      if (p.id === mySessionId) continue;
      let buf = remoteInterp.get(p.id);
      if (!buf) {
        remoteInterp.set(p.id, createInterpolationBuffer(p, t));
      } else {
        advanceIfPoseChanged(buf, p, t);
      }
    }
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
    if (me) {
      const { halfW, halfH } = orthoVisibleHalfExtents(window.innerWidth, window.innerHeight);
      const pivot = cameraPivotXZ(me.x, me.z, me.headingRad);
      artyFxCullShipX = me.x;
      artyFxCullShipZ = me.z;
      artyFxCullRadiusSq = artilleryFxCullRadiusSq(
        me.x,
        me.z,
        pivot.x,
        pivot.z,
        halfW,
        halfH,
        ARTILLERY_FX_CULL_MARGIN,
      );
    } else {
      artyFxCullRadiusSq = Number.POSITIVE_INFINITY;
    }

    for (const [sessionId, vis] of visuals) {
      const p = getPlayer(playerList, sessionId);
      if (!p) continue;

      if (sessionId === mySessionId) {
        /** MVP Task 3: lokaler Spieler — direkte Server-Pose (autoritativ). */
        vis.group.position.set(p.x, 0, p.z);
        vis.group.rotation.y = p.headingRad;
        vis.rudderLine.rotation.y = rudderRotationRad(p.rudder);
        const aimWx = samp.aimWorldX;
        const aimWz = samp.aimWorldZ;
        const yawAim = Math.atan2(aimWx - p.x, aimWz - p.z);
        vis.aimLine.rotation.y = yawAim - p.headingRad;
      } else {
        let buf = remoteInterp.get(sessionId);
        if (!buf) {
          buf = createInterpolationBuffer(p, now);
          remoteInterp.set(sessionId, buf);
        }
        const r = sampleInterpolatedPose(buf, now, DEFAULT_INTERPOLATION_DELAY_MS);
        vis.group.position.set(r.x, 0, r.z);
        vis.group.rotation.y = r.headingRad;
        vis.rudderLine.rotation.y = rudderRotationRad(r.rudder);
        const yawAim = Math.atan2(r.aimX - r.x, r.aimZ - r.z);
        vis.aimLine.rotation.y = yawAim - r.headingRad;
      }

      if (sessionId === mySessionId && me) {
        updateFollowCamera(camera, p.x, p.z, p.headingRad);

        room.send("input", {
          throttle: samp.throttle,
          rudderInput: samp.rudderInput,
          aimX: samp.aimWorldX,
          aimZ: samp.aimWorldZ,
          primaryFire: samp.primaryFire,
        });

        cockpit.update({
          speed: p.speed,
          maxSpeed: cfg.maxSpeed,
          throttle: samp.throttle,
          rudder: p.rudder,
          headingRad: p.headingRad,
          hp: p.hp,
          maxHp: p.maxHp,
          primaryCooldownSec: p.primaryCooldownSec,
        });
      }
    }

    artilleryFx.update(now);

    areaWarningHud.update(me?.oobCountdownSec ?? 0);

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
