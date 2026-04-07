import * as THREE from "three";

/** Max. Stützpunkte für Wake → muss zum Wasser-Shader passen. */
export const WAKE_TRAIL_MAX_POINTS = 96;

export type WakeTrailState = {
  readonly pool: THREE.Vector2[];
  length: number;
  filteredX: number;
  filteredZ: number;
  hasFiltered: boolean;
};

export function createWakeTrailState(): WakeTrailState {
  return {
    pool: Array.from({ length: WAKE_TRAIL_MAX_POINTS }, () => new THREE.Vector2()),
    length: 0,
    filteredX: 0,
    filteredZ: 0,
    hasFiltered: false,
  };
}

export function clearWakeTrail(state: WakeTrailState): void {
  state.length = 0;
  state.hasFiltered = false;
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
  // Light low-pass filter removes high-speed per-frame stern jitter.
  if (!state.hasFiltered) {
    state.filteredX = rx;
    state.filteredZ = rz;
    state.hasFiltered = true;
  } else {
    const alpha = 0.35;
    state.filteredX += (rx - state.filteredX) * alpha;
    state.filteredZ += (rz - state.filteredZ) * alpha;
  }
  const sx = state.filteredX;
  const sz = state.filteredZ;

  const { pool } = state;
  if (state.length === 0) {
    pool[0]!.set(sx, sz);
    state.length = 1;
    return;
  }

  const last = pool[state.length - 1]!;
  const dx = sx - last.x;
  const dz = sz - last.y;
  if (dx * dx + dz * dz < minDistSq) return;

  if (state.length < WAKE_TRAIL_MAX_POINTS) {
    pool[state.length]!.set(sx, sz);
    state.length++;
  } else {
    for (let i = 0; i < WAKE_TRAIL_MAX_POINTS - 1; i++) {
      pool[i]!.copy(pool[i + 1]!);
    }
    pool[WAKE_TRAIL_MAX_POINTS - 1]!.set(sx, sz);
  }
}
