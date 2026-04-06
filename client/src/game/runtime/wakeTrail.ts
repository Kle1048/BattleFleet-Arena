import * as THREE from "three";

/** Max. Stützpunkte für Wake → muss zum Wasser-Shader passen. */
export const WAKE_TRAIL_MAX_POINTS = 24;

export type WakeTrailState = {
  readonly pool: THREE.Vector2[];
  length: number;
};

export function createWakeTrailState(): WakeTrailState {
  return {
    pool: Array.from({ length: WAKE_TRAIL_MAX_POINTS }, () => new THREE.Vector2()),
    length: 0,
  };
}

export function clearWakeTrail(state: WakeTrailState): void {
  state.length = 0;
}

/**
 * Internes Layout: trail[0] = ältester, trail[length-1] = aktuellster Heckpunkt.
 * Nur bei ausreichender Bewegung neuen Punkt anhängen (vermeidet überlange Segmente bei FPS).
 */
export function pushWakeTrailSample(
  state: WakeTrailState,
  rx: number,
  rz: number,
  minDistSq: number,
): void {
  const { pool } = state;
  if (state.length === 0) {
    pool[0]!.set(rx, rz);
    state.length = 1;
    return;
  }

  const last = pool[state.length - 1]!;
  const dx = rx - last.x;
  const dz = rz - last.y;
  if (dx * dx + dz * dz < minDistSq) return;

  if (state.length < WAKE_TRAIL_MAX_POINTS) {
    pool[state.length]!.set(rx, rz);
    state.length++;
  } else {
    for (let i = 0; i < WAKE_TRAIL_MAX_POINTS - 1; i++) {
      pool[i]!.copy(pool[i + 1]!);
    }
    pool[WAKE_TRAIL_MAX_POINTS - 1]!.set(rx, rz);
  }
}
