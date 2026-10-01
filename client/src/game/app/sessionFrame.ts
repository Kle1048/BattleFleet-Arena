/** The session's frame composition, not a second gameplay state. Scratch state
 * dies with the session; the existing frame phases retain their timing/order. */
import * as THREE from "three";
import { type BotVisibleMissile, type BotVisibleTorpedo, DESTROYER_LIKE_MVP, MATCH_PHASE_ENDED, PlayerLifeState } from "@battlefleet/shared";

import { createFireControlChannel } from "../input/fireControlChannel";
import { createCockpitHud } from "../hud/cockpitHud";

import { createBotController } from "@battlefleet/shared";

import { createGameMessageHud, playerDisplayLabel, shortSessionIdForMessage } from "../hud/gameMessageHud";
import { createArtilleryFx } from "../effects/artilleryFx";
import { createFxSystem } from "../effects/fxSystem";
import { createMissileFx } from "../effects/missileFx";
import { createTorpedoFx } from "../effects/torpedoFx";
import { gameAudio } from "../audio/gameAudio";

import { createCombatFeedbackPresenter } from "../presentation/combatFeedbackPresenter";

import { createVisualRuntime } from "../runtime/visualRuntime";
import { createHudRuntime } from "../runtime/hudRuntime";

import { updateGameWaterAnimations } from "../runtime/materialLibrary";

import { createUpdateCadence } from "../runtime/updateCadence";

import { createCameraCullRuntimeState } from "../runtime/cameraCullRuntime";

import { createFrameRuntimeState, runFrameRuntimeStep } from "../runtime/frameRuntime";

import { syncWreckListVisuals, updateAllWreckVisualPoses } from "../runtime/shipWreckVisuals";
import { syncWreckCollisionDebugMeshes } from "../runtime/wreckCollisionDebug";

import { createShipWakeRibbonSystem } from "../scene/shipWakeRibbon";


import type { SessionConnection } from "./GameSession";
import type { SessionInput } from "./createGameInput";

import type { BattleReadModel } from "../presentation/BattleReadModel";

