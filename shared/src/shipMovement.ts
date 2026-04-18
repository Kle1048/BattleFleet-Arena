/**
 * Schiffsbewegung (Server = autoritativ; Client nutzt dieselbe Logik nur für spätere Prediction).
 * XZ-Ebene, Y nach oben. Kurs 0 rad = Bug = Welt-+Z (Nord).
 */

import type { ShipClassProfile } from "./shipClass";
import { progressionMovementScale } from "./progression";

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

/**
 * Trägheit: Gas baut langsamer auf / Bremsen weicher (`forwardAccel`, `backwardAccel`, `dragWhenNeutral`).
 * `maxSpeed` bleibt unverändert — nur der Weg zur Zielgeschwindigkeit wird länger.
 */
export const SHIP_INERTIA_ACCEL_MUL = 0.5;

/**
 * Trägheit: Ruder folgt der Tastatur langsamer (`smoothRudder` — niedriger = schwerfälliger).
 */
export const SHIP_INERTIA_RUDDER_RESP_MUL = 0.45;

/**
 * Trägheit: maximale Gierrate bei vollem Ruder (`stepMovement` — niedriger = weiterer Wendekreis bei gleicher Fahrt).
 */
export const SHIP_INERTIA_TURN_RATE_MUL = 0.7;

export const DESTROYER_LIKE_MVP: ShipMovementConfig = {
  maxSpeed: DESTROYER_BASE_SPEED_KN * SPEED_FEEL_FACTOR,
  forwardAccel: 14 * SPEED_FEEL_FACTOR * SHIP_INERTIA_ACCEL_MUL,
  backwardAccel: 22 * SPEED_FEEL_FACTOR * SHIP_INERTIA_ACCEL_MUL,
  dragWhenNeutral: 6 * SPEED_FEEL_FACTOR * SHIP_INERTIA_ACCEL_MUL,
  maxTurnRateRad: 1.05 * SHIP_INERTIA_TURN_RATE_MUL,
  rudderResponsiveness: 8 * SHIP_INERTIA_RUDDER_RESP_MUL,
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

/**
 * ### Datenfluss: Geschwindigkeit, Beschleunigung, Drehen (wie im Server `BattleRoom`)
 *
 * **1. Basis** — `DESTROYER_LIKE_MVP` (`ShipMovementConfig`), abgeleitet vom „Zerstörer“-Referenzschiff:
 *
 * | Feld | Rolle in `stepMovement` |
 * |------|-------------------------|
 * | `maxSpeed` | Obere Grenze der Fahrt bei Throttle ±1 (`targetSpeed = throttle * maxSpeed` bzw. rückwärts reduziert). |
 * | `forwardAccel` | Beschleunigung Richtung Zielgeschwindigkeit (vorwärts). |
 * | `backwardAccel` | Stärkeres Abbremsen / Rückwärtsfahren. |
 * | `dragWhenNeutral` | Abbremsen, wenn Zielgeschwindigkeit unterschritten (Gas neutral / schwach). |
 * | `maxTurnRateRad` | Max. **Giergeschwindigkeit** in rad/s bei **Ruder ±1**, zusätzlich `turnScale` bei wenig Speed (`minSpeedForFullTurn`). |
 * | `rudderResponsiveness` | Nur in `smoothRudder`: wie schnell `rudder` dem Spieler-Input folgt (nicht in `stepMovement`). |
 * | `minSpeedForFullTurn` | Unterhalb davon ist `turnScale` &lt; 1 → engere Wendekreis bei langsamer Fahrt. |
 *
 * **2. Schiffsklasse** — `ShipClassProfile` (`shipClass.ts`): drei Multiplikatoren relativ zur Basis-MVP:
 * - `movementSpeedMul` → auf `maxSpeed`
 * - `turnRateMul` → auf `maxTurnRateRad`
 * - `accelMul` → auf `forwardAccel` und `backwardAccel` (**nicht** auf `dragWhenNeutral`)
 *
 * **3. Progression** — `progressionMovementScale(level)`:
 * - `maxSpeedFactor` → auf `maxSpeed`
 * - `maxTurnRateFactor` → auf `maxTurnRateRad`
 * (Kein Level-Faktor auf Beschleunigung oder Ruder-„Weichheit“ in der aktuellen Formel.)
 *
 * **4. Konkreter Rumpf / JSON** — `ShipHullMovementDefinition`: dieselben drei Haupt-Multiplikatoren **überschreiben die Klassenwerte**, wenn im Profil gesetzt (sonst Klasse). Optional Feintuning an `rudderResponsiveness`, `minSpeedForFullTurn`, `dragWhenNeutral`.
 *
 * Zusammenfassung Formel (ohne optionale Hull-Zusatzfaktoren 1):
 * ```
 * maxSpeed = base.maxSpeed × eff.movementSpeedMul × progression.maxSpeedFactor
 * maxTurnRateRad = base.maxTurnRateRad × eff.turnRateMul × progression.maxTurnRateFactor
 * forwardAccel = base.forwardAccel × eff.accelMul
 * backwardAccel = base.backwardAccel × eff.accelMul
 * ```
 * wobei `eff.*` = Werte aus dem Rumpf-JSON, falls vorhanden, sonst aus `ShipClassProfile`.
 *
 * ### „Drehradius“
 *
 * Es gibt **keinen** gespeicherten Radius. Die Simulation ist **differential**: `headingRad += rudder × maxTurnRateRad × turnScale × dt`.
 * Grobe Näherung bei vollem Ruder und hohem `turnScale`: Bahnradius **R ≈ |v| / ω** mit **ω ≈ maxTurnRateRad** (nur zur Einordnung, kein exakter Kreis).
 *
 * @see BattleRoom.movementCfgForPlayer (nutzt `movementConfigForPlayer`)
 */
export type ShipHullMovementDefinition = {
  /**
   * Auf `maxSpeed` (nach Basis-MVP, **vor** Progressions-Faktor).
   * Semantik wie `ShipClassProfile.movementSpeedMul` — überschreibt die Klasse, wenn gesetzt.
   */
  movementSpeedMul?: number;
  /** Auf `maxTurnRateRad` — wie `ShipClassProfile.turnRateMul`. */
  turnRateMul?: number;
  /** Auf `forwardAccel` / `backwardAccel` — wie `ShipClassProfile.accelMul`. */
  accelMul?: number;
  /** Optional: Faktor auf `rudderResponsiveness` (Standard 1). */
  rudderResponsivenessMul?: number;
  /** Optional: Faktor auf `minSpeedForFullTurn` (Standard 1). */
  minSpeedForFullTurnMul?: number;
  /** Optional: Faktor auf `dragWhenNeutral` (Standard 1). */
  dragWhenNeutralMul?: number;
};

/**
 * Effektive `ShipMovementConfig` für einen Spieler: Basis-MVP + Klasse + Level + optional Rumpf-Override.
 * Einzige zentrale Stelle für diese Kombination (Server + ggf. Client-Prediction).
 */
export function movementConfigForPlayer(
  base: ShipMovementConfig,
  classProfile: ShipClassProfile,
  level: number,
  hullMovement?: ShipHullMovementDefinition | null,
): ShipMovementConfig {
  const s = progressionMovementScale(level);
  const prof = classProfile;
  const sp = hullMovement?.movementSpeedMul ?? prof.movementSpeedMul;
  const tr = hullMovement?.turnRateMul ?? prof.turnRateMul;
  const ac = hullMovement?.accelMul ?? prof.accelMul;
  return {
    ...base,
    maxSpeed: base.maxSpeed * sp * s.maxSpeedFactor,
    maxTurnRateRad: base.maxTurnRateRad * tr * s.maxTurnRateFactor,
    forwardAccel: base.forwardAccel * ac,
    backwardAccel: base.backwardAccel * ac,
    rudderResponsiveness:
      base.rudderResponsiveness * (hullMovement?.rudderResponsivenessMul ?? 1),
    minSpeedForFullTurn: base.minSpeedForFullTurn * (hullMovement?.minSpeedForFullTurnMul ?? 1),
    dragWhenNeutral: base.dragWhenNeutral * (hullMovement?.dragWhenNeutralMul ?? 1),
  };
}
