/**
 * Warnung bei Verlassen des Einsatzgebiets (serverseitiger Countdown in PlayerState.oobCountdownSec).
 */

const MESSAGE =
  "You are leaving the Area of Operations, Return immediately";

export function createAreaWarningHud(): {
  update: (oobCountdownSec: number) => void;
} {
  const wrap = document.createElement("div");
  wrap.className = "area-warning-hud";
  wrap.setAttribute("role", "alert");
  wrap.style.cssText =
    "position:fixed;top:12%;left:50%;transform:translateX(-50%);z-index:10000;" +
    "max-width:min(520px,92vw);text-align:center;font:600 15px/1.35 system-ui,sans-serif;" +
    "color:#ff1a1a;text-shadow:0 0 8px #000,0 1px 2px #000;" +
    "pointer-events:none;display:none;padding:12px 16px;border-radius:8px;" +
    "background:rgba(20,0,0,0.45);border:1px solid rgba(255,40,40,0.6);";

  const text = document.createElement("div");
  text.textContent = MESSAGE;
  const count = document.createElement("div");
  count.style.cssText =
    "margin-top:10px;font-size:22px;letter-spacing:0.04em;font-variant-numeric:tabular-nums;";

  wrap.appendChild(text);
  wrap.appendChild(count);
  document.body.appendChild(wrap);

  return {
    update(oobCountdownSec: number): void {
      if (oobCountdownSec <= 0) {
        wrap.style.display = "none";
        return;
      }
      wrap.style.display = "block";
      count.textContent = `${Math.max(1, Math.ceil(oobCountdownSec))} s`;
    },
  };
}
