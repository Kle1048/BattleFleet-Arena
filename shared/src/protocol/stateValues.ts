/** Transport-neutral scalar values. Schema and simulation may implement these contracts independently. */

export interface PlayerValues {
  id: string;
  x: number;
  z: number;
  headingRad: number;
  speed: number;
  rudder: number;
  /** Mauszielfaden auf der XZ-Welt (authoritativ für Peilung / spätere Waffen). */
  aimX: number;
  aimZ: number;
  /**
   * Sekunden bis zur Zerstörung bei Verlassen des Einsatzgebiets; 0 = nicht außerhalb / kein Countdown.
   * Autoritativ vom Server (~20 Hz aktualisiert).
   */
  oobCountdownSec: number;
  hp: number;
  maxHp: number;
  /** Verbleibende Sekunden bis Primärfeuer bereit (~20 Hz, für HUD). */
  primaryCooldownSec: number;
  /**
   * Lebensphase (Task 6) — siehe `PlayerLifeState` in `playerLife.ts`.
   * Invarianten werden serverseitig durch `assertPlayerLifeInvariant` abgesichert.
   */
  lifeState: string;
  /** Sekunden bis Respawn; >0 nur in `awaiting_respawn`. */
  respawnCountdownSec: number;
  /** Verbleibender Spawn-Schutz in Sekunden; >0 nur in `spawn_protected`. */
  spawnProtectionSec: number;
  /** Sekunden bis ASuM (Sekundär) bereit (~20 Hz). Task 7. */
  secondaryCooldownSec: number;
  /** Sekunden bis Torpedo bereit (~20 Hz). Task 8. */
  torpedoCooldownSec: number;
  /** Runden-Score (Sieg = höchster Wert); sinkt nicht bei Tod (im Gegensatz zu `xp`). */
  score: number;
  /** Task 10 — Kills (tödlicher Treffer). */
  kills: number;
  /** Task 11 — Level 1…10 im aktuellen Leben. */
  level: number;
  /** Task 11 — kumulative XP im aktuellen Leben. */
  xp: number;
  /** Task 12 — `fac` | `destroyer` | `cruiser` (Server setzt aktuell FAC für alle Spieler). */
  shipClass: string;
  /** Anzeigename (Lobby), serverbereinigt, max. Länge s. `displayName.ts`. */
  displayName: string;
  /**
   * Suchrad aktiv — wenn `true`, sendet das Schiff für Gegner eine ESM-Peilung (Passivelektronik).
   * `false` = „Radar aus“, keine ESM-Sichtbarkeit für andere.
   */
  radarActive: boolean;
  /** Eingehende ASuM, die dieses Schiff als Luftverteidigungs-Ziel nutzen (~20 Hz). */
  adHudIncomingAswm: number;
  /** True, wenn mindestens eine eingehende ASuM gemeldet wird (HUD / Hinweise). */
  adHudCanCommitHardkill: boolean;
  /** Legacy-Feld: Hardkill ist vollautomatisch; Wert bleibt 0. */
  adHardkillCommitRemainingSec: number;
  /**
   * True, wenn eine Bedrohung in SAM-Reichweite ist, aber das Suchrad aus ist — SAM schießt nur mit Radar.
   */
  adHudRadarAffectsSam: boolean;
  /** Verbleibende ASuM-Runden Backbord (HUD). */
  aswmRemainingPort: number;
  /** Verbleibende ASuM-Runden Steuerbord (HUD). */
  aswmRemainingStarboard: number;
  /**
   * Serverzeit (ms) beim Übergang zu `awaiting_respawn` — Wrack-Animation / Wrack-Sync.
   * `0` wenn nicht tot.
   */
  deathAtMs: number;
  /**
   * Session-ID des Killers für die letzte Zerstörung; leer bei Umwelt/OOB/ohne Zuordnung.
   * Wird bei Respawn / Match-Reset geleert.
   */
  killedBySessionId: string;
}

export interface MissileValues {
  missileId: number;
  ownerId: string;
  /** Ziel-Session oder leer = geradeaus. */
  targetId: string;
  x: number;
  z: number;
  headingRad: number;
}

export interface TorpedoValues {
  torpedoId: number;
  ownerId: string;
  x: number;
  z: number;
  headingRad: number;
}

export interface WreckValues {
  wreckId: string;
  /** Schiffssimulationsanker (Seekarten-XZ), Bezug für `collisionHitbox` wie bei Spielern. */
  anchorX: number;
  anchorZ: number;
  headingRad: number;
  /** 0…3 — siehe `wreckVariantFromSessionId` / `WreckVariantId`. */
  variant: number;
  shipClass: string;
  /** Start der Sink-Animation (übereinstimmend mit `PlayerState.deathAtMs`). */
  deathAtMs: number;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface MatchValues {
  matchPhase: string;
  matchRemainingSec: number;
}
