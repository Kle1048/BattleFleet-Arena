/**
 * Colyseus-Client — Pose, Input (LMB / Leertaste Primär, **RMB ASuM**), Interpolation,
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
} from "@battlefleet/shared";
import { createGameScene } from "./game/scene/createGameScene";
import { createInputHandlers, type MobileAimEngagementRef } from "./game/input/keyboardMouse";
import { createFireControlChannel } from "./game/input/fireControlChannel";
import { createCockpitHud } from "./game/hud/cockpitHud";
import { createMessageLog } from "./game/hud/messageLog";
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
import { showMissionBriefingIfNeeded } from "./game/ui/missionBriefing";
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
import {
  getPdmsMuzzleSeekCoords,
  getPrimaryArtilleryMuzzleSeekCoords,
} from "./game/scene/shipMountVisuals";
import { renderToWorldX } from "./game/runtime/renderCoords";
import { updateGameWaterAnimations } from "./game/runtime/materialLibrary";
import { createEnvironmentDebugPanel } from "./game/runtime/environmentDebugPanel";
import { installReflectionCameraLayerMask } from "./game/runtime/renderOverlayLayers";
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
  wreckListOf,
} from "./game/runtime/stateAdapter";
import { syncWreckListVisuals, updateAllWreckVisualPoses } from "./game/runtime/shipWreckVisuals";
import { disposeWreckCollisionDebug, syncWreckCollisionDebugMeshes } from "./game/runtime/wreckCollisionDebug";
import { clearPersistedClientSettings } from "./game/runtime/clearPersistedClientSettings";
import { installMobileBrowserChromeGuards } from "./game/runtime/mobileBrowserGuards";
import { createShipWakeRibbonSystem } from "./game/scene/shipWakeRibbon";
import { AIM_CROSSHAIR_SVG } from "./game/input/aimCrosshairSvg";
import { createMobileMapAimReticle } from "./game/input/mobileMapAimReticle";
import { t } from "./locale/t";

const COLYSEUS_URL = colyseusHttpBase(
  import.meta.env.VITE_COLYSEUS_URL,
  typeof window !== "undefined" ? window.location.hostname : undefined,
);

const root = document.getElementById("app");
if (!root) throw new Error(t("errors.appRootMissing"));

document.documentElement.lang = "en";
document.title = t("shell.documentTitle");
const pageTitleEl = document.getElementById("title");
if (pageTitleEl) pageTitleEl.textContent = t("shell.pageTitleBanner");
/** `#hud` help lines: hidden in index.html; to restore, remove `display:none` on `#hud` and populate from `shell.helpHudLine1`…`6`. */

installMobileBrowserChromeGuards();

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

const renderer = createGameRenderer(root);
renderer.domElement.style.cursor = `url("data:image/svg+xml,${encodeURIComponent(AIM_CROSSHAIR_SVG)}") 16 16, crosshair`;
const assetManager = createAssetManager();

loadPersistedFollowCameraTuning();

/** Nach Cockpit-HUD gesetzt — für bootstrap().catch */
let debugOverlayForFatal: ReturnType<typeof createDebugOverlay> | null = null;

