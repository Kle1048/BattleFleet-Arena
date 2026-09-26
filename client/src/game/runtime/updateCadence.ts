/** No catch-up bursts after a suspended tab; critical state changes can bypass the interval. */
export function createUpdateCadence(intervalMs: number): (now: number, force?: boolean) => boolean {
  let last = -Infinity;
  return (now, force = false) => {
    if (!force && now >= last && now - last + 0.001 < intervalMs) return false;
    last = now;
    return true;
  };
}
