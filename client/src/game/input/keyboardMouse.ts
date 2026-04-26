/** Pro Frame aus Tastatur + Maus; NDC wie WebGL (−1…1, Y oben positiv). SSM-Rail: Q Backbord / E Steuerbord (halten); Torpedo/Minen: T + Mittelklick. */
import {
  ARTILLERY_MAX_RANGE,
  canPrimaryArtilleryEngageAimAtWorldPoint,
  FEATURE_MINES_ENABLED,
} from "@battlefleet/shared";
import { t } from "../../locale/t";
import { createMachineryTelegraphLevers } from "./machineryTelegraphLevers";
import { mergeAswmFireSide } from "./aswmKeyboardSide";
import {
  createMobileControls,
  isMobileControlSurface,
  type MobileHudActions,
} from "./mobileControls";
import {
  TELEGRAPH_RUDDER_STEPS,
  TELEGRAPH_STOP_INDEX,
  TELEGRAPH_THROTTLE_STEPS,
  valueToStepIndex,
} from "./telegraphSteps";

export type InputSample = {
  throttle: number;
  rudderInput: number;
  aimWorldX: number;
  aimWorldZ: number;
  /** True solange LMB gehalten oder Leertaste (Servertakt entscheidet über Cooldown / Dauerfeuer). */
  primaryFire: boolean;
  /** True solange RMB (SSM zielrichtungsbasiert), Q/E (feste Rail Backbord/Steuerbord) oder Mobile-SSM-Tasten. */
  secondaryFire: boolean;
  /** Torpedo/Minen (Task 8): mittlere Maustaste gehalten oder T (wenn Feature aktiv). */
  torpedoFire: boolean;
  /** Suchrad an/aus — R toggelt (ESM-Sichtbarkeit für Gegner). */
  radarActive: boolean;
  /** Feste SSM-Rail: Q = port, E = starboard (halten); Mobile-Softkeys; bei nur RMB ausgelassen → Zielrichtung am Server. */
  aswmFireSide?: "port" | "starboard";
  /**
   * `false`: Server nutzt `throttle` / `rudderInput` (aktueller Stand).
   * Reserviert: `true` + Order-Strings, sobald der Raum das versteht.
   */
  useTelegraphWire?: boolean;
  engineOrder?: string;
  rudderOrder?: string;
};

/** Wird jeden Frame vor `sample()` gesetzt — Mobile-Zielmarke + Primärfeuer im gültigen Bogen. */
export type MobileAimEngagementRef = {
  self: null | {
    x: number;
    z: number;
    headingRad: number;
    shipClass: string;
  };
};

const MOBILE_FALLBACK_AIM_DIST = Math.min(ARTILLERY_MAX_RANGE * 0.42, 280);
const KEYBOARD_CONTROL_MODE_STORAGE_KEY = "bfa.keyboardControlMode";

type KeyboardControlMode = "hold" | "step";

function readKeyboardControlMode(): KeyboardControlMode {
  try {
    return localStorage.getItem(KEYBOARD_CONTROL_MODE_STORAGE_KEY) === "step" ? "step" : "hold";
  } catch {
    return "hold";
  }
}

