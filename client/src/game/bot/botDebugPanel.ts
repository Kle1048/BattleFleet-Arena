import type { BotInputCommand, BotIntent, BotLogEntry, TacticalContext } from "./types";

export type BotDebugState = {
  enabled: boolean;
  intent: BotIntent | null;
  targetId: string | null;
  context: TacticalContext | null;
  lastInputs: BotInputCommand[];
  recentIntents: { at: number; intent: BotIntent }[];
  logs: BotLogEntry[];
};

export function createBotDebugPanel(): {
  render: (state: BotDebugState) => void;
  dispose: () => void;
} {
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "position:fixed;right:12px;bottom:12px;z-index:9998;font:11px/1.4 system-ui,sans-serif;color:#d7ecff;" +
    "background:rgba(8,22,36,0.82);padding:8px 10px;border-radius:6px;max-width:min(360px,42vw);" +
    "border:1px solid rgba(160,210,255,0.22);";
  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;";
  const title = document.createElement("div");
  title.style.cssText = "font-weight:700;";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.style.cssText =
    "background:#153247;color:#bfe7ff;border:1px solid rgba(130,180,220,0.45);" +
    "border-radius:5px;padding:2px 7px;cursor:pointer;font:11px system-ui,sans-serif;";
  header.appendChild(title);
  header.appendChild(toggle);
  wrap.appendChild(header);

  const content = document.createElement("div");
  content.style.marginTop = "6px";
  wrap.appendChild(content);

  let expanded = true;
  const applyExpandedState = (): void => {
    content.style.display = expanded ? "block" : "none";
    toggle.textContent = expanded ? "Hide" : "Show";
  };
  toggle.addEventListener("click", () => {
    expanded = !expanded;
    applyExpandedState();
  });
  applyExpandedState();
  document.body.appendChild(wrap);

  const fmt = (n: number) => n.toFixed(2);
  const yn = (b: boolean) => (b ? "ja" : "nein");
  return {
    render(state): void {
      const c = state.context;
      const status = state.enabled ? "AKTIV" : "INAKTIV";
      title.textContent = `Bot ${status} (Taste B)`;
      const inputLines = state.lastInputs
        .slice(-5)
        .map((q) => `T ${fmt(q.throttle)} R ${fmt(q.rudderInput)} F ${q.primaryFire ? 1 : 0}`)
        .join("<br/>");
      const intentLines = state.recentIntents
        .slice(-5)
        .map((q) => `${new Date(q.at).toLocaleTimeString()} ${q.intent}`)
        .join("<br/>");
      const logLines = state.logs
        .slice(-8)
        .map((q) => {
          const t = new Date(performance.timeOrigin + q.timestamp).toLocaleTimeString();
          return `[${t}] ${q.phase} ${q.message}`;
        })
        .join("<br/>");
      content.innerHTML = `
        <div>Intent: ${state.intent ?? "—"}</div>
        <div>Ziel: ${state.targetId ?? "—"}</div>
        <div>danger: ${c ? fmt(c.dangerScore) : "—"} | aggr: ${c ? fmt(c.aggressionScore) : "—"} | surv: ${c ? fmt(c.survivalScore) : "—"}</div>
        <div>Gun Arc: ${c ? yn(c.targetInGunArc) : "—"} | Missile Arc: ${c ? yn(c.targetInMissileArc) : "—"}</div>
        <div>Incoming Missiles: ${c ? c.incomingMissileCount : 0}</div>
        <hr style="border:none;border-top:1px solid rgba(160,210,255,0.2);margin:6px 0;" />
        <div style="font-weight:600;">Letzte Inputs</div>
        <div>${inputLines || "—"}</div>
        <div style="font-weight:600;margin-top:6px;">Intent-Wechsel</div>
        <div>${intentLines || "—"}</div>
        <div style="font-weight:600;margin-top:6px;">Decision-Log</div>
        <div style="max-height:120px;overflow:auto;">${logLines || "—"}</div>
      `;
    },
    dispose(): void {
      wrap.remove();
    },
  };
}
