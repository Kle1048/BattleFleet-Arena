import { PlayerLifeState, type ShipClassId, type ShipWreckState } from "@battlefleet/shared";
import { applyShipVisualRuntimeTuning, setShipVisualLifeState, type ShipVisual } from "../scene/shipVisual";
import { computeWreckVisualPose } from "../scene/shipWreckAnimation";
import { worldToRenderX, worldToRenderYaw } from "./renderCoords";
import { getShipDebugTuningForVisualClass, getShipDebugTuningGeneration } from "./shipDebugTuning";

const WRECK_VIS_PREFIX = "wreck:";

export function wreckVisualSessionKey(wreckId: string): string {
  return `${WRECK_VIS_PREFIX}${wreckId}`;
}

type WreckListLike = {
  length: number;
  at: (index: number) => ShipWreckState | undefined;
};

/**
 * Synchronisiert GLB-Wracks mit `state.wreckList`; entfernt alte Wrack-Meshes.
 * Rückgabe = neues Id-Set für den nächsten Aufruf (`prevWreckIds` ersetzen).
 */
export function syncWreckListVisuals(
  wreckList: WreckListLike | null | undefined,
  ensureShip: (sessionKey: string, shipClassId?: ShipClassId) => void,
  removeShip: (sessionKey: string) => boolean,
  prevWreckIds: Set<string>,
): Set<string> {
  const next = new Set<string>();
  if (wreckList) {
    for (let i = 0; i < wreckList.length; i++) {
      const w = wreckList.at(i);
      if (!w) continue;
      next.add(w.wreckId);
      ensureShip(wreckVisualSessionKey(w.wreckId), w.shipClass as ShipClassId);
    }
  }
  for (const id of prevWreckIds) {
    if (!next.has(id)) removeShip(wreckVisualSessionKey(id));
  }
  return next;
}

export function applyPoseToWreckVisual(
  vis: ShipVisual,
  w: ShipWreckState,
  wallNowMs: number,
  tuningGen: number,
): void {
  if (vis.debugTuningGenApplied !== tuningGen) {
    applyShipVisualRuntimeTuning(vis);
    vis.debugTuningGenApplied = tuningGen;
  }
  const tune = getShipDebugTuningForVisualClass(w.shipClass);
  const elapsed = Math.max(0, wallNowMs - w.deathAtMs);
  const pose = computeWreckVisualPose(elapsed, w.variant as 0 | 1 | 2 | 3);
  const yaw = worldToRenderYaw(w.headingRad);
  const pivotDx = Math.sin(yaw) * tune.shipPivotLocalZ;
  const pivotDz = Math.cos(yaw) * tune.shipPivotLocalZ;
  vis.group.position.set(
    worldToRenderX(w.anchorX) - pivotDx,
    pose.sinkY,
    w.anchorZ - pivotDz,
  );
  vis.group.rotation.order = "YXZ";
  vis.group.rotation.y = yaw;
  vis.group.rotation.x = pose.pitchX;
  vis.group.rotation.z = pose.rollZ;
  setShipVisualLifeState(vis, PlayerLifeState.AwaitingRespawn, false);
}

/** Aktualisiert alle Wrack-Visuals aus der replizierten Liste. */
export function updateAllWreckVisualPoses(
  wreckList: WreckListLike | null | undefined,
  visuals: Map<string, ShipVisual>,
  wallNowMs: number,
): void {
  if (!wreckList) return;
  const tuningGen = getShipDebugTuningGeneration();
  for (let i = 0; i < wreckList.length; i++) {
    const w = wreckList.at(i);
    if (!w) continue;
    const vis = visuals.get(wreckVisualSessionKey(w.wreckId));
    if (!vis) continue;
    applyPoseToWreckVisual(vis, w, wallNowMs, tuningGen);
  }
}
