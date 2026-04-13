/**
 * Colyseus-Client — Pose, Input (LMB Primär, **RMB ASuM**), Interpolation,
 * **gameMessageHud**, Artillerie-, **ASuM** (`missileList`) + **Torpedos** (`torpedoList`), **SAM/CIWS** (`airDefenseFire` / `airDefenseIntercept`).
 *
 * Join **mit** `BattleState` aus `@battlefleet/shared`: gleiche Feldreihenfolge wie der Server —
 * Reflection allein ließ u. a. `aswmRemaining*` fehlen → HUD zeigte nur „rot“ (Remaining 0).
 * Vite `resolve.dedupe: ["@colyseus/schema"]` hält eine Schema-Instanz (kein getNextUniqueId-Chaos).
 * `playerList`-Referenz nach jedem State-Wechsel neu binden (stale ArraySchema).
 */
import * as THREE from "three";
import {
  BattleState,
  DESTROYER_LIKE_MVP,
  MATCH_PHASE_ENDED,
  PlayerLifeState,
  getShipClassProfile,
} from "@battlefleet/shared";
import { createGameScene } from "./game/scene/createGameScene";
import { createInputHandlers } from "./game/input/keyboardMouse";
import { createCockpitHud } from "./game/hud/cockpitHud";
import { createMessageLogPlaceholder } from "./game/hud/messageLogPlaceholder";
import { createDebugOverlay } from "./game/hud/debugOverlay";
import { createBotController } from "./game/bot/botController";
import { createBotDebugPanel } from "./game/bot/botDebugPanel";
import { createMatchEndHud } from "./game/hud/matchEndHud";
import {
  createGameMessageHud,
  playerDisplayLabel,
  shortSessionIdForMessage,
} from "./game/hud/gameMessageHud";
import { createArtilleryFx } from "./game/effects/artilleryFx";
import { createFxSystem } from "./game/effects/fxSystem";
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
import { loadPersistedFollowCameraTuning } from "./game/runtime/followCameraTuning";
import { resolveMountGltfUrl, uniqueMountVisualUrls } from "./game/runtime/mountGltfUrls";
import {
  resolveShipHullGltfUrlForClass,
  uniqueHullGltfUrlsForAllClasses,
} from "./game/runtime/shipProfileRuntime";
import type { ShipClassId } from "@battlefleet/shared";
import { getShipHullGltfSourceForUrl, loadShipHullGltfSource } from "./game/scene/shipGltfHull";
import { renderToWorldX, worldToRenderX } from "./game/runtime/renderCoords";
import {
  MAX_SHIP_WAKES,
  applyWaterShaderTuning,
  updateGameWaterAnimations,
  updateWaterShipWakes,
} from "./game/runtime/materialLibrary";
import { getWakeSampleMinDistSq } from "./game/runtime/wakeRuntimeTuning";
import { createWakeTrailState, pushWakeTrailSample } from "./game/runtime/wakeTrail";
import { createEnvironmentDebugPanel } from "./game/runtime/environmentDebugPanel";
import { installReflectionCameraLayerMask } from "./game/runtime/renderOverlayLayers";
import { getShipDebugTuning } from "./game/runtime/shipDebugTuning";
import {
  createCameraCullRuntimeState,
  isArtyWorldPointInCullRange,
  shouldRenderArtyFiredClientVfx,
} from "./game/runtime/cameraCullRuntime";
import { disposeCameraShake, triggerCameraShake } from "./game/runtime/cameraShakeRuntime";
import { createScreenFlashOverlay } from "./game/runtime/screenFlashRuntime";
import {
  createFrameRuntimeState,
  runFrameRuntimeStep,
} from "./game/runtime/frameRuntime";
import {
  getPlayer,
  missileListOf,
  playerListOf,
  readMatchTimer,
  torpedoListOf,
} from "./game/runtime/stateAdapter";
import { clearPersistedClientSettings } from "./game/runtime/clearPersistedClientSettings";

const COLYSEUS_URL = colyseusHttpBase(
  import.meta.env.VITE_COLYSEUS_URL,
  typeof window !== "undefined" ? window.location.hostname : undefined,
);

const root = document.getElementById("app");
if (!root) throw new Error("#app missing");

/**
 * Einmalig alle lokalen Client-Defaults wiederherstellen: Seite mit `?resetLocal=1` öffnen
 * (z. B. nach Browser-Wechsel oder kaputten Debug-Werten). Löscht bekannte `localStorage`-Keys
 * und lädt neu — **vor** `loadPersistedFollowCameraTuning()`.
 */