export function createSessionFrame(options: {
  sessionNumber: number;
  model: BattleReadModel;
  connection: SessionConnection;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  water: THREE.Mesh;
  setOperationalAreaHalfExtent(half: number): void;
  input: SessionInput["input"];
  mobileAimEngagement: SessionInput["mobileAimEngagement"];
  botController: ReturnType<typeof createBotController>;
  fireControl: ReturnType<typeof createFireControlChannel>;
  visualRuntime: ReturnType<typeof createVisualRuntime>;
  hudRuntime: ReturnType<typeof createHudRuntime>;
  cockpit: ReturnType<typeof createCockpitHud>;
  gameMessageHud: ReturnType<typeof createGameMessageHud>;
  cameraCullState: ReturnType<typeof createCameraCullRuntimeState>;
  artilleryFx: ReturnType<typeof createArtilleryFx>;
  missileFx: ReturnType<typeof createMissileFx>;
  torpedoFx: ReturnType<typeof createTorpedoFx>;
  fxSystem: ReturnType<typeof createFxSystem>;
  shipWakeRibbonSystem: ReturnType<typeof createShipWakeRibbonSystem>;
  onShipDestroyed: ReturnType<typeof createCombatFeedbackPresenter>["onShipDestroyed"];
  debugVisible(): boolean;
  renderBotDebug(): void;
}) {
  const { model, connection, renderer, camera, scene, water, setOperationalAreaHalfExtent,
    input, mobileAimEngagement, botController, fireControl, visualRuntime, hudRuntime,
    cockpit, gameMessageHud, cameraCullState, artilleryFx, missileFx, torpedoFx, fxSystem,
    shipWakeRibbonSystem, onShipDestroyed, debugVisible, renderBotDebug } = options;
  const mySessionId = connection.mySessionId;
  const { visuals, remoteInterp, ensureShipVisual, removeShipVisual } = visualRuntime;
  const cfg = DESTROYER_LIKE_MVP;
  const debugPanelDue = createUpdateCadence(100);
  let lastSyncedOperationalHalf = -1;
  const frameRuntimeState = createFrameRuntimeState(1);
  const botMissileScratch: BotVisibleMissile[] = [];
  const botTorpedoScratch: BotVisibleTorpedo[] = [];
  let prevWreckIds = new Set<string>();
  let nextWreckIds = new Set<string>();
  const lastWreckSmokeByWreckId = new Map<string, number>();

  let fpsFrames = 0;
  let lastFpsTick = performance.now();
  function frame(now: number, frameTimeMs: number): void {
    const playerList = model.playerList;
    const meAudio = model.playersById.get(mySessionId);
    if (meAudio && meAudio.lifeState !== PlayerLifeState.AwaitingRespawn) {
      gameAudio.setListenerShipPose({
        x: meAudio.x,
        z: meAudio.z,
        headingRad: meAudio.headingRad,
      });
    } else {
      gameAudio.setListenerShipPose(null);
    }
    const operationalHalf = model.operationalAreaHalfExtent;
    if (operationalHalf !== lastSyncedOperationalHalf) {
      setOperationalAreaHalfExtent(operationalHalf);
      lastSyncedOperationalHalf = operationalHalf;
    }
    fpsFrames += 1;
    if (now - lastFpsTick >= 500) {
      const fps = fpsFrames / ((now - lastFpsTick) / 1000);
      fpsFrames = 0;
      lastFpsTick = now;
      const stateSyncCount = visualRuntime.getStateSyncCount();
      hudRuntime.updateDebugOverlay({
        now,
        roomState: model,
        roomId: connection.roomId,
        playerCount: playerList.length,
        pingMs: connection.pingMs,
        stateSyncCount,
        colyseusWarn: connection.warning,
        fps,
        frameTimeMs,
          extraDiagLine: `Session ${options.sessionNumber} | GPU geom ${renderer.info.memory.geometries}` +
            ` tex ${renderer.info.memory.textures} programs ${renderer.info.programs?.length ?? 0}` +
            (frameRuntimeState.aimLineSectorDebug ? `\nAimDbg ${frameRuntimeState.aimLineSectorDebug}` : ""),
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

    const wreckList = model.wreckList;
    const oldWreckIds = prevWreckIds;
    prevWreckIds = syncWreckListVisuals(
      wreckList,
      ensureShipVisual,
      removeShipVisual,
      prevWreckIds,
      nextWreckIds,
    );
    nextWreckIds = oldWreckIds;
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
      for (const id of lastWreckSmokeByWreckId.keys()) {
        if (!prevWreckIds.has(id)) lastWreckSmokeByWreckId.delete(id);
      }
    }

    const { matchPhase, matchRemainingSec: matchRemainingSecRaw } = model;
    const matchEnded = matchPhase === MATCH_PHASE_ENDED;

    const meForAim = meAudio;
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
    const missileList = model.missileList;
    const torpedoList = model.torpedoList;
    const botEnabled = botController.isEnabled();
    if (botEnabled && missileList) {
      botMissileScratch.length = 0;
      for (let i = 0; i < missileList.length; i++) {
        const m = missileList.at(i);
        if (m) {
          botMissileScratch.push({
            missileId: m.missileId,
            ownerId: m.ownerId,
            x: m.x,
            z: m.z,
          });
        }
      }
    } else {
      botMissileScratch.length = 0;
    }
    if (botEnabled && torpedoList) {
      botTorpedoScratch.length = 0;
      for (let i = 0; i < torpedoList.length; i++) {
        const t = torpedoList.at(i);
        if (t) {
          botTorpedoScratch.push({
            torpedoId: t.torpedoId,
            ownerId: t.ownerId,
            x: t.x,
            z: t.z,
          });
        }
      }
    } else {
      botTorpedoScratch.length = 0;
    }
    const botInput = botController.update(
      now,
      playerList,
      mySessionId,
      botMissileScratch,
      botTorpedoScratch,
      operationalHalf,
      model.islandsEnabled,
    );
    const samp = botInput ?? humanInput;

    hudRuntime.updateMatchEndHud({ matchEnded, players: playerList });

    runFrameRuntimeStep({
      now,
      dtMs: frameTimeMs,
      camera,
      roomSendInput: connection.sendInput,
      mySessionId,
      cfgMaxSpeed: cfg.maxSpeed,
      playerList,
      visuals,
      remoteInterp,
      inputSample: samp,
      matchEnded,
      matchRemainingSecRaw,
      cockpit,
      fireControlTargetId: fireControl.getTargetId(),
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
      onShipDestroyed,
    });

    const meLod = meAudio;
    shipWakeRibbonSystem.updateFromPlayers({
      players: playerList,
      visuals,
      lodAnchorWorld: meLod ? { x: meLod.x, z: meLod.z } : undefined,
      nowSeconds: now * 0.001,
    });

    if (debugVisible() && debugPanelDue(now)) {
      renderBotDebug();
    }

    fxSystem.update(frameTimeMs);

    updateGameWaterAnimations(water, now);
    renderer.render(scene, camera);
  }
  return frame;
}
