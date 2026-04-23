import { ArraySchema, Schema, defineTypes } from "@colyseus/schema";
import { ARTILLERY_PLAYER_MAX_HP } from "./artillery";
import { operationalHalfExtentFromParticipantCount } from "./mapBounds";
import { MATCH_DURATION_SEC, MATCH_PHASE_RUNNING } from "./match";
import { PlayerLifeState } from "./playerLife";
import { SHIP_CLASS_FAC } from "./shipClass";

/**
 * Keine Klassenfeld-Initialisierer (`id = ""`, `playerList = new ArraySchema()`) bei target ES2022:
 * Die werden als eigene Properties angelegt und laufen nicht über die defineTypes-Setter — dann fehlt
 * setParent() an der ArraySchema / ReferenceTracker, und encode → getNextUniqueId wirft.
 */
export class PlayerState extends Schema {
  declare id: string;
  declare x: number;
  declare z: number;
  declare headingRad: number;
  declare speed: number;
  declare rudder: number;
  /** Mauszielfaden auf der XZ-Welt (authoritativ für Peilung / spätere Waffen). */
  declare aimX: number;
  declare aimZ: number;
  /**
   * Sekunden bis zur Zerstörung bei Verlassen des Einsatzgebiets; 0 = nicht außerhalb / kein Countdown.
   * Autoritativ vom Server (~20 Hz aktualisiert).
   */
  declare oobCountdownSec: number;
  declare hp: number;
  declare maxHp: number;
  /** Verbleibende Sekunden bis Primärfeuer bereit (~20 Hz, für HUD). */
  declare primaryCooldownSec: number;
  /**
   * Lebensphase (Task 6) — siehe `PlayerLifeState` in `playerLife.ts`.
   * Invarianten werden serverseitig durch `assertPlayerLifeInvariant` abgesichert.
   */
  declare lifeState: string;
  /** Sekunden bis Respawn; >0 nur in `awaiting_respawn`. */
  declare respawnCountdownSec: number;
  /** Verbleibender Spawn-Schutz in Sekunden; >0 nur in `spawn_protected`. */
  declare spawnProtectionSec: number;
  /** Sekunden bis ASuM (Sekundär) bereit (~20 Hz). Task 7. */
  declare secondaryCooldownSec: number;
  /** Sekunden bis Torpedo bereit (~20 Hz). Task 8. */
  declare torpedoCooldownSec: number;
  /** Runden-Score (Sieg = höchster Wert); sinkt nicht bei Tod (im Gegensatz zu `xp`). */
  declare score: number;
  /** Task 10 — Kills (tödlicher Treffer). */
  declare kills: number;
  /** Task 11 — Level 1…10 im aktuellen Leben. */
  declare level: number;
  /** Task 11 — kumulative XP im aktuellen Leben. */
  declare xp: number;
  /** Task 12 — `fac` | `destroyer` | `cruiser` (Server setzt aktuell FAC für alle Spieler). */
  declare shipClass: string;
  /** Anzeigename (Lobby), serverbereinigt, max. Länge s. `displayName.ts`. */
  declare displayName: string;
  /**
   * Suchrad aktiv — wenn `true`, sendet das Schiff für Gegner eine ESM-Peilung (Passivelektronik).
   * `false` = „Radar aus“, keine ESM-Sichtbarkeit für andere.
   */
  declare radarActive: boolean;
  /** Eingehende ASuM, die dieses Schiff als Luftverteidigungs-Ziel nutzen (~20 Hz). */
  declare adHudIncomingAswm: number;
  /** True, wenn mindestens eine eingehende ASuM gemeldet wird (HUD / Hinweise). */
  declare adHudCanCommitHardkill: boolean;
  /** Legacy-Feld: Hardkill ist vollautomatisch; Wert bleibt 0. */
  declare adHardkillCommitRemainingSec: number;
  /**
   * True, wenn eine Bedrohung in SAM-Reichweite ist, aber das Suchrad aus ist — SAM schießt nur mit Radar.
   */
  declare adHudRadarAffectsSam: boolean;
  /** Verbleibende ASuM-Runden Backbord (HUD). */
  declare aswmRemainingPort: number;
  /** Verbleibende ASuM-Runden Steuerbord (HUD). */
  declare aswmRemainingStarboard: number;
  /**
   * Serverzeit (ms) beim Übergang zu `awaiting_respawn` — Wrack-Animation / Wrack-Sync.
   * `0` wenn nicht tot.
   */
  declare deathAtMs: number;
  /**
   * Session-ID des Killers für die letzte Zerstörung; leer bei Umwelt/OOB/ohne Zuordnung.
   * Wird bei Respawn / Match-Reset geleert.
   */
  declare killedBySessionId: string;

  constructor() {
    super();
    this.id = "";
    this.x = 0;
    this.z = 0;
    this.headingRad = 0;
    this.speed = 0;
    this.rudder = 0;
    this.aimX = 0;
    this.aimZ = 0;
    this.oobCountdownSec = 0;
    this.hp = ARTILLERY_PLAYER_MAX_HP;
    this.maxHp = ARTILLERY_PLAYER_MAX_HP;
    this.primaryCooldownSec = 0;
    this.lifeState = PlayerLifeState.Alive;
    this.respawnCountdownSec = 0;
    this.spawnProtectionSec = 0;
    this.secondaryCooldownSec = 0;
    this.torpedoCooldownSec = 0;
    this.score = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.shipClass = SHIP_CLASS_FAC;
    this.displayName = "";
    this.radarActive = true;
    this.adHudIncomingAswm = 0;
    this.adHudCanCommitHardkill = false;
    this.adHardkillCommitRemainingSec = 0;
    this.adHudRadarAffectsSam = false;
    this.aswmRemainingPort = 0;
    this.aswmRemainingStarboard = 0;
    this.deathAtMs = 0;
    this.killedBySessionId = "";
  }
}

