import { diagnosticReport, safeFeedbackUrl, type BetaContext } from "../runtime/betaDiagnostics";

/** App-owned; no automatic reports, clipboard writes or third-party requests. */
export function mountBetaFeedback(build: { id: string; dirty: boolean | null }, feedbackUrl: unknown,
  serverUrl: string, context: () => BetaContext) {
  let disposed = false, modal: HTMLDivElement | undefined;
  let cancelFetch: AbortController | undefined;
  let cancelSubmit: AbortController | undefined;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `Beta ${build.id.slice(0,12)}${build.dirty !== false ? "*" : ""} · Feedback`;
  button.style.cssText = "position:fixed;right:8px;top:8px;z-index:350;padding:6px 9px;background:#152638;color:#eef6ff;border:1px solid #8696a8;border-radius:6px;font:12px system-ui;cursor:pointer;";
  const close = () => { cancelFetch?.abort(); cancelSubmit?.abort(); modal?.remove(); modal = undefined; if (!disposed) button.focus(); };
  const open = () => {
    if (disposed || modal) return;
    const root = modal = document.createElement("div");
    root.className = "class-picker-overlay";
    root.style.zIndex = "10000";
    root.style.background = "rgba(0,0,0,.65)";
    root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "Beta feedback and diagnostics");
    const panel = document.createElement("div"); panel.className = "class-picker-panel";
    panel.style.cssText = "box-sizing:border-box;width:min(640px,92vw);max-width:640px;max-height:90vh;overflow:auto;transform:none;background:#101f30;font-size:14px;";
    const title = document.createElement("h2"); title.textContent = "Beta feedback";
    const note = document.createElement("p");
    note.textContent = "Send feedback privately to the project team. Describe what happened, what you expected and how to reproduce it. Do not include passwords, personal details or other players' names. Diagnostics are optional; browser and room details may identify your test session. Nothing is sent until you click Send.";
    const fields = document.createElement("div");
    fields.style.cssText = "display:grid;gap:10px;margin:12px 0;";
    const category = document.createElement("select");
    for (const value of ["bug", "performance", "balance", "idea", "other"]) {
      const option = document.createElement("option"); option.value = value; option.textContent = value; category.appendChild(option);
    }
    const subject = document.createElement("input"); subject.maxLength = 120; subject.minLength = 5;
    const description = document.createElement("textarea"); description.maxLength = 2000; description.rows = 5;
    const consent = document.createElement("input"); consent.type = "checkbox"; consent.checked = false;
    const fieldStyle = "box-sizing:border-box;width:100%;padding:8px;border:1px solid #718399;border-radius:5px;background:#071421;color:#eef6ff;font:inherit;";
    for (const input of [category, subject, description]) input.style.cssText = fieldStyle;
    for (const [caption, input] of [["Category", category], ["Title (5–120 characters)", subject],
      ["What happened / reproduction steps (10–2000 characters)", description], ["Include the diagnostic preview below", consent]] as const) {
      const label = document.createElement("label"); label.textContent = caption; label.style.cssText = "display:grid;gap:4px;";
      if (input === consent) label.style.cssText = "display:flex;gap:10px;align-items:center;";
      label.appendChild(input); fields.appendChild(label);
    }
    const send = document.createElement("button"); send.type = "button"; send.textContent = "Send feedback privately";
    fields.appendChild(send);
    const preview = document.createElement("textarea"); preview.readOnly = true; preview.rows = 5;
    preview.setAttribute("aria-label", "Diagnostic preview"); preview.style.cssText = fieldStyle + "font:11px monospace;";
    const status = document.createElement("p"); status.setAttribute("role", "status");
    const copy = document.createElement("button"); copy.type = "button"; copy.textContent = "Copy diagnostics";
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(preview.value); if (modal === root) status.textContent = "Copied. Paste only if you want to share these details."; }
      catch { if (modal === root) { preview.focus(); preview.select(); status.textContent = "Clipboard unavailable. Copy the selected text manually."; } }
    };
    const url = safeFeedbackUrl(feedbackUrl);
    const feedback = document.createElement("a"); feedback.textContent = url ? "Alternative feedback channel" : "Feedback is stored privately in the project's admin inbox.";
    if (url) { feedback.href = url; feedback.target = "_blank"; feedback.rel = "noopener noreferrer"; }
    feedback.style.cssText = "display:block;margin:12px 0;color:#b5ddff;";
    const done = document.createElement("button"); done.type = "button"; done.textContent = "Close"; done.onclick = close;
    for (const action of [send, copy, done]) action.style.cssText = "padding:9px 12px;border:1px solid #718399;border-radius:5px;background:#204c72;color:#fff;cursor:pointer;";
    root.onkeydown = event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "Tab") {
        const focusable: HTMLElement[] = [category, subject, description, consent, ...(!send.disabled ? [send] : []), preview, copy, ...(url ? [feedback] : []), done];
        const index = focusable.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length]?.focus();
      }
    };
    const browser = { userAgent: navigator.userAgent, width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio };
    const captured = context(), capturedAt = new Date();
    const render = (server: unknown) => { preview.value = JSON.stringify(diagnosticReport(build, server, captured, browser, capturedAt), null, 2); };
    render(null);
    panel.append(title, note, fields, preview, status, copy, feedback, done); root.appendChild(panel); document.body.appendChild(root); subject.focus();
    const apiBase = serverUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:").replace(/\/$/, "");
    let requestId = "", previousPayload = "", submitting = false, submitted = false;
    send.onclick = async () => {
      if (submitting || submitted) return;
      if (subject.value.trim().length < 5 || description.value.trim().length < 10) {
        status.textContent = "Please enter a title (at least 5 characters) and description (at least 10)."; return;
      }
      cancelFetch?.abort(); // Keep the preview stable for idempotent retries.
      const payload = JSON.stringify({ category: category.value, title: subject.value.trim(), description: description.value.trim(),
        diagnostics: consent.checked ? JSON.parse(preview.value) : null });
      if (payload !== previousPayload) { requestId = crypto.randomUUID(); previousPayload = payload; }
      submitting = true; send.disabled = true;
      const controller = cancelSubmit = new AbortController();
      const deadline = setTimeout(() => controller.abort(), 10_000);
      status.textContent = "Sending feedback…";
      try {
        const response = await fetch(apiBase + "/api/feedback", { method: "POST", credentials: "omit", signal: controller.signal,
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(payload), id: requestId }) });
        if (!response.ok) throw new Error(response.status === 429 ? "Please wait a minute before retrying." : "Feedback could not be saved. Check the fields or retry later.");
        const result = await response.json() as { id?: unknown };
        if (result.id !== requestId) throw new Error("Receipt not confirmed. Retry to check the same submission.");
        submitted = true;
        if (modal === root) { status.textContent = `Thank you! Saved as ${requestId}.`; send.textContent = "Feedback saved"; }
      } catch (error) {
        if (modal === root) status.textContent = controller.signal.aborted ? "No receipt received. Retry with unchanged fields to avoid a duplicate." : String((error as Error).message);
      } finally { clearTimeout(deadline); submitting = false; if (modal === root) send.disabled = submitted; }
    };
    const abort = cancelFetch = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 4000);
    status.textContent = "Checking server version…";
    const versionUrl = apiBase + "/api/version";
    void fetch(versionUrl, { signal: abort.signal, cache: "no-store", credentials: "omit" })
      .then(async response => {
        if (!response.ok) throw new Error("Version unavailable");
        const value: unknown = await response.json();
        if (!disposed && modal === root && !abort.signal.aborted) { render(value); if (!submitting && !submitted) status.textContent = "Preview ready. Server values describe the current configuration, not necessarily the whole past round."; }
      }).catch(() => { if (!disposed && modal === root && !submitting && !submitted) status.textContent = "Server version unavailable. Client diagnostics are still available."; })
      .finally(() => clearTimeout(timeout));
  };
  button.addEventListener("click", open); document.body.appendChild(button);
  return { dispose() { if (disposed) return; disposed = true; close(); button.removeEventListener("click", open); button.remove(); } };
}
