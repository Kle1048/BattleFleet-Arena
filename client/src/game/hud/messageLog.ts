/**
 * Comms-Room: scrollbares Meldelog (Toasts + manuelle Systemzeilen).
 */

import { t } from "../../locale/t";
import { controlGuideHtml } from "../ui/controlGuide";

export type CommsLogEntry = {
  text: string;
  kind?: "info" | "danger";
};

const MAX_LINES = 80;

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function createMessageLog(options?: {
  showControls?: boolean;
  parent?: HTMLElement;
  playerContent?: HTMLElement;
  scoreContent?: HTMLElement;
  fullscreenParent?: HTMLElement;
  helpParent?: HTMLElement;
  /** Opens the in-game mission briefing overlay (e.g. from Help). */
  onShowHelp?: () => void;
}): {
  append: (e: CommsLogEntry) => void;
  performanceParent: HTMLElement;
  dispose: () => void;
} {
  const root = document.createElement("div");
  const events = new AbortController();
  root.className = "message-log-panel";
  root.setAttribute("aria-label", "Ship information");

  const head = document.createElement("div");
  head.className = "message-log-head message-log-head-row";

  const tabs = document.createElement("div");
  tabs.className = "utility-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Ship information");
  const controlsTab = document.createElement("button");
  const logTab = document.createElement("button");
  const playerTab = document.createElement("button");
  const scoreTab = document.createElement("button");
  const performanceTab = document.createElement("button");
  const showControls = options?.showControls !== false;
  const tabButtons = [playerTab, ...(showControls ? [controlsTab] : []), logTab, scoreTab, performanceTab];
  const tabIcons = {
    player: '<circle cx="12" cy="7" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>',
    controls: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h2m3 0h2m3 0h2m-12 4h2m3 0h2m3 0h2M7 16h10"/>',
    events: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    score: '<path d="M8 3h8v5a4 4 0 0 1-8 0V3Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 1v6m-4 3h8m-4-3-3 3m3-3 3 3"/>',
    performance: '<path d="M3 19h18M5 15V9m7 6V4m7 11v-8"/>',
  };
  for (const [button, name, id] of [[playerTab, "Player Data", "player"], [controlsTab, "Controls", "controls"], [logTab, "Event Log", "events"], [scoreTab, "Score", "score"], [performanceTab, "Performance", "performance"]] as const) {
    button.type = "button";
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${tabIcons[id]}</svg>`;
    button.title = name;
    button.setAttribute("aria-label", name);
    button.id = "utility-tab-" + id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", "utility-panel-" + id);
    if (tabButtons.includes(button)) tabs.appendChild(button);
  }
  const expandBtn = document.createElement("button");
  expandBtn.type = "button";
  expandBtn.className = "utility-expand";
  expandBtn.setAttribute("aria-controls", "utility-body");

  const actions = document.createElement("div");
  actions.className = "message-log-actions";

  if (options?.onShowHelp) {
    const helpBtn = document.createElement("button");
    helpBtn.type = "button";
    helpBtn.className = "message-log-help message-log-help-icon";
    helpBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01"/></svg>';
    helpBtn.title = t("messageLog.helpTitle");
    helpBtn.setAttribute("aria-label", t("messageLog.helpTitle"));
    helpBtn.addEventListener("click", () => {
      if (!events.signal.aborted) options.onShowHelp?.();
    }, { signal: events.signal });
    (options?.helpParent ?? actions).appendChild(helpBtn);
    events.signal.addEventListener("abort", () => helpBtn.remove(), { once: true });
  }

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "message-log-clear";
  clearBtn.textContent = t("messageLog.clear");
  clearBtn.title = t("messageLog.clearTitle");
  clearBtn.setAttribute("aria-label", t("messageLog.clearTitle"));


  const fullscreenBtn = document.createElement("button");
  fullscreenBtn.type = "button";
  fullscreenBtn.className = "message-log-help message-log-fullscreen";

  const fullscreenAvailable = typeof document.documentElement.requestFullscreen === "function" && document.fullscreenEnabled !== false;
  let changingFullscreen = false;
  const syncFullscreen = () => {
    if (events.signal.aborted) return;
    const active = !!document.fullscreenElement;
    fullscreenBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (active ? 'M4 9h5V4m6 0v5h5M4 15h5v5m6 0v-5h5' : 'M9 4H4v5m11-5h5v5M4 15v5h5m6 0h5v-5') + '"/></svg>';
    const label = t(fullscreenAvailable ? (active ? "messageLog.exitFullscreen" : "messageLog.enterFullscreen") : "messageLog.fullscreenUnavailable");
    fullscreenBtn.title = label;
    fullscreenBtn.setAttribute("aria-label", label);
    fullscreenBtn.setAttribute("aria-pressed", String(active));
    fullscreenBtn.disabled = changingFullscreen || !fullscreenAvailable;
  };
  fullscreenBtn.addEventListener("click", async () => {
    if (changingFullscreen || !fullscreenAvailable || events.signal.aborted) return;
    changingFullscreen = true; syncFullscreen();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      append({ text: t("messageLog.fullscreenUnavailable"), kind: "info" });
    } finally {
      changingFullscreen = false; syncFullscreen();
      fullscreenBtn.blur();
    }
  }, { signal: events.signal });
  document.addEventListener("fullscreenchange", syncFullscreen, { signal: events.signal });
  syncFullscreen();
  (options?.fullscreenParent ?? actions).appendChild(fullscreenBtn);
  if (options?.fullscreenParent) fullscreenBtn.classList.add("fullscreen-beside-tac");

  head.appendChild(expandBtn);
  head.appendChild(tabs);
  head.appendChild(clearBtn);
  if (!options?.helpParent || !options?.fullscreenParent) head.appendChild(actions);

  const list = document.createElement("ul");
  list.className = "message-log-list";
  list.id = "game-event-log";
  const body = document.createElement("div");
  body.id = "utility-body";
  const controlsPanel = document.createElement("div");
  if (showControls) controlsPanel.innerHTML = controlGuideHtml(true);
  const logPanel = document.createElement("div");
  const playerPanel = options?.playerContent ?? document.createElement("div");
  const scorePanel = options?.scoreContent ?? document.createElement("div");
  const performancePanel = document.createElement("div");
  for (const [panel, id] of [[playerPanel, "player"], [controlsPanel, "controls"], [logPanel, "events"], [scorePanel, "score"], [performancePanel, "performance"]] as const) {
    panel.id = "utility-panel-" + id;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", "utility-tab-" + id);
    panel.tabIndex = 0;
  }
  logPanel.appendChild(list);
  body.appendChild(playerPanel);
  if (showControls) body.appendChild(controlsPanel);
  body.appendChild(scorePanel);
  body.appendChild(performancePanel);
  body.appendChild(logPanel);
  let expanded = true;
  let selected = playerTab;
  const syncExpanded = () => {
    body.hidden = !expanded;
    playerPanel.hidden = selected !== playerTab;
    scorePanel.hidden = selected !== scoreTab;
    performancePanel.hidden = selected !== performanceTab;
    controlsPanel.hidden = selected !== controlsTab;
    logPanel.hidden = selected !== logTab;
    clearBtn.hidden = !expanded || selected !== logTab;
    expandBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + (expanded ? 'M6 9h12l-6 7Z' : 'M9 6v12l7-6Z') + '"/></svg>';
    expandBtn.setAttribute("aria-expanded", String(expanded));
    expandBtn.setAttribute("aria-label", expanded ? "Collapse information panel" : "Expand information panel");
    for (const button of tabButtons) {
      button.setAttribute("aria-selected", String(button === selected));
      button.tabIndex = button === selected ? 0 : -1;
    }
    if (expanded && selected === logTab) list.scrollTop = list.scrollHeight;
  };
  for (const button of tabButtons) {
    button.addEventListener("click", () => { selected = button; expanded = true; syncExpanded(); }, { signal: events.signal });
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = event.key === "Home" ? 0 : event.key === "End" ? tabButtons.length - 1 :
        (tabButtons.indexOf(button) + (event.key === "ArrowLeft" ? -1 : 1) + tabButtons.length) % tabButtons.length;
      selected = tabButtons[index]!; expanded = true; syncExpanded(); selected.focus();
    }, { signal: events.signal });
  }
  expandBtn.addEventListener("click", () => { expanded = !expanded; syncExpanded(); }, { signal: events.signal });
  syncExpanded();
  root.appendChild(head);
  root.appendChild(body);

  const parent = options?.parent ?? document.body;
  parent.appendChild(root);

  const clear = (): void => {
    list.replaceChildren();
  };
  clearBtn.addEventListener("click", clear, { signal: events.signal });

  const append = (e: CommsLogEntry): void => {
    if (events.signal.aborted) return;
    const li = document.createElement("li");
    li.className = "message-log-line";
    const kind = e.kind ?? "info";
    if (kind === "danger") li.classList.add("message-log-line--danger");

    const t = document.createElement("span");
    t.className = "message-log-time";
    t.textContent = formatTime(new Date());

    const msg = document.createElement("span");
    msg.className = "message-log-text";
    msg.textContent = e.text;

    li.appendChild(t);
    li.appendChild(msg);
    list.appendChild(li);

    while (list.children.length > MAX_LINES) {
      list.removeChild(list.firstChild!);
    }
    if (expanded && selected === logTab) list.scrollTop = list.scrollHeight;
  };

  return {
    append,
    performanceParent: performancePanel,
    dispose() {
      events.abort();
      fullscreenBtn.remove();
      root.remove();
    },
  };
}
