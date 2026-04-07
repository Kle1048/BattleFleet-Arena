/**
 * Schiffsbewegung (Server = autoritativ; Client nutzt dieselbe Logik nur für spätere Prediction).
 * XZ-Ebene, Y nach oben. Kurs 0 rad = Bug = Welt-+Z (Nord).
 */

export type ShipMovementConfig = {
  maxSpeed: number;
  forwardAccel: number;
  backwardAccel: number;
  dragWhenNeutral: number;
  maxTurnRateRad: number;
  rudderResponsiveness: number;
  minSpeedForFullTurn: number;
};

/** Angezeigte Basisspeed in Knoten (ohne "Feel"-Skalierung). */
export const DESTROYER_BASE_SPEED_KN = 26;
/** Globaler Faktor für mehr Dynamik bei unveränderter Knotenanzeige. */
export const SPEED_FEEL_FACTOR = 2.5;

export const DESTROYER_LIKE_MVP: ShipMovementConfig = {
  maxSpeed: DESTROYER_BASE_SPEED_KN * SPEED_FEEL_FACTOR,
  forwardAccel: 14 * SPEED_FEEL_FACTOR,
  backwardAccel: 22 * SPEED_FEEL_FACTOR,
  dragWhenNeutral: 6 * SPEED_FEEL_FACTOR,
  maxTurnRateRad: 1.05,
  rudderResponsiveness: 8,
  minSpeedForFullTurn: 8 * SPEED_FEEL_FACTOR,
};

export type ShipMovementState = {
  x: number;
  z: number;
  headingRad: number;
  speed: number;
  throttle: number;
  rudder: number;
};

export function createShipState(x = 0, z = 0): ShipMovementState {
  return {
    x,
    z,
    headingRad: 0,
    speed: 0,
    throttle: 0,
    rudder: 0,
  };
}

function wrapPi(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function stepMovement(state: ShipMovementState, cfg: ShipMovementConfig, dt: number): void {
  const t = state.throttle;
  const maxS = cfg.maxSpeed;
  const targetSpeed = t >= 0 ? t * maxS : t * maxS * 0.35;

  const speedGap = targetSpeed - state.speed;
  let accel: number;
  if (Math.abs(speedGap) < 0.001) {
    accel = 0;
  } else if (speedGap > 0) {
    accel = cfg.forwardAccel;
  } else {
    if (Math.abs(t) < 0.05 && Math.abs(state.speed) < maxS * 0.02) {
      state.speed = 0;
      accel = 0;
    } else {
      const reversing = targetSpeed < 0 && state.speed > 0.5;
      accel = reversing ? cfg.backwardAccel : cfg.dragWhenNeutral;
    }
  }

  if (accel > 0) {
    const dir = Math.sign(speedGap) || (state.speed >= 0 ? 1 : -1);
    const ds = dir * accel * dt;
    if (Math.abs(speedGap) <= Math.abs(ds)) {
      state.speed = targetSpeed;
    } else {
      state.speed += ds;
    }
  }

  const speedAbs = Math.abs(state.speed);
  const turnScale =
    speedAbs < cfg.minSpeedForFullTurn
      ? 0.15 + 0.85 * (speedAbs / cfg.minSpeedForFullTurn)
      : 1;

  const rud = state.rudder;
  const desiredTurn = rud * cfg.maxTurnRateRad * turnScale * Math.sign(state.speed || 1);
  state.headingRad = wrapPi(state.headingRad + desiredTurn * dt);

  const sh = Math.sin(state.headingRad);
  const ch = Math.cos(state.headingRad);
  state.x += sh * state.speed * dt;
  state.z += ch * state.speed * dt;
}

export function smoothRudder(
  current: number,
  input: number,
  responsiveness: number,
  dt: number,
): number {
  const k = 1 - Math.exp(-responsiveness * dt);
  return current + (input - current) * k;
}
