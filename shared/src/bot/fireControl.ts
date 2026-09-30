import { computeFlightMs, isInForwardArc, wrapPi } from "../artillery";
import { ASWM_SPEED, ASWM_LIFETIME_MS, ASWM_SEEKER_ARM_DELAY_MS, ASWM_ACQUIRE_CONE_LENGTH,
  ASWM_ACQUIRE_HALF_ANGLE_RAD, launcherYawRadFromBow, spawnAswmFromFixedLauncher,
  pickFixedSeaSkimmerLauncherWithAmmo } from "../aswm";
import { getAuthoritativeShipHullProfile } from "../shipProfiles";
import type { BotVisiblePlayer } from "./types";

/** Launch along a passive bearing. 600 m is only an aim marker, not a range estimate. */
export function missileBearingSolution(self: BotVisiblePlayer, bearingRad: number) {
  const x = self.x + Math.sin(bearingRad) * 600, z = self.z + Math.cos(bearingRad) * 600;
  const launchers = getAuthoritativeShipHullProfile(self.shipClass)?.fixedSeaSkimmerLaunchers ?? [];
  const launcher = pickFixedSeaSkimmerLauncherWithAmmo(launchers, x, z, self.x, self.z, self.headingRad,
    self.aswmRemainingPort ?? 1, self.aswmRemainingStarboard ?? 1);
  if (!launcher) return null;
  const rudderYawError = wrapPi(bearingRad - launcherYawRadFromBow(launcher) - self.headingRad);
  return { x, z, rudderYawError, canFire: Math.abs(rudderYawError) <= 10 * Math.PI / 180 };
}

function velocity(target: BotVisiblePlayer) {
  const speed = Number.isFinite(target.speed) ? target.speed! : 0;
  return { x: Math.sin(target.headingRad) * speed, z: Math.cos(target.headingRad) * speed };
}

/** Earliest constant-velocity intercept in world space; missiles do not inherit ship speed. */
export function interceptSeconds(dx: number, dz: number, vx: number, vz: number, speed: number): number | null {
  const a = vx * vx + vz * vz - speed * speed;
  const b = 2 * (dx * vx + dz * vz), c = dx * dx + dz * dz;
  if (c < 1e-8) return null;
  if (Math.abs(a) < 1e-8) {
    const t = -c / b;
    return Number.isFinite(t) && t > 0 ? t : null;
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const roots = [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)]
    .filter(t => Number.isFinite(t) && t > 0);
  return roots.length ? Math.min(...roots) : null;
}

export function artilleryAim(self: BotVisiblePlayer, target: BotVisiblePlayer) {
  const v = velocity(target);
  let time = computeFlightMs(Math.hypot(target.x - self.x, target.z - self.z)) / 1000;
  for (let i = 0; i < 3; i++) {
    time = computeFlightMs(Math.hypot(target.x + v.x * time - self.x, target.z + v.z * time - self.z)) / 1000;
  }
  return { x: target.x + v.x * time, z: target.z + v.z * time };
}

/** Aim the hull's fixed rail at an intercept, then require a plausible seeker acquisition. */
export function missileFireSolution(self: BotVisiblePlayer, target: BotVisiblePlayer) {
  const v = velocity(target);
  const launchers = getAuthoritativeShipHullProfile(self.shipClass)?.fixedSeaSkimmerLaunchers ?? [];
  const port = self.aswmRemainingPort ?? 1, starboard = self.aswmRemainingStarboard ?? 1;
  let best: { x: number; z: number; rudderYawError: number; canFire: boolean } | null = null;
  for (const launcher of launchers) {
    // Same ammunition eligibility and launcher selection as the authoritative server.
    const pose = spawnAswmFromFixedLauncher(self.x, self.z, self.headingRad, launcher);
    const time = interceptSeconds(target.x - pose.x, target.z - pose.z, v.x, v.z, ASWM_SPEED);
    if (time === null || time < ASWM_SEEKER_ARM_DELAY_MS / 1000 || time > ASWM_LIFETIME_MS / 1000) continue;
    const x = target.x + v.x * time, z = target.z + v.z * time;
    const selected = pickFixedSeaSkimmerLauncherWithAmmo(launchers, x, z, self.x, self.z, self.headingRad, port, starboard);
    if (selected?.id !== launcher.id) continue;
    const desiredHeading = Math.atan2(x - pose.x, z - pose.z) - launcherYawRadFromBow(launcher);
    const rudderYawError = wrapPi(desiredHeading - self.headingRad);
    let canFire = false;
    if (Math.abs(rudderYawError) <= 10 * Math.PI / 180) {
      // A fixed rail flies straight until acquisition. Sample that actual trajectory,
      // including the seeker arming delay and 300 m cone, before authorizing a launch.
      for (let t = ASWM_SEEKER_ARM_DELAY_MS / 1000; t <= time; t += 0.1) {
        const mx = pose.x + Math.sin(pose.headingRad) * ASWM_SPEED * t;
        const mz = pose.z + Math.cos(pose.headingRad) * ASWM_SPEED * t;
        const tx = target.x + v.x * t, tz = target.z + v.z * t;
        if (Math.hypot(tx - mx, tz - mz) <= ASWM_ACQUIRE_CONE_LENGTH &&
            isInForwardArc(mx, mz, pose.headingRad, tx, tz, ASWM_ACQUIRE_HALF_ANGLE_RAD)) {
          canFire = true; break;
        }
      }
    }
    if (!best || Math.abs(rudderYawError) < Math.abs(best.rudderYawError)) best = { x, z, rudderYawError, canFire };
  }
  return best;
}
