import type { BotInputCommand, BotIntent, BotLogEntry, TacticalContext } from "./types";
import { appendToBottomDebugDock } from "../runtime/bottomDebugDock";

export type BotDebugState = {
  enabled: boolean;
  intent: BotIntent | null;
  targetId: string | null;
  context: TacticalContext | null;
  lastInputs: BotInputCommand[];
  recentIntents: { at: number; intent: BotIntent }[];
  logs: BotLogEntry[];
};

type BotDebugPanelOptions = {
  onSetEnabled?: (enabled: boolean) => void;
};

export function createBotDebugPanel(options: BotDebugPanelOptions = {}): {
  render: (state: BotDebugState) => void;
  dispose: () => void;
} {
  const wrap = document.createElement("div");
  wrap.className = "bot-debug-panel";
  /* Layout: index.html `.bot-debug-panel` + `#bottom-debug-dock` */
  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;";
  const title = document.createElement("div");
  title.style.cssText = "font-weight:700;";
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;align-items:center;gap:6px;";
  const botToggle = document.createElement("button");
  botToggle.type = "button";
  botToggle.style.cssText =
    "background:#123f2b;color:#d8ffeb;border:1px solid rgba(120,220,180,0.48);" +
    "border-radius:7px;padding:6px 10px;cursor:pointer;font:600 12px system-ui,sans-serif;" +
    "touch-action:manipulation;";
  botToggle.setAttribute("aria-label", "Bot aktivieren oder deaktivieren");
  const collapseToggle = document.createElement("button");
  collapseToggle.type = "button";
  collapseToggle.style.cssText =
    "background:#153247;color:#bfe7ff;border:1px solid rgba(130,180,220,0.45);" +
    "border-radius:5px;padding:4px 8px;cursor:pointer;font:11px system-ui,sans-serif;" +
    "touch-action:manipulation;";
  header.appendChild(title);
  actions.appendChild(botToggle);
  actions.appendChild(collapseToggle);
  header.appendChild(actions);
  wrap.appendChild(header);

  const content = document.createElement("div");
  content.style.marginTop = "6px";
  wrap.appendChild(content);

  let expanded = true;
  let botEnabled = false;
  const applyExpandedState = (): void => {
    content.style.display = expanded ? "block" : "none";
    collapseToggle.textContent = expanded ? "Hide" : "Show";
  };
  const applyBotToggleState = (): void => {
    botToggle.textContent = botEnabled ? "Bot: ON" : "Bot: OFF";
    botToggle.style.background = botEnabled ? "#14643f" : "#4b2121";
    botToggle.style.borderColor = botEnabled ? "rgba(120,220,180,0.58)" : "rgba(255,145,145,0.52)";
    botToggle.style.color = botEnabled ? "#d8ffeb" : "#ffe0e0";
  };
  collapseToggle.addEventListener("click", () => {
    expanded = !expanded;
    applyExpandedState();
  });
  botToggle.addEventListener("click", () => {
    options.onSetEnabled?.(!botEnabled);
  });
  applyBotToggleState();
  applyExpandedState();
  appendToBottomDebugDock(wrap);

  let lastRenderedEnabled: boolean | null = null;

  const fmt = (n: number) => n.toFixed(2);
  const yn = (b: boolean) => (b ? "ja" : "nein");
  return {
    render(state): void {
      botEnabled = state.enabled;
      applyBotToggleState();
      if (!state.enabled) {
        title.textContent = "Bot INAKTIV (Taste B / Button)";
        if (lastRenderedEnabled !== false) {
          content.innerHTML =
            '<div style="opacity:0.88;">Bot ist aus — <b>B</b> oder Button zum Aktivieren.</div>';
          lastRenderedEnabled = false;
        }
        return;
      }
      lastRenderedEnabled = true;
      const c = state.context;
      const status = state.enabled ? "AKTIV" : "INAKTIV";
      title.textContent = `Bot ${status} (Taste B / Button)`;
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
