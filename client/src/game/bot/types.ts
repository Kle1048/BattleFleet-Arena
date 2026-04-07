export type BotIntent =
  | "ATTACK"
  | "CHASE"
  | "REPOSITION"
  | "HOLD_ARC"
  | "TAKE_COVER"
  | "RETREAT"
  | "EVADE_MISSILES"
  | "FINISH_TARGET";

export type BotInputCommand = {
  throttle: number;
  rudderInput: number;
  aimWorldX: number;
  aimWorldZ: number;
  primaryFire: boolean;
  secondaryFire: boolean;
  torpedoFire: boolean;
};

export type BotVisiblePlayer = {
  id: string;
  x: number;
  z: number;
  headingRad: number;
  hp: number;
  maxHp: number;
  lifeState: string;
  primaryCooldownSec: number;
  secondaryCooldownSec: number;
  torpedoCooldownSec: number;
};

export type BotVisibleMissile = { missileId: number; ownerId: string; x: number; z: number };
export type BotVisibleTorpedo = { torpedoId: number; ownerId: string; x: number; z: number };

export type PerceptionSnapshot = {
  timestamp: number;
  self: BotVisiblePlayer;
  enemies: BotVisiblePlayer[];
  missiles: BotVisibleMissile[];
  torpedoes: BotVisibleTorpedo[];
};

export type TacticalContext = {
  dangerScore: number;
  aggressionScore: number;
  survivalScore: number;
  bestTargetId: string | null;
  targetInGunArc: boolean;
  targetInMissileArc: boolean;
  incomingMissileThreat: boolean;
  incomingMissileCount: number;
  preferredRange: "close" | "medium" | "long";
  situationTag: "safe" | "pressure" | "advantage" | "missile_threat" | "retreat_needed";
};

export type BotMemory = {
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
