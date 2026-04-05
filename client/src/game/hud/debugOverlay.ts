/**
 * Dev-Overlay (Task 2): FPS, Raum, Spielerzahl, Ping (RTT ping/pong). Optional `warn` / `diag`.
 */

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

export function createDebugOverlay(): {
  update: (info: DebugOverlayInfo) => void;
} {
  const el = document.createElement("div");
  el.id = "debug-overlay";
  el.style.cssText =
    "position:fixed;top:48px;right:12px;z-index:9998;font:11px/1.4 system-ui,sans-serif;color:#0d2135;" +
    "background:rgba(255,255,255,0.78);padding:8px 10px;border-radius:6px;pointer-events:none;text-align:right;" +
    "max-width:min(280px,42vw);";

  const metrics = document.createElement("div");
  const diag = document.createElement("div");
  diag.style.cssText =
    "display:none;margin-top:6px;text-align:left;font-size:10px;color:#5a6b7a;line-height:1.35;white-space:pre-wrap;";
  const warn = document.createElement("div");
  warn.style.cssText =
    "display:none;color:#a81616;margin-top:8px;text-align:left;white-space:pre-wrap;font-weight:600;border-top:1px solid rgba(168,22,22,0.25);padding-top:6px;";

  el.appendChild(metrics);
  el.appendChild(diag);
  el.appendChild(warn);
  document.body.appendChild(el);

  return {
    update({ fps, roomId, playerCount, pingMs, diag: diagText, warn: warnText }): void {
      const ping = pingMs == null ? "—" : `${Math.round(pingMs)} ms`;
      metrics.innerHTML = `FPS ${fps.toFixed(0)}<br/>Raum ${roomId}<br/>Spieler ${playerCount}<br/>Ping ${ping}`;
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
