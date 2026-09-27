import type { ShipMovementState } from "@battlefleet/shared/rules";

/** Server-only state: input, deadlines and ammunition are not network-owned. */
export type ParticipantState = {
  ship: ShipMovementState;
  lastRudderInput: number;
  aimX: number;
  aimZ: number;
  mineSpawnLocalZ: number;
  oobSinceMs: number | null;
  /** Epoch-Millisekunden ab dem Primärfeuer erlaubt ist. */
  primaryReadyAtMs: number;
  /** ASuM-Runden Magazin (Backbord / Steuerbord). */
  aswmRemainingPort: number;
  aswmRemainingStarboard: number;
  /** Epoch-Millisekunden ab dem nächsten ASuM-Schuss erlaubt ist (bei Magazin > 0). */
  aswmNextShotAtMs: number;
  /** Epoch-Millisekunden bis Magic Reload fertig; 0 = nicht im Reload. */
  aswmReloadUntilMs: number;
  /** Epoch-Millisekunden ab Torpedo-Start erlaubt ist. */
  torpedoReadyAtMs: number;
  /** Hardkill-Schichten: früheste nächste Schusszeit (0 = sofort verfügbar). */
  adSamNextAtMs: number;
  adPdNextAtMs: number;
  adCiwsNextAtMs: number;
  /** Softkill (ECM): letzter Versuch (Epoch-Millisekunden). */
  adSoftkillLastUsedAtMs: number;
  /** Nach Tod: Zeitpunkt des Respawns; `null` wenn nicht wartend. */
  respawnAtMs: number | null;
  /** Nach Respawn: Ende der Schutzphase; `0` = keine Invulnerabilität. */
  invulnerableUntilMs: number;
  /** Suchrad — ESM-Emission für Gegner. */
  radarActive: boolean;
};
