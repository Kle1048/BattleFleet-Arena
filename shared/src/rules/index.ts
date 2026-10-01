/** Transport-free entry point. Do not export schema or platform adapters here. */
export * from "../shipMovement";
export * from "../mapBounds";
export * from "../convexHull2d";
export * from "../islands";
export * from "../artillery";
export * from "../primaryArtilleryEngagement";
export * from "../playerLife";
export * from "../respawn";
export * from "../aswm";
export * from "../aswmShipAim";
export * from "../torpedo";
export * from "../airDefense";
export * from "../airDefenseMissileTargeting";
export * from "../match";
export * from "../seaControl";
export * from "../esmDetection";
export * from "../progression";
export * from "../shipClass";
export * from "../displayName";
export * from "../shipVisualLayout";
export * from "../weaponSystems";
export * from "../content/models";
export * from "../content/modelMetadata";
export * from "../content/shipProfileSource";
export { loadShipProfile } from "../content/loadShipProfile";
export * from "../shipProfileEditorJson";
export * from "../shipProfiles";
export * from "../shipHitboxCollision";
export * from "../shipShipCollision";
export * from "../shipRamDamage";
export * from "../collisionContactQueries";
export * from "../wakeRibbonMath";
export * from "../wakeLod";
export * from "../wrecks";

/** Headless / client AI — `createBotController` + types for perception/planning. */
export { createBotController } from "../bot/botController";
export { FIRE_CONTROL_TARGET_RANGE, PROJECTILE_DETECTION_RANGE, RADAR_DETECTION_RANGE, ESM_BASE_DETECTION_RANGE, esmDetectionRange,
  VISUAL_DETECTION_RANGE, SMOKE_VISUAL_DETECTION_RANGE, DAMAGE_SMOKE_HP_RATIO,
  SHIP_SENSOR_CONTRACT, SHIP_CONTACT_DISPLAY_RANGE, shipHasDamageSmoke,
  radarDetectionRange, visualDetectionRange, canIdentifyShip } from "../sensors";
export type { BotDecisionStrategy } from "../bot/decisionEngine";
export { DecisionTreeStrategy } from "../bot/decisionEngine";
export { LearnedPolicyStrategy, validatePolicyArtifact, encodePolicyObservation, policyLogits, POLICY_ACTIONS, POLICY_FEATURES, POLICY_VERSION } from "../bot/learnedPolicy";
export { observeWorld } from "../bot/perceptionSystem";
export { BOT_PROFILES, botProfile, PROFILE_CONTROLLER_VERSION, profileControllerVersion, type BotProfile } from "../bot/profiles";
export { orient } from "../bot/orientationSystem";
export type { BotDiagnosticClock } from "../bot/botController";
export type {
  BotInputCommand,
  BotIntent,
  BotLogEntry,
  BotVisibleMissile,
  BotVisiblePlayer,
  BotVisibleTorpedo,
  TacticalContext,
} from "../bot/types";

export * from "../mountedWeaponPose";
