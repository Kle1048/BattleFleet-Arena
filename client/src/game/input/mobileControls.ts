import { FEATURE_MINES_ENABLED } from "@battlefleet/shared";
import nipplejs from "nipplejs";

export type MobileControlSample = {
  active: boolean;
  throttle: number;
  rudderInput: number;
  primaryFire: boolean;
  secondaryFire: boolean;
  torpedoFire: boolean;
  radarTogglePressed: boolean;
  airDefensePressed: boolean;
};

function clampUnit(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

function shouldEnableMobileControls(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("mobileControls") === "0") return false;
  if (params.get("mobileControls") === "1") return true;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const touchCapable = (navigator.maxTouchPoints ?? 0) > 0;
  return coarse || touchCapable;
}

function createActionButton(label: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.style.cssText =
    "width:100%;min-height:52px;padding:8px 10px;border-radius:10px;" +
    "border:1px solid rgba(160,220,255,0.35);background:rgba(10,24,40,0.86);" +
    "color:#dff2ff;font:600 12px system-ui,sans-serif;letter-spacing:0.02em;" +
    "touch-action:manipulation;user-select:none;-webkit-user-select:none;" +
    "-webkit-touch-callout:none;";
  return btn;
}

function bindHoldButton(
  btn: HTMLButtonElement,
  setHeld: (held: boolean) => void,
  activeBg = "rgba(28,88,140,0.96)",
): void {
  const setState = (held: boolean): void => {
    setHeld(held);
    btn.style.background = held ? activeBg : "rgba(10,24,40,0.86)";
    btn.style.borderColor = held ? "rgba(170,220,255,0.75)" : "rgba(160,220,255,0.35)";
  };
  const blockSelect = (e: Event): void => {
    e.preventDefault();
  };
  btn.addEventListener("selectstart", blockSelect);

  const onDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (window.getSelection) window.getSelection()?.removeAllRanges();
    btn.setPointerCapture(e.pointerId);
    setState(true);
  };
  const onUp = (e: PointerEvent): void => {
    e.preventDefault();
    if (btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
    setState(false);
  };
  btn.addEventListener("pointerdown", onDown);
  btn.addEventListener("pointerup", onUp);
  btn.addEventListener("pointercancel", onUp);
  btn.addEventListener("lostpointercapture", () => setState(false));
}

export function createMobileControls(): {
  sample: () => MobileControlSample;
  dispose: () => void;
} {
  if (!shouldEnableMobileControls()) {
    return {
      sample: () => ({
        active: false,
        throttle: 0,
        rudderInput: 0,
        primaryFire: false,
        secondaryFire: false,
        torpedoFire: false,
        radarTogglePressed: false,
        airDefensePressed: false,
      }),
      dispose: () => void 0,
    };
  }

  const root = document.createElement("div");
  root.setAttribute("aria-label", "Mobile controls");
  root.style.cssText =
    "position:fixed;inset:0;z-index:9000;pointer-events:none;touch-action:none;" +
    "user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;";

  const joystickZone = document.createElement("div");
  joystickZone.style.cssText =
    "position:relative;width:min(38vw,190px);height:min(38vw,190px);" +
    "max-width:190px;max-height:190px;pointer-events:auto;touch-action:none;" +
    "user-select:none;-webkit-user-select:none;";
  const joystickAnchor = document.createElement("div");
  joystickAnchor.style.cssText =
    "position:absolute;left:12px;bottom:12px;pointer-events:auto;";
  joystickAnchor.appendChild(joystickZone);
  root.appendChild(joystickAnchor);

  const actionGrid = document.createElement("div");
  actionGrid.style.cssText =
    "position:absolute;right:12px;bottom:12px;width:min(48vw,240px);" +
    "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;pointer-events:auto;";
  root.appendChild(actionGrid);

  const btnPrimary = createActionButton("Fire");
  const btnSecondary = createActionButton("ASuM");
  const btnTorpedo = createActionButton("Minen");
  const btnRadar = createActionButton("Radar");
  const btnAirDefense = createActionButton("Defense");

  btnAirDefense.style.gridColumn = "1 / span 2";

  if (FEATURE_MINES_ENABLED) {
    actionGrid.append(btnPrimary, btnSecondary, btnTorpedo, btnRadar, btnAirDefense);
  } else {
    actionGrid.append(btnPrimary, btnSecondary, btnRadar, btnAirDefense);
  }
  document.body.appendChild(root);

  let throttle = 0;
  let rudderInput = 0;
  let primaryFire = false;
  let secondaryFire = false;
  let torpedoFire = false;
  let radarTogglePressed = false;
  let airDefensePressed = false;

  bindHoldButton(btnPrimary, (held) => {
    primaryFire = held;
  }, "rgba(116,64,30,0.96)");
  bindHoldButton(btnSecondary, (held) => {
    secondaryFire = held;
  }, "rgba(98,38,100,0.96)");
  if (FEATURE_MINES_ENABLED) {
    bindHoldButton(btnTorpedo, (held) => {
      torpedoFire = held;
    }, "rgba(24,88,116,0.96)");
  }

  const bindTapButton = (
    btn: HTMLButtonElement,
    onTap: () => void,
    activeColor: string,
  ): void => {
    btn.addEventListener("selectstart", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      onTap();
      btn.style.background = activeColor;
      btn.style.borderColor = "rgba(170,220,255,0.75)";
      window.setTimeout(() => {
        btn.style.background = "rgba(10,24,40,0.86)";
        btn.style.borderColor = "rgba(160,220,255,0.35)";
      }, 130);
    });
  };

  bindTapButton(btnRadar, () => {
    radarTogglePressed = true;
  }, "rgba(30,100,62,0.96)");
  bindTapButton(btnAirDefense, () => {
    airDefensePressed = true;
  }, "rgba(110,78,22,0.96)");

  const manager = nipplejs.create({
    zone: joystickZone,
    mode: "static",
    color: "#8fd3ff",
    dynamicPage: true,
    position: { left: "50%", top: "50%" },
    size: 145,
    multitouch: false,
  });

  manager.on("move", (evt) => {
    const data = evt.data;
    const v = data.vector;
    rudderInput = clampUnit(v.x);
    throttle = clampUnit(v.y);
  });
  manager.on("end", () => {
    rudderInput = 0;
    throttle = 0;
  });

  return {
    sample: () => {
      const snapshot: MobileControlSample = {
        active: true,
        throttle,
        rudderInput,
        primaryFire,
        secondaryFire,
        torpedoFire: FEATURE_MINES_ENABLED && torpedoFire,
        radarTogglePressed,
        airDefensePressed,
      };
      radarTogglePressed = false;
      airDefensePressed = false;
      return snapshot;
    },
    dispose: () => {
      manager.destroy();
      root.remove();
    },
  };
}
