/** Pro Frame aus Tastatur + Maus; NDC wie WebGL (−1…1, Y oben positiv). */
export type InputSample = {
  throttle: number;
  rudderInput: number;
  aimWorldX: number;
  aimWorldZ: number;
};

/**
 * Tastatur global (auch außerhalb Canvas), Maus nur über dem Canvas.
 * Ohne gültigen Bodenschnittpunkt liefert Aim (0,0) — Ziellinie springt dann zur Welt-Null.
 */
export function createInputHandlers(
  canvas: HTMLElement,
  getGroundPoint: (ndcX: number, ndcY: number) => { x: number; z: number } | null,
): {
  sample: () => InputSample;
  dispose: () => void;
} {
  const keys = new Set<string>();

  const onDown = (e: KeyboardEvent): void => {
    keys.add(e.code);
  };
  const onUp = (e: KeyboardEvent): void => {
    keys.delete(e.code);
  };
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);

  let mouseNdcX = 0;
  let mouseNdcY = 0;

  const onMove = (e: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    mouseNdcX = x;
    mouseNdcY = y;
  };
  canvas.addEventListener("pointermove", onMove);

  function sample(): InputSample {
    let throttle = 0;
    if (keys.has("KeyW")) throttle += 1;
    if (keys.has("KeyS")) throttle -= 1;
    throttle = Math.max(-1, Math.min(1, throttle));

    let rudderInput = 0;
    if (keys.has("KeyA")) rudderInput -= 1;
    if (keys.has("KeyD")) rudderInput += 1;
    rudderInput = Math.max(-1, Math.min(1, rudderInput));

    const hit = getGroundPoint(mouseNdcX, mouseNdcY);
    return {
      throttle,
      rudderInput,
      aimWorldX: hit?.x ?? 0,
      aimWorldZ: hit?.z ?? 0,
    };
  }

  return {
    sample,
    dispose: () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      canvas.removeEventListener("pointermove", onMove);
    },
  };
}
