/**
 * Stereo-Pan relativ zur **eigenen Schiffs-Bug-Richtung** (Seekarten-XZ, `headingRad` wie Simulation).
 * Rechts bugseitig → pan +1, links → −1, voraus/achtern → 0.
 */

export type ListenerShipPose = {
  x: number;
  z: number;
  headingRad: number;
};

/** Waffentreffer / kleine Detonationen — leiser mit Abstand, stumm außerhalb. */
export const SPATIAL_WEAPON_HIT_MAX_M = 560;
/** Fremde Schiffs-Explosion — stumm außerhalb. */
export const SPATIAL_EXPLOSION_OTHER_MAX_M = 520;
/** Artillerie „hit near“ — nur nah spürbar. */
export const SPATIAL_HIT_NEAR_MAX_M = 300;
/** Luftverteidigung (Feuer/Abfang) — großzügiger, damit AD noch weg hörbar ist. */
export const SPATIAL_AIR_DEFENSE_MAX_M = 1800;

export type SpatialSoundOpts = {
  worldX: number;
  worldZ: number;
  /** Harte Grenze: kein Ton jenseits dieser Distanz (m). */
  maxAudibleM?: number;
  /**
   * Gain-Faktor am Rand von `maxAudibleM` (linearer Abfall von 1.0 bei d=0).
   * z. B. 0.12 → am Horizont noch 12 % Basis-Lautstärke.
   */
  floorAtMax?: number;
};

/**
 * Rechtseinheitsvektor (liegt 90° rechts zur Bug-Richtung in XZ).
 * Bug: `(sin(h), cos(h))` — konsistent mit `forwardXZ` in `@battlefleet/shared` / Artillerie.
 */
export function shipRightUnitXZ(headingRad: number): { x: number; z: number } {
  return { x: Math.cos(headingRad), z: -Math.sin(headingRad) };
}

/** Stereo-Pan ∈ [−1, 1] für `StereoPannerNode.pan` (Quelle in Welt-XZ). */
export function stereoPanFromShip(listener: ListenerShipPose, sourceX: number, sourceZ: number): number {
  const dx = sourceX - listener.x;
  const dz = sourceZ - listener.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.75) return 0;
  const nx = dx / len;
  const nz = dz / len;
  const r = shipRightUnitXZ(listener.headingRad);
  const lateral = nx * r.x + nz * r.z;
  return Math.max(-1, Math.min(1, lateral));
}

export function spatializedGainAndPan(
  baseGain: number,
  listener: ListenerShipPose | null,
  spatial?: SpatialSoundOpts,
): { gain: number; pan: number; skip: boolean } {
  if (!spatial || !listener) {
    return { gain: baseGain, pan: 0, skip: false };
  }
  const d = Math.hypot(spatial.worldX - listener.x, spatial.worldZ - listener.z);
  const maxA = spatial.maxAudibleM;
  if (maxA != null && maxA > 0 && d > maxA) {
    return { gain: 0, pan: 0, skip: true };
  }
  const pan = stereoPanFromShip(listener, spatial.worldX, spatial.worldZ);
  let distMul = 1;
  if (maxA != null && maxA > 0) {
    const floor = spatial.floorAtMax ?? 0.1;
    distMul = floor + (1 - floor) * (1 - d / maxA);
  } else {
    const ref = 380;
    distMul = Math.max(0.12, ref / (ref + d));
  }
  return { gain: baseGain * distMul, pan, skip: false };
}
