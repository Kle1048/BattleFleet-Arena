import type * as THREE from "three";
import { PlayerLifeState } from "@battlefleet/shared/rules";
import type { InputSample } from "../input/keyboardMouse";
import type { ShipVisual } from "../scene/shipVisual";
import type { createInterpolationBuffer } from "../network/remoteInterpolation";
import type { FramePlayer, FrameMissile, FrameOwnedTorpedo, CockpitOutput,
  MessageOutput, AudioOutput, FrameEffects, FrameRuntimeState } from "./frameContracts";
import { createUpdateCadence } from "./updateCadence";
import { pruneVisualRollSmoothed } from "../scene/shipVisualRoll";
import { refreshArtilleryCullFromLocalPlayer, type CameraCullState } from "./cameraCullRuntime";
import { applyCameraShakeStep } from "./cameraShakeRuntime";
import { updateFrameLifeFeedback, updateLocalFrameFeedback } from "./frameFeedback";
import { updateFrameAudio, updateFrameEffects } from "./frameAudioFx";
import { updateFrameWorld } from "./frameWorld";
import { updateFrameInput, type FrameInputPayload } from "./frameInput";
import { updateFrameCockpit } from "./frameCockpit";

export function createFrameRuntimeState(initialHudLevel = 1): FrameRuntimeState {
  return {
    playersById: new Map(), adMissiles: [], adPlayers: [],
    hudDue: createUpdateCadence(50),
    lastHudLifeState: "", lastHudClass: "", lastHudRadar: true, lastHudMatchEnded: false,
    lastHudLevel: initialHudLevel,
    lastOobCountdown: 0,
    lastLifeStateBySessionId: new Map<string, string>(),
    lastDamageSmokeAtBySessionId: new Map<string, number>(),
    lastSeaControlZone: null,
    lastAdHudIncomingAswm: 0,
    aimLineSectorDebug: "",
    lastInputDedupKey: null,
    lastInputDedupAtMs: 0,
    pendingInput: null,
    lastTelegraphThrottleIndex: -1,
    lastTelegraphRudderIndex: -1,
    musicSmoothedTierF: 0,
  };
}

/**
 * Frame composition only. Preserve the legacy interleaving explicitly:
 * life edges → local warnings → continuous audio → each visual (local camera,
 * input, cockpit) → culling → projectile FX/messages → final camera shake.
 * Scratch collections borrow read-model values for this synchronous call.
 */
export function runFrameRuntimeStep<
  TPlayer extends FramePlayer,
  TMissile extends FrameMissile,
  TTorpedo extends FrameOwnedTorpedo,
>(options: {
  now: number;
  dtMs: number;
  camera: THREE.PerspectiveCamera;
  roomSendInput: (payload: FrameInputPayload) => void;
  mySessionId: string;
  cfgMaxSpeed: number;
  playerList: readonly TPlayer[];
  visuals: Map<string, ShipVisual>;
  remoteInterp: Map<string, ReturnType<typeof createInterpolationBuffer>>;
  inputSample: InputSample;
  matchEnded: boolean;
  matchRemainingSecRaw: number;
  cockpit: CockpitOutput;
  fireControlTargetId?: string | null;
  autofireEnabled?: boolean;
  gameMessageHud: MessageOutput;
  gameAudio: AudioOutput;
  shortSessionIdForMessage: (sessionId: string) => string;
  playerDisplayLabel: (p: { id: string; displayName?: string }) => string;
  fx: FrameEffects;
  missileList: readonly TMissile[] | null;
  torpedoList: readonly TTorpedo[] | null;
  state: FrameRuntimeState;
  cameraCullState: CameraCullState;
  /** Schiff wechselt zu „zerstört“ (AwaitingRespawn); z. B. großes FX. */
  onShipDestroyed?: (player: TPlayer) => void;
}): { me: TPlayer | undefined } {
  const {
    now,
    dtMs,
    camera,
    roomSendInput,
    mySessionId,
    cfgMaxSpeed,
    playerList,
    visuals,
    remoteInterp,
    inputSample,
    matchEnded,
    matchRemainingSecRaw,
    cockpit,
    gameMessageHud,
    gameAudio,
    shortSessionIdForMessage: toShortSession,
    playerDisplayLabel: toDisplayLabel,
    fx,
    missileList,
    torpedoList,
    state,
    cameraCullState,
    onShipDestroyed,
  } = options;

  const playersById = state.playersById as Map<string, TPlayer>;
  playersById.clear();
  for (const pl of playerList) {
    playersById.set(pl.id, pl);
  }

  updateFrameLifeFeedback({ playerList, playersById, mySessionId, state, gameMessageHud,
    toDisplayLabel, onShipDestroyed });

  const adPlayerSnapshotsScratch = state.adPlayers;
  const adMissileSnapsScratch = state.adMissiles;
  adPlayerSnapshotsScratch.length = 0;
  for (const pl of playerList) {
    // Read-only targeting helpers can consume the borrowed read-model view during this synchronous frame.
    adPlayerSnapshotsScratch.push(pl);
  }
  adMissileSnapsScratch.length = 0;
  if (missileList) {
    for (let mi = 0; mi < missileList.length; mi++) {
      const m = missileList.at(mi);
      if (!m) continue;
      adMissileSnapsScratch.push(m);
    }
  }
  const adPlayerSnapshots = adPlayerSnapshotsScratch;

  const me = playersById.get(mySessionId);
  if (!me || matchEnded || me.lifeState === PlayerLifeState.AwaitingRespawn || !visuals.has(mySessionId)) {
    state.pendingInput = null;
  }
  updateLocalFrameFeedback({ me, matchEnded, state, gameAudio, gameMessageHud });
  updateFrameAudio({ me, mySessionId, playerList, inputSample, matchEnded, cfgMaxSpeed, dtMs, gameAudio, state });
  updateFrameWorld({ now, dtMs, camera, mySessionId, playersById, me, visuals, remoteInterp,
    inputSample, adMissileSnapsScratch, adPlayerSnapshots, state, fx,
    onLocalVisual: p => {
      // World only invokes this hook when the local participant/visual exists.
      // Its position inside the visual loop is observable and intentionally retained.
      if (!me) return;
      updateFrameInput({ me, inputSample, now, matchEnded, state, roomSendInput });
      updateFrameCockpit({ me, p, now, mySessionId, cfgMaxSpeed, matchEnded, matchRemainingSecRaw,
        playerList, torpedoList, adMissileSnapsScratch, adPlayerSnapshots, state, cockpit,
        gameMessageHud, gameAudio, toShortSession, fireControlTargetId: options.fireControlTargetId, autofireEnabled: options.autofireEnabled });
    },
  });
  pruneVisualRollSmoothed(visuals);
  refreshArtilleryCullFromLocalPlayer(cameraCullState, me, window.innerWidth, window.innerHeight);
  updateFrameEffects({ now, dtMs, fx, missileList, torpedoList, me, gameMessageHud });
  applyCameraShakeStep(camera, dtMs);
  return { me };
}
