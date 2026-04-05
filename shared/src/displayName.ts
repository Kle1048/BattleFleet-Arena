/**
 * Anzeigename beim Join (Lobby) — serverseitig autoritativ bereinigt.
 */

export const PLAYER_DISPLAY_NAME_MAX_LEN = 24;

const DEFAULT_NAME = "Spieler";

/**
 * Trimmt, entfernt Steuerzeichen, kürzt. Leer → **Spieler**.
 */
export function sanitizePlayerDisplayName(raw: unknown): string {
  let s = typeof raw === "string" ? raw : "";
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/[\u0000-\u001F\u007F]/g, "");
  if (s.length > PLAYER_DISPLAY_NAME_MAX_LEN) {
    s = s.slice(0, PLAYER_DISPLAY_NAME_MAX_LEN).trim();
  }
  if (s.length === 0) return DEFAULT_NAME;
  return s;
}
