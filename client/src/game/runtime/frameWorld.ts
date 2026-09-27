import { PlayerLifeState, wreckVariantFromSessionId, pickThreatMissilePositionForDefender, type AirDefenseMissileSnapshot, type AirDefensePlayerSnapshot } from "@battlefleet/shared/rules";
import type { FramePlayer, FrameRuntimeState, FrameEffects } from "./frameContracts";
import type * as THREE from "three";
import type { InputSample } from "../input/keyboardMouse";
import { computeWreckVisualPose } from "../scene/shipWreckAnimation";
import { applyShipVisualRuntimeTuning, setShipVisualLifeState, updateAimMountToTargetDebugLine,
  updateArtilleryTrainRotationsFromAim, type ArtilleryTrainAimOptions, type ShipVisual } from "../scene/shipVisual";
import { stepVisualRollSmoothed, visualRollRadFromRudderAndSpeed } from "../scene/shipVisualRoll";
import { DEFAULT_INTERPOLATION_DELAY_MS, createInterpolationBuffer, sampleInterpolatedPose } from "../network/remoteInterpolation";
import { updateLocalFollowCameraFromPlayer } from "./cameraCullRuntime";
import { worldToRenderX, worldToRenderYaw } from "./renderCoords";
import { getShipDebugTuningGeneration } from "./shipDebugTuning";

export type FrameWorldState = Pick<FrameRuntimeState, "aimLineSectorDebug" | "lastDamageSmokeAtBySessionId">;

/** Poses, mount aiming, wreck animation and damage smoke share visual iteration order.
 * The local hook intentionally stays inside that iteration: moving input/HUD after
 * the loop would reorder observable side effects relative to remote smoke/visuals. */
