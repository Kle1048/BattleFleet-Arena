import { FEATURE_MINES_ENABLED, PlayerLifeState } from "@battlefleet/shared/rules";
import type { InputSample } from "../input/keyboardMouse";
import type { FramePlayer, FrameRuntimeState } from "./frameContracts";
import { getShipDebugTuningForVisualClass } from "./shipDebugTuning";

export type FrameInputState = Pick<FrameRuntimeState, "lastInputDedupKey" | "lastInputDedupAtMs" | "pendingInput">;
export type FrameInputPayload = {
  throttle?: number; rudderInput?: number; engineOrder?: string; rudderOrder?: string;
  aimX: number; aimZ: number; primaryFire: boolean; secondaryFire: boolean;
  torpedoFire: boolean; mineSpawnLocalZ: number; radarActive: boolean;
  aswmFireSide?: "port" | "starboard";
};
const INPUT_HEARTBEAT_MS = 1200;
export const INPUT_SEND_INTERVAL_MS = 50;
const INPUT_AIM_QUANT = 4;

function quantInput(n: number): number {
  return Math.round(n * INPUT_AIM_QUANT) / INPUT_AIM_QUANT;
}

function buildInputDedupKey(input: InputSample, mineSpawnLocalZ: number): string {
  /** Nur explizit `true` = Maschinentelegraf; `false`/`undefined` (z. B. Bot) = analog throttle/rudder. */
  const telegraph = input.useTelegraphWire === true;
  const aim = `${quantInput(input.aimWorldX)},${quantInput(input.aimWorldZ)}`;
  const mineZ = quantInput(mineSpawnLocalZ);
  const f = `${input.primaryFire ? 1 : 0}${input.secondaryFire ? 1 : 0}${
    FEATURE_MINES_ENABLED && input.torpedoFire ? 1 : 0
  }|${input.aswmFireSide ?? "auto"}`;
  if (telegraph) {
    return `T|${input.engineOrder}|${input.rudderOrder}|${aim}|${input.radarActive ? 1 : 0}|${mineZ}|${f}`;
  }
  return `A|${quantInput(input.throttle)}|${quantInput(input.rudderInput)}|${aim}|${
    input.radarActive ? 1 : 0
  }|${mineZ}|${f}`;
}


/** Called at the local-visual boundary, after the camera pose and before cockpit output.
 * At most 20 Hz, including held fire. Coalesce current controls and latch short
 * fire taps until the next send. No catch-up burst after a suspended tab. */
export function updateFrameInput(options: {
  me: FramePlayer; inputSample: InputSample; now: number; matchEnded: boolean;
  state: FrameInputState; roomSendInput: (payload: FrameInputPayload) => void;
}): void {
  const { me, now, matchEnded, state, roomSendInput } = options;
  if (me.lifeState === PlayerLifeState.AwaitingRespawn || matchEnded) {
    state.pendingInput = null;
    return;
  }
  const previous = now - state.lastInputDedupAtMs > INPUT_HEARTBEAT_MS ? null : state.pendingInput;
  const fire = {
    primaryFire: options.inputSample.primaryFire || previous?.primaryFire === true,
    secondaryFire: options.inputSample.secondaryFire || previous?.secondaryFire === true,
    torpedoFire: FEATURE_MINES_ENABLED && (options.inputSample.torpedoFire || previous?.torpedoFire === true),
    aswmFireSide: options.inputSample.secondaryFire ? options.inputSample.aswmFireSide : previous?.aswmFireSide,
  };
  const inputSample = state.pendingInput = Object.assign(previous ?? {}, options.inputSample, fire);
  if (state.lastInputDedupKey !== null && now >= state.lastInputDedupAtMs &&
      now - state.lastInputDedupAtMs + 0.001 < INPUT_SEND_INTERVAL_MS) return;
  const tuningNow = getShipDebugTuningForVisualClass(me.shipClass);
  const firing = inputSample.primaryFire || inputSample.secondaryFire || inputSample.torpedoFire;
  const dedupKey = buildInputDedupKey(inputSample, tuningNow.mineSpawnLocalZ);
  const mustSend = firing || dedupKey !== state.lastInputDedupKey ||
    now - state.lastInputDedupAtMs >= INPUT_HEARTBEAT_MS;
  if (mustSend) {
    const base = {
      aimX: inputSample.aimWorldX,
      aimZ: inputSample.aimWorldZ,
      primaryFire: inputSample.primaryFire,
      secondaryFire: inputSample.secondaryFire,
      torpedoFire: inputSample.torpedoFire,
      mineSpawnLocalZ: tuningNow.mineSpawnLocalZ,
      radarActive: inputSample.radarActive,
      ...(inputSample.aswmFireSide ? { aswmFireSide: inputSample.aswmFireSide } : {}),
    };
    if (inputSample.useTelegraphWire === true) {
      roomSendInput({ ...base, engineOrder: inputSample.engineOrder, rudderOrder: inputSample.rudderOrder });
    } else {
      roomSendInput({ ...base, throttle: inputSample.throttle, rudderInput: inputSample.rudderInput });
    }
    state.lastInputDedupKey = dedupKey;
    state.lastInputDedupAtMs = now;
  }
  state.pendingInput = null;
}
