/**
 * Colyseus-Client — Pose, Input (LMB Primär, **RMB ASuM**), Interpolation,
 * **gameMessageHud**, Artillerie-, **ASuM** (`missileList`) + **Torpedos** (`torpedoList`), **SAM/CIWS** (`airDefenseFire` / `airDefenseIntercept`).
 *
 * Join **ohne** Root-Schema-Argument: State per **Reflection** (vom Server-Handshake).
 * Kein `BattleState` aus `@battlefleet/shared` übergeben — mit Vite-Alias + zweiter Schema-Kopie
 * entsteht sonst „getNextUniqueId“ / kaputtes `$changes.root` beim Decode.
 * `playerList`-Referenz nach jedem State-Wechsel neu binden (stale ArraySchema).
 */
import * as THREE from "three";
import { DESTROYER_LIKE_MVP, MATCH_PHASE_ENDED } from "@battlefleet/shared";
import { createGameScene } from "./game/scene/createGameScene";
import { createInputHandlers } from "./game/input/keyboardMouse";
import { createCockpitHud } from "./game/hud/cockpitHud";
import { createDebugOverlay } from "./game/hud/debugOverlay";
import { createMatchEndHud } from "./game/hud/matchEndHud";
import {
  createGameMessageHud,
  playerDisplayLabel,
  shortSessionIdForMessage,
} from "./game/hud/gameMessageHud";
import { createArtilleryFx } from "./game/effects/artilleryFx";
import { createMissileFx } from "./game/effects/missileFx";
import { createTorpedoFx } from "./game/effects/torpedoFx";
import { gameAudio } from "./game/audio/gameAudio";
import { pickShipLobbyChoice } from "./game/ui/classPicker";
import { colyseusHttpBase, createColyseusClient, withTimeout } from "./game/runtime/sessionBootstrap";
import { bindRendererResize, createGameRenderer } from "./game/runtime/rendererLifecycle";
import { installGlobalRuntimeErrorHandlers } from "./game/runtime/runtimeErrors";
import { registerNetworkHandlers } from "./game/runtime/networkRuntime";
import { createVisualRuntime } from "./game/runtime/visualRuntime";
import { createHudRuntime } from "./game/runtime/hudRuntime";
import { createRuntimeShutdown } from "./game/runtime/runtimeShutdown";
import { createAssetManager } from "./game/runtime/assetManager";
import { AssetKeys, AssetUrls } from "./game/runtime/assetCatalog";
import {
  createFrameRuntimeState,
  isArtyWorldPointInCullRange,
  runFrameRuntimeStep,
  shouldRenderArtyFiredClientVfx,
} from "./game/runtime/frameRuntime";
import {
  getPlayer,
  missileListOf,
  playerListOf,
  readMatchTimer,
  torpedoListOf,
} from "./game/runtime/stateAdapter";

const COLYSEUS_URL = colyseusHttpBase(
  import.meta.env.VITE_COLYSEUS_URL,
  typeof window !== "undefined" ? window.location.hostname : undefined,
);

const root = document.getElementById("app");
if (!root) throw new Error("#app missing");

const renderer = createGameRenderer(root);
const assetManager = createAssetManager();

const bundle = createGameScene();
const { scene, camera, water } = bundle;
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
const gameMessageHud = createGameMessageHud();
const artilleryFx = createArtilleryFx(scene);
const missileFx = createMissileFx(scene);
const torpedoFx = createTorpedoFx(scene);

