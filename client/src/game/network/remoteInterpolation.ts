/**
 * Task 3: Zwei-Punkt-Interpolation für entfernte Spieler (~20 Hz Server → flüssige 60 fps).
 * Render-Zeit = jetzt − Verzögerung, damit meist ein Snapshot-Paar verfügbar ist.
 */

export const DEFAULT_INTERPOLATION_DELAY_MS = 100;

export type PoseSnapshot = {
  x: number;
  z: number;
  headingRad: number;
  rudder: number;
  aimX: number;
  aimZ: number;
  /** performance.now() beim Eintreffen / Annehmen dieses Snapshots */
  timeMs: number;
};

export type InterpolationBuffer = {
  prev: PoseSnapshot;
  next: PoseSnapshot;
};

const EPS = 1e-4;

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Kürzester Winkel zwischen a und b, interpoliert mit t ∈ [0,1]. */
export function lerpAngle(a0: number, a1: number, t: number): number {
  let d = a1 - a0;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a0 + d * t;
}

export function posesEqual(a: PoseSnapshot, b: PoseSnapshot): boolean {
  return (
    Math.abs(a.x - b.x) < EPS &&
    Math.abs(a.z - b.z) < EPS &&
    Math.abs(a.headingRad - b.headingRad) < EPS &&
    Math.abs(a.rudder - b.rudder) < EPS &&
    Math.abs(a.aimX - b.aimX) < EPS &&
    Math.abs(a.aimZ - b.aimZ) < EPS
  );
}

export function snapshotFromPose(
  p: {
    x: number;
    z: number;
    headingRad: number;
    rudder: number;
    aimX: number;
    aimZ: number;
  },
  timeMs: number,
): PoseSnapshot {
  return {
    x: p.x,
    z: p.z,
    headingRad: p.headingRad,
    rudder: p.rudder,
    aimX: p.aimX,
    aimZ: p.aimZ,
    timeMs,
  };
}

export function createInterpolationBuffer(
  p: {
    x: number;
    z: number;
    headingRad: number;
    rudder: number;
    aimX: number;
    aimZ: number;
  },
  timeMs: number,
): InterpolationBuffer {
  const s = snapshotFromPose(p, timeMs);
  return { prev: { ...s }, next: { ...s } };
}

/** Neues Server-Snapshot nur wenn Pose sich wirklich geändert hat (kein Reset bei fremden Patches). */
export function advanceIfPoseChanged(
  buf: InterpolationBuffer,
  p: {
    x: number;
    z: number;
    headingRad: number;
    rudder: number;
    aimX: number;
    aimZ: number;
  },
  timeMs: number,
): void {
  const candidate = snapshotFromPose(p, timeMs);
  if (posesEqual(buf.next, candidate)) return;
  buf.prev = { ...buf.next };
  buf.next = candidate;
}

export type RenderedPose = {
  x: number;
  z: number;
  headingRad: number;
  rudder: number;
  aimX: number;
  aimZ: number;
};

/**
 * @param nowMs performance.now()
 * @param delayMs typisch ~2 Server-Ticks (20 Hz → 100 ms)
 */
export function sampleInterpolatedPose(
  buf: InterpolationBuffer,
  nowMs: number,
  delayMs: number,
): RenderedPose {
  const renderTime = nowMs - delayMs;
  const { prev, next } = buf;
  const span = next.timeMs - prev.timeMs;
  if (span < 1e-6) {
    return {
      x: next.x,
      z: next.z,
      headingRad: next.headingRad,
      rudder: next.rudder,
      aimX: next.aimX,
      aimZ: next.aimZ,
    };
  }
  let alpha = (renderTime - prev.timeMs) / span;
  if (alpha <= 0) {
    return {
      x: prev.x,
      z: prev.z,
      headingRad: prev.headingRad,
      rudder: prev.rudder,
      aimX: prev.aimX,
      aimZ: prev.aimZ,
    };
  }
  if (alpha >= 1) {
    return {
      x: next.x,
      z: next.z,
      headingRad: next.headingRad,
      rudder: next.rudder,
      aimX: next.aimX,
      aimZ: next.aimZ,
    };
  }
  return {
    x: lerp(prev.x, next.x, alpha),
    z: lerp(prev.z, next.z, alpha),
    headingRad: lerpAngle(prev.headingRad, next.headingRad, alpha),
    rudder: lerp(prev.rudder, next.rudder, alpha),
    aimX: lerp(prev.aimX, next.aimX, alpha),
    aimZ: lerp(prev.aimZ, next.aimZ, alpha),
  };
}
