import { ArraySchema, Schema, defineTypes } from "@colyseus/schema";
import { ARTILLERY_PLAYER_MAX_HP } from "./artillery";
import { PlayerLifeState } from "./playerLife";

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

export class BattleState extends Schema {
  declare playerList: ArraySchema<PlayerState>;
  declare missileList: ArraySchema<MissileState>;
  declare torpedoList: ArraySchema<TorpedoState>;

  constructor() {
    super();
    this.playerList = new ArraySchema<PlayerState>();
    this.missileList = new ArraySchema<MissileState>();
    this.torpedoList = new ArraySchema<TorpedoState>();
  }
}

defineTypes(BattleState, {
  playerList: [PlayerState],
  missileList: [MissileState],
  torpedoList: [TorpedoState],
});
