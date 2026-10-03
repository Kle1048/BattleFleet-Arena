import { t } from "../../locale/t";
import { controlGuideHtml } from "../ui/controlGuide";
import { isMobileControlSurface } from "../input/mobileControls";

export function createControlsHelp(onShowHelp: () => void, parent: HTMLElement = document.body) {
  if (isMobileControlSurface()) return { dispose() {} };
  const root = document.createElement("aside");
  root.className = "controls-help";
  root.setAttribute("aria-label", t("playHelp.keys"));
  root.innerHTML = `<div class="controls-help-header">
      <button type="button" class="controls-help-toggle" aria-controls="controls-help-body"></button>
      <button type="button" class="controls-help-guide">${t("playHelp.fullGuide")}</button>
    </div><div id="controls-help-body">${controlGuideHtml(true)}</div>`;
  const toggle = root.querySelector<HTMLButtonElement>(".controls-help-toggle")!;
  const body = root.querySelector<HTMLElement>("#controls-help-body")!;
  const guide = root.querySelector<HTMLButtonElement>(".controls-help-guide")!;
  const storageKey = "bfa.controlsHelp.hidden.v1";
  let hidden = true;
  try { hidden = localStorage.getItem(storageKey) !== "false"; } catch { /* Optional preference. */ }
  const sync = () => {
    body.hidden = hidden;
    toggle.textContent = `${t("playHelp.keys")} ${hidden ? "+" : "−"}`;
    toggle.setAttribute("aria-expanded", String(!hidden));
    toggle.setAttribute("aria-label", t(hidden ? "playHelp.show" : "playHelp.hide"));
  };
  const onToggle = () => {
    hidden = !hidden; sync();
    try { localStorage.setItem(storageKey, String(hidden)); } catch { /* Optional preference. */ }
    toggle.blur();
  };
  toggle.addEventListener("click", onToggle);
  guide.addEventListener("click", onShowHelp);
  sync(); parent.appendChild(root);
  return { dispose() {
    toggle.removeEventListener("click", onToggle);
    guide.removeEventListener("click", onShowHelp);
    root.remove();
  } };
}
