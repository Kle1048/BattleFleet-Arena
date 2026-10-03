import { waitForDialog } from "./dialogLifetime";

/** Text-only, abortable notice. Retry delay is capped and never triggers an automatic join. */
export async function showConnectionNotice(message: string, signal: AbortSignal, retryAttempt = 0): Promise<void> {
  const root = document.createElement("div");
  root.className = "class-picker-overlay";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Connection status");
  const panel = document.createElement("div");
  panel.className = "class-picker-panel";
  const text = document.createElement("p");
  text.setAttribute("role", "status");
  text.textContent = message;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "class-picker-continue-btn";
  const label = retryAttempt ? "Try again" : "Return to lobby";
  let remaining = retryAttempt ? Math.min(8, 2 ** Math.min(retryAttempt, 3)) : 0;
  const update = () => {
    button.disabled = remaining > 0;
    button.textContent = remaining > 0 ? `${label} (${remaining}s)` : label;
  };
  update();
  panel.append(text, button); root.appendChild(panel);
  const timer = setInterval(() => { if (remaining > 0) { remaining--; update(); if (!remaining) button.focus(); } }, 1000);
  try { await waitForDialog(root, button, { signal, canSubmit: () => remaining === 0 }); }
  finally { clearInterval(timer); }
}
