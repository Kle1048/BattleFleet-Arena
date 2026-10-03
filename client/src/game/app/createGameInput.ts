import { Plane, Raycaster, Vector2, Vector3, type PerspectiveCamera } from "three";
import { createInputHandlers, type MobileAimEngagementRef } from "../input/keyboardMouse";
import type { MobileHudActions } from "../input/mobileControls";
import { createMobileMapAimReticle } from "../input/mobileMapAimReticle";
import { renderToWorldX } from "../runtime/renderCoords";
import { createLifetime } from "../runtime/lifetime";
import { createCameraOrbitInput } from "../input/cameraOrbitInput";

/** App-owned input binding. A new session starts with neutral keys/levers/aim;
 * lobby text entry never reaches the gameplay keyboard handlers. */
export function createGameInput(canvas: HTMLCanvasElement, camera: PerspectiveCamera) {
  let active: ReturnType<typeof createLifetime> | undefined;
  let disposed = false;
  const ground = new Plane(new Vector3(0, 1, 0), 0);
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const hit = new Vector3();
  const getGroundPoint = (x: number, y: number) => {
    raycaster.setFromCamera(ndc.set(x, y), camera);
    if (!raycaster.ray.intersectPlane(ground, hit)) return null;
    return { x: renderToWorldX(hit.x), z: hit.z };
  };
  function stopSession() { active?.dispose(); active = undefined; }
  return {
    startSession() {
      if (disposed) throw new Error("Game input is disposed");
      stopSession();
      const lifetime = active = createLifetime();
      try {
        lifetime.use(createCameraOrbitInput(canvas));
        lifetime.use(createMobileMapAimReticle(canvas));
        const mobileAimEngagement: MobileAimEngagementRef = { self: null };
        const mobileHudActions: MobileHudActions = {};
        const input = lifetime.use(createInputHandlers(canvas, getGroundPoint, mobileAimEngagement, mobileHudActions));
        lifetime.defer(() => {
          mobileAimEngagement.self = null;
          mobileHudActions.onNextFireControlTarget = undefined;
          mobileHudActions.onNearestFireControlTarget = undefined;
          mobileHudActions.onClearFireControlTarget = undefined;
          mobileHudActions.onToggleAutofire = undefined;
          mobileHudActions.isAutofireEnabled = undefined;
        });
        return { input, mobileAimEngagement, mobileHudActions };
      } catch (error) { stopSession(); throw error; }
    },
    stopSession,
    dispose() { disposed = true; stopSession(); },
  };
}

export type SessionInput = ReturnType<ReturnType<typeof createGameInput>["startSession"]>;
