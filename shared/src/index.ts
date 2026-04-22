export * from "./shipMovement";
export * from "./schema";
export * from "./mapBounds";
export * from "./vibeJamPortalUrl";
export * from "./convexHull2d";
export * from "./islands";
export * from "./artillery";
export * from "./primaryArtilleryEngagement";
export * from "./playerLife";
export * from "./respawn";
export * from "./aswm";
export * from "./aswmShipAim";
export * from "./torpedo";
export * from "./airDefense";
export * from "./airDefenseMissileTargeting";
export * from "./match";
export * from "./seaControl";
export * from "./esmDetection";
export * from "./progression";
export * from "./shipClass";
export * from "./displayName";
export * from "./shipVisualLayout";
export * from "./mountWeaponRange";
export * from "./shipProfileEditorJson";
export * from "./shipProfiles";
export * from "./shipHitboxCollision";
export * from "./shipShipCollision";
export * from "./shipRamDamage";
export * from "./collisionContactQueries";
export * from "./wakeRibbonMath";
export * from "./wakeLod";
export * from "./wrecks";

/** Headless / client AI — `createBotController` + types for perception/planning. */
export { createBotController } from "./bot/botController";
export type {
  BotInputCommand,
  BotIntent,
  BotLogEntry,
  BotVisibleMissile,
  BotVisiblePlayer,
  BotVisibleTorpedo,
  TacticalContext,
} from "./bot/types";
