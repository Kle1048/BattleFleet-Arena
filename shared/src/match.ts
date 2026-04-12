/**
 * Task 10 — Match, Score (MVP): FFA-Timer, Kill-Punkte ohne Assist-Logik.
 * Kill geht an den **tödlichen Treffer** (letzter Schaden bis HP 0); Umgebung (OOB) zählt nicht.
 */

/** Sichtbar im Schema / HUD (Sekunden). */
export const MATCH_DURATION_SEC = 720;

export const MATCH_DURATION_MS = MATCH_DURATION_SEC * 1000;

/** Punkte pro Kill — keine Teilassistenz (nur letzter Treffer). */
export const SCORE_PER_KILL = 100;

export const MATCH_PHASE_RUNNING = "running";
export const MATCH_PHASE_ENDED = "ended";

export type MatchPhase = typeof MATCH_PHASE_RUNNING | typeof MATCH_PHASE_ENDED;

/** Ob ein Session-Kill gutgeschrieben werden soll (Victim ≠ Killer, Killer gesetzt). */
export function isValidKillAttribution(killerSessionId: string | undefined, victimSessionId: string): boolean {
  if (killerSessionId == null || killerSessionId === "") return false;
  return killerSessionId !== victimSessionId;
}
