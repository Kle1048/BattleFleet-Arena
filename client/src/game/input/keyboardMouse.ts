/** Pro Frame aus Tastatur + Maus; NDC wie WebGL (−1…1, Y oben positiv). Torpedo: **Q** + **Mittelklick**. */
import { FEATURE_MINES_ENABLED } from "@battlefleet/shared";
import { createMobileControls } from "./mobileControls";

export type InputSample = {
  throttle: number;
  rudderInput: number;
  aimWorldX: number;
  aimWorldZ: number;
  /** True solange **LMB gehalten** oder **Leertaste** (Servertakt entscheidet über Cooldown / Dauerfeuer). */
  primaryFire: boolean;
  /** True solange **RMB gehalten** — ASuM (Task 7). */
  secondaryFire: boolean;
  /** Torpedo (Task 8): **Mittlere Maustaste** gehalten oder **Q**. */
  torpedoFire: boolean;
  /** Suchrad an/aus — **R** toggelt (ESM-Sichtbarkeit für Gegner). */
  radarActive: boolean;
  /**
   * Ein Frame lang true nach **E** — Hardkill-Luftverteidigung bestätigen (Server öffnet Engagement-Fenster).
   */
  airDefenseEngage: boolean;
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
  const mobileControls = createMobileControls();
  let radarActive = true;
  let pendingAirDefenseEngage = false;

  const onDown = (e: KeyboardEvent): void => {
    keys.add(e.code);
    if (e.code === "Space") {
      e.preventDefault();
    }
    if (e.code === "KeyR" && !e.repeat) {
      radarActive = !radarActive;
    }
    if (e.code === "KeyE" && !e.repeat) {
      pendingAirDefenseEngage = true;
    }
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
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("auxclick", (e) => e.preventDefault());

  let lmbHeld = false;
  let rmbHeld = false;
  let mmbHeld = false;
  const onPointerDown = (e: PointerEvent): void => {
    if (e.button === 0) {
      lmbHeld = true;
    }
    if (e.button === 1) {
      mmbHeld = true;
      e.preventDefault();
    }
    if (e.button === 2) {
      rmbHeld = true;
    }
  };
  const onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0) {
      lmbHeld = false;
    }
    if (e.button === 1) {
      mmbHeld = false;
    }
    if (e.button === 2) {
      rmbHeld = false;
    }
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("pointerup", onPointerUp);

  function sample(): InputSample {
    const mobile = mobileControls.sample();
    let throttle = 0;
    if (keys.has("KeyW")) throttle += 1;
    if (keys.has("KeyS")) throttle -= 1;
    throttle = Math.max(-1, Math.min(1, throttle));

    let rudderInput = 0;
    if (keys.has("KeyA")) rudderInput -= 1;
    if (keys.has("KeyD")) rudderInput += 1;
    rudderInput = Math.max(-1, Math.min(1, rudderInput));

    if (mobile.active) {
      if (Math.abs(mobile.throttle) > 0.01) throttle = mobile.throttle;
      if (Math.abs(mobile.rudderInput) > 0.01) rudderInput = mobile.rudderInput;
      if (mobile.radarTogglePressed) radarActive = !radarActive;
      if (mobile.airDefensePressed) pendingAirDefenseEngage = true;
    }

    const hit = getGroundPoint(mouseNdcX, mouseNdcY);
    const primaryFire = lmbHeld || keys.has("Space") || mobile.primaryFire;
    const secondaryFire = rmbHeld || mobile.secondaryFire;
    const torpedoFire =
      FEATURE_MINES_ENABLED && (mmbHeld || keys.has("KeyQ") || mobile.torpedoFire);
    const airDefenseEngage = pendingAirDefenseEngage;
    pendingAirDefenseEngage = false;
    return {
      throttle,
      rudderInput,
      aimWorldX: hit?.x ?? 0,
      aimWorldZ: hit?.z ?? 0,
      primaryFire,
      secondaryFire,
      torpedoFire,
      radarActive,
      airDefenseEngage,
    };
  }

  return {
    sample,
    dispose: () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("pointerup", onPointerUp);
      mobileControls.dispose();
    },
  };
}
