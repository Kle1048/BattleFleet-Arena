import { esmDetectionRangeMul } from "./esmDetection";
import { normalizeShipClassId } from "./shipClass";

// Visual/radar target size is independent from radar-emission strength.
function targetSizeMultiplier(targetClass: unknown): number {
  const id = normalizeShipClassId(targetClass);
  return id === "destroyer" ? 4 / 3 : id === "cruiser" ? 5 / 3 : 1;
}

/** Shared by the player's cockpit and both bot strategies. Distances in world metres. */
export const RADAR_DETECTION_RANGE = 1200;
export const FIRE_CONTROL_TARGET_RANGE = 800;
export const PROJECTILE_DETECTION_RANGE = 600;
export const VISUAL_DETECTION_RANGE = 600;
export const SMOKE_VISUAL_DETECTION_RANGE = 800;
export const DAMAGE_SMOKE_HP_RATIO = 0.9;
export const SHIP_SENSOR_CONTRACT = "bfa-visual-smoke-radar-v4";
/** Largest precise-contact range: a cruiser on active radar. Display scale, not weapon range. */
export const SHIP_CONTACT_DISPLAY_RANGE = RADAR_DETECTION_RANGE * targetSizeMultiplier("cruiser");
export function shipHasDamageSmoke(hp: number, maxHp: number): boolean {
  return Number.isFinite(hp) && Number.isFinite(maxHp) && maxHp > 0 && hp > 0 && hp / maxHp < DAMAGE_SMOKE_HP_RATIO;
}
export function radarDetectionRange(targetClass: unknown): number {
  return RADAR_DETECTION_RANGE * targetSizeMultiplier(targetClass);
}
export function visualDetectionRange(targetClass: unknown, hp: number, maxHp: number): number {
  return shipHasDamageSmoke(hp, maxHp) ? SMOKE_VISUAL_DETECTION_RANGE : VISUAL_DETECTION_RANGE * targetSizeMultiplier(targetClass);
}
/** Precise contact via passive sight or own active radar. ESM remains bearing-only. */
export function canIdentifyShip(observer: { x: number; z: number; radarActive?: boolean },
  target: { x: number; z: number; shipClass: unknown; hp: number; maxHp: number }): boolean {
  const distance = Math.hypot(target.x - observer.x, target.z - observer.z);
  return distance <= visualDetectionRange(target.shipClass, target.hp, target.maxHp) ||
    (observer.radarActive !== false && distance <= radarDetectionRange(target.shipClass));
}
export const ESM_BASE_DETECTION_RANGE = 1600;
export function esmDetectionRange(emitterClass: unknown): number {
  return ESM_BASE_DETECTION_RANGE * esmDetectionRangeMul(emitterClass);
}
