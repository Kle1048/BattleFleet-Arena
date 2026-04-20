import { t } from "../../locale/t";

export type MobileControlSample = {
  active: boolean;
  primaryFire: boolean;
  secondaryFire: boolean;
  /** Gesetzt, wenn Port- oder Stb-SSM gehalten — Server wählt Rail/Munition nach Seite. */
  aswmFireSide?: "port" | "starboard";
  torpedoFire: boolean;
};

export type CreateMobileControlsOptions = {
  /** Maschinen-Telegraf (Gas/Ruder) — im Overlay über dem linken Dead-Zone-Layer. */
  telegraphRoot?: HTMLElement;
};

function shouldEnableMobileControls(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("mobileControls") === "0") return false;
  if (params.get("mobileControls") === "1") return true;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const touchCapable = (navigator.maxTouchPoints ?? 0) > 0;
  return coarse || touchCapable;
}

/** Gleiche Heuristik wie Softkeys — für Telegraf-Eingabe vs. Anzeige. */
export function isMobileControlSurface(): boolean {
  return shouldEnableMobileControls();
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

export function createMobileControls(options?: CreateMobileControlsOptions): {
  sample: () => MobileControlSample;
  dispose: () => void;
} {
  if (!shouldEnableMobileControls()) {
    return {
      sample: () => ({
        active: false,
        primaryFire: false,
        secondaryFire: false,
        torpedoFire: false,
      }),
      dispose: () => void 0,
    };
  }

  const root = document.createElement("div");
  root.setAttribute("aria-label", t("mobile.ariaRoot"));
  root.style.cssText =
    "position:fixed;inset:0;z-index:9000;pointer-events:none;touch-action:none;" +
    "user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;";

  /** Fängt versehentliche Canvas-Zieleingaben neben Softkeys ab (transparent). */
  const deadLeft = document.createElement("div");
  deadLeft.setAttribute("aria-hidden", "true");
  deadLeft.style.cssText =
    "position:fixed;left:0;bottom:0;width:min(44vw,280px);height:min(52vh,320px);" +
    "pointer-events:auto;z-index:0;";
  const deadRight = document.createElement("div");
  deadRight.setAttribute("aria-hidden", "true");
  deadRight.style.cssText =
    "position:fixed;right:0;bottom:0;width:min(58vw,360px);height:min(56vh,360px);" +
    "pointer-events:auto;z-index:0;";
  root.appendChild(deadLeft);
  if (options?.telegraphRoot) {
    options.telegraphRoot.style.zIndex = "3";
    root.appendChild(options.telegraphRoot);
  }
  root.appendChild(deadRight);

  const actionGrid = document.createElement("div");
  actionGrid.style.cssText =
    "position:fixed;right:12px;bottom:12px;z-index:4;" +
    "display:flex;flex-direction:column;gap:10px;align-items:stretch;" +
    "width:min(54vw,280px);pointer-events:auto;";

  const btnPrimary = createActionButton(t("mobile.btnFire"));
  btnPrimary.style.minHeight = "76px";
  btnPrimary.style.fontSize = "15px";
  btnPrimary.style.fontWeight = "800";

  const ssmRow = document.createElement("div");
  ssmRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;";

  const btnPort = createActionButton(t("mobile.btnSsmPort"));
  btnPort.style.borderColor = "rgba(220,90,90,0.55)";
  btnPort.style.color = "#ffc8c8";

  const btnStb = createActionButton(t("mobile.btnSsmStarboard"));
  btnStb.style.borderColor = "rgba(90,220,130,0.55)";
  btnStb.style.color = "#c8ffd8";

  ssmRow.append(btnPort, btnStb);
  actionGrid.append(ssmRow, btnPrimary);
  root.appendChild(actionGrid);

  document.body.appendChild(root);

  let primaryFire = false;
  let secondaryPort = false;
  let secondaryStb = false;
  bindHoldButton(btnPrimary, (held) => {
    primaryFire = held;
  }, "rgba(116,64,30,0.96)");
  bindHoldButton(
    btnPort,
    (held) => {
      secondaryPort = held;
    },
    "rgba(160,45,45,0.96)",
  );
  bindHoldButton(
    btnStb,
    (held) => {
      secondaryStb = held;
    },
    "rgba(35,120,65,0.96)",
  );

  return {
    sample: () => {
      const secondaryFire = secondaryPort || secondaryStb;
      const aswmFireSide: "port" | "starboard" | undefined = secondaryFire
        ? secondaryPort
          ? "port"
          : "starboard"
        : undefined;
      const snapshot: MobileControlSample = {
        active: true,
        primaryFire,
        secondaryFire,
        aswmFireSide,
        torpedoFire: false,
      };
      return snapshot;
    },
    dispose: () => {
      root.remove();
    },
  };
}
