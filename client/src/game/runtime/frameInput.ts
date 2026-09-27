import { FEATURE_MINES_ENABLED, PlayerLifeState } from "@battlefleet/shared/rules";
import type { InputSample } from "../input/keyboardMouse";
import type { FramePlayer, FrameRuntimeState } from "./frameContracts";
import { getShipDebugTuningForVisualClass } from "./shipDebugTuning";

export type FrameInputState = Pick<FrameRuntimeState, "lastInputDedupKey" | "lastInputDedupAtMs">;
export type FrameInputPayload = {
  throttle?: number; rudderInput?: number; engineOrder?: string; rudderOrder?: string;
  aimX: number; aimZ: number; primaryFire: boolean; secondaryFire: boolean;
  torpedoFire: boolean; mineSpawnLocalZ: number; radarActive: boolean;
  aswmFireSide?: "port" | "starboard";
};
const INPUT_HEARTBEAT_MS = 1200;
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
  }`;
  if (telegraph) {
    return `T|${input.engineOrder}|${input.rudderOrder}|${aim}|${input.radarActive ? 1 : 0}|${mineZ}|${f}`;
  }
  return `A|${quantInput(input.throttle)}|${quantInput(input.rudderInput)}|${aim}|${
    input.radarActive ? 1 : 0
  }|${mineZ}|${f}`;
}


/** Called at the local-visual boundary, after the camera pose and before cockpit output.
 * Held fire bypasses dedup; an unchanged command still sends the existing heartbeat. */
export function updateFrameInput(options: {
  me: FramePlayer; inputSample: InputSample; now: number; matchEnded: boolean;
  state: FrameInputState; roomSendInput: (payload: FrameInputPayload) => void;
}): void {
  const { me, inputSample, now, matchEnded, state, roomSendInput } = options;
  if (me.lifeState !== PlayerLifeState.AwaitingRespawn && !matchEnded) {
    const tuningNow = getShipDebugTuningForVisualClass(me.shipClass);
    const firing =
      inputSample.primaryFire ||
      inputSample.secondaryFire ||
      (FEATURE_MINES_ENABLED && inputSample.torpedoFire);
    const dedupKey = buildInputDedupKey(inputSample, tuningNow.mineSpawnLocalZ);
    const mustSend =
      firing ||
      dedupKey !== state.lastInputDedupKey ||
      now - state.lastInputDedupAtMs >= INPUT_HEARTBEAT_MS;
    if (mustSend) {
      const base = {
        aimX: inputSample.aimWorldX,
        aimZ: inputSample.aimWorldZ,
        primaryFire: inputSample.primaryFire,
        secondaryFire: inputSample.secondaryFire,
        torpedoFire: FEATURE_MINES_ENABLED && inputSample.torpedoFire,
        mineSpawnLocalZ: tuningNow.mineSpawnLocalZ,
        radarActive: inputSample.radarActive,
        ...(inputSample.aswmFireSide ? { aswmFireSide: inputSample.aswmFireSide } : {}),
      };
      if (inputSample.useTelegraphWire === true) {
        roomSendInput({
          ...base,
          engineOrder: inputSample.engineOrder,
          rudderOrder: inputSample.rudderOrder,
        });
      } else {
        roomSendInput({
          ...base,
          throttle: inputSample.throttle,
          rudderInput: inputSample.rudderInput,
        });
      }
      state.lastInputDedupKey = dedupKey;
      state.lastInputDedupAtMs = now;
    }
  }

}
