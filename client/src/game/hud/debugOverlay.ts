/**
 * Dev-Overlay (Task 2): FPS, Raum, Spielerzahl, Ping (RTT ping/pong). Optional `warn` / `diag`.
 * Kompakt: nur FPS + Ping (Toggle, persistiert in localStorage).
 */

const DEBUG_OVERLAY_COMPACT_KEY = "bfa.hud.debugOverlayCompact";

function readDebugCompact(): boolean {
  try {
    return localStorage.getItem(DEBUG_OVERLAY_COMPACT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDebugCompact(compact: boolean): void {
  try {
    localStorage.setItem(DEBUG_OVERLAY_COMPACT_KEY, compact ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export type DebugOverlayInfo = {
  fps: number;
  roomId: string;
  playerCount: number;
  pingMs: number | null;
  /** Graue Zeile (z. B. Diagnose ohne Konsole). */
  diag?: string;
  /** Sichtbare Warnung (z. B. Timeout, leerer State, Colyseus-Fehler). */
  warn?: string;
};

export function createDebugOverlay(options?: {
  /** Wenn gesetzt (z. B. `.cockpit-bridge`), wird dort eingehängt — Abstand per Flex `gap`. */
  parent?: HTMLElement;
}): {
  update: (info: DebugOverlayInfo) => void;
} {
  const el = document.createElement("div");
  el.id = "debug-overlay";
  /* Layout: index.html `#debug-overlay` (in Brücke: skaliert mit Panel) */

  const head = document.createElement("div");
  head.className = "debug-overlay-head";

  const compactLine = document.createElement("div");
  compactLine.className = "debug-overlay-compact-line";
  compactLine.setAttribute("aria-hidden", "true");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "debug-overlay-toggle";
  toggle.setAttribute("aria-label", "Debug-Overlay reduzieren oder erweitern");

  head.appendChild(compactLine);
  head.appendChild(toggle);

  const metrics = document.createElement("div");
  metrics.className = "debug-overlay-full";

  const diag = document.createElement("div");
  diag.className = "debug-overlay-diag";
  diag.style.cssText =
    "display:none;margin-top:6px;text-align:left;font-size:10px;color:#5a6b7a;line-height:1.35;white-space:pre-wrap;";
  const warn = document.createElement("div");
  warn.className = "debug-overlay-warn";
  warn.style.cssText =
    "display:none;color:#a81616;margin-top:8px;text-align:left;white-space:pre-wrap;font-weight:600;border-top:1px solid rgba(168,22,22,0.25);padding-top:6px;";

  el.appendChild(head);
  el.appendChild(metrics);
  el.appendChild(diag);
  el.appendChild(warn);
  (options?.parent ?? document.body).appendChild(el);

  const applyCompact = (compact: boolean): void => {
    el.classList.toggle("debug-overlay--compact", compact);
    toggle.setAttribute("aria-expanded", (!compact).toString());
    toggle.textContent = compact ? "+" : "−";
    toggle.title = compact ? "Debug voll anzeigen" : "Nur FPS und Ping";
    writeDebugCompact(compact);
  };

  applyCompact(readDebugCompact());

  toggle.addEventListener("click", () => {
    applyCompact(!el.classList.contains("debug-overlay--compact"));
  });

  return {
    update({ fps, roomId, playerCount, pingMs, diag: diagText, warn: warnText }): void {
      const ping = pingMs == null ? "—" : `${Math.round(pingMs)} ms`;
      const fpsStr = fps.toFixed(0);
      compactLine.textContent = `FPS ${fpsStr} · Ping ${ping}`;
      metrics.innerHTML = `FPS ${fpsStr}<br/>Raum ${roomId}<br/>Spieler ${playerCount}<br/>Ping ${ping}`;
      if (diagText != null && diagText.length > 0) {
        diag.style.display = "block";
        diag.textContent = diagText;
      } else {
        diag.style.display = "none";
        diag.textContent = "";
      }
      if (warnText != null && warnText.length > 0) {
        warn.style.display = "block";
        warn.textContent = warnText;
      } else {
        warn.style.display = "none";
        warn.textContent = "";
      }
    },
  };
}
