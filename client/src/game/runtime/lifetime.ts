export type Disposable = { dispose(): void };

/** One owner for acquired resources. Release in reverse acquisition order, including
 * partially completed startup. Late async acquisitions are released immediately. */
export function createLifetime(reportError: (error: unknown) => void = error => {
  console.warn("Lifetime cleanup failed", error);
}) {
  let disposed = false;
  const releases = new Set<() => void>();

  function defer(cleanup: () => void): () => void {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      releases.delete(release);
      try { cleanup(); }
      catch (error) {
        // Diagnostics must not prevent release of the owner's remaining resources.
        try { reportError(error); } catch { /* Keep unwinding. */ }
      }
    };
    if (disposed) release();
    else releases.add(release);
    return release;
  }

  return {
    get disposed() { return disposed; },
    defer,
    use<T extends Disposable>(resource: T): T {
      defer(() => resource.dispose());
      return resource;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const release of [...releases].reverse()) release();
      releases.clear();
    },
  };
}

export type Lifetime = ReturnType<typeof createLifetime>;
