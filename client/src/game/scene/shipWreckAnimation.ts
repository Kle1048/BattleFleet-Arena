import { WRECK_ANIM_TOTAL_MS, type WreckVariantId } from "@battlefleet/shared";

export type WreckVisualPose = {
  /** Zusätzliche Neigung Bug/Heck (Heck sinkt). */
  pitchX: number;
  /** Kippen um Längsachse (Backbord/Steuerbord unten). */
  rollZ: number;
  /** Senkrecht (Einsinken). */
  sinkY: number;
};

function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * `elapsedMs` seit `deathAtMs` (Wandzeit); `variant` von Server / `wreckVariantFromSessionId`.
 * Pitch um lokale X nach YXZ: stärkere Winkel (~±1,0 rad), damit Heck- vs. Bug-Sinken im Spiel erkennbar sind.
 */
const WRECK_PITCH_STERN_FIRST = 1.05;
const WRECK_PITCH_BOW_FIRST = -1.05;

export function computeWreckVisualPose(elapsedMs: number, variant: WreckVariantId): WreckVisualPose {
  const t = smoothstep01(elapsedMs / WRECK_ANIM_TOTAL_MS);
  let pitchX = 0;
  if (variant === 0) {
    pitchX = t * WRECK_PITCH_STERN_FIRST;
  } else if (variant === 3) {
    pitchX = t * WRECK_PITCH_BOW_FIRST;
  }
  const rollZ =
    variant === 1 ? t * (Math.PI / 2) * 0.9 : variant === 2 ? -t * (Math.PI / 2) * 0.9 : 0;
  /** Mehr Absenkung bei Bug/Heck-first; etwas weniger bei reiner Seitenlage (Roll dominiert). */
  const sinkY = variant === 0 || variant === 3 ? -t * 19 : -t * 11;
  return { pitchX, rollZ, sinkY };
}
