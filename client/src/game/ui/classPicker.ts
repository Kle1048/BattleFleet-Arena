/**
 * Vor Match: optionaler Anzeigename, dann `joinOrCreate(..., { shipClass: FAC, displayName })`.
 */

import { PLAYER_DISPLAY_NAME_MAX_LEN, SHIP_CLASS_FAC, type ShipClassId } from "@battlefleet/shared";
import { t } from "../../locale/t";
import { waitForDialog } from "./dialogLifetime";
import { showMissionBriefing } from "./missionBriefing";

export type ShipLobbyChoice = {
  shipClass: ShipClassId;
  /** Roh wie im Formular; Server bereinigt mit `sanitizePlayerDisplayName`. */
  displayName: string;
};

export async function pickShipLobbyChoice(signal?: AbortSignal): Promise<ShipLobbyChoice> {
  const root = document.createElement("div");
  root.className = "class-picker-overlay";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", t("classPicker.ariaDialog"));
  root.innerHTML = `
    <div class="class-picker-panel">
      <label class="class-picker-name-label">
        <span class="class-picker-name-caption">${t("classPicker.nameCaption")}</span>
        <input type="text" class="class-picker-name-input" maxlength="${PLAYER_DISPLAY_NAME_MAX_LEN}"
          autocomplete="nickname" spellcheck="false" placeholder="" />
      </label>
      <button type="button" class="class-picker-continue-btn" aria-label="${t("classPicker.continue")}">${t("classPicker.continue")}</button>
      <a class="class-picker-help-link" href="#help">${t("playHelp.title")}</a>
    </div>
  `;
  const nameInput = root.querySelector(".class-picker-name-input") as HTMLInputElement;
  const continueBtn = root.querySelector(".class-picker-continue-btn") as HTMLButtonElement;
  const helpLink = root.querySelector(".class-picker-help-link") as HTMLAnchorElement;
  const openHelp = (event: Event) => {
    event.preventDefault();
    void showMissionBriefing(signal, false).catch(error => {
      if (!signal?.aborted) console.warn("Lobby help failed", error);
    });
  };
  helpLink.addEventListener("click", openHelp);

  try { await waitForDialog(root, continueBtn, { signal, enterInput: nameInput }); }
  finally { helpLink.removeEventListener("click", openHelp); }
  return { shipClass: SHIP_CLASS_FAC, displayName: nameInput.value };
}
