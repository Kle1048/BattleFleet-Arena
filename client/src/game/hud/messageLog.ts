/**
 * Comms-Room: scrollbares Meldelog (Toasts + manuelle Systemzeilen).
 */

import { t } from "../../locale/t";

export type CommsLogEntry = {
  text: string;
  kind?: "info" | "danger";
};

const MAX_LINES = 80;

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function createMessageLog(options?: {
  parent?: HTMLElement;
  fullscreenParent?: HTMLElement;
  /** Opens the in-game mission briefing overlay (e.g. from Help). */
  onShowHelp?: () => void;
}): {
  append: (e: CommsLogEntry) => void;
  dispose: () => void;
} {
  const root = document.createElement("div");
  const events = new AbortController();
  root.className = "message-log-panel";
  root.setAttribute("aria-label", t("messageLog.panelTitle"));

  const head = document.createElement("div");
  head.className = "message-log-head message-log-head-row";

  const headTitle = document.createElement("span");
  headTitle.className = "message-log-title";
  headTitle.textContent = t("messageLog.panelTitle");

  const actions = document.createElement("div");
  actions.className = "message-log-actions";

  if (options?.onShowHelp) {
    const helpBtn = document.createElement("button");
    helpBtn.type = "button";
    helpBtn.className = "message-log-help";
    helpBtn.textContent = t("messageLog.help");
    helpBtn.title = t("messageLog.helpTitle");
    helpBtn.setAttribute("aria-label", t("messageLog.helpTitle"));
    helpBtn.addEventListener("click", () => {
      if (!events.signal.aborted) options.onShowHelp?.();
    }, { signal: events.signal });
    actions.appendChild(helpBtn);
  }

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "message-log-clear";
  clearBtn.textContent = t("messageLog.clear");
  clearBtn.title = t("messageLog.clearTitle");
  clearBtn.setAttribute("aria-label", t("messageLog.clearTitle"));
  actions.appendChild(clearBtn);

  const fullscreenBtn = document.createElement("button");
  fullscreenBtn.type = "button";
  fullscreenBtn.className = "message-log-help message-log-fullscreen";
  fullscreenBtn.textContent = "⛶";
  const fullscreenAvailable = typeof document.documentElement.requestFullscreen === "function" && document.fullscreenEnabled !== false;
  let changingFullscreen = false;
  const syncFullscreen = () => {
    if (events.signal.aborted) return;
    const active = !!document.fullscreenElement;
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

  head.appendChild(headTitle);
  head.appendChild(actions);

  const list = document.createElement("ul");
  list.className = "message-log-list";

  root.appendChild(head);
  root.appendChild(list);

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
    list.scrollTop = list.scrollHeight;
  };

  return {
    append,
    dispose() {
      events.abort();
      fullscreenBtn.remove();
      root.remove();
    },
  };
}