bindRendererResize(camera, renderer);

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

  const client = createColyseusClient(COLYSEUS_URL);
  const lobby = await pickShipLobbyChoice();
  gameAudio.unlockFromUserGesture();
  const room = await withTimeout(
    client.joinOrCreate("battle", {
      shipClass: lobby.shipClass,
      displayName: lobby.displayName,
    }),
    15_000,
    `Keine Antwort vom Spiel-Server. Prüfe: Server läuft? Firewall? Adresse ${COLYSEUS_URL}`,
  );
  const mySessionId = room.sessionId;

  // R4 productive integration: load and apply a runtime texture via AssetManager + AssetCatalog.
  const waterPattern = await assetManager.loadTexture(
    AssetKeys.waterPatternGrid,
    AssetUrls.waterPatternGrid,
  );
  waterPattern.wrapS = THREE.RepeatWrapping;
  waterPattern.wrapT = THREE.RepeatWrapping;
  waterPattern.repeat.set(42, 42);
  waterPattern.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const waterMat = water.material as THREE.MeshStandardMaterial;
  waterMat.map = waterPattern;
  waterMat.needsUpdate = true;

  const matchEndHud = createMatchEndHud(() => {
    void room.leave().finally(() => {
      window.location.reload();
    });
  });
  const joinedAt = performance.now();
  let pingMs: number | null = null;
  const frameRuntimeState = createFrameRuntimeState(1);

  registerNetworkHandlers({
    room,
    mySessionId,
    camera,
    scene,
    artilleryFx,
    missileFx,
    torpedoFx,
    shouldRenderArtyFiredClientVfx: (fromX, fromZ, toX, toZ) =>
      shouldRenderArtyFiredClientVfx(frameRuntimeState, fromX, fromZ, toX, toZ),
    isArtyWorldPointInCullRange: (x, z) => isArtyWorldPointInCullRange(frameRuntimeState, x, z),
    playerListOf,
    findPlayerBySessionId: getPlayer,
    setPingMs: (next) => {
      pingMs = next;
    },
    setColyseusWarn: (next) => {
      colyseusWarn = next;
    },
    onPrimaryFireByLocalPlayer: () => gameAudio.primaryFire(),
    onHitNearLocalPlayer: () => gameAudio.hitNear(),
    onMissileFireByLocalPlayer: () => gameAudio.missileFire(),
    onTorpedoFireByLocalPlayer: () => gameAudio.torpedoFire(),
  });

  const visualRuntime = createVisualRuntime({
    room,
    scene,
    mySessionId,
    playerListOf,
  });
  const hudRuntime = createHudRuntime({
    debugOverlay,
    matchEndHud,
    mySessionId,
    joinedAt,
  });
  const { visuals, remoteInterp } = visualRuntime;
  const runtimeShutdown = createRuntimeShutdown([
    visualRuntime,
    artilleryFx,
    missileFx,
    torpedoFx,
    assetManager,
    renderer,
  ]);
  runtimeShutdown.bindWindowUnload();

  let fpsFrames = 0;
  let lastFpsTick = performance.now();
  let lastFrameNow = performance.now();
  let frameTimeMs = 0;

  function frame(now: number): void {
    frameTimeMs = Math.max(0, now - lastFrameNow);
    lastFrameNow = now;
    const playerList = playerListOf(room);
    fpsFrames += 1;
    if (now - lastFpsTick >= 500) {
      const fps = fpsFrames / ((now - lastFpsTick) / 1000);
      fpsFrames = 0;
      lastFpsTick = now;
      const stateSyncCount = visualRuntime.getStateSyncCount();
      hudRuntime.updateDebugOverlay({
        now,
        roomState: room.state,
        roomId: room.roomId,
        playerCount: playerList.length,
        pingMs,
        stateSyncCount,
        colyseusWarn,
        fps,
        frameTimeMs,
        perfMetrics: {
          artillery: artilleryFx.getStats(),
          missile: missileFx.getStats(),
          torpedo: torpedoFx.getStats(),
        },
      });
    }

    /** Nach ROOM_STATE können Callbacks fehlen — fehlende Meshes nachziehen. */
    visualRuntime.ensureVisualsForPlayers(playerList);

    const samp = input.sample();
    const { phase: matchPhase, remainingSec: matchRemainingSecRaw } = readMatchTimer(room);
    const matchEnded = matchPhase === MATCH_PHASE_ENDED;

    hudRuntime.updateMatchEndHud({ matchEnded, players: playerList });

    runFrameRuntimeStep({
      now,
      camera,
      roomSendInput: (payload) => room.send("input", payload),
      mySessionId,
      cfgMaxSpeed: cfg.maxSpeed,
      playerList,
      visuals,
      remoteInterp,
      getPlayer,
      inputSample: samp,
      matchEnded,
      matchRemainingSecRaw,
      cockpit,
      gameMessageHud,
      gameAudio,
      shortSessionIdForMessage,
      playerDisplayLabel,
      fx: { artilleryFx, missileFx, torpedoFx },
      missileList: missileListOf(room),
      torpedoList: torpedoListOf(room),
      state: frameRuntimeState,
    });

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
      return visualRuntime.getStateSyncCount();
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
  try {
    artilleryFx.dispose();
    missileFx.dispose();
    torpedoFx.dispose();
    assetManager.dispose();
    renderer.dispose();
  } catch {
    // Ignore cleanup errors during fatal bootstrap failure.
  }
});

installGlobalRuntimeErrorHandlers(debugOverlay);
