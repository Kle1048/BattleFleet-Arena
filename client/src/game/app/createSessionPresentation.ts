/** Session presentation composition: creates and releases views/effects against
 * borrowed app rendering/input resources. Network callbacks enter through ports. */
import * as THREE from "three";

import { createFireControlChannel } from "../input/fireControlChannel";
import { createCockpitHud } from "../hud/cockpitHud";
import { createMessageLog } from "../hud/messageLog";
import { isMobileControlSurface } from "../input/mobileControls";
import { createDebugOverlay } from "../hud/debugOverlay";
import { createBotController } from "@battlefleet/shared";
import { createMatchEndHud } from "../hud/matchEndHud";
import { createGameMessageHud, playerDisplayLabel } from "../hud/gameMessageHud";
import { createArtilleryFx } from "../effects/artilleryFx";
import { createFxSystem } from "../effects/fxSystem";
import { createMissileFx } from "../effects/missileFx";
import { createTorpedoFx } from "../effects/torpedoFx";
import { gameAudio } from "../audio/gameAudio";

import { showMissionBriefing } from "../ui/missionBriefing";

import { installGlobalRuntimeErrorHandlers } from "../runtime/runtimeErrors";

import { createMatchEventPresenter } from "../presentation/matchEventPresenter";
import { createCombatFeedbackPresenter } from "../presentation/combatFeedbackPresenter";

import { createAirDefenseOutput } from "../effects/airDefenseOutput";
import { createVisualRuntime } from "../runtime/visualRuntime";
import { createHudRuntime } from "../runtime/hudRuntime";
import { createLifetime } from "../runtime/lifetime";


import { resolveMountGltfUrl } from "../runtime/mountGltfUrls";
import { resolveShipHullGltfUrlForClass } from "../runtime/shipProfileRuntime";
import type { ShipClassId } from "@battlefleet/shared";
import { getShipHullGltfSourceForUrl } from "../scene/shipGltfHull";

import { loadShipAssets } from "../runtime/shipAssetLoading";
import { getAirDefenseMuzzleSeekCoords, getPrimaryArtilleryMuzzleSeekCoords, getFixedLauncherMuzzleSeekCoords } from "../scene/shipMountVisuals";

import { createLazyResource } from "../runtime/lazyResource";

import { createCameraCullRuntimeState, isArtyWorldPointInCullRange, shouldRenderArtyFiredClientVfx } from "../runtime/cameraCullRuntime";
import { disposeCameraShake, triggerCameraShake } from "../runtime/cameraShakeRuntime";
import { createScreenFlashOverlay } from "../runtime/screenFlashRuntime";

import { disposeWreckCollisionDebug } from "../runtime/wreckCollisionDebug";

import { createShipWakeRibbonSystem } from "../scene/shipWakeRibbon";

import { t } from "../../locale/t";

import type { BattleStateSource } from "../presentation/BattleReadModel";
import type { GameSceneBundle } from "../scene/createGameScene";
import type { SessionConnection, SessionPresentation } from "./GameSession";
import type { SessionInput } from "./createGameInput";
import { pruneVisualRollSmoothed } from "../scene/shipVisualRoll";

import { createSessionFrame } from "./sessionFrame";
import { warmupWeaponRendering } from "../runtime/warmupWeaponRendering";

