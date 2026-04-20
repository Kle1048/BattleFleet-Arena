/** Pro Frame aus Tastatur + Maus; NDC wie WebGL (−1…1, Y oben positiv). Torpedo: **Q** + **Mittelklick**. */
import {
  ARTILLERY_MAX_RANGE,
  canPrimaryArtilleryEngageAimAtWorldPoint,
  FEATURE_MINES_ENABLED,
} from "@battlefleet/shared";
import { createMachineryTelegraphLevers } from "./machineryTelegraphLevers";
import { createMobileControls, isMobileControlSurface } from "./mobileControls";
import {
  TELEGRAPH_RUDDER_STEPS,
  TELEGRAPH_STOP_INDEX,
  TELEGRAPH_THROTTLE_STEPS,
} from "./telegraphSteps";

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
  /** Nur Mobile: ASuM von fester Backbord-/Steuerbord-Seite (Softkeys). */
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
    mobileSurface ? { telegraphRoot: telegraph.root } : undefined,
  );
  if (!mobileSurface) {
    document.body.appendChild(telegraph.root);
  }

  let throttleNotch = TELEGRAPH_STOP_INDEX;
  let rudderNotch = TELEGRAPH_STOP_INDEX;

  let radarActive = true;
  /** HUD-/Touch-Knopf: Toggles werden im nächsten `sample()` verarbeitet (gleiche Quelle wie **R**). */
  let pendingRadarToggles = 0;

  const onDown = (e: KeyboardEvent): void => {
    keys.add(e.code);
    if (e.code === "Space") {
      e.preventDefault();
    }
    if (e.code === "KeyR" && !e.repeat) {
      radarActive = !radarActive;
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

    let throttle = TELEGRAPH_THROTTLE_STEPS[throttleNotch] ?? 0;
    let rudderInput = TELEGRAPH_RUDDER_STEPS[rudderNotch] ?? 0;

    if (mobile.active) {
      const levers = telegraph.sampleMobileOutputs();
      throttle = levers.throttle;
      rudderInput = levers.rudderInput;
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
    } else if (mobile.active && self) {
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
    const secondaryFire = rmbHeld || mobile.secondaryFire;
    const torpedoFire =
      FEATURE_MINES_ENABLED && (mmbHeld || keys.has("KeyQ") || mobile.torpedoFire);
    const aswmFireSide =
      mobile.active && mobile.secondaryFire && mobile.aswmFireSide
        ? mobile.aswmFireSide
        : undefined;
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
