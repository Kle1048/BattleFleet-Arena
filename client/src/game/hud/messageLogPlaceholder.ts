/**
 * Platzhalter für ein späteres Melde-/Chat-Log (oben rechts, links neben OPZ).
 */

export function createMessageLogPlaceholder(options?: {
  /** Wenn gesetzt (z. B. `.cockpit-opz`), als erstes Kind — links neben OPZ, Abstand per Flex `gap`. */
  parent?: HTMLElement;
}): { dispose: () => void } {
  const root = document.createElement("div");
  root.className = "message-log-panel";
  root.setAttribute("aria-label", "Comms-Room");
  root.innerHTML = `
    <div class="message-log-head">Comms-Room</div>
    <ul class="message-log-list">
      <li><span class="message-log-time">12:04</span> Verbindung zum OPZ-Kanal …</li>
      <li><span class="message-log-time">12:04</span> Eigene Einheit — Grün, Gegner — Rot (Radar)</li>
      <li><span class="message-log-time">12:05</span> Beispiel: Ziel Peilung 270° — später dynamisch</li>
      <li><span class="message-log-time">12:05</span> Platzhalter — keine Live-Daten</li>
    </ul>
  `;
  const parent = options?.parent ?? document.body;
  if (options?.parent) {
    parent.prepend(root);
  } else {
    parent.appendChild(root);
  }
  return {
    dispose() {
      root.remove();
    },
  };
}
