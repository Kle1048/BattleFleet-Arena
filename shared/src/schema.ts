import { ArraySchema, Schema, defineTypes } from "@colyseus/schema";
import { ARTILLERY_PLAYER_MAX_HP } from "./artillery";

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
});

export class BattleState extends Schema {
  declare playerList: ArraySchema<PlayerState>;

  constructor() {
    super();
    this.playerList = new ArraySchema<PlayerState>();
  }
}

defineTypes(BattleState, {
  playerList: [PlayerState],
});
