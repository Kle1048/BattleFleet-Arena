import { MAX_HUMAN_CLIENTS_IN_ROOM } from "./simulation/systems/botPopulation.js";
export { MAX_HUMAN_CLIENTS_IN_ROOM, MAX_SERVER_BOTS, desiredServerBotCount } from "./simulation/systems/botPopulation.js";

/** Environment parsing belongs to the host; the population policy itself is portable. */
export function readMinTotalParticipantsFromEnv(): number {
  const raw = process.env.BFA_MIN_ROOM_PLAYERS?.trim();
  if (raw === undefined || raw === "") return 10;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 10;
  return Math.min(MAX_HUMAN_CLIENTS_IN_ROOM, Math.floor(n));
}
