type Disposable = { dispose: () => void };

export function createRuntimeShutdown(disposables: readonly Disposable[]): {
  disposeAll: () => void;
  bindWindowUnload: () => void;
} {
  let disposed = false;

  const disposeAll = (): void => {
    if (disposed) return;
    disposed = true;
    for (const d of disposables) {
      try {
        d.dispose();
      } catch (err) {
        console.warn("runtime dispose failed", err);
      }
    }
  };

  const bindWindowUnload = (): void => {
    window.addEventListener("beforeunload", disposeAll, { once: true });
  };

  return { disposeAll, bindWindowUnload };
}