if (typeof window !== "undefined") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("resetLocal") === "1") {
    clearPersistedClientSettings();
    params.delete("resetLocal");
    const q = params.toString();
    const url = `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", url);
    window.location.reload();
  }
}

/** Größeres Fadenkreuz: dunkle Kontur + helle Mitte, damit es auf Wasser/Himmel gut lesbar ist. */
const AIM_CROSSHAIR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g stroke-linecap="round"><line x1="16" y1="2" x2="16" y2="11" stroke="#050a12" stroke-width="5"/><line x1="16" y1="21" x2="16" y2="30" stroke="#050a12" stroke-width="5"/><line x1="2" y1="16" x2="11" y2="16" stroke="#050a12" stroke-width="5"/><line x1="21" y1="16" x2="30" y2="16" stroke="#050a12" stroke-width="5"/><circle cx="16" cy="16" r="4" fill="none" stroke="#050a12" stroke-width="5"/><line x1="16" y1="2" x2="16" y2="11" stroke="#f5f9ff" stroke-width="2.5"/><line x1="16" y1="21" x2="16" y2="30" stroke="#f5f9ff" stroke-width="2.5"/><line x1="2" y1="16" x2="11" y2="16" stroke="#f5f9ff" stroke-width="2.5"/><line x1="21" y1="16" x2="30" y2="16" stroke="#f5f9ff" stroke-width="2.5"/><circle cx="16" cy="16" r="4" fill="none" stroke="#f5f9ff" stroke-width="2"/></g></svg>`;

const renderer = createGameRenderer(root);
renderer.domElement.style.cursor = `url("data:image/svg+xml,${encodeURIComponent(AIM_CROSSHAIR_SVG)}") 16 16, crosshair`;
const assetManager = createAssetManager();

loadPersistedFollowCameraTuning();

/** Nach Cockpit-HUD gesetzt — für bootstrap().catch */
let debugOverlayForFatal: ReturnType<typeof createDebugOverlay> | null = null;

async function bootstrap(): Promise<void> {
  const bundle = await createGameScene();
  const { scene, camera, water, waterFoam } = bundle;
  const foamMat = waterFoam.material as THREE.Material;
  const environmentDebugPanel = createEnvironmentDebugPanel(bundle);
  const cfg = DESTROYER_LIKE_MVP;

  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const raycaster = new THREE.Raycaster();

  function getGroundPoint(ndcX: number, ndcY: number): { x: number; z: number } | null {
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const out = new THREE.Vector3();
    const ok = raycaster.ray.intersectPlane(groundPlane, out);
    if (!ok) return null;
    return { x: renderToWorldX(out.x), z: out.z };
  }

  const input = createInputHandlers(renderer.domElement, getGroundPoint);
  const cockpit = createCockpitHud();
  const bridgeEl = document.querySelector(".cockpit-bridge") as HTMLElement | null;
  const opzEl = document.querySelector(".cockpit-opz") as HTMLElement | null;
  if (!bridgeEl || !opzEl) {
    throw new Error("Cockpit-HUD (.cockpit-bridge / .cockpit-opz) fehlt");
  }
  const debugOverlay = createDebugOverlay({ parent: bridgeEl });
  debugOverlayForFatal = debugOverlay;
  installGlobalRuntimeErrorHandlers(debugOverlay);
  const messageLogPlaceholder = createMessageLogPlaceholder({ parent: opzEl });
  const botController = createBotController();
  const botDebugPanel = createBotDebugPanel();
  const gameMessageHud = createGameMessageHud();
  const fxSystem = createFxSystem(scene);
  const artilleryFx = createArtilleryFx(scene, fxSystem);
  const missileFx = createMissileFx(scene, fxSystem);
  const torpedoFx = createTorpedoFx(scene, fxSystem);
  const screenFlash = createScreenFlashOverlay();

  bindRendererResize(camera, renderer);
  const reflectionLayerMask = installReflectionCameraLayerMask(renderer, camera);

  let colyseusWarn = "";
  let reloadScheduled = false;

  function scheduleReload(delayMs = 900): void {
    if (reloadScheduled) return;
    reloadScheduled = true;
    window.setTimeout(() => {
      window.location.reload();
    }, delayMs);
  }

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
  await gameAudio.preloadSounds();
  const hullUrls = uniqueHullGltfUrlsForAllClasses();
  const mountUrls = uniqueMountVisualUrls();
  await Promise.all(
    [...hullUrls, ...mountUrls].map((u) => loadShipHullGltfSource(u)),
  );
  function getHullGltfTemplate(shipClassId: ShipClassId) {
    return getShipHullGltfSourceForUrl(resolveShipHullGltfUrlForClass(shipClassId));
  }
  function getMountGltfTemplate(visualId: string) {
    return getShipHullGltfSourceForUrl(resolveMountGltfUrl(visualId));
  }
  const room = await withTimeout(
    client.joinOrCreate(
      "battle",
      {
        shipClass: lobby.shipClass,
        displayName: lobby.displayName,
      },
      BattleState,
    ),
    15_000,
    `Keine Antwort vom Spiel-Server. Prüfe: Server läuft? Firewall? Adresse ${COLYSEUS_URL}`,
  );
  const mySessionId = room.sessionId;

  const matchEndHud = createMatchEndHud(() => {
    // Fallback: bei bereits geschlossener WS kann `leave()` hängen.
    scheduleReload(500);
    void room.leave().finally(() => {
      scheduleReload(80);
    });
  });
  const joinedAt = performance.now();
  let pingMs: number | null = null;
  const botAutoEnabled =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("bot") === "1";
  if (botAutoEnabled) {
    botController.enable();
  }
  const onBotToggleKey = (e: KeyboardEvent): void => {
    if (e.code !== "KeyB") return;
    if (botController.isEnabled()) botController.disable();
    else botController.enable();
  };
  window.addEventListener("keydown", onBotToggleKey);
  const frameRuntimeState = createFrameRuntimeState(1);
  const cameraCullState = createCameraCullRuntimeState();
  let localWakeTrail: ReturnType<typeof createWakeTrailState> | null = null;

  registerNetworkHandlers({
    room,
    mySessionId,
    camera,
    scene,
    artilleryFx,
    missileFx,
    torpedoFx,
    shouldRenderArtyFiredClientVfx: (fromX, fromZ, toX, toZ) =>
      shouldRenderArtyFiredClientVfx(cameraCullState, fromX, fromZ, toX, toZ),
    isArtyWorldPointInCullRange: (x, z) => isArtyWorldPointInCullRange(cameraCullState, x, z),
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
    onMineImpactNearLocalPlayer: (distance) => {
      const prox = 1 - Math.min(1, Math.max(0, distance / 360));
      if (prox <= 0) return;
      triggerCameraShake({
        durationMs: 120 + 190 * prox,
        amplitude: 2 + 6 * prox,
      });
    },
    onConnectionClosed: () => {
      scheduleReload(1200);
    },
    onAirDefenseSound: ({ phase, layer }) => {
      if (layer === "sam" || layer === "pd") {
        if (phase === "fire") gameAudio.airDefenseSamFire();
        else gameAudio.airDefenseSamIntercept();
      } else {
        if (phase === "fire") gameAudio.airDefenseCiwsFire();
        else gameAudio.airDefenseCiwsIntercept();
      }
    },
    onCollisionContact: (kind) => {
      if (kind === "ship") gameAudio.shipShipCollision();
      else gameAudio.shipIslandCollision();
    },
    onMissileLockOn: () => gameAudio.missileLockOn(),
    onAswmMagazineReloaded: () =>
      gameMessageHud.showToast("ASuM: Magazin nachgeladen", "info", 3500),
    onSoftkillResult: (success) => {
      gameMessageHud.showToast(
        success ? "Softkill successful" : "Softkill failed",
        success ? "info" : "danger",
        3800,
      );
    },
    onWeaponHitAt: (x, z) => {
      const me = getPlayer(playerListOf(room), mySessionId);
      if (!me) {
        gameAudio.weaponHit(0.32);
        return;
      }
      const d = Math.hypot(x - me.x, z - me.z);
      const maxD = 520;
      if (d > maxD) return;
      const prox = 1 - d / maxD;
      gameAudio.weaponHit(0.18 + 0.48 * prox);
    },
  });

  const visualRuntime = createVisualRuntime({
    room,
    scene,
    mySessionId,
    playerListOf,
    getHullGltfTemplate,
    getMountGltfTemplate,
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
    fxSystem,
    {
      dispose() {
        screenFlash.dispose();
        disposeCameraShake();
      },
    },
    assetManager,
    environmentDebugPanel,
    reflectionLayerMask,
    renderer,
    {
      dispose() {
        botDebugPanel.dispose();
        window.removeEventListener("keydown", onBotToggleKey);
      },
    },
    messageLogPlaceholder,
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
        extraDiagLine: frameRuntimeState.aimLineSectorDebug
          ? `AimDbg ${frameRuntimeState.aimLineSectorDebug}`
          : undefined,
        perfMetrics: {
          artillery: artilleryFx.getStats(),
          missile: missileFx.getStats(),
          torpedo: torpedoFx.getStats(),
          fx: fxSystem.getStats(),
        },
      });
    }

    /** Nach ROOM_STATE können Callbacks fehlen — fehlende Meshes nachziehen. */
    visualRuntime.ensureVisualsForPlayers(playerList);

    const humanInput = input.sample();
    const missileList = missileListOf(room);
    const torpedoList = torpedoListOf(room);
    const botEnabled = botController.isEnabled();
    const botInput = botController.update(
      now,
      playerList,
      mySessionId,
      botEnabled && missileList ? [...missileList] : [],
      botEnabled && torpedoList ? [...torpedoList] : [],
    );
    const samp = botInput ?? humanInput;
    const { phase: matchPhase, remainingSec: matchRemainingSecRaw } = readMatchTimer(room);
    const matchEnded = matchPhase === MATCH_PHASE_ENDED;

    hudRuntime.updateMatchEndHud({ matchEnded, players: playerList });

    runFrameRuntimeStep({
      now,
      dtMs: frameTimeMs,
      camera,
      roomSendInput: (payload) => room.send("input", payload),
      mySessionId,
      cfgMaxSpeed: cfg.maxSpeed,
      playerList,
      visuals,
      remoteInterp,
      inputSample: samp,
      matchEnded,
      matchRemainingSecRaw,
      cockpit,
      gameMessageHud,
      gameAudio,
      shortSessionIdForMessage,
      playerDisplayLabel,
      fx: {
        artilleryFx,
        missileFx,
        torpedoFx,
        shipDamageSmokeTick: (worldX, worldZ, headingRad, severity) =>
          fxSystem.spawnShipDamageSmokeTick(worldX, worldZ, headingRad, severity),
      },
      missileList,
      torpedoList,
      state: frameRuntimeState,
      cameraCullState,
      onShipDestroyed: (p) => {
        fxSystem.spawnShipDestroyedExplosion(p.x, p.z);
        const isSelf = p.id === mySessionId;
        const me = getPlayer(playerList, mySessionId);
        if (isSelf) {
          gameAudio.explosion(0.58);
          screenFlash.trigger({ intensity: 1 });
          triggerCameraShake({ durationMs: 520, amplitude: 15 });
        } else if (me) {
          const dist = Math.hypot(p.x - me.x, p.z - me.z);
          if (dist < 340) {
            const prox = 1 - dist / 340;
            screenFlash.trigger({ intensity: 0.26 + 0.55 * prox });
            triggerCameraShake({ durationMs: 220 + 280 * prox, amplitude: 4.5 + 12 * prox });
          }
          if (dist <= 500) {
            gameAudio.explosion(0.22 + 0.5 * (1 - dist / 500));
          }
        } else {
          gameAudio.explosion(0.38);
        }
      },
    });
    botDebugPanel.render(botController.getDebugState());

    fxSystem.update(frameTimeMs);

    const wakeUpload: { trail: ReturnType<typeof createWakeTrailState>; strength: number }[] = [];
    const minDistWakeSq = getWakeSampleMinDistSq();
    const meWake = getPlayer(playerList, mySessionId);

    if (!meWake || matchEnded || meWake.lifeState === PlayerLifeState.AwaitingRespawn) {
      localWakeTrail = null;
    } else {
      if (!localWakeTrail) localWakeTrail = createWakeTrailState();
      const p = meWake;
      const wx = p.x;
      const wz = p.z;
      const h = p.headingRad;
      const profWake = getShipClassProfile(p.shipClass);
      const refSp = cfg.maxSpeed * profWake.movementSpeedMul;
      const speedRatio = refSp > 0 ? Math.min(1, Math.max(0, p.speed / refSp)) : 0;
      const moving = speedRatio > 0.06 ? 1 : 0;
      const strength = speedRatio * speedRatio * moving;
      const sinH = Math.sin(h);
      const cosH = Math.cos(h);
      const sz = getShipDebugTuning().wakeSpawnLocalZ;
      const sternRx = worldToRenderX(wx) - sz * sinH;
      const sternZ = wz + sz * cosH;
      pushWakeTrailSample(localWakeTrail, sternRx, sternZ, minDistWakeSq);
      if (localWakeTrail.length >= 2 && strength >= 0.02) {
        wakeUpload.push({ trail: localWakeTrail, strength });
      }
    }

    updateWaterShipWakes(foamMat, wakeUpload.slice(0, MAX_SHIP_WAKES));

    updateGameWaterAnimations(water, foamMat, now);
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
    waterShader: {
      set: (patch: {
        uvScale?: number;
        timeX?: number;
        timeY?: number;
        depthBase?: number;
        depthAmp?: number;
        flowTime?: number;
        flowMix?: number;
        shoreMix?: number;
        wakeCoreMix?: number;
        wakeOuterMix?: number;
        wakeOuterWidthMul?: number;
        wakeOuterNoiseMix?: number;
        wakeSegDecay?: number;
      }) => applyWaterShaderTuning(foamMat, patch),
    },
  };
}

bootstrap().catch((err) => {
  console.error(err);
  const detail = err instanceof Error ? err.message : String(err);
  debugOverlayForFatal?.update({
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
    assetManager.dispose();
    renderer.dispose();
  } catch {
    // Ignore cleanup errors during fatal bootstrap failure.
  }
});
