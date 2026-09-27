type FrameClock = {
  now(): number;
  request(callback: (now: number) => void): number;
  cancel(id: number): void;
};

/** App-owned rAF loop. Stopping invalidates even a callback already dequeued by the
 * browser; stopping/restarting inside a frame must never schedule a second loop. */
export function createFrameScheduler(
  onError: (error: unknown) => void,
  clock: FrameClock = {
    now: () => performance.now(),
    request: callback => requestAnimationFrame(callback),
    cancel: id => cancelAnimationFrame(id),
  },
) {
  let disposed = false;
  let generation = 0;
  let pending: number | undefined;

  function stop() {
    generation++;
    if (pending !== undefined) clock.cancel(pending);
    pending = undefined;
  }

  return {
    start(step: (now: number, dtMs: number) => void) {
      if (disposed) return;
      stop();
      const activeGeneration = generation;
      let previous = clock.now();
      const frame = (now: number) => {
        if (disposed || generation !== activeGeneration) return;
        pending = undefined;
        const dtMs = Math.max(0, now - previous);
        previous = now;
        try { step(now, dtMs); }
        catch (error) { stop(); onError(error); return; }
        if (!disposed && generation === activeGeneration) pending = clock.request(frame);
      };
      pending = clock.request(frame);
    },
    stop,
    dispose() { if (disposed) return; disposed = true; stop(); },
  };
}
