/**
 * Vor Match: Anzeigename + Schiffsklasse, danach `joinOrCreate(..., { shipClass, displayName })`.
 */

import {
  PLAYER_DISPLAY_NAME_MAX_LEN,
  SHIP_CLASS_CRUISER,
  SHIP_CLASS_DESTROYER,
  SHIP_CLASS_FAC,
  type ShipClassId,
} from "@battlefleet/shared";

export type ShipLobbyChoice = {
  shipClass: ShipClassId;
  /** Roh wie im Formular; Server bereinigt mit `sanitizePlayerDisplayName`. */
  displayName: string;
};

type ClassOption = {
  id: ShipClassId;
  title: string;
  blurb: string;
};

const OPTIONS: ClassOption[] = [
  {
    id: SHIP_CLASS_FAC,
    title: "FAC",
    blurb: "Schnell, weiter Bug-Bogen, wenig HP — max. 1 ASuM.",
  },
  {
    id: SHIP_CLASS_DESTROYER,
    title: "Zerstörer",
    blurb: "Ausgewogen — gleiche Basis wie bisher (2 ASuM).",
  },
  {
    id: SHIP_CLASS_CRUISER,
    title: "Kreuzer",
    blurb: "Schwere Panzerung, enger Bogen, langsamer.",
  },
];

export function pickShipLobbyChoice(): Promise<ShipLobbyChoice> {
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.className = "class-picker-overlay";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Schiff und Name wählen");
    root.innerHTML = `
      <div class="class-picker-panel">
        <h2 class="class-picker-title">Schiffsklasse</h2>
        <p class="class-picker-hint">Gib deinen Namen ein (optional) und wähle eine Klasse — dann geht es in den Kampfraum.</p>
        <label class="class-picker-name-label">
          <span class="class-picker-name-caption">Spielername</span>
          <input type="text" class="class-picker-name-input" maxlength="${PLAYER_DISPLAY_NAME_MAX_LEN}"
            autocomplete="nickname" spellcheck="false" placeholder="z. B. Kommandant" />
        </label>
        <div class="class-picker-grid"></div>
      </div>
    `;
    const grid = root.querySelector(".class-picker-grid") as HTMLElement;
    const nameInput = root.querySelector(".class-picker-name-input") as HTMLInputElement;

    const cleanup = (): void => {
      root.remove();
    };

    const readDisplayName = (): string => nameInput.value;

    for (const opt of OPTIONS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "class-picker-card";
      btn.innerHTML = `<span class="class-picker-card-title">${opt.title}</span><span class="class-picker-card-blurb">${opt.blurb}</span>`;
      btn.addEventListener("click", () => {
        cleanup();
        resolve({ shipClass: opt.id, displayName: readDisplayName() });
      });
      grid.appendChild(btn);
    }

    document.body.appendChild(root);
    queueMicrotask(() => nameInput.focus());
  });
}

/** @deprecated Nutze `pickShipLobbyChoice`. */
export async function pickShipClass(): Promise<ShipClassId> {
  const c = await pickShipLobbyChoice();
  return c.shipClass;
}
