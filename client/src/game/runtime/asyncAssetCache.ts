/** Deduplicated, bounded background loads. Failures stay cached for this session. */
export function createAsyncAssetCache<K, T>(options: {
  load: (key: K, signal: AbortSignal) => Promise<T>;
  disposeValue?: (value: T) => void;
  concurrency?: number;
  timeoutMs?: number;
  onError?: (key: K, error: unknown) => void;
}) {
  const values = new Map<K, T>();
  const promises = new Map<K, Promise<T | null>>();
  const pending: Array<() => void> = [];
  const active = new Set<AbortController>();
  let disposed = false;
  const pump = (): void => {
    while (pending.length && active.size < (options.concurrency ?? 2)) pending.shift()!();
  };
  return {
    get: (key: K): T | undefined => values.get(key),
    load(key: K): Promise<T | null> {
      if (disposed) return Promise.resolve(null);
      const hit = promises.get(key);
      if (hit) return hit;
      const promise = new Promise<T | null>((resolve) => {
        pending.push(() => {
          if (disposed) { resolve(null); return; }
          const controller = new AbortController();
          active.add(controller);
          let finished = false;
          const finish = (value: T | null): void => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            active.delete(controller);
            resolve(value);
            pump();
          };
          const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
          controller.signal.addEventListener("abort", () => finish(null), { once: true });
          Promise.resolve().then(() => options.load(key, controller.signal)).then((value) => {
            if (finished || disposed) { options.disposeValue?.(value); return; }
            values.set(key, value);
            finish(value);
          }, (error: unknown) => {
            if (!finished) options.onError?.(key, error);
            finish(null);
          });
        });
      });
      promises.set(key, promise);
      pump();
      return promise;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const controller of [...active]) controller.abort();
      pump();
      for (const value of values.values()) options.disposeValue?.(value);
      values.clear();
      promises.clear();
    },
  };
}

export async function fetchAssetBytes(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Asset request failed: ${response.status} ${url}`);
  return response.arrayBuffer();
}
