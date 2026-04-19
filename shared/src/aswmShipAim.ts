/**
 * Hilfen für Client-Bot / KI: Abgleich Zielrichtung (Bug → Ziel) mit festen SSM-Rails
 * (`fixedSeaSkimmerLaunchers`, z. B. FAC ±45°, DD ±90°, CG ±10°).
 */

import { aimDirectionYawFromBowRad, shortestAngleDelta, wrapPi } from "./artillery";
import { launcherYawRadFromBow } from "./aswm";
import { normalizeShipClassId } from "./shipClass";
import { getAuthoritativeShipHullProfile } from "./shipProfiles";

/**
 * Max. Winkelabweichung (Bug→Ziel) zur nächsten Rail-Richtung, unter der ein ASuM-Schuss
 * sinnvoll ist (Sucher ±30° + Puffer für Kurven).
 */
export const BOT_ASWM_MAX_BORE_YAW_ERR_RAD =
  (30 * Math.PI) / 180 + (14 * Math.PI) / 180;

/**
 * Kleinster |Δ| zwischen Yaw vom Bug zum Zielpunkt und einem `launchYawRadFromBow` der Rails.
 * `null` wenn keine Rails oder Ziel auf dem Schiff.
 */
export function minFixedSeaSkimmerLauncherYawErrorRad(
  shipClass: unknown,
  shipX: number,
  shipZ: number,
  headingRad: number,
  aimX: number,
  aimZ: number,
): number | null {
  const hull = getAuthoritativeShipHullProfile(normalizeShipClassId(shipClass));
  const launchers = hull?.fixedSeaSkimmerLaunchers;
  if (!launchers?.length) return null;
  const yawToAim = aimDirectionYawFromBowRad(shipX, shipZ, headingRad, aimX, aimZ);
  if (yawToAim === null) return null;
  let best = Infinity;
  for (const L of launchers) {
    const railYaw = launcherYawRadFromBow(L);
    const err = Math.abs(shortestAngleDelta(railYaw, yawToAim));
    best = Math.min(best, err);
  }
  return best;
}

/**
 * Rudder-Ziel: `heading` so dass eine Rail Welt-Richtung `yawToTarget` hat (`heading + railYaw`).
 * Liefert den kleinsten `wrapPi(desiredHeading - headingRad)` über alle Rails.
 */
export function aswmSteeringYawErrRad(
  shipClass: unknown,
  shipX: number,
  shipZ: number,
  headingRad: number,
  aimX: number,
  aimZ: number,
): number {
  const dx = aimX - shipX;
  const dz = aimZ - shipZ;
  const yawToTarget = Math.atan2(dx, dz);
  const hull = getAuthoritativeShipHullProfile(normalizeShipClassId(shipClass));
  const launchers = hull?.fixedSeaSkimmerLaunchers;
  if (!launchers?.length) return wrapPi(yawToTarget - headingRad);

  let bestAbs = Infinity;
  let bestErr = 0;
  for (const L of launchers) {
    const r = launcherYawRadFromBow(L);
    const desiredHeading = wrapPi(yawToTarget - r);
    const e = wrapPi(desiredHeading - headingRad);
    const ab = Math.abs(e);
    if (ab < bestAbs) {
      bestAbs = ab;
      bestErr = e;
    }
  }
  return bestErr;
}
