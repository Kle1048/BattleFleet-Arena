/** Max. echte WebSocket-Clients pro `BattleRoom` — muss zu `maxClients` passen. */
export const MAX_HUMAN_CLIENTS_IN_ROOM = 16;

/** Obergrenze Server-Bots pro Raum (unabhängig von `BFA_MIN_ROOM_PLAYERS`). */
export const MAX_SERVER_BOTS = 5;

/**
 * Mindestanzahl **Spieler insgesamt** (Menschen + Bots) im Raum.
 * Liest `BFA_MIN_ROOM_PLAYERS` (Standard **10** wenn unset/leer).
 * Ungültig oder kleiner 1 → **10**; oben mit `MAX_HUMAN_CLIENTS_IN_ROOM` begrenzt.
 */
export function readMinTotalParticipantsFromEnv(): number {
  const raw = process.env.BFA_MIN_ROOM_PLAYERS?.trim();
  if (raw === undefined || raw === "") return 10;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 10;
  return Math.min(MAX_HUMAN_CLIENTS_IN_ROOM, Math.floor(n));
}

/**
 * So viele Server-Bots, dass `humanClients + bots >= minTotalParticipants` (solange `bots ≥ 0`).
 * **Ohne Menschen (`humanClients < 1`) immer 0 Bots** — leere Räume sollen nicht mit hochgelevelten Bots gefüllt werden.
 * Beispiel minTotal=4: 1 Mensch → 3 Bots, 4 Menschen → 0 Bots, 0 Menschen → 0 Bots.
 */
export function desiredServerBotCount(minTotalParticipants: number, humanClients: number): number {
  const h = Math.max(0, Math.floor(humanClients));
  if (h < 1) return 0;
  const target = Math.min(
    MAX_HUMAN_CLIENTS_IN_ROOM,
    Math.max(1, Math.floor(minTotalParticipants)),
  );
  const raw = Math.max(0, target - h);
  return Math.min(MAX_SERVER_BOTS, raw);
}
