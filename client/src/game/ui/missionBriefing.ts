/**
 * Vor dem Lobby-Dialog: Mission-Briefing-Overlay (Beispiel). Optional per localStorage ausblendbar.
 */

import { isVibeJamPortalEntry } from "../portal/vibeJamPortal";
import { t } from "../../locale/t";

const STORAGE_KEY = "battlefleet_missionBriefing_v1";

export function shouldShowMissionBriefing(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "1";
  } catch {
    return true;
  }
}

/**
 * Zeigt den Briefing-Screen und resolved nach Bestätigung.
 * Wenn „Nicht mehr anzeigen“ aktiv ist, wird der Schlüssel gesetzt.
 */
export function showMissionBriefing(): Promise<void> {
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.className = "mission-briefing-overlay";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", t("missionBriefing.ariaDialog"));
    root.innerHTML = `
      <div class="mission-briefing-panel">
        <header class="mission-briefing-header">
          <span class="mission-briefing-classified">${t("missionBriefing.headerClassified")}</span>
          <span class="mission-briefing-op">${t("missionBriefing.headerOp")}</span>
          <span class="mission-briefing-date" aria-hidden="true"></span>
        </header>
        <h2 class="mission-briefing-title">${t("missionBriefing.title")}</h2>
        <p class="mission-briefing-lead">
          ${t("missionBriefing.leadBefore")}<strong>${t("product.fullName")}</strong>${t("missionBriefing.leadAfter")}
        </p>
        <div class="mission-briefing-scroll" tabindex="0">
          <section class="mission-briefing-section">
            <h3 class="mission-briefing-h3">${t("missionBriefing.sectionSituationTitle")}</h3>
            <p>${t("missionBriefing.sectionSituationBody")}</p>
          </section>
          <section class="mission-briefing-section">
            <h3 class="mission-briefing-h3">${t("missionBriefing.sectionMissionTitle")}</h3>
            <ul class="mission-briefing-list">
              <li>${t("missionBriefing.missionBullet1")}</li>
              <li>${t("missionBriefing.missionBullet2")}</li>
              <li>${t("missionBriefing.missionBullet3")}</li>
            </ul>
          </section>
          <section class="mission-briefing-section">
            <h3 class="mission-briefing-h3">${t("missionBriefing.sectionMapTitle")}</h3>
            <ul class="mission-briefing-list mission-briefing-list--compact">
              <li>${t("missionBriefing.mapBulletSeaControl")}</li>
              <li>${t("missionBriefing.mapBulletOob")}</li>
              <li>${t("missionBriefing.mapBulletIslands")}</li>
              <li>${t("missionBriefing.mapBulletPortal")}</li>
              <li>${t("missionBriefing.mapBulletNorth")}</li>
            </ul>
          </section>
          <section class="mission-briefing-section">
            <h3 class="mission-briefing-h3">${t("missionBriefing.sectionControlsTitle")}</h3>
            <ul class="mission-briefing-list mission-briefing-list--compact">
              <li><span class="mission-briefing-kbd">WASD</span> ${t("missionBriefing.controlWasdSuffix")}</li>
              <li><span class="mission-briefing-kbd">Mouse</span> ${t("missionBriefing.controlMouseSuffix")}</li>
              <li><span class="mission-briefing-kbd">LMB</span> or <span class="mission-briefing-kbd">Space</span> ${t("missionBriefing.controlPrimarySuffix")}</li>
              <li><span class="mission-briefing-kbd">RMB</span> ${t("missionBriefing.controlRmbSuffix")}</li>
              <li><span class="mission-briefing-kbd">R</span> ${t("missionBriefing.controlRadarSuffix")}</li>
            </ul>
          </section>
        </div>
        <footer class="mission-briefing-footer">
          <label class="mission-briefing-skip">
            <input type="checkbox" class="mission-briefing-skip-input" />
            <span>${t("missionBriefing.skipLabel")}</span>
          </label>
          <button type="button" class="mission-briefing-continue-btn">${t("missionBriefing.continue")}</button>
        </footer>
      </div>
    `;

    const dateEl = root.querySelector(".mission-briefing-date") as HTMLElement | null;
    if (dateEl) {
      try {
        dateEl.textContent = new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date());
      } catch {
        dateEl.textContent = new Date().toISOString().slice(0, 16).replace("T", " ");
      }
    }

    const skipInput = root.querySelector(".mission-briefing-skip-input") as HTMLInputElement;
    const continueBtn = root.querySelector(".mission-briefing-continue-btn") as HTMLButtonElement;

    const finish = (): void => {
      if (skipInput.checked) {
        try {
          window.localStorage.setItem(STORAGE_KEY, "1");
        } catch {
          /* ignore quota / private mode */
        }
      }
      root.remove();
      resolve();
    };

    continueBtn.addEventListener("click", () => finish());

    document.body.appendChild(root);
    queueMicrotask(() => continueBtn.focus());
  });
}

/** Zeigt das Briefing nur, wenn der Spieler es nicht dauerhaft ausgeschaltet hat. */
export async function showMissionBriefingIfNeeded(): Promise<void> {
  if (isVibeJamPortalEntry()) return;
  if (!shouldShowMissionBriefing()) return;
  await showMissionBriefing();
}
