/**
 * Match: Dauer, Phasen, **Score** (Sieg = höchstes `score` am Ende).
 * Kills: nur `PROGRESSION_XP_PER_KILL` auf `xp` + `score` (ein gemeinsamer Zähler mit Lebens-XP).
 * Passives XP in `MATCH_PASSIVE_XP_INTERVAL_MS`; in der Sea-Control-Zone × `SEA_CONTROL_XP_MULTIPLIER` (s. `seaControl.ts`).
 */

/** Sichtbar im Schema / HUD (Sekunden). */
export const MATCH_DURATION_SEC = 720;

export const MATCH_DURATION_MS = MATCH_DURATION_SEC * 1000;

/**
 * @deprecated Historisch „Score pro Kill“ — identisch zu `PROGRESSION_XP_PER_KILL` für Vergütung.
 * Behalten für ältere Referenzen; neuer Code nutzt `score` + `PROGRESSION_XP_PER_KILL`.
 */
export const SCORE_PER_KILL = 100;

/** Abstand der passiven XP-Vergabe (alle lebenden Spieler im Einsatz). */
export const MATCH_PASSIVE_XP_INTERVAL_MS = 4000;

/** Basis-XP pro Tick (außerhalb Sea Control). */
export const MATCH_PASSIVE_XP_BASE = 4;

export const MATCH_PHASE_RUNNING = "running";
export const MATCH_PHASE_ENDED = "ended";

export type MatchPhase = typeof MATCH_PHASE_RUNNING | typeof MATCH_PHASE_ENDED;

/** Ob ein Session-Kill gutgeschrieben werden soll (Victim ≠ Killer, Killer gesetzt). */
export function isValidKillAttribution(killerSessionId: string | undefined, victimSessionId: string): boolean {
  if (killerSessionId == null || killerSessionId === "") return false;
  return killerSessionId !== victimSessionId;
}
