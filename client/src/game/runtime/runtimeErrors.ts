type DebugOverlayLike = {
  update: (model: {
    fps: number;
    roomId: string;
    playerCount: number;
    pingMs: number | null;
    diag?: string;
    warn?: string;
  }) => void;
};

export function installGlobalRuntimeErrorHandlers(debugOverlay: DebugOverlayLike): () => void {
  let disposed = false;
  const onRejection = (ev: PromiseRejectionEvent) => {
    if (disposed) return;
    const msg = ev.reason instanceof Error ? ev.reason.message : String(ev.reason);
    console.error("unhandledrejection", ev.reason);
    debugOverlay.update({
      fps: 0,
      roomId: "FEHLER",
      playerCount: 0,
      pingMs: null,
      diag: undefined,
      warn: `Unhandled: ${msg}`,
    });
  };
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
