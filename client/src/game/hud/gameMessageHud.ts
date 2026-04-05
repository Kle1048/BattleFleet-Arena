/**
 * Feste Meldungsfläche (oben Mitte): OOB, **Spawn-Schutz** (lokal repliziert), Zerstörung-Toasts.
 * **Priorität:** OOB → Spawn-Schutz → Toasts.
 */

const OOB_TITLE =
  "Du verlässt das Einsatzgebiet — kehre um.";

const SPAWN_SHIELD_TITLE = "Spawn-Schutz aktiv";

export type GameMessageHud = {
  /**
   * Toast-Meldung (wird von OOB verdrängt, danach wieder angezeigt falls noch gültig).
   */
  showToast: (
    text: string,
    kind?: "info" | "danger",
    durationMs?: number,
  ) => void;
  /**
   * Pro Frame: `spawnProtectionSec` vom **lokalen** Spieler (Schema), nur wenn `spawn_protected`.
   */
  updateFrame: (
    nowMs: number,
    oobCountdownSec: number,
    spawnProtectionSec: number,
  ) => void;
};

export function createGameMessageHud(): GameMessageHud {
  const wrap = document.createElement("div");
  wrap.className = "game-message-hud";
  wrap.setAttribute("role", "status");
  wrap.setAttribute("aria-live", "polite");
  wrap.style.cssText =
    "position:fixed;top:12%;left:50%;transform:translateX(-50%);z-index:10000;" +
    "width:min(520px,92vw);min-height:76px;box-sizing:border-box;display:none;" +
    "flex-direction:column;align-items:center;justify-content:center;gap:8px;" +
    "padding:14px 18px;text-align:center;font-family:system-ui,sans-serif;" +
    "pointer-events:none;background:transparent;border:none;";

  const textShadow =
    "0 0 10px #000,0 1px 3px #000,0 2px 10px rgba(0,0,0,0.85)";
  const titleEl = document.createElement("div");
  titleEl.className = "game-message-hud__title";
  titleEl.style.cssText =
    `font-weight:700;font-size:15px;line-height:1.35;white-space:pre-wrap;max-width:100%;text-shadow:${textShadow};`;

  const subEl = document.createElement("div");
  subEl.className = "game-message-hud__sub";
  subEl.style.cssText =
    `font-size:22px;font-variant-numeric:tabular-nums;letter-spacing:0.04em;font-weight:600;text-shadow:${textShadow};`;

  wrap.appendChild(titleEl);
  wrap.appendChild(subEl);
  document.body.appendChild(wrap);

  let toastUntilMs = 0;
  let toastText = "";
  let toastKind: "info" | "danger" = "info";

  return {
    showToast(text, kind = "info", durationMs = 4500) {
      toastText = text;
      toastKind = kind;
      toastUntilMs = performance.now() + durationMs;
    },
    updateFrame(nowMs, oobCountdownSec, spawnProtectionSec) {
      if (oobCountdownSec > 0) {
        wrap.style.display = "flex";
        titleEl.style.color = "#ff8a8a";
        subEl.style.color = "#ffffff";
        titleEl.textContent = OOB_TITLE;
        subEl.textContent = `${Math.max(1, Math.ceil(oobCountdownSec))} s`;
        subEl.style.display = "block";
        return;
      }

      if (spawnProtectionSec > 0.05) {
        wrap.style.display = "flex";
        titleEl.style.color = "#8cf0e0";
        subEl.style.color = "#d6fffa";
        titleEl.textContent = SPAWN_SHIELD_TITLE;
        subEl.textContent = `${spawnProtectionSec.toFixed(1)} s`;
        subEl.style.display = "block";
        return;
      }

      if (nowMs < toastUntilMs) {
        wrap.style.display = "flex";
        const danger = toastKind === "danger";
        titleEl.style.color = danger ? "#ffc9c9" : "#c8e4ff";
        titleEl.textContent = toastText;
        subEl.style.display = "none";
        subEl.textContent = "";
        return;
      }

      wrap.style.display = "none";
      titleEl.textContent = "";
      subEl.textContent = "";
    },
  };
}

export function shortSessionIdForMessage(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}
