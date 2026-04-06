/**
 * Voller Bildschirm — kurzer Aufblitz (z. B. Schiffsvernichtung), ohne Pointer-Block.
 */
export function createScreenFlashOverlay(): {
  trigger: (opts?: { intensity?: number }) => void;
  dispose: () => void;
} {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "pointer-events:none;position:fixed;inset:0;z-index:9996;" +
    "background:radial-gradient(ellipse 85% 70% at 50% 42%, rgba(255,252,248,0.94) 0%, rgba(255,210,170,0.42) 38%, rgba(255,160,120,0.12) 58%, transparent 75%);" +
    "opacity:0;";
  document.body.appendChild(el);

  let fadeToken = 0;

  return {
    trigger(opts?: { intensity?: number }) {
      const intensity = Math.max(0, Math.min(1.2, opts?.intensity ?? 1));
      const token = ++fadeToken;
      el.style.transition = "none";
      el.style.opacity = String(0.12 + 0.62 * intensity);

      requestAnimationFrame(() => {
        if (token !== fadeToken) return;
        el.style.transition = "opacity 520ms cubic-bezier(0.22, 1, 0.36, 1)";
        el.style.opacity = "0";
      });
    },
    dispose() {
      fadeToken++;
      el.remove();
    },
  };
}
