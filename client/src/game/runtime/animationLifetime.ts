import { createLifetime } from "./lifetime";

export type AnimationClock = {
  now(): number;
  request(callback: () => void): number;
  cancel(id: number): void;
  delay(callback: () => void, ms: number): number;
  clearDelay(id: number): void;
};

/** Owns independent short-lived FX without changing their rAF/timer cadence.
 * Completed callbacks and released meshes leave the registry immediately. */
export function createAnimationLifetime(clock: AnimationClock = {
  now: () => performance.now(),
  request: callback => requestAnimationFrame(callback),
  cancel: id => cancelAnimationFrame(id),
  delay: (callback, ms) => window.setTimeout(callback, ms),
  clearDelay: id => window.clearTimeout(id),
}) {
  const lifetime = createLifetime();
  function schedule(callback: () => void, request: (run: () => void) => number, cancel: (id: number) => void) {
    if (lifetime.disposed) return;
    let finished = false;
    const id = request(() => {
      if (finished || lifetime.disposed) return;
      finished = true;
      release();
      try { callback(); }
      catch (error) { lifetime.dispose(); throw error; }
    });
    const release = lifetime.defer(() => {
      if (!finished) { finished = true; cancel(id); }
    });
  }
  return {
    get disposed() { return lifetime.disposed; },
    now: clock.now,
    own: lifetime.defer,
    frame: (callback: () => void) => schedule(callback, clock.request, clock.cancel),
    delay: (callback: () => void, ms: number) => schedule(callback, run => clock.delay(run, ms), clock.clearDelay),
    dispose: lifetime.dispose,
  };
}

export type AnimationLifetime = ReturnType<typeof createAnimationLifetime>;