async function bootstrap(): Promise<void> {
  const mobileMapAimReticle = createMobileMapAimReticle(renderer.domElement);
  const bundle = await createGameScene();
  const { scene, camera, water } = bundle;
  const debugShipSwitchRef: { send?: (id: ShipClassId) => void } = {};
  const environmentDebugPanel = createEnvironmentDebugPanel(bundle, {
    getDebugShipClassSender: () => debugShipSwitchRef.send,
  });
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

  const mobileAimEngagement: MobileAimEngagementRef = { self: null };
  const input = createInputHandlers(renderer.domElement, getGroundPoint, mobileAimEngagement);
  const cockpit = createCockpitHud({ onRadarToggle: () => input.queueRadarToggle() });
  const bridgeEl = document.querySelector(".cockpit-bridge") as HTMLElement | null;
  const opzEl = document.querySelector(".cockpit-opz") as HTMLElement | null;
  if (!bridgeEl || !opzEl) {
    throw new Error(t("errors.cockpitHudMissing"));
  }
  const debugOverlay = createDebugOverlay({ parent: bridgeEl });
  debugOverlayForFatal = debugOverlay;
  installGlobalRuntimeErrorHandlers(debugOverlay);
  const commsLog = createMessageLog({ parent: opzEl });
  const botController = createBotController();
  const setBotEnabled = (enabled: boolean): void => {
    if (enabled) botController.enable();
    else botController.disable();
  };
  const botDebugPanel = createBotDebugPanel({
    onSetEnabled: setBotEnabled,
  });
  document.getElementById("bottom-debug-dock")?.classList.add("bottom-debug-dock--hidden");
  const gameMessageHud = createGameMessageHud({
    onToast: (e) => commsLog.append({ text: e.text, kind: e.kind }),
  });
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
    diag: t("bootstrap.initialDebugDiag"),
    warn: t("bootstrap.initialDebugWarnConnecting", { url: COLYSEUS_URL }),
  });

  const client = createColyseusClient(COLYSEUS_URL);
  await showMissionBriefingIfNeeded();
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
    t("bootstrap.joinServerTimeout", { url: COLYSEUS_URL }),
  );
  const mySessionId = room.sessionId;
  debugShipSwitchRef.send = (id) => {
    room.send("debugSetShipClass", { shipClass: id });
  };
  commsLog.append({
    text: t("comms.roomChannelOpen", { roomId: room.roomId.slice(0, 8) }),
    kind: "info",
  });

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
    setBotEnabled(!botController.isEnabled());
  };
  window.addEventListener("keydown", onBotToggleKey);
  const frameRuntimeState = createFrameRuntimeState(1);
  const cameraCullState = createCameraCullRuntimeState();
  let prevWreckIds = new Set<string>();
  const lastWreckSmokeByWreckId = new Map<string, number>();
  let resolvePdmsMuzzleSeek: ((defenderId: string) => { x: number; y: number; z: number } | null) | undefined;

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
      debugShipSwitchRef.send = undefined;
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
      gameMessageHud.showToast(t("toast.aswmMagazineReloaded"), "info", 3500),
    onSoftkillResult: (success) => {
      const skMe = getPlayer(playerListOf(room), mySessionId);
      if (skMe && skMe.lifeState !== PlayerLifeState.AwaitingRespawn) {
        /** Pro Rauch-Puff einmal — Gain ~1/√8 gegenüber früher „einmal 0.32“, damit es nicht übersteuert. */
        const chaffGainPerPuff = 0.32 / Math.sqrt(8);
        fxSystem.spawnSoftkillChaffCloud(skMe.x, skMe.z, skMe.headingRad, undefined, (_puffIndex) => {
          gameAudio.softkillChaff(chaffGainPerPuff);
        });
      } else {
        gameAudio.softkillChaff(0.32);
      }
      gameMessageHud.showToast(
        success ? t("toast.softkillSuccess") : t("toast.softkillFailed"),
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
    getPdmsMuzzleSeek: (defenderId) => resolvePdmsMuzzleSeek?.(defenderId) ?? null,
    appendAirDefenseComms: (e) => commsLog.append(e),
    formatPlayerLabel: (id) => {
      const p = getPlayer(playerListOf(room), id);
      return playerDisplayLabel(p ?? { id });
    },
    airDefenseSamLaunchFx: {
      spawnMissileLaunchSmoke: (worldX, worldZ, headingRad) =>
        fxSystem.spawnMissileLaunchSmoke(worldX, worldZ, headingRad),
      spawnMissileTrailStreamTick: (worldX, worldZ, headingRad, particleCount) =>
        fxSystem.spawnMissileTrailStreamTick(worldX, worldZ, headingRad, particleCount),
    },
    getMissileWorldXZById: (missileId) => {
      const list = missileListOf(room);
      if (!list) return null;
      for (let i = 0; i < list.length; i++) {
        const m = list.at(i);
        if (m && m.missileId === missileId) {
          return { x: m.x, z: m.z };
        }
      }
      return null;
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
  const { visuals, remoteInterp, ensureShipVisual, removeShipVisual } = visualRuntime;
  const shipWakeRibbonSystem = createShipWakeRibbonSystem(scene);
  artilleryFx.setMuzzleSeekResolver((ownerId) => getPrimaryArtilleryMuzzleSeekCoords(visuals.get(ownerId)));
  resolvePdmsMuzzleSeek = (defenderId) => getPdmsMuzzleSeekCoords(visuals.get(defenderId));
  const fireControl = createFireControlChannel({
    scene,
    camera,
    canvas: renderer.domElement,
    mySessionId,
    playerLabel: playerDisplayLabel,
    onToast: (text, kind, durationMs) => gameMessageHud.showToast(text, kind, durationMs),
  });
  const runtimeShutdown = createRuntimeShutdown([
    mobileMapAimReticle,
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
    commsLog,
    fireControl,
    shipWakeRibbonSystem,
    {
      dispose() {
        disposeWreckCollisionDebug(scene);
      },
    },
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

    const wreckList = wreckListOf(room);
    prevWreckIds = syncWreckListVisuals(
      wreckList,
      ensureShipVisual,
      removeShipVisual,
      prevWreckIds,
    );
    updateAllWreckVisualPoses(wreckList, visuals, Date.now());
    syncWreckCollisionDebugMeshes(scene, wreckList);
    if (wreckList) {
      for (let i = 0; i < wreckList.length; i++) {
        const w = wreckList.at(i);
        if (!w) continue;
        const last = lastWreckSmokeByWreckId.get(w.wreckId) ?? 0;
        if (now - last >= 400) {
          fxSystem.spawnShipDamageSmokeTick(w.anchorX, w.anchorZ, w.headingRad, "heavily_damaged");
          lastWreckSmokeByWreckId.set(w.wreckId, now);
        }
      }
      const aliveWrecks = new Set<string>();
      for (let i = 0; i < wreckList.length; i++) {
        const w = wreckList.at(i);
        if (w) aliveWrecks.add(w.wreckId);
      }
      for (const id of lastWreckSmokeByWreckId.keys()) {
        if (!aliveWrecks.has(id)) lastWreckSmokeByWreckId.delete(id);
      }
    }

    const { phase: matchPhase, remainingSec: matchRemainingSecRaw } = readMatchTimer(room);
    const matchEnded = matchPhase === MATCH_PHASE_ENDED;

    const meForAim = getPlayer(playerList, mySessionId);
    if (meForAim && meForAim.lifeState !== PlayerLifeState.AwaitingRespawn) {
      mobileAimEngagement.self = {
        x: meForAim.x,
        z: meForAim.z,
        headingRad: meForAim.headingRad,
        shipClass: typeof meForAim.shipClass === "string" ? meForAim.shipClass : "fac",
      };
    } else {
      mobileAimEngagement.self = null;
    }

    let humanInput = input.sample();
    humanInput = fireControl.applyToInput(humanInput, playerList, matchEnded);
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

    const meLod = getPlayer(playerList, mySessionId);
    shipWakeRibbonSystem.updateFromPlayers({
      players: playerList,
      visuals,
      lodAnchorWorld: meLod ? { x: meLod.x, z: meLod.z } : undefined,
      nowSeconds: now * 0.001,
    });

    botDebugPanel.render(botController.getDebugState());

    fxSystem.update(frameTimeMs);

    updateGameWaterAnimations(water, now);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  const scaConsoleApi = {
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
    /** Dev-Debug (FPS-Toggle, Diagnose, Bot, Environment): `true` einblenden, `false` nur FPS/Frame/Ping. */
    showDevHud: (show = true) => {
      debugOverlay.setDevPanelsVisible(show);
      document.getElementById("bottom-debug-dock")?.classList.toggle("bottom-debug-dock--hidden", !show);
    },
    get devHudVisible(): boolean {
      return debugOverlay.getDevPanelsVisible();
    },
  };
  (window as unknown as { __SCA: typeof scaConsoleApi; __BFA?: typeof scaConsoleApi }).__SCA = scaConsoleApi;
  /** @deprecated Prefer `window.__SCA`. */
  (window as unknown as { __BFA?: typeof scaConsoleApi }).__BFA = scaConsoleApi;
}

bootstrap().catch((err) => {
  console.error(err);
  const detail = err instanceof Error ? err.message : String(err);
  debugOverlayForFatal?.update({
    fps: 0,
    roomId: t("bootstrap.roomIdFatal"),
    playerCount: 0,
    pingMs: null,
    diag: undefined,
    warn: t("bootstrap.fatalServerHint", { detail }),
  });
  const banner = document.createElement("div");
  banner.style.cssText =
    "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#5ec8f5;color:#102030;font-family:system-ui;padding:24px;text-align:center;z-index:9999;";
  banner.textContent = t("bootstrap.connectionFailed", { url: COLYSEUS_URL, detail });
  document.body.appendChild(banner);
  try {
    assetManager.dispose();
    renderer.dispose();
  } catch {
    // Ignore cleanup errors during fatal bootstrap failure.
  }
});
