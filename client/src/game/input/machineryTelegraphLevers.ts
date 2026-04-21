import { t } from "../../locale/t";
import {
  TELEGRAPH_RUDDER_STEPS,
  TELEGRAPH_STOP_INDEX,
  TELEGRAPH_THROTTLE_STEPS,
  snapToNearestStep,
} from "./telegraphSteps";

const STYLE_ID = "bfa-machinery-telegraph-styles";

/** Y von oben nach unten: oben = +1 (voraus), unten = -1 (zurück). */
export function clientYToThrottle(clientY: number, top: number, height: number): number {
  if (height <= 1e-6) return 0;
  const u = (clientY - top) / height;
  return Math.max(-1, Math.min(1, 1 - 2 * u));
}

/** X von links nach rechts: links = -1 (Bb), rechts = +1 (Stb). */
export function clientXToRudder(clientX: number, left: number, width: number): number {
  if (width <= 1e-6) return 0;
  const u = (clientX - left) / width;
  return Math.max(-1, Math.min(1, 2 * u - 1));
}

let styleInjected = false;

function ensureStyles(): void {
  if (styleInjected || typeof document === "undefined") return;
  styleInjected = true;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
.bfa-tele {
  --bfa-tele-brass: linear-gradient(145deg, #6a5538 0%, #3d2f1c 45%, #2a2014 100%);
  --bfa-tele-face: linear-gradient(180deg, #1a2430 0%, #0d141c 100%);
  --bfa-tele-rim: rgba(200, 170, 110, 0.55);
  --bfa-tele-glow: rgba(255, 210, 120, 0.12);
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  box-sizing: border-box;
}
.bfa-tele *, .bfa-tele *::before, .bfa-tele *::after { box-sizing: border-box; }
.bfa-tele-l-root {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex-wrap: nowrap;
  gap: 8px;
}
.bfa-tele-panel {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 8px 10px 10px;
  border-radius: 10px;
  background: var(--bfa-tele-brass);
  border: 2px solid var(--bfa-tele-rim);
  box-shadow:
    0 0 0 1px rgba(0,0,0,0.45) inset,
    0 4px 18px rgba(0,0,0,0.55),
    0 0 24px var(--bfa-tele-glow);
}
.bfa-tele-panel--engine {
  align-self: flex-start;
}
.bfa-tele-panel--rudder {
  min-width: 0;
  align-self: flex-start;
}
.bfa-tele-throttle-col {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 6px;
}
.bfa-tele-ticks-v {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 2px 0;
  font-size: 6px;
  letter-spacing: 0.04em;
  color: rgba(200, 210, 190, 0.55);
  line-height: 1.05;
  width: 2.35rem;
  min-height: 118px;
  text-align: right;
}
.bfa-tele-ticks-v span {
  display: block;
}
.bfa-tele-track-v {
  position: relative;
  width: 32px;
  height: 118px;
  border-radius: 7px;
  background: var(--bfa-tele-face);
  border: 1px solid rgba(0,0,0,0.5);
  box-shadow: 0 0 0 1px rgba(255,220,160,0.08) inset, 0 4px 12px rgba(0,0,0,0.4) inset;
  touch-action: none;
}
.bfa-tele-groove-v {
  position: absolute;
  left: 50%;
  top: 8px;
  bottom: 8px;
  width: 6px;
  margin-left: -3px;
  border-radius: 3px;
  background: linear-gradient(90deg, #05080c, #1a2838 50%, #05080c);
  box-shadow: 0 0 4px rgba(0,0,0,0.9) inset;
}
.bfa-tele-knob-v {
  position: absolute;
  left: 50%;
  width: 24px;
  height: 16px;
  margin-left: -12px;
  margin-top: -8px;
  top: 50%;
  border-radius: 4px;
  background: linear-gradient(180deg, #c49852 0%, #7a5a28 45%, #4a3618 100%);
  border: 1px solid rgba(255, 220, 160, 0.35);
  box-shadow:
    0 2px 4px rgba(0,0,0,0.65),
    0 0 0 1px rgba(0,0,0,0.4) inset;
  pointer-events: none;
}
.bfa-tele-rudder-block {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  width: 100%;
  min-width: 0;
}
.bfa-tele-ticks-h {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  font-size: 6px;
  letter-spacing: 0.02em;
  color: rgba(200, 210, 190, 0.55);
  padding: 0 1px;
  width: 154px;
  max-width: 100%;
}
.bfa-tele-ticks-h span {
  flex: 1;
  text-align: center;
  min-width: 0;
}
.bfa-tele-track-h {
  position: relative;
  height: 34px;
  width: 154px;
  max-width: 100%;
  border-radius: 7px;
  background: var(--bfa-tele-face);
  border: 1px solid rgba(0,0,0,0.5);
  box-shadow: 0 0 0 1px rgba(255,220,160,0.08) inset, 0 4px 12px rgba(0,0,0,0.4) inset;
  touch-action: none;
}
.bfa-tele-groove-h {
  position: absolute;
  top: 50%;
  left: 8px;
  right: 8px;
  height: 6px;
  margin-top: -3px;
  border-radius: 3px;
  background: linear-gradient(180deg, #05080c, #1a2838 50%, #05080c);
  box-shadow: 0 0 4px rgba(0,0,0,0.9) inset;
}
.bfa-tele-knob-h {
  position: absolute;
  top: 50%;
  width: 16px;
  height: 24px;
  margin-top: -12px;
  margin-left: -8px;
  left: 50%;
  border-radius: 4px;
  background: linear-gradient(90deg, #c49852 0%, #7a5a28 50%, #4a3618 100%);
  border: 1px solid rgba(255, 220, 160, 0.35);
  box-shadow:
    0 2px 4px rgba(0,0,0,0.65),
    0 0 0 1px rgba(0,0,0,0.4) inset;
  pointer-events: none;
}
.bfa-tele--readonly,
.bfa-tele--readonly * {
  pointer-events: none !important;
}
.bfa-tele--readonly .bfa-tele-track-v,
.bfa-tele--readonly .bfa-tele-track-h {
  touch-action: none;
  cursor: default;
}
.bfa-tele--interactive .bfa-tele-track-v,
.bfa-tele--interactive .bfa-tele-track-h {
  cursor: grab;
}
.bfa-tele--interactive .bfa-tele-track-v:active,
.bfa-tele--interactive .bfa-tele-track-h:active {
  cursor: grabbing;
}
`;
  document.head.appendChild(el);
}

export type MachineryTelegraphLevers = {
  /** Root node — on mobile, append inside overlay so z-order stays above dead zones. */
  root: HTMLElement;
  /** Desktop: mirrors W/S + A/D each frame. Mobile: no-op (sliders own state). */
  setFeedback(throttle: number, rudderInput: number): void;
  /** Mobile: current lever values; desktop: zeros (caller ignores). */
  sampleMobileOutputs(): { throttle: number; rudderInput: number };
  dispose(): void;
};

export function createMachineryTelegraphLevers(options: {
  interactive: boolean;
}): MachineryTelegraphLevers {
  ensureStyles();

  const root = document.createElement("div");
  root.className =
    `bfa-tele bfa-tele-l-root ${options.interactive ? "bfa-tele--interactive" : "bfa-tele--readonly"}`;
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", t("telegraphLevers.ariaGroup"));
  root.style.cssText =
    "position:fixed;left:10px;bottom:10px;z-index:" +
    (options.interactive ? "5" : "26") +
    ";pointer-events:" +
    (options.interactive ? "auto" : "none") +
    ";user-select:none;-webkit-user-select:none;touch-action:none;";

  const panelEngine = document.createElement("div");
  panelEngine.className = "bfa-tele-panel bfa-tele-panel--engine";
  panelEngine.setAttribute("role", "group");
  panelEngine.setAttribute("aria-label", t("telegraphLevers.ariaThrottle"));

  const throttleCol = document.createElement("div");
  throttleCol.className = "bfa-tele-throttle-col";

  const ticksV = document.createElement("div");
  ticksV.className = "bfa-tele-ticks-v";
  for (let i = TELEGRAPH_THROTTLE_STEPS.length - 1; i >= 0; i--) {
    const row = document.createElement("span");
    row.textContent = t(`telegraphLevers.throttleTick${i}`);
    ticksV.appendChild(row);
  }

  const trackV = document.createElement("div");
  trackV.className = "bfa-tele-track-v";
  trackV.setAttribute("aria-label", t("telegraphLevers.ariaThrottle"));

  const grooveV = document.createElement("div");
  grooveV.className = "bfa-tele-groove-v";
  const knobV = document.createElement("div");
  knobV.className = "bfa-tele-knob-v";
  trackV.append(grooveV, knobV);

  throttleCol.append(ticksV, trackV);
  panelEngine.append(throttleCol);

  const panelRudder = document.createElement("div");
  panelRudder.className = "bfa-tele-panel bfa-tele-panel--rudder";
  panelRudder.setAttribute("role", "group");
  panelRudder.setAttribute("aria-label", t("telegraphLevers.ariaRudder"));

  const rudderBlock = document.createElement("div");
  rudderBlock.className = "bfa-tele-rudder-block";

  const ticksH = document.createElement("div");
  ticksH.className = "bfa-tele-ticks-h";
  for (let i = 0; i < TELEGRAPH_RUDDER_STEPS.length; i++) {
    const s = document.createElement("span");
    s.textContent = t(`telegraphLevers.rudderTick${i}`);
    ticksH.appendChild(s);
  }

  const trackH = document.createElement("div");
  trackH.className = "bfa-tele-track-h";
  trackH.setAttribute("aria-label", t("telegraphLevers.ariaRudder"));

  const grooveH = document.createElement("div");
  grooveH.className = "bfa-tele-groove-h";
  const knobH = document.createElement("div");
  knobH.className = "bfa-tele-knob-h";
  trackH.append(grooveH, knobH);

  rudderBlock.append(ticksH, trackH);
  panelRudder.append(rudderBlock);

  root.append(panelEngine, panelRudder);

  let throttle: number = TELEGRAPH_THROTTLE_STEPS[TELEGRAPH_STOP_INDEX]!;
  let rudderInput: number = TELEGRAPH_RUDDER_STEPS[TELEGRAPH_STOP_INDEX]!;

  function placeKnobV(): void {
    const tClamped = Math.max(-1, Math.min(1, throttle));
    const yPct = 50 - (tClamped / 2) * 100;
    knobV.style.top = `${yPct}%`;
  }

  function placeKnobH(): void {
    const rClamped = Math.max(-1, Math.min(1, rudderInput));
    const xPct = 50 + (rClamped / 2) * 100;
    knobH.style.left = `${xPct}%`;
  }

  placeKnobV();
  placeKnobH();

  const dragState: { kind: "v" | "h" | null; pointerId: number | null } = {
    kind: null,
    pointerId: null,
  };

  function applyFromPointerV(clientY: number): void {
    const rect = trackV.getBoundingClientRect();
    const raw = clientYToThrottle(clientY, rect.top, rect.height);
    throttle = snapToNearestStep(raw, TELEGRAPH_THROTTLE_STEPS);
    placeKnobV();
  }

  function applyFromPointerH(clientX: number): void {
    const rect = trackH.getBoundingClientRect();
    const raw = clientXToRudder(clientX, rect.left, rect.width);
    rudderInput = snapToNearestStep(raw, TELEGRAPH_RUDDER_STEPS);
    placeKnobH();
  }

  const onMove = (e: PointerEvent): void => {
    if (dragState.pointerId !== e.pointerId) return;
    if (dragState.kind === "v") applyFromPointerV(e.clientY);
    else if (dragState.kind === "h") applyFromPointerH(e.clientX);
  };

  const endDrag = (e: PointerEvent): void => {
    if (dragState.pointerId !== e.pointerId) return;
    if (trackV.hasPointerCapture(e.pointerId)) trackV.releasePointerCapture(e.pointerId);
    if (trackH.hasPointerCapture(e.pointerId)) trackH.releasePointerCapture(e.pointerId);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
    dragState.kind = null;
    dragState.pointerId = null;
  };

  function startV(e: PointerEvent): void {
    if (!options.interactive) return;
    e.preventDefault();
    dragState.kind = "v";
    dragState.pointerId = e.pointerId;
    trackV.setPointerCapture(e.pointerId);
    applyFromPointerV(e.clientY);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  }

  function startH(e: PointerEvent): void {
    if (!options.interactive) return;
    e.preventDefault();
    dragState.kind = "h";
    dragState.pointerId = e.pointerId;
    trackH.setPointerCapture(e.pointerId);
    applyFromPointerH(e.clientX);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  }

  if (options.interactive) {
    trackV.addEventListener("pointerdown", startV);
    trackH.addEventListener("pointerdown", startH);
  }

  return {
    root,
    setFeedback(nextThrottle: number, nextRudder: number): void {
      if (options.interactive) return;
      throttle = snapToNearestStep(nextThrottle, TELEGRAPH_THROTTLE_STEPS);
      rudderInput = snapToNearestStep(nextRudder, TELEGRAPH_RUDDER_STEPS);
      placeKnobV();
      placeKnobH();
    },
    sampleMobileOutputs(): { throttle: number; rudderInput: number } {
      if (!options.interactive) return { throttle: 0, rudderInput: 0 };
      return { throttle, rudderInput };
    },
    dispose(): void {
      trackV.removeEventListener("pointerdown", startV);
      trackH.removeEventListener("pointerdown", startH);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      root.remove();
    },
  };
}