export function updateFrameWorld<TPlayer extends FramePlayer>(options: {
  now: number; dtMs: number; camera: THREE.PerspectiveCamera; mySessionId: string;
  playersById: ReadonlyMap<string, TPlayer>; me: TPlayer | undefined;
  visuals: Map<string, ShipVisual>; remoteInterp: Map<string, ReturnType<typeof createInterpolationBuffer>>;
  inputSample: InputSample; adMissileSnapsScratch: readonly AirDefenseMissileSnapshot[];
  adPlayerSnapshots: readonly AirDefensePlayerSnapshot[]; state: FrameWorldState;
  fx: Pick<FrameEffects, "shipDamageSmokeTick">; onLocalVisual: (p: TPlayer) => void;
}): void {
  const { now, dtMs, camera, mySessionId, playersById, me, visuals, remoteInterp, inputSample,
    adMissileSnapsScratch, adPlayerSnapshots, state, fx, onLocalVisual } = options;
  const tuningGen = getShipDebugTuningGeneration();
  const wallNowMs = Date.now();
  for (const [sessionId, vis] of visuals) {
    const p = playersById.get(sessionId);
    if (!p) continue;
    if (sessionId.startsWith("wreck:")) continue;
    if (vis.debugTuningGenApplied !== tuningGen) {
      applyShipVisualRuntimeTuning(vis);
      vis.debugTuningGenApplied = tuningGen;
    }

    const isDeadVis = p.lifeState === PlayerLifeState.AwaitingRespawn;
    const deathMs = typeof p.deathAtMs === "number" && p.deathAtMs > 0 ? p.deathAtMs : 0;
    const deathPose =
      isDeadVis && deathMs > 0
        ? computeWreckVisualPose(
            Math.max(0, wallNowMs - deathMs),
            wreckVariantFromSessionId(sessionId) as 0 | 1 | 2 | 3,
          )
        : null;
    const wreckSinkY = isDeadVis ? (deathPose ? deathPose.sinkY : -6.5) : 0;

    let shipLineSimX = p.x;
    let shipLineSimZ = p.z;
    let shipLineHeadingRad = p.headingRad;
    let aimLineSimX = p.x;
    let aimLineSimZ = p.z;
    let rudderForRoll = p.rudder;
    if (sessionId === mySessionId) {
      const yaw = worldToRenderYaw(p.headingRad);
      vis.group.position.set(worldToRenderX(p.x), 0, p.z);
      // Own the complete logical pose: quaternion/Euler round-trips can leave
      // equivalent 180-degree X/Z rotations when |yaw| exceeds 90 degrees.
      vis.group.rotation.set(0, yaw, 0);
      rudderForRoll = p.rudder;
      aimLineSimX = inputSample.aimWorldX;
      aimLineSimZ = inputSample.aimWorldZ;
    } else {
      let buf = remoteInterp.get(sessionId);
      if (!buf) {
        buf = createInterpolationBuffer(p, now);
        remoteInterp.set(sessionId, buf);
      }
      const r = sampleInterpolatedPose(buf, now, DEFAULT_INTERPOLATION_DELAY_MS);
      const yaw = worldToRenderYaw(r.headingRad);
      vis.group.position.set(worldToRenderX(r.x), 0, r.z);
      vis.group.rotation.set(0, yaw, 0);
      rudderForRoll = r.rudder;
      aimLineSimX = r.aimX;
      aimLineSimZ = r.aimZ;
      shipLineSimX = r.x;
      shipLineSimZ = r.z;
      shipLineHeadingRad = r.headingRad;
    }

    vis.modelMotion.position.y = wreckSinkY;
    if (deathPose) {
      vis.modelMotion.rotation.set(deathPose.pitchX, 0, deathPose.rollZ, "YXZ");
    } else {
      const rollTarget = visualRollRadFromRudderAndSpeed(rudderForRoll, p.speed);
      vis.modelMotion.rotation.set(0, 0, stepVisualRollSmoothed(sessionId, rollTarget, dtMs / 1000), "YXZ");
    }

    /** LW-Mounts zur Rakete: solange Server „incoming“ meldet. */
    const layered = typeof p.adHudIncomingAswm === "number" && p.adHudIncomingAswm > 0;
    let aimOpts: ArtilleryTrainAimOptions | undefined;
    if (!isDeadVis && vis.rotatingMountTrains.some((t) => t.isAirDefense)) {
      let missileSim: { x: number; z: number } | null = null;
      if (layered && adMissileSnapsScratch.length > 0) {
        missileSim = pickThreatMissilePositionForDefender(
          adMissileSnapsScratch,
          sessionId,
          adPlayerSnapshots,
        );
      }
      aimOpts = {
        layeredDefenseActive: layered,
        missileSim,
        shipSimX: shipLineSimX,
        shipSimZ: shipLineSimZ,
        shipHeadingRad: shipLineHeadingRad,
      };
    }
    if (!isDeadVis) {
      updateArtilleryTrainRotationsFromAim(vis, aimLineSimX, aimLineSimZ, aimOpts);
    }

    setShipVisualLifeState(vis, p.lifeState, sessionId === mySessionId);

    if (p.lifeState !== PlayerLifeState.AwaitingRespawn) {
      const aimDebug = updateAimMountToTargetDebugLine(
        vis,
        shipLineSimX,
        shipLineSimZ,
        shipLineHeadingRad,
        aimLineSimX,
        aimLineSimZ,
      );
      if (sessionId === mySessionId) {
        state.aimLineSectorDebug = aimDebug.join(" | ");
      }
    } else {
      for (const c of vis.aimLine.children) {
        (c as THREE.Line).visible = false;
      }
      if (sessionId === mySessionId) {
        state.aimLineSectorDebug = "local: awaiting_respawn";
      }
    }

    if (p.lifeState !== PlayerLifeState.AwaitingRespawn) {
      const hpPercent = p.maxHp > 0 ? p.hp / p.maxHp : 1;
      const severity =
        hpPercent < 0.3 ? "heavily_damaged" : hpPercent < 0.9 ? "damaged" : null;
      if (severity) {
        const intervalMs = severity === "heavily_damaged" ? 80 : 170;
        const last = state.lastDamageSmokeAtBySessionId.get(sessionId) ?? 0;
        if (now - last >= intervalMs) {
          fx.shipDamageSmokeTick(p.x, p.z, p.headingRad, severity);
          state.lastDamageSmokeAtBySessionId.set(sessionId, now);
        }
      }
    }

    if (sessionId === mySessionId && me) {
      updateLocalFollowCameraFromPlayer(camera, p, dtMs);

      onLocalVisual(p);
    }
  }
}