function writeKeyboardControlMode(mode: KeyboardControlMode): void {
  try {
    localStorage.setItem(KEYBOARD_CONTROL_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage can be unavailable in privacy modes; the in-memory mode still works.
  }
}

function defaultBowAimWorld(self: { x: number; z: number; headingRad: number }): { x: number; z: number } {
  const d = MOBILE_FALLBACK_AIM_DIST;
  return {
    x: self.x + Math.sin(self.headingRad) * d,
    z: self.z + Math.cos(self.headingRad) * d,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Viewport-Pixel → NDC relativ zum **aktuellen** Canvas-Rect (Zielmarke fix am Bildschirm). */
function clientToNdcOnCanvasClamped(
  canvas: HTMLElement,
  clientX: number,
  clientY: number,
): { ndcX: number; ndcY: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1e-6 || rect.height < 1e-6) return null;
  const x = clamp(clientX, rect.left + 1e-6, rect.right - 1e-6);
  const y = clamp(clientY, rect.top + 1e-6, rect.bottom - 1e-6);
  const ndcX = ((x - rect.left) / rect.width) * 2 - 1;
  const ndcY = -(((y - rect.top) / rect.height) * 2 - 1);
  return { ndcX, ndcY };
}

/**
 * Tastatur global (auch außerhalb Canvas), Maus nur über dem Canvas.
 * Ohne gültigen Bodenschnittpunkt liefert Aim (0,0) — Ziellinie springt dann zur Welt-Null.
 */
export function createInputHandlers(
  canvas: HTMLElement,
  getGroundPoint: (ndcX: number, ndcY: number) => { x: number; z: number } | null,
  mobileAimEngagement?: MobileAimEngagementRef,
  mobileHudActions?: MobileHudActions,
): {
  sample: () => InputSample;
  /** Suchrad umschalten (HUD-Knopf / Touch) — wirkt wie **R**. */
  queueRadarToggle: () => void;
  dispose: () => void;
} {
  const keys = new Set<string>();
  const mobileSurface = isMobileControlSurface();
  const telegraph = createMachineryTelegraphLevers({ interactive: mobileSurface });
  const mobileControls = createMobileControls(
    mobileSurface ? { telegraphRoot: telegraph.root, hudActions: mobileHudActions } : undefined,
  );
  if (!mobileSurface) {
    document.body.appendChild(telegraph.root);
  }

  let throttleNotch = TELEGRAPH_STOP_INDEX;
  let rudderNotch = TELEGRAPH_STOP_INDEX;
  let keyboardControlMode = readKeyboardControlMode();

  let radarActive = true;
  /** HUD-/Touch-Knopf: Toggles werden im nächsten `sample()` verarbeitet (gleiche Quelle wie **R**). */
  let pendingRadarToggles = 0;

  const controlModeButton = document.createElement("button");
  controlModeButton.type = "button";
  controlModeButton.style.cssText =
    "pointer-events:auto;align-self:flex-start;padding:4px 7px;border-radius:7px;border:1px solid rgba(200,170,110,0.55);background:rgba(8,13,19,0.86);color:rgba(235,241,245,0.92);font:10px ui-monospace,Cascadia Mono,Consolas,monospace;letter-spacing:0.02em;cursor:pointer;";

  function updateControlModeButton(): void {
    controlModeButton.textContent =
      keyboardControlMode === "hold"
        ? t("telegraphLevers.controlModeHold")
        : t("telegraphLevers.controlModeStep");
    controlModeButton.title = t("telegraphLevers.controlModeToggleTitle");
    controlModeButton.setAttribute("aria-label", t("telegraphLevers.controlModeToggleAria"));
  }

  function toggleKeyboardControlMode(): void {
    keyboardControlMode = keyboardControlMode === "hold" ? "step" : "hold";
    writeKeyboardControlMode(keyboardControlMode);
    updateControlModeButton();
    if (keyboardControlMode === "step") {
      throttleNotch = valueToStepIndex(0, TELEGRAPH_THROTTLE_STEPS);
      rudderNotch = valueToStepIndex(0, TELEGRAPH_RUDDER_STEPS);
    }
  }

  updateControlModeButton();
  controlModeButton.addEventListener("click", toggleKeyboardControlMode);
  if (!mobileSurface) {
    telegraph.root.style.pointerEvents = "auto";
    telegraph.root.appendChild(controlModeButton);
  }

  const onDown = (e: KeyboardEvent): void => {
    keys.add(e.code);
    if (e.code === "Space") {
      e.preventDefault();
    }
    if (e.code === "KeyM" && !e.repeat) {
      toggleKeyboardControlMode();
    }
    if (e.code === "KeyR" && !e.repeat) {
      radarActive = !radarActive;
    }
    if (keyboardControlMode !== "step") {
      return;
    }
    const tMax = TELEGRAPH_THROTTLE_STEPS.length - 1;
    const rMax = TELEGRAPH_RUDDER_STEPS.length - 1;
    if (e.code === "KeyW") {
      throttleNotch = Math.min(tMax, throttleNotch + 1);
    }
    if (e.code === "KeyS") {
      throttleNotch = Math.max(0, throttleNotch - 1);
    }
    if (e.code === "KeyA") {
      rudderNotch = Math.max(0, rudderNotch - 1);
    }
    if (e.code === "KeyD") {
      rudderNotch = Math.min(rMax, rudderNotch + 1);
    }
  };
  const onUp = (e: KeyboardEvent): void => {
    keys.delete(e.code);
  };
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);

  let mouseNdcX = 0;
  let mouseNdcY = 0;
  /**
   * Mobile: feste Viewport-Position der Zielmarke — jedes Frame neu in den Boden geraycast,
   * damit das Ziel mit Kamera/Schiff (nordstabilisierte Darstellung) mitwandert.
   */
  let pinViewport: { clientX: number; clientY: number } | null = null;
  /** Letzter `pointerType` auf dem Canvas — für Maus-/Stift-Ziel trotz Mobile-Overlay. */
  let lastCanvasPointerType: string | null = null;

  const onMove = (e: PointerEvent): void => {
    lastCanvasPointerType = e.pointerType;
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
    if (e.target === canvas) {
      lastCanvasPointerType = e.pointerType;
    }
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
    if (mobileSurface && e.button === 0 && e.target === canvas) {
      pinViewport = { clientX: e.clientX, clientY: e.clientY };
      const ndc = clientToNdcOnCanvasClamped(canvas, e.clientX, e.clientY);
      if (ndc) {
        mouseNdcX = ndc.ndcX;
        mouseNdcY = ndc.ndcY;
      }
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
    if (!mobile.active) {
      pinViewport = null;
    }

    let throttle =
      keyboardControlMode === "hold"
        ? (keys.has("KeyW") ? 1 : 0) + (keys.has("KeyS") ? -1 : 0)
        : (TELEGRAPH_THROTTLE_STEPS[throttleNotch] ?? 0);
    let rudderInput =
      keyboardControlMode === "hold"
        ? (keys.has("KeyD") ? 1 : 0) + (keys.has("KeyA") ? -1 : 0)
        : (TELEGRAPH_RUDDER_STEPS[rudderNotch] ?? 0);

    const keyboardTelegraphKeysDown =
      keys.has("KeyW") || keys.has("KeyS") || keys.has("KeyA") || keys.has("KeyD");

    if (mobile.active) {
      if (keyboardTelegraphKeysDown) {
        telegraph.syncFromNotchIndices(
          valueToStepIndex(throttle, TELEGRAPH_THROTTLE_STEPS),
          valueToStepIndex(rudderInput, TELEGRAPH_RUDDER_STEPS),
        );
      } else {
        const levers = telegraph.sampleMobileOutputs();
        throttle = levers.throttle;
        rudderInput = levers.rudderInput;
        throttleNotch = valueToStepIndex(throttle, TELEGRAPH_THROTTLE_STEPS);
        rudderNotch = valueToStepIndex(rudderInput, TELEGRAPH_RUDDER_STEPS);
      }
    } else {
      telegraph.setFeedback(throttle, rudderInput);
    }
    while (pendingRadarToggles > 0) {
      pendingRadarToggles -= 1;
      radarActive = !radarActive;
    }

    const self = mobileAimEngagement?.self ?? null;
    const hitMove = getGroundPoint(mouseNdcX, mouseNdcY);
    let aimWorldX = hitMove?.x ?? 0;
    let aimWorldZ = hitMove?.z ?? 0;

    /** Aus fixem Bildschirm-Strahl; null wenn Pin fehlt oder Boden nicht getroffen. */
    let aimFromViewportPin: { x: number; z: number } | null = null;
    if (mobile.active && pinViewport) {
      const ndcPin = clientToNdcOnCanvasClamped(canvas, pinViewport.clientX, pinViewport.clientY);
      if (ndcPin) {
        const hitP = getGroundPoint(ndcPin.ndcX, ndcPin.ndcY);
        if (hitP) {
          aimFromViewportPin = hitP;
          aimWorldX = hitP.x;
          aimWorldZ = hitP.z;
        }
      }
      if (!aimFromViewportPin && self) {
        const bow = defaultBowAimWorld(self);
        aimWorldX = bow.x;
        aimWorldZ = bow.z;
      }
    } else if (
      mobile.active &&
      self &&
      lastCanvasPointerType !== "mouse" &&
      lastCanvasPointerType !== "pen"
    ) {
      const bow = defaultBowAimWorld(self);
      aimWorldX = bow.x;
      aimWorldZ = bow.z;
    }

    let primaryFire = lmbHeld || keys.has("Space") || mobile.primaryFire;
    if (
      mobile.active &&
      mobile.primaryFire &&
      aimFromViewportPin &&
      self &&
      !canPrimaryArtilleryEngageAimAtWorldPoint(
        self.x,
        self.z,
        self.headingRad,
        self.shipClass,
        aimFromViewportPin.x,
        aimFromViewportPin.z,
      )
    ) {
      primaryFire = false;
    }
    const ssmKeyPort = keys.has("KeyQ");
    const ssmKeyStarboard = keys.has("KeyE");
    const keyboardSsmHold = ssmKeyPort || ssmKeyStarboard;
    const secondaryFire = rmbHeld || mobile.secondaryFire || keyboardSsmHold;
    const torpedoFire =
      FEATURE_MINES_ENABLED && (mmbHeld || keys.has("KeyT") || mobile.torpedoFire);

    const aswmFireSide = mergeAswmFireSide({
      mobileActive: mobile.active,
      mobileSecondaryFire: mobile.secondaryFire,
      mobileAswmSide: mobile.aswmFireSide,
      keyQ: ssmKeyPort,
      keyE: ssmKeyStarboard,
    });
    return {
      throttle,
      rudderInput,
      aimWorldX,
      aimWorldZ,
      primaryFire,
      secondaryFire,
      torpedoFire,
      radarActive,
      aswmFireSide,
      useTelegraphWire: false,
    };
  }

  function queueRadarToggle(): void {
    pendingRadarToggles += 1;
  }

  return {
    sample,
    queueRadarToggle,
    dispose: () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      controlModeButton.removeEventListener("click", toggleKeyboardControlMode);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("pointerup", onPointerUp);
      telegraph.dispose();
      mobileControls.dispose();
    },
  };
}
