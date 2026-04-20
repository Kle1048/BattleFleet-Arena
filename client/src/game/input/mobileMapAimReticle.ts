import { AIM_CROSSHAIR_SVG } from "./aimCrosshairSvg";
import { isMobileControlSurface } from "./mobileControls";

/**
 * Auf Touch-Oberflächen: gleiches Fadenkreuz wie der Desktop-Cursor, fix an der letzten
 * Pointer-Position **nur** auf dem Spielfeld-Canvas (kein HUD / keine Softkeys).
 */
export function createMobileMapAimReticle(
  canvas: HTMLCanvasElement,
  options?: { enabled?: boolean },
): { dispose: () => void } {
  const enabled = options?.enabled ?? isMobileControlSurface();
  if (!enabled) {
    return { dispose: () => void 0 };
  }

  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "position:fixed;left:0;top:0;width:32px;height:32px;" +
    "transform:translate(-50%,-50%);" +
    "pointer-events:none;z-index:9200;visibility:hidden;" +
    "background-repeat:no-repeat;background-position:center;background-size:contain;" +
    "filter:drop-shadow(0 1px 2px rgba(0,0,0,0.55));";
  const uri = `data:image/svg+xml,${encodeURIComponent(AIM_CROSSHAIR_SVG)}`;
  el.style.backgroundImage = `url("${uri}")`;

  document.body.appendChild(el);

  const prevCursor = canvas.style.cursor;
  canvas.style.cursor = "default";

  const onPointerDown = (e: PointerEvent): void => {
    if (e.target !== canvas) return;
    if (e.button !== 0) return;
    el.style.left = `${e.clientX}px`;
    el.style.top = `${e.clientY}px`;
    el.style.visibility = "visible";
  };

  canvas.addEventListener("pointerdown", onPointerDown);

  return {
    dispose: () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.style.cursor = prevCursor;
      el.remove();
    },
  };
}
