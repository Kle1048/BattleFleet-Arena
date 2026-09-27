/** Idempotent bounded drain. The host must stop accepting HTTP/matchmaking first. */
export function createShutdown(stopRooms: () => Promise<void>, closeStorage: () => Promise<void>,
  report: (error: unknown) => void, stopDeadlineMs = 4000): () => Promise<boolean> {
  let running: Promise<boolean> | undefined;
  return () => running ??= (async () => {
    let ok = true;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([Promise.resolve().then(stopRooms), new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new Error("Room shutdown deadline exceeded")), stopDeadlineMs);
      })]);
    } catch (error) { ok = false; report(error); }
    finally { clearTimeout(deadline); }
    // Also attempt the drain after a room shutdown failure. The process-level hard
    // deadline is still needed for broken framework/native callbacks.
    try { await closeStorage(); }
    catch (error) { ok = false; report(error); }
    return ok;
  })();
}
