/**
 * Touch-/Hybrid-Geräte: weniger Browser-Eingriff (Pinch-Zoom, Kontextmenü, Selektion)
 * während des Spiels. Viewport + Basis-CSS in `index.html`; hier v. a. Safari (`gesture*`).
 */
export function installMobileBrowserChromeGuards(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const touchCapable = (navigator.maxTouchPoints ?? 0) > 0;
  if (!coarse && !touchCapable) return;

  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) {
    vp.setAttribute(
      "content",
      "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
    );
  }

  const passiveFalse: AddEventListenerOptions = { passive: false };
  const blockGesture = (e: Event): void => {
    e.preventDefault();
  };
  document.addEventListener("gesturestart", blockGesture, passiveFalse);
  document.addEventListener("gesturechange", blockGesture, passiveFalse);
  document.addEventListener("gestureend", blockGesture, passiveFalse);

  document.addEventListener(
    "contextmenu",
    (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      if (el.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
    },
    { capture: true },
  );
}
