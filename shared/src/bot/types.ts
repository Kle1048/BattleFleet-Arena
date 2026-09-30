export type BotIntent =
  | "ATTACK"
  | "CHASE"
  | "REPOSITION"
  | "HOLD_ARC"
  | "TAKE_COVER"
  | "RETREAT"
  | "EVADE_MISSILES"
  | "FINISH_TARGET"
  | "SEEK_SEA_CONTROL";

export type BotInputCommand = {
  throttle: number;
  rudderInput: number;
  aimWorldX: number;
  aimWorldZ: number;
  primaryFire: boolean;
  secondaryFire: boolean;
  torpedoFire: boolean;
  radarActive: boolean;
};

export type BotVisiblePlayer = {
  id: string;
  x: number;
  z: number;
  headingRad: number;
  /** Signed world-units/s; optional for older callers and stationary fixtures. */
  speed?: number;
  radarActive?: boolean;
  aswmRemainingPort?: number;
  aswmRemainingStarboard?: number;
  /** Replizierte Schiffsklasse — für ASuM-Rail-Winkel / Bot. */
  shipClass: string;
  hp: number;
  maxHp: number;
  lifeState: string;
  primaryCooldownSec: number;
  secondaryCooldownSec: number;
  torpedoCooldownSec: number;
  /** Server: Anzahl eingehender ASuM (gleiche Quelle wie HUD „Vampire incoming“). */
  adHudIncomingAswm: number;
};

export type BotVisibleMissile = { missileId: number; ownerId: string; x: number; z: number };
export type BotVisibleTorpedo = { torpedoId: number; ownerId: string; x: number; z: number };
/** Passive bearing only: deliberately no world position, range, course, speed or HP. */
export type BotEsmBearing = { id: string; bearingRad: number };

export type PerceptionSnapshot = {
  timestamp: number;
  profile?: import("./profiles").BotProfile;
  /** Halbe AO-Kante (m) — gleiche Quelle wie `BattleState.operationalAreaHalfExtent`. */
  operationalHalfExtent: number;
  islandsEnabled?: boolean;
  self: BotVisiblePlayer;
  enemies: BotVisiblePlayer[];
  esmBearings?: BotEsmBearing[];
  missiles: BotVisibleMissile[];
  torpedoes: BotVisibleTorpedo[];
};

export type TacticalContext = {
  dangerScore: number;
  aggressionScore: number;
  survivalScore: number;
  bestTargetId: string | null;
  esmTargetId?: string | null;
  esmBearingRad?: number | null;
  /** Quadrat-Distanz zum gewählten Ziel (nur wenn `bestTargetId` gesetzt). */
  bestTargetDistSq: number | null;
  targetInGunArc: boolean;
  targetInMissileArc: boolean;
  /** Eigenes Schiff in der Sea-Control-Zone (passives XP). */
  selfInSeaControlZone: boolean;
  incomingMissileThreat: boolean;
  incomingMissileCount: number;
  preferredRange: "close" | "medium" | "long";
  situationTag: "safe" | "pressure" | "advantage" | "missile_threat" | "retreat_needed";
};

export type BotMemory = {
  pursuit?: { id: string; x: number; z: number; at: number };
  lastIntent: BotIntent | null;
  lastIntentChangeAt: number;
  lastTargetId: string | null;
  lastThreatId: string | null;
};

export type DecisionInput = {
  snapshot: PerceptionSnapshot;
  context: TacticalContext;
  memory: BotMemory;
};

export type ActionPlanningInput = DecisionInput & { intent: BotIntent };

export type BotLogPhase = "OBSERVE" | "ORIENT" | "DECIDE" | "ACT";

export type BotLogEntry = {
  timestamp: number;
  phase: BotLogPhase;
  message: string;
  data?: Record<string, unknown>;
};

export type BotPlayerList = Iterable<BotVisiblePlayer>;
