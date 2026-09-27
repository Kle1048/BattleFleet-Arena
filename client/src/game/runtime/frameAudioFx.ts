import { PlayerLifeState, PROGRESSION_MAX_LEVEL, normalizeShipClassId, getShipClassProfile, progressionMovementScale, type ShipClassId } from "@battlefleet/shared/rules";
import type { FramePlayer, FrameRuntimeState, AudioOutput, FrameEffects, FrameMissile, FrameTorpedo, MessageOutput } from "./frameContracts";
import type { InputSample } from "../input/keyboardMouse";
import { TELEGRAPH_THROTTLE_STEPS, TELEGRAPH_RUDDER_STEPS, valueToStepIndex } from "../input/telegraphSteps";

export type FrameAudioState = Pick<FrameRuntimeState,
  "lastTelegraphThrottleIndex" | "lastTelegraphRudderIndex" | "musicSmoothedTierF">;
/**
 * 0: kein/ferner Gegner, 1: Fahrwasser-Kontakt, 2: dichtes Gefecht (Entfernung/Stack).
 * Heuristik, später mit Raketen-Alarmen / Treffer erweiterbar.
 */
function musicTargetTierFromField(
  me: FramePlayer,
  myId: string,
  list: Iterable<FramePlayer>,
): 0 | 1 | 2 {
  let minD = Infinity;
  let in520 = 0;
  for (const pl of list) {
    if (pl.id === myId) continue;
    if (pl.lifeState === PlayerLifeState.AwaitingRespawn) continue;
    const d = Math.hypot(pl.x - me.x, pl.z - me.z);
    if (d < minD) minD = d;
    if (d < 520) in520++;
  }
  if (!Number.isFinite(minD) || minD > 2000) return 0;
  if (minD < 400 || in520 >= 2) return 2;
  return 1;
}


/** Continuous audio precedes world presentation in the established frame order. */
export function updateFrameAudio(options: {
  me: FramePlayer | undefined; mySessionId: string; playerList: readonly FramePlayer[];
  inputSample: InputSample; matchEnded: boolean; cfgMaxSpeed: number; dtMs: number;
  gameAudio: AudioOutput; state: FrameAudioState;
}): void {
  const { me, mySessionId, playerList, inputSample, matchEnded, cfgMaxSpeed, dtMs, gameAudio, state } = options;
  if (matchEnded || !me || me.lifeState === PlayerLifeState.AwaitingRespawn) {
    gameAudio.updateEngineBedOff();
    state.lastTelegraphThrottleIndex = -1;
    state.lastTelegraphRudderIndex = -1;
    state.musicSmoothedTierF = 0;
    gameAudio.updateDynamicMusic({ active: false, dtMs, smoothedTier0to2: 0 });
  } else {
    const progLevel = Math.min(
      PROGRESSION_MAX_LEVEL,
      Math.max(1, Math.floor(typeof me.level === "number" ? me.level : 1)),
    );
    const classId = normalizeShipClassId(me.shipClass) as ShipClassId;
    const profShip = getShipClassProfile(classId);
    const maxSpForEngine =
      cfgMaxSpeed * profShip.movementSpeedMul * progressionMovementScale(progLevel).maxSpeedFactor;
    const tIdx = valueToStepIndex(inputSample.throttle, TELEGRAPH_THROTTLE_STEPS);
    const rIdx = valueToStepIndex(inputSample.rudderInput, TELEGRAPH_RUDDER_STEPS);
    if (state.lastTelegraphThrottleIndex >= 0) {
      if (tIdx !== state.lastTelegraphThrottleIndex) gameAudio.telegraphNotchClick();
      if (rIdx !== state.lastTelegraphRudderIndex) gameAudio.telegraphNotchClick();
    }
    state.lastTelegraphThrottleIndex = tIdx;
    state.lastTelegraphRudderIndex = rIdx;
    gameAudio.updateEngineBed({
      dtMs,
      active: true,
      throttle: inputSample.throttle,
      speed: Math.abs(me.speed),
      maxSpeed: maxSpForEngine,
    });
    const mTarget = musicTargetTierFromField(me, mySessionId, playerList);
    const f = state.musicSmoothedTierF;
    const smoothHz = mTarget > f - 0.02 ? 0.6 : 0.22;
    const aM = 1 - Math.exp(-(dtMs / 1000) * smoothHz);
    state.musicSmoothedTierF = f + (mTarget - f) * aM;
    gameAudio.updateDynamicMusic({
      dtMs,
      active: true,
      smoothedTier0to2: state.musicSmoothedTierF,
    });
  }

}

/** Preserve sync-before-update and missile → mine/torpedo → artillery ordering. */
export function updateFrameEffects(options: {
  now: number; dtMs: number; fx: Pick<FrameEffects, "missileFx" | "torpedoFx" | "artilleryFx">;
  missileList: readonly FrameMissile[] | null; torpedoList: readonly FrameTorpedo[] | null;
  me: FramePlayer | undefined; gameMessageHud: Pick<MessageOutput, "updateFrame">;
}): void {
  const { now, dtMs, fx, missileList, torpedoList, me, gameMessageHud } = options;
  fx.missileFx.sync(missileList);
  fx.torpedoFx.sync(torpedoList);

  fx.missileFx.update(now, dtMs);
  fx.torpedoFx.update(now, dtMs);
  fx.artilleryFx.update(now, dtMs);
  gameMessageHud.updateFrame(now, me?.oobCountdownSec ?? 0, me?.spawnProtectionSec ?? 0);

}
