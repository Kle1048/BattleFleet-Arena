import { esmDetectionRangeMul } from "./esmDetection";

/** Shared by the player's cockpit and both bot strategies. Distances in world metres. */
export const RADAR_DETECTION_RANGE = 600;
export const ESM_BASE_DETECTION_RANGE = 1200;
export function esmDetectionRange(emitterClass: unknown): number {
  return ESM_BASE_DETECTION_RANGE * esmDetectionRangeMul(emitterClass);
}
