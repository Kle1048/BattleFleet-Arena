/** Accessible, task-oriented help for the running game. */
import { t } from "../../locale/t";
import { waitForDialog } from "./dialogLifetime";
import { controlGuideHtml } from "./controlGuide";
import { isMobileControlSurface } from "../input/mobileControls";

let briefingOpen = false;
export async function showMissionBriefing(signal?: AbortSignal, inBattle = true): Promise<void> {
  if (briefingOpen || signal?.aborted) return;
  briefingOpen = true;
  const mobile = isMobileControlSurface();
  const previousFocus = document.activeElement as HTMLElement | null;
  const root = document.createElement("div");
  root.className = "mission-briefing-overlay";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "play-help-title");
  root.innerHTML = `<div class="mission-briefing-panel play-help-panel">
    <h2 id="play-help-title" class="mission-briefing-title">${t("playHelp.title")}</h2>
    <p class="mission-briefing-lead">${t("playHelp.intro")}</p>
    <div class="mission-briefing-scroll" tabindex="0">
      <section class="mission-briefing-section play-help-start">
        <h3 class="mission-briefing-h3">${t("playHelp.quickStart")}</h3>
        <ol><li>${t("playHelp.step1")}</li><li>${t(mobile ? "playHelp.mobileStep2" : "playHelp.step2")}</li><li>${t(mobile ? "playHelp.mobileStep3" : "playHelp.step3")}</li></ol>
      </section>
      <section class="mission-briefing-section"><h3 class="mission-briefing-h3">${t(mobile ? "playHelp.mobileKeys" : "playHelp.desktopKeys")}</h3>
        ${controlGuideHtml(false, mobile)}
        <p>${t(mobile ? "playHelp.touchDetail" : "playHelp.modeDetail")}</p>
      </section>
      <details open><summary>${t("playHelp.combat")}</summary><p>${t("playHelp.fireDetail")}</p></details>
      <details><summary>${t("playHelp.systems")}</summary><p>${t("playHelp.radarDetail")}</p><p>${t("playHelp.displayDetail")}</p></details>
      <details><summary>${t("playHelp.survival")}</summary><p>${t("playHelp.survivalDetail")}</p></details>
    </div>
    <footer class="mission-briefing-footer"><span>${t(inBattle ? "playHelp.liveNotice" : "playHelp.lobbyNotice")}</span>
      <button type="button" class="mission-briefing-continue-btn">${t(inBattle ? "playHelp.close" : "playHelp.lobbyClose")}</button>
    </footer>
  </div>`;
  const close = root.querySelector<HTMLButtonElement>(".mission-briefing-continue-btn")!;
  const onKey = (event: KeyboardEvent) => {
    // Reading help must not also steer, shoot or change the selected contact.
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); close.click(); }
    if (event.key === "Tab") {
      const focusable = [...root.querySelectorAll<HTMLElement>("button, a[href], summary, [tabindex='0']")];
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };
  root.addEventListener("keydown", onKey);
  try { await waitForDialog(root, close, { signal }); }
  finally {
    briefingOpen = false;
    root.removeEventListener("keydown", onKey);
    if (previousFocus?.isConnected) previousFocus.focus();
  }
}
export async function showMissionBriefingIfNeeded(): Promise<void> { await showMissionBriefing(); }
