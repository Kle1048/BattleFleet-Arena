/**
 * Vor Match: optionaler Anzeigename, dann `joinOrCreate(..., { shipClass: FAC, displayName })`.
 */

import { PLAYER_DISPLAY_NAME_MAX_LEN, SHIP_CLASS_FAC, type ShipClassId } from "@battlefleet/shared";
import { t } from "../../locale/t";

export type ShipLobbyChoice = {
  shipClass: ShipClassId;
  /** Roh wie im Formular; Server bereinigt mit `sanitizePlayerDisplayName`. */
  displayName: string;
};

export function pickShipLobbyChoice(): Promise<ShipLobbyChoice> {
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.className = "class-picker-overlay";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", t("classPicker.ariaDialog"));
    root.innerHTML = `
      <div class="class-picker-panel">
        <h2 class="class-picker-title">${t("product.fullName")}</h2>
        <p class="class-picker-hint">${t("classPicker.hint")}</p>
        <label class="class-picker-name-label">
          <span class="class-picker-name-caption">${t("classPicker.nameCaption")}</span>
          <input type="text" class="class-picker-name-input" maxlength="${PLAYER_DISPLAY_NAME_MAX_LEN}"
            autocomplete="nickname" spellcheck="false" placeholder="${t("classPicker.namePlaceholder")}" />
        </label>
        <button type="button" class="class-picker-continue-btn">${t("classPicker.continue")}</button>
      </div>
    `;
    const nameInput = root.querySelector(".class-picker-name-input") as HTMLInputElement;
    const continueBtn = root.querySelector(".class-picker-continue-btn") as HTMLButtonElement;

    const finish = (): void => {
      root.remove();
      resolve({ shipClass: SHIP_CLASS_FAC, displayName: nameInput.value });
    };

    continueBtn.addEventListener("click", () => finish());
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish();
      }
    });

    document.body.appendChild(root);
    queueMicrotask(() => nameInput.focus());
  });
}

/** @deprecated Nutze `pickShipLobbyChoice`. */
export async function pickShipClass(): Promise<ShipClassId> {
  const c = await pickShipLobbyChoice();
  return c.shipClass;
}
