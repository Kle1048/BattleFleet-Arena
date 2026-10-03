import type { MissileValues, PlayerValues, TorpedoValues, WreckValues } from "./stateValues.js";

/** Explicit scalar projection contracts; never enumerate Schema metadata or copy live references. */
export const playerFields = [
  "id", "x", "z", "headingRad", "speed", "rudder", "aimX", "aimZ", "oobCountdownSec",
  "hp", "maxHp", "primaryCooldownSec", "lifeState", "respawnCountdownSec", "spawnProtectionSec",
  "secondaryCooldownSec", "torpedoCooldownSec", "score", "kills", "level", "xp", "shipClass",
  "displayName", "radarActive", "adHudIncomingAswm", "adHudCanCommitHardkill",
  "adHardkillCommitRemainingSec", "adHudRadarAffectsSam", "aswmRemainingPort", "aswmRemainingStarboard",
  "deathAtMs", "killedBySessionId", "adCooldownMask",
] as const satisfies readonly (keyof PlayerValues)[];
export const missileFields = ["missileId", "ownerId", "targetId", "x", "z", "headingRad"] as const satisfies readonly (keyof MissileValues)[];
export const torpedoFields = ["torpedoId", "ownerId", "x", "z", "headingRad"] as const satisfies readonly (keyof TorpedoValues)[];
export const wreckFields = [
  "wreckId", "anchorX", "anchorZ", "headingRad", "variant", "shipClass", "deathAtMs", "createdAtMs", "expiresAtMs",
] as const satisfies readonly (keyof WreckValues)[];

// Adding a value field without its projection must fail typechecking, not silently lose wire data.
type Complete<T extends never> = T;
export type CompleteValueProjections = Complete<
  Exclude<keyof PlayerValues, typeof playerFields[number]> |
  Exclude<keyof MissileValues, typeof missileFields[number]> |
  Exclude<keyof TorpedoValues, typeof torpedoFields[number]> |
  Exclude<keyof WreckValues, typeof wreckFields[number]>
>;
