type AcquisitionOptions<T> = {
  signal: AbortSignal;
  timeoutMs: number;
  timeoutMessage: string;
  /** Some APIs (including Colyseus join) cannot abort their in-flight operation. */
  releaseLate(value: T): void | Promise<unknown>;
  reportCleanupError?: (error: unknown) => void;
};

/** Bound startup without orphaning a resource returned after cancellation/timeout.
 * The caller still owns a successful result and must register it immediately. */
export function acquireWithTimeout<T>(pending: Promise<T>, options: AcquisitionOptions<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const detach = () => {
      if (timer !== undefined) clearTimeout(timer);
      options.signal.removeEventListener("abort", abort);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      detach();
      reject(error);
    };
    const abort = () => fail(options.signal.reason ?? new DOMException("Operation aborted", "AbortError"));
    const report = (error: unknown) => {
      try { (options.reportCleanupError ?? console.warn)(error); }
      catch { /* Cleanup diagnostics must not cause an unhandled rejection. */ }
    };

    // Always observe pending, even if cancellation happened before acquisition began.
    pending.then(value => {
      if (settled) {
        try { void Promise.resolve(options.releaseLate(value)).catch(report); }
        catch (error) { report(error); }
        return;
      }
      settled = true;
      detach();
      resolve(value);
    }, fail);
    if (options.signal.aborted) abort();
    else {
      options.signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => fail(new Error(options.timeoutMessage)), options.timeoutMs);
    }
  });
}