defineTypes(PlayerState, {
  id: "string",
  x: "number",
  z: "number",
  headingRad: "number",
  speed: "number",
  rudder: "number",
  aimX: "number",
  aimZ: "number",
  oobCountdownSec: "number",
  hp: "number",
  maxHp: "number",
  primaryCooldownSec: "number",
  lifeState: "string",
  respawnCountdownSec: "number",
  spawnProtectionSec: "number",
  secondaryCooldownSec: "number",
  torpedoCooldownSec: "number",
  score: "number",
  kills: "number",
  level: "number",
  xp: "number",
  shipClass: "string",
  displayName: "string",
  radarActive: "boolean",
  adHudIncomingAswm: "number",
  adHudCanCommitHardkill: "boolean",
  adHardkillCommitRemainingSec: "number",
  adHudRadarAffectsSam: "boolean",
  aswmRemainingPort: "number",
  aswmRemainingStarboard: "number",
  deathAtMs: "number",
  killedBySessionId: "string",
});

/** Replizierte Lenkflugkörper (Task 7); Server autoritativ. */
export class MissileState extends Schema {
  declare missileId: number;
  declare ownerId: string;
  /** Ziel-Session oder leer = geradeaus. */
  declare targetId: string;
  declare x: number;
  declare z: number;
  declare headingRad: number;

  constructor() {
    super();
    this.missileId = 0;
    this.ownerId = "";
    this.targetId = "";
    this.x = 0;
    this.z = 0;
    this.headingRad = 0;
  }
}

defineTypes(MissileState, {
  missileId: "number",
  ownerId: "string",
  targetId: "string",
  x: "number",
  z: "number",
  headingRad: "number",
});

/** Replizierte Torpedos (Task 8); geradeaus, langsamer als ASuM. */
export class TorpedoState extends Schema {
  declare torpedoId: number;
  declare ownerId: string;
  declare x: number;
  declare z: number;
  declare headingRad: number;

  constructor() {
    super();
    this.torpedoId = 0;
    this.ownerId = "";
    this.x = 0;
    this.z = 0;
    this.headingRad = 0;
  }
}

defineTypes(TorpedoState, {
  torpedoId: "number",
  ownerId: "string",
  x: "number",
  z: "number",
  headingRad: "number",
});

/** Statisches Wrack (Hitbox-OBB wie Schiff–Schiff); entsteht beim Respawn nach Zerstörung. */
export class ShipWreckState extends Schema {
  declare wreckId: string;
  /** Schiffssimulationsanker (Seekarten-XZ), Bezug für `collisionHitbox` wie bei Spielern. */
  declare anchorX: number;
  declare anchorZ: number;
  declare headingRad: number;
  /** 0…3 — siehe `wreckVariantFromSessionId` / `WreckVariantId`. */
  declare variant: number;
  declare shipClass: string;
  /** Start der Sink-Animation (übereinstimmend mit `PlayerState.deathAtMs`). */
  declare deathAtMs: number;
  declare createdAtMs: number;
  declare expiresAtMs: number;

  constructor() {
    super();
    this.wreckId = "";
    this.anchorX = 0;
    this.anchorZ = 0;
    this.headingRad = 0;
    this.variant = 0;
    this.shipClass = "";
    this.deathAtMs = 0;
    this.createdAtMs = 0;
    this.expiresAtMs = 0;
  }
}

defineTypes(ShipWreckState, {
  wreckId: "string",
  anchorX: "number",
  anchorZ: "number",
  headingRad: "number",
  variant: "number",
  shipClass: "string",
  deathAtMs: "number",
  createdAtMs: "number",
  expiresAtMs: "number",
});

export class BattleState extends Schema {
  declare playerList: ArraySchema<PlayerState>;
  declare missileList: ArraySchema<MissileState>;
  declare torpedoList: ArraySchema<TorpedoState>;
  declare wreckList: ArraySchema<ShipWreckState>;
  /** Task 10 — `running` | `ended`. */
  declare matchPhase: string;
  /** Task 10 — verbleibende Sekunden (~20 Hz), 0 wenn beendet. */
  declare matchRemainingSec: number;
  /**
   * Halbe Kantenlänge des Einsatzgebiets (m), autoritativ; skaliert mit `playerList.length`
   * (Menschen + Server-Bots). Client: roter AO-Rand, gleiche Logik wie Server-OOB.
   */
  declare operationalAreaHalfExtent: number;

  constructor() {
    super();
    this.playerList = new ArraySchema<PlayerState>();
    this.missileList = new ArraySchema<MissileState>();
    this.torpedoList = new ArraySchema<TorpedoState>();
    this.wreckList = new ArraySchema<ShipWreckState>();
    this.matchPhase = MATCH_PHASE_RUNNING;
    this.matchRemainingSec = MATCH_DURATION_SEC;
    this.operationalAreaHalfExtent = operationalHalfExtentFromParticipantCount(0);
  }
}

defineTypes(BattleState, {
  playerList: [PlayerState],
  missileList: [MissileState],
  torpedoList: [TorpedoState],
  wreckList: [ShipWreckState],
  matchPhase: "string",
  matchRemainingSec: "number",
  operationalAreaHalfExtent: "number",
});
