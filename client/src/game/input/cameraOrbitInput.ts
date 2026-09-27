import { getFollowCameraTuning, savePersistedFollowCameraTuning } from "../runtime/followCameraTuning";
import { rotateThirdPersonCamera, zoomThirdPersonCamera } from "../runtime/thirdPersonCamera";

/** Alt-drag reserves the gesture for the camera; ordinary clicks still fire. */
export function createCameraOrbitInput(canvas: HTMLElement) {
  let pointer: number | null = null;
  let x = 0, y = 0;
  const enabled = () => getFollowCameraTuning().mode === "thirdPerson";
  function end() {
    if (pointer === null) return;
    const id = pointer;
    pointer = null;
    if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
    savePersistedFollowCameraTuning({ ...getFollowCameraTuning() });
  }
  const down = (e: PointerEvent) => {
    if (!enabled() || !e.altKey || e.button !== 0 || pointer !== null) return;
    pointer = e.pointerId; x = e.clientX; y = e.clientY;
    canvas.setPointerCapture?.(pointer);
    e.preventDefault();
  };
  const move = (e: PointerEvent) => {
    if (pointer !== e.pointerId) return;
    if (!enabled()) { end(); return; }
    rotateThirdPersonCamera(e.clientX - x, e.clientY - y);
    x = e.clientX; y = e.clientY;
    e.preventDefault();
  };
  const up = (e: PointerEvent) => { if (e.pointerId === pointer) end(); };
  const wheel = (e: WheelEvent) => {
    if (!enabled()) return;
    e.preventDefault();
    zoomThirdPersonCamera(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1));
    savePersistedFollowCameraTuning({ ...getFollowCameraTuning() });
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("lostpointercapture", end);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", wheel, { passive: false });
  window.addEventListener("pointerup", up);
  window.addEventListener("blur", end);
  return {
    dispose() {
      end();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("lostpointercapture", end);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("blur", end);
    },
  };
}
