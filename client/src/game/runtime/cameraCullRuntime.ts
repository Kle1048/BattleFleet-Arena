import type * as THREE from "three";
import {
  ARTILLERY_FX_CULL_MARGIN,
  artilleryFxCullRadiusSq,
  cameraPivotXZ,
  orthoVisibleHalfExtents,
  PERSPECTIVE_ARTY_CULL_EXTENT_SCALE,
  updateFollowCamera,
} from "../scene/createGameScene";

export type CameraCullState = {
  artyFxCullShipX: number;
  artyFxCullShipZ: number;
  artyFxCullRadiusSq: number;
};

type LocalShipPose = {
  x: number;
  z: number;
  headingRad: number;
};

export function createCameraCullRuntimeState(): CameraCullState {
  return {
    artyFxCullShipX: 0,
    artyFxCullShipZ: 0,
    artyFxCullRadiusSq: Number.POSITIVE_INFINITY,
  };
}

export function refreshArtilleryCullFromLocalPlayer(
  state: CameraCullState,
  me: LocalShipPose | undefined,
  viewportWidth: number,
  viewportHeight: number,
): void {
  if (!me) {
    state.artyFxCullRadiusSq = Number.POSITIVE_INFINITY;
    return;
  }
  const { halfW, halfH } = orthoVisibleHalfExtents(viewportWidth, viewportHeight);
  const cullHalfW = halfW * PERSPECTIVE_ARTY_CULL_EXTENT_SCALE;
  const cullHalfH = halfH * PERSPECTIVE_ARTY_CULL_EXTENT_SCALE;
  const pivot = cameraPivotXZ(me.x, me.z, me.headingRad);
  state.artyFxCullShipX = me.x;
  state.artyFxCullShipZ = me.z;
  state.artyFxCullRadiusSq = artilleryFxCullRadiusSq(
    me.x,
    me.z,
    pivot.x,
    pivot.z,
    cullHalfW,
    cullHalfH,
    ARTILLERY_FX_CULL_MARGIN,
  );
}

export function updateLocalFollowCameraFromPlayer(
  camera: THREE.PerspectiveCamera,
  me: LocalShipPose,
): void {
  updateFollowCamera(camera, me.x, me.z, me.headingRad);
}

export function isArtyWorldPointInCullRange(state: CameraCullState, wx: number, wz: number): boolean {
  const dx = wx - state.artyFxCullShipX;
  const dz = wz - state.artyFxCullShipZ;
  return dx * dx + dz * dz <= state.artyFxCullRadiusSq;
}

export function shouldRenderArtyFiredClientVfx(
  state: CameraCullState,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): boolean {
  return isArtyWorldPointInCullRange(state, fromX, fromZ) || isArtyWorldPointInCullRange(state, toX, toZ);
}
