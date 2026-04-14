/** Gemeinsamer Anker unten mittig für Bot- und Environment-Debug-Panels (`#bottom-debug-dock` in index.html). */
export const BOTTOM_DEBUG_DOCK_ID = "bottom-debug-dock";

export function appendToBottomDebugDock(el: HTMLElement): void {
  const dock = document.getElementById(BOTTOM_DEBUG_DOCK_ID);
  (dock ?? document.body).appendChild(el);
}
