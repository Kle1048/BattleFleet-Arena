export type RoomSignal<Callback> = { (callback: Callback): unknown; remove(callback: Callback): void };
export type RoomLeaveSignal = RoomSignal<(code: number, reason?: string) => void>;

/**
 * Colyseus 0.15 signal ownership, using only its public API.
 * remove() swaps/pops and does not tolerate missing callbacks; Room clears all signals
 * before user leave handlers. Defer detach until dispatch completes and skip it after leave.
 * Wrappers are inert immediately on disposal, including during reentrant dispatch.
 */
export function createRoomSignalScope(onLeave: RoomLeaveSignal) {
  let disposed = false;
  let left = false;
  const detach: Array<() => void> = [];
  // This marker must still execute when an earlier leave handler disposed the scope.
  const markLeft = () => { left = true; };
  onLeave(markLeft);

  return {
    listen<Args extends unknown[]>(signal: RoomSignal<(...args: Args) => void>, callback: (...args: Args) => void): void {
      if (disposed || left) return;
      const guarded = (...args: Args) => { if (!disposed) callback(...args); };
      signal(guarded);
      detach.push(() => signal.remove(guarded));
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      queueMicrotask(() => {
        if (!left) {
          for (const remove of detach) remove();
          onLeave.remove(markLeft);
        }
        detach.length = 0;
      });
    },
  };
}
