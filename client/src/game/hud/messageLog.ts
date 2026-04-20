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
}): {
  append: (e: CommsLogEntry) => void;
  dispose: () => void;
} {
  const root = document.createElement("div");
  root.className = "message-log-panel";
  root.setAttribute("aria-label", t("messageLog.panelTitle"));

  const head = document.createElement("div");
  head.className = "message-log-head message-log-head-row";

  const headTitle = document.createElement("span");
  headTitle.className = "message-log-title";
  headTitle.textContent = t("messageLog.panelTitle");

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "message-log-clear";
  clearBtn.textContent = t("messageLog.clear");
  clearBtn.title = t("messageLog.clearTitle");
  clearBtn.setAttribute("aria-label", t("messageLog.clearTitle"));

  head.appendChild(headTitle);
  head.appendChild(clearBtn);

  const list = document.createElement("ul");
  list.className = "message-log-list";

  root.appendChild(head);
  root.appendChild(list);

  const parent = options?.parent ?? document.body;
  if (options?.parent) {
    parent.prepend(root);
  } else {
    parent.appendChild(root);
  }

  const clear = (): void => {
    list.replaceChildren();
  };
  clearBtn.addEventListener("click", () => clear());

  const append = (e: CommsLogEntry): void => {
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
      root.remove();
    },
  };
}
