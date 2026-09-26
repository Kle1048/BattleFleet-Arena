/** Deferred optional UI, deduplicated and safe when its import completes after shutdown. */
export function createLazyResource<T extends { dispose(): void }>(load: () => Promise<T>) {
  let value: T | null = null;
  let pending: Promise<T | null> | null = null;
  let disposed = false;
  return {
    get: () => value,
    ensure(): Promise<T | null> {
      if (disposed) return Promise.resolve(null);
      if (pending) return pending;
      pending = load().then((loaded) => {
        if (disposed) { loaded.dispose(); return null; }
        value = loaded;
        return loaded;
      }).catch((error: unknown) => { pending = null; throw error; });
      return pending;
    },
    dispose() {
      disposed = true;
      value?.dispose();
      value = null;
    },
  };
}
