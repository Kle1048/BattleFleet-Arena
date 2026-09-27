import type * as THREE from "three";
import type { AirDefenseOutput } from "../presentation/MatchPresentationEvent";
import { worldToRenderX } from "../runtime/renderCoords";
import { type AirDefenseSamLaunchFx, createAirDefenseFx } from "./airDefenseFx";

/** Renderer adapter: presentation uses world coordinates; only this boundary mirrors tracked X. */
export function createAirDefenseOutput(options: {
  scene: THREE.Scene;
  camera: THREE.Camera;
  mount: HTMLElement;
  getMissileWorldXZById(id: number): { x: number; z: number } | null;
  launchFx: AirDefenseSamLaunchFx;
}): AirDefenseOutput & { dispose(): void } {
  const effects = createAirDefenseFx();
  return {
    dispose: effects.dispose,
    fire(request) {
      const id = request.trackedMissileId;
      const trackedTarget = id === undefined ? undefined : () => {
        const position = options.getMissileWorldXZById(id);
        return position ? { x: worldToRenderX(position.x), z: position.z } : null;
      };
      effects.fire(options.scene, request.layer, request.fromX, request.fromZ, request.toX, request.toZ,
        request.launchY, trackedTarget, options.launchFx);
    },
    intercept(x, z, layer) {
      effects.pulse(options.camera, options.mount, x, z, layer);
      effects.hit(options.scene, x, z, layer);
    },
  };
}