export function createSessionPresentation(options: {
  bundle: GameSceneBundle;
  renderer: THREE.WebGLRenderer;
  controls: SessionInput;
  stateSource: BattleStateSource;
  connection: SessionConnection;
  serverUrl: string;
  sessionNumber: number;
  returnToLobby(): void;
  /** Dev-console compatibility only; presentation never reads transport state. */
  inspectConnection(): unknown;
}): SessionPresentation {
  const lifetime = createLifetime();
  const startup = new AbortController();
  const { bundle, renderer, stateSource, connection } = options;
  const { scene, camera } = bundle;
  const { input, mobileAimEngagement, mobileHudActions } = options.controls;
  const model = stateSource.model;
  bundle.setIslandsEnabled(model.islandsEnabled);
  lifetime.defer(() => bundle.setIslandsEnabled(false));
  lifetime.defer(stateSource.subscribe({ onState: () => bundle.setIslandsEnabled(model.islandsEnabled) }));
  const mySessionId = connection.mySessionId;
  const debugShipSwitchRef: { send?: (id: ShipClassId) => void } = { send: connection.setDebugShipClass };
  function dispose() { startup.abort(); lifetime.dispose(); }
  try {
    const cockpit = lifetime.use(createCockpitHud({ onRadarToggle: () => input.queueRadarToggle(), speedParent: document.querySelector(".bfa-tele-panel--engine") ?? undefined }));
    const bridgeEl = document.querySelector(".cockpit-bridge") as HTMLElement | null;
    const bridgeStackEl = document.querySelector(".cockpit-bridge-stack") as HTMLElement | null;
    const opzEl = document.querySelector(".cockpit-opz") as HTMLElement | null;
    if (!bridgeEl || !bridgeStackEl || !opzEl) {
      throw new Error(t("errors.cockpitHudMissing"));
    }
    let stopAutofire = () => {};
    const openHelp = () => {
      stopAutofire();
      void showMissionBriefing(startup.signal).catch(error => {
        if (!startup.signal.aborted) console.warn("Mission briefing failed", error);
      });
    };
    const utilityDock = document.createElement("div");
    utilityDock.className = "hud-utility-dock";
    document.body.appendChild(utilityDock);
    lifetime.defer(() => utilityDock.remove());
    const playerContent = bridgeStackEl.querySelector<HTMLElement>(".cockpit-panel--bridge")!;
    const scoreContent = document.createElement("div");
    const scoreboard = playerContent.querySelector(".cockpit-scoreboard");
    if (scoreboard) scoreContent.appendChild(scoreboard);
    const tacActions = document.createElement("div");
    tacActions.className = "tac-utility-actions";
    tacActions.setAttribute("aria-label", "Help and fullscreen");
    opzEl.appendChild(tacActions);
    lifetime.defer(() => tacActions.remove());
    const commsLog = createMessageLog({
      showControls: !isMobileControlSurface(),
      helpParent: tacActions,
      fullscreenParent: tacActions,
      parent: utilityDock,
      playerContent,
      scoreContent,
      onShowHelp: openHelp,
    });
    lifetime.use(commsLog);
    commsLog.append({ text: t("messageLog.initialObjective") });
    const mobile = isMobileControlSurface();
    commsLog.append({ text: t(mobile ? "messageLog.initialMobileMove" : "messageLog.initialControlsMove") });
    commsLog.append({ text: t(mobile ? "messageLog.initialMobileFight" : "messageLog.initialControlsFight") });
    commsLog.append({ text: t(mobile ? "messageLog.initialMobileSystems" : "messageLog.initialControlsSystems") });
    const debugOverlay = lifetime.use(createDebugOverlay({ parent: commsLog.performanceParent }));
    lifetime.defer(installGlobalRuntimeErrorHandlers(debugOverlay));
    const botController = createBotController({ wallNow: Date.now, monotonicNow: () => performance.now() });
    const setBotEnabled = (enabled: boolean): void => {
      if (import.meta.env.DEV && enabled) botController.enable();
      else botController.disable();
    };
    const debugTools = createLazyResource(async () => {
      if (import.meta.env.DEV) {
        const { createDebugTools } = await import("../runtime/debugTools");
        return createDebugTools(bundle, { getDebugShipClassSender: () => debugShipSwitchRef.send }, setBotEnabled);
      }
      throw new Error("Debug tools are development-only");
    });
    lifetime.use(debugTools);
    document.getElementById("bottom-debug-dock")?.classList.add("bottom-debug-dock--hidden");
    const gameMessageHud = createGameMessageHud({
      onToast: (e) => commsLog.append({ text: e.text, kind: e.kind }),
    });
    lifetime.use(gameMessageHud);
    const fxSystem = lifetime.use(createFxSystem(scene, { camera: bundle.camera }));
    const artilleryFx = lifetime.use(createArtilleryFx(scene, fxSystem));
    const missileFx = lifetime.use(createMissileFx(scene, fxSystem));
    const torpedoFx = lifetime.use(createTorpedoFx(scene, fxSystem));
    const screenFlash = lifetime.use(createScreenFlashOverlay());

    lifetime.defer(disposeCameraShake);
    lifetime.defer(() => pruneVisualRollSmoothed(new Set()));
    function getHullGltfTemplate(shipClassId: ShipClassId) {
      return getShipHullGltfSourceForUrl(resolveShipHullGltfUrlForClass(shipClassId));
    }
    function getMountGltfTemplate(visualId: string) {
      return getShipHullGltfSourceForUrl(resolveMountGltfUrl(visualId));
    }
    commsLog.append({
      text: t("comms.roomChannelOpen", { roomId: connection.roomId.slice(0, 8) }),
      kind: "info",
    });

    const matchEndHud = createMatchEndHud(options.returnToLobby);
    lifetime.use(matchEndHud);
    const joinedAt = performance.now();

    // Local autopilot is a development tool, not a beta player control.
    if (import.meta.env.DEV) {
      if (new URLSearchParams(window.location.search).get("bot") === "1") {
        setBotEnabled(true);
      }
      const onBotToggleKey = (e: KeyboardEvent): void => {
        if (e.code !== "KeyB") return;
        setBotEnabled(!botController.isEnabled());
      };
      window.addEventListener("keydown", onBotToggleKey);
      lifetime.defer(() => window.removeEventListener("keydown", onBotToggleKey));
    }
    const cameraCullState = createCameraCullRuntimeState();
    let resolveAirDefenseMuzzleSeek: ((defenderId: string, slotId: string, layer: "sam" | "pd" | "ciws") => { x: number; y: number; z: number } | null) | undefined;

    const combatFeedback = createCombatFeedbackPresenter({
      mySessionId,
      now: () => performance.now(),
      localPlayer: () => model.playersById.get(mySessionId),
      text: t,
      toast: (message, kind, duration) => gameMessageHud.showToast(message, kind, duration),
      shake: triggerCameraShake,
      flash: options => screenFlash.trigger(options),
      audio: gameAudio,
      effects: {
        chaff: (x, z, heading, onPuff) => fxSystem.spawnSoftkillChaffCloud(x, z, heading, undefined, onPuff),
        destroyed: (x, z) => fxSystem.spawnShipDestroyedExplosion(x, z),
      },
    });

    lifetime.use(combatFeedback);
    const airDefense = createAirDefenseOutput({
      scene, camera, mount: document.body,
      getMissileWorldXZById: (id) => {
        const missile = model.missilesById.get(id);
        return missile ? { x: missile.x, z: missile.z } : null;
      },
      launchFx: {
        spawnMissileLaunchSmoke: (x, z, heading, y) => fxSystem.spawnMissileLaunchSmoke(x, z, heading, y),
        spawnMissileTrailStreamTick: (x, z, heading, count) => fxSystem.spawnMissileTrailStreamTick(x, z, heading, count),
      },
    });
    lifetime.use(airDefense);
    const eventPresenter = createMatchEventPresenter({
      mySessionId,
      airDefense,
      artilleryFx,
      missileFx,
      torpedoFx,
      shouldRenderArtyFiredClientVfx: (fromX, fromZ, toX, toZ) =>
        shouldRenderArtyFiredClientVfx(cameraCullState, fromX, fromZ, toX, toZ),
      isArtyWorldPointInCullRange: (x, z) => isArtyWorldPointInCullRange(cameraCullState, x, z),
      findPlayerBySessionId: (id) => model.playersById.get(id),
      onPrimaryFireByLocalPlayer: () => gameAudio.primaryFire(),
      onHitNearAt: (impactX, impactZ) => {
        gameAudio.hitNearAt(impactX, impactZ);
      },
      onMissileFireByLocalPlayer: () => gameAudio.missileFire(),
      onTorpedoFireByLocalPlayer: () => gameAudio.torpedoFire(),
      onMineImpactNearLocalPlayer: combatFeedback.onMineImpactNearLocalPlayer,
      onAirDefenseSound: combatFeedback.onAirDefenseSound,
      onCollisionContact: combatFeedback.onCollisionContact,
      onMissileLockOn: () => gameAudio.missileLockOn(),
      onAswmMagazineReloaded: combatFeedback.onAswmMagazineReloaded,
      onSoftkillResult: combatFeedback.onSoftkillResult,
      onWeaponHitAt: (x, z) => gameAudio.weaponHitAt(x, z),
      onFeelLocalWeaponThreat: combatFeedback.onFeelLocalWeaponThreat,
      getAirDefenseMuzzleSeek: (defenderId, slotId, layer) => resolveAirDefenseMuzzleSeek?.(defenderId, slotId, layer) ?? null,
      appendAirDefenseComms: (e) => commsLog.append(e),
      formatPlayerLabel: (id) => {
        const p = model.playersById.get(id);
        return playerDisplayLabel(p ?? { id });
      },
    });
    lifetime.use(eventPresenter);
    const visualRuntime = createVisualRuntime({
      stateSource,
      scene,
      mySessionId,
      getHullGltfTemplate,
      getMountGltfTemplate,
      loadShipAssets,
      onRemotePlayerJoinedRoom: (p) => {
        commsLog.append({
          text: t("comms.playerJoined", { name: playerDisplayLabel(p) }),
          kind: "info",
        });
      },
    });
    lifetime.use(visualRuntime);
    const hudRuntime = createHudRuntime({
      debugOverlay,
      matchEndHud,
      mySessionId,
      joinedAt,
    });
    lifetime.use(hudRuntime);
    const { visuals } = visualRuntime;
    const shipWakeRibbonSystem = lifetime.use(createShipWakeRibbonSystem(scene));
    artilleryFx.setMuzzleSeekResolver((ownerId, slotId) => getPrimaryArtilleryMuzzleSeekCoords(visuals.get(ownerId), slotId));
    missileFx.setMuzzleSeekResolver((ownerId, launcherId) => getFixedLauncherMuzzleSeekCoords(visuals.get(ownerId), launcherId));
    resolveAirDefenseMuzzleSeek = (defenderId, slotId, layer) => getAirDefenseMuzzleSeekCoords(visuals.get(defenderId), slotId, layer);
    const fireControl = createFireControlChannel({
      scene,
      camera,
      canvas: renderer.domElement,
      mySessionId,
      playerLabel: playerDisplayLabel,
      onToast: (text, kind, durationMs) => gameMessageHud.showToast(text, kind, durationMs),
    });
    lifetime.use(fireControl);
    stopAutofire = () => fireControl.setAutofire(false);
    lifetime.defer(() => {
      mobileHudActions.onToggleAutofire = undefined;
      mobileHudActions.isAutofireEnabled = undefined;
      mobileHudActions.onNextFireControlTarget = undefined;
      mobileHudActions.onNearestFireControlTarget = undefined;
      mobileHudActions.onClearFireControlTarget = undefined;
    });
    mobileHudActions.onToggleAutofire = () => fireControl.setAutofire(!fireControl.isAutofireEnabled());
    mobileHudActions.isAutofireEnabled = () => fireControl.isAutofireEnabled();
    mobileHudActions.onNearestFireControlTarget = () => fireControl.selectNearestTarget();
    mobileHudActions.onClearFireControlTarget = () => fireControl.clearTarget();
    mobileHudActions.onNextFireControlTarget = () => {
      fireControl.cycleNextTarget();
    };
    lifetime.defer(() => disposeWreckCollisionDebug(scene));

    const frame = createSessionFrame({
      sessionNumber: options.sessionNumber,
      model, connection, renderer, camera, scene, water: bundle.water,
      setOperationalAreaHalfExtent: bundle.setOperationalAreaHalfExtent,
      input, mobileAimEngagement, botController, fireControl, visualRuntime,
      hudRuntime, cockpit, gameMessageHud, cameraCullState,
      artilleryFx, missileFx, torpedoFx, fxSystem, shipWakeRibbonSystem,
      onShipDestroyed: combatFeedback.onShipDestroyed,
      debugVisible: debugOverlay.getDevPanelsVisible,
      renderBotDebug: () => debugTools.get()?.renderBot(botController.getDebugState()),
    });

    // Compile-time gate: no console API or URL activation in beta/release bundles.
    if (import.meta.env.DEV) {
      const scaConsoleApi = {
        colyseusUrl: options.serverUrl,
        get room() { return options.inspectConnection(); },
        mySessionId,
        get playerListLength(): number {
          return model.playerList.length;
        },
        get stateSyncCount(): number {
          return visualRuntime.getStateSyncCount();
        },
        get pingMs(): number | null {
          return connection.pingMs;
        },
        /** Dev-Debug (FPS-Toggle, Diagnose, Bot, Environment): `true` einblenden, `false` nur FPS/Frame/Ping. */
        showDevHud: (show = true) => {
          if (lifetime.disposed) return;
          debugOverlay.setDevPanelsVisible(show);
          const dock = document.getElementById("bottom-debug-dock");
          dock?.classList.toggle("bottom-debug-dock--hidden", !show);
          dock?.setAttribute("aria-hidden", String(!show));
          if (show) void debugTools.ensure().then((tools) => {
            if (tools && !lifetime.disposed) document.getElementById("bottom-debug-dock")?.classList.toggle(
              "bottom-debug-dock--hidden", !debugOverlay.getDevPanelsVisible(),
            );
          }).catch((error: unknown) => console.warn("[BattleFleet] Debug panels unavailable", error));
        },
        get devHudVisible(): boolean {
          return debugOverlay.getDevPanelsVisible();
        },
      };
      (window as unknown as { __SCA: typeof scaConsoleApi; __BFA?: typeof scaConsoleApi }).__SCA = scaConsoleApi;
      /** @deprecated Prefer `window.__SCA`. */
      (window as unknown as { __BFA?: typeof scaConsoleApi }).__BFA = scaConsoleApi;
      lifetime.defer(() => {
        const debugWindow = window as unknown as { __SCA?: typeof scaConsoleApi; __BFA?: typeof scaConsoleApi };
        if (debugWindow.__SCA === scaConsoleApi) delete debugWindow.__SCA;
        if (debugWindow.__BFA === scaConsoleApi) delete debugWindow.__BFA;
        debugShipSwitchRef.send = undefined;
      });
      if (new URLSearchParams(window.location.search).get("debug") === "1") scaConsoleApi.showDevHud(true);
    }

    warmupWeaponRendering(renderer, scene, camera, [artilleryFx.createWarmupMesh(), missileFx.createWarmupMesh()]);
    return { frame, present: eventPresenter.present, dispose };
  } catch (error) { dispose(); throw error; }
}
