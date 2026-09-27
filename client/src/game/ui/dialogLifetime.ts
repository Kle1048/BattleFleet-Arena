/** A temporary dialog owns its listeners and queued focus, including while its
 * caller is awaiting the user's choice. Aborting never submits the dialog. */
export function waitForDialog(
  root: HTMLElement,
  submit: HTMLElement,
  options: { signal?: AbortSignal; enterInput?: HTMLElement } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const detach = () => {
      submit.removeEventListener("click", finish);
      options.enterInput?.removeEventListener("keydown", onKey);
      options.signal?.removeEventListener("abort", abort);
      root.remove();
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      detach();
      resolve();
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      detach();
      reject(options.signal?.reason ?? new DOMException("Dialog aborted", "AbortError"));
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") { event.preventDefault(); finish(); }
    };
    if (options.signal?.aborted) { abort(); return; }
    submit.addEventListener("click", finish);
    options.enterInput?.addEventListener("keydown", onKey);
    options.signal?.addEventListener("abort", abort, { once: true });
    document.body.appendChild(root);
    queueMicrotask(() => { if (!settled) (options.enterInput ?? submit).focus(); });
  });
}
