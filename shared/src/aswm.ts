/**
 * Task 7 — Anti-Schiff-Lenkflugkörper (MVP): Start von **festen Rails** (`fixedSeaSkimmerLaunchers`),
 * sonst Fallback Feuerrichtung = Schiff→Aim;
 * **Suchkegel ±30°** um die **aktuelle Flugrichtung** — nur Ziele im Kegel werden angeflogen.
 */

import { forwardXZ, isInForwardArc } from "./artillery";
import { PlayerLifeState } from "./playerLife";
import type { FixedSeaSkimmerLauncherSpec } from "./shipVisualLayout";

/** Horizontale Geschwindigkeit (XZ, Einheiten/s). */
export const ASWM_SPEED = 190;
/** Max. Drehgeschwindigkeit Richtung Ziel (rad/s). */
export const ASWM_TURN_RATE_RAD_PER_S = 1.05;
export const ASWM_LIFETIME_MS = 12_000;
/**
 * Treffer, wenn der Abstand vom Raketenmittelpunkt zur **Hitbox-Fußfläche** (XZ) ≤ diesem Wert ist
 * (`circleIntersectsShipHitboxFootprintXZ`) — zusätzlicher Puffer **außerhalb** der Schiffs-AABB.
 * Zuvor 26 m / 16 m; aktuell bewusst eng für ein knapperes Einschlagfenster.
 */
export const ASWM_HIT_RADIUS = 12;
/** Kollision Insel: Zentrum FK gilt als innerhalb, wenn Distanz ≤ Inselradius + dieser Wert. */
export const ASWM_ISLAND_COLLISION_RADIUS = 14;
export const ASWM_DAMAGE = 28;
export const ASWM_COOLDOWN_MS = 3200;
export const ASWM_MAX_PER_OWNER = 2;
/** Mindestabstand zwischen ASuM-Schüssen bei noch gefülltem Magazin (Server). */
export const ASWM_SHOT_INTERVAL_MS = 1000;
/** Nach Start: Sucher/Zielerfassung erst aktiv — verhindert Nutzung im Nahkampf (Server). */
export const ASWM_SEEKER_ARM_DELAY_MS = 1000;
/** Nach leerem Magazin: Zeit bis Magic Reload (Server); FAC nutzt Default, DD/CG in Rumpf-JSON. */
export const ASWM_MAGIC_RELOAD_MS = 20_000;
/** Länge des Suchkegels (m): nur Ziele innerhalb dieser Entfernung zur Rakete. */
export const ASWM_ACQUIRE_CONE_LENGTH = 210;
export const ASWM_SPAWN_FORWARD = 22;
/** Startpunkt entlang der Rail-Abstrahlrichtung (nach Weltposition des Sockets). */
export const ASWM_SPAWN_FROM_RAIL = 12;

/**
 * Halber Öffnungswinkel des Suchkegels um die Blick-/Flugrichtung (±30°).
 */
export const ASWM_ACQUIRE_HALF_ANGLE_RAD = (30 * Math.PI) / 180;

export type AswmTargetCandidate = {
  id: string;
  x: number;
  z: number;
  lifeState: string;
};

/**
 * Nächstes Ziel im **Suchkegel** um `boreHeadingRad` (±30°), in Reichweite, nicht Respawn.
 * `boreHeadingRad` pro Tick = aktuelle Raketenflugrichtung (Seeker).
 */
export function pickAswmAcquisitionTarget(
  observerX: number,
  observerZ: number,
  boreHeadingRad: number,
  ownerId: string,
  candidates: readonly AswmTargetCandidate[],
): string | null {
  let bestId: string | null = null;
  let bestD2 = Infinity;
  const maxSq = ASWM_ACQUIRE_CONE_LENGTH * ASWM_ACQUIRE_CONE_LENGTH;
  for (const c of candidates) {
    if (c.id === ownerId) continue;
    if (c.lifeState === PlayerLifeState.AwaitingRespawn) continue;
    if (
      !isInForwardArc(
        observerX,
        observerZ,
        boreHeadingRad,
        c.x,
        c.z,
        ASWM_ACQUIRE_HALF_ANGLE_RAD,
      )
    ) {
      continue;
    }
    const dx = c.x - observerX;
    const dz = c.z - observerZ;
    const d2 = dx * dx + dz * dz;
    if (d2 > maxSq) continue;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestId = c.id;
    }
  }
  return bestId;
}

/**
 * Start in **Feuerrichtung** (Schiff → Aim). Bei Aim ≈ Schiff: `fallbackHeadingRad` (Bug).
 */
export function spawnAswmFromFireDirection(
  shipX: number,
  shipZ: number,
  aimX: number,
  aimZ: number,
  fallbackHeadingRad: number,
): { x: number; z: number; headingRad: number } {
  let dx = aimX - shipX;
  let dz = aimZ - shipZ;
  const len = Math.hypot(dx, dz);
  let headingRad: number;
  if (len < 1e-3) {
    headingRad = fallbackHeadingRad;
  } else {
    headingRad = Math.atan2(dx, dz);
  }
  const f = forwardXZ(headingRad);
  return {
    x: shipX + f.x * ASWM_SPAWN_FORWARD,
    z: shipZ + f.z * ASWM_SPAWN_FORWARD,
    headingRad,
  };
}

/** Horizontaler Yaw relativ zum Bug, siehe `FixedSeaSkimmerLauncherSpec`. */
export function launcherYawRadFromBow(L: FixedSeaSkimmerLauncherSpec): number {
  if (L.launchYawRadFromBow !== undefined) return L.launchYawRadFromBow;
  return L.socket.eulerRad?.y ?? 0;
}

/** Schiffslokal (+X Steuerbord, +Z Bug) → Welt-XZ (Y ignoriert). */
export function shipLocalToWorldXZ(
  shipX: number,
  shipZ: number,
  headingRad: number,
  localX: number,
  localZ: number,
): { x: number; z: number } {
  const c = Math.cos(headingRad);
  const s = Math.sin(headingRad);
  return {
    x: shipX + localX * c + localZ * s,
    z: shipZ - localX * s + localZ * c,
  };
}

/**
 * Wählt Port- oder Steuerbord-Rail nach Zielrichtung (Schiff → Aim): Aim eher rechts vom Bug → Steuerbord.
 * Nur sinnvoll bei ≥2 Einträgen mit `side` port/starboard; sonst erster Launcher.
 */
export function pickFixedSeaSkimmerLauncher(
  launchers: readonly FixedSeaSkimmerLauncherSpec[] | undefined,
  aimX: number,
  aimZ: number,
  shipX: number,
  shipZ: number,
  headingRad: number,
): FixedSeaSkimmerLauncherSpec | null {
  if (!launchers?.length) return null;
  const paired = launchers.filter((L) => L.side === "port" || L.side === "starboard");
  if (paired.length < 2) {
    return launchers[0] ?? null;
  }
  const adx = aimX - shipX;
  const adz = aimZ - shipZ;
  const len = Math.hypot(adx, adz);
  let preferStarboard = true;
  if (len > 1e-3) {
    const ax = adx / len;
    const az = adz / len;
    const sbx = Math.cos(headingRad);
    const sbz = -Math.sin(headingRad);
    preferStarboard = ax * sbx + az * sbz >= 0;
  }
  const want: "port" | "starboard" = preferStarboard ? "starboard" : "port";
  const hit = launchers.find((L) => L.side === want);
  return hit ?? launchers[0] ?? null;
}

/**
 * Wie `pickFixedSeaSkimmerLauncher`, aber nur Rails mit Restmunition auf der gewünschten Seite;
 * sonst die andere Seite. Bei nur einer Rail / Centerline: Schuss, wenn `port+starboard > 0`.
 */
export function pickFixedSeaSkimmerLauncherWithAmmo(
  launchers: readonly FixedSeaSkimmerLauncherSpec[] | undefined,
  aimX: number,
  aimZ: number,
  shipX: number,
  shipZ: number,
  headingRad: number,
  ammoPort: number,
  ammoStarboard: number,
): FixedSeaSkimmerLauncherSpec | null {
  if (!launchers?.length) return null;
  const totalAmmo = ammoPort + ammoStarboard;
  if (totalAmmo <= 0) return null;

  const paired = launchers.filter((L) => L.side === "port" || L.side === "starboard");
  if (paired.length >= 2) {
    const adx = aimX - shipX;
    const adz = aimZ - shipZ;
    const len = Math.hypot(adx, adz);
    let preferStarboard = true;
    if (len > 1e-3) {
      const ax = adx / len;
      const az = adz / len;
      const sbx = Math.cos(headingRad);
      const sbz = -Math.sin(headingRad);
      preferStarboard = ax * sbx + az * sbz >= 0;
    }
    const want: "port" | "starboard" = preferStarboard ? "starboard" : "port";
    const other: "port" | "starboard" = preferStarboard ? "port" : "starboard";
    const wantAmmo = want === "port" ? ammoPort : ammoStarboard;
    const otherAmmo = want === "port" ? ammoStarboard : ammoPort;
    if (wantAmmo > 0) {
      const hit = launchers.find((L) => L.side === want);
      if (hit) return hit;
    }
    if (otherAmmo > 0) {
      const hit = launchers.find((L) => L.side === other);
      if (hit) return hit;
    }
    return null;
  }

  for (const L of launchers) {
    if (L.side === "centerline") return L;
    if (L.side === "port" && ammoPort > 0) return L;
    if (L.side === "starboard" && ammoStarboard > 0) return L;
  }
  return null;
}

/**
 * Wie `pickFixedSeaSkimmerLauncherWithAmmo`, aber Seite **fest** vorgegeben (Mobile Softkeys).
 * Bei leerer gewünschter Seite: andere Seite, sonst `null`.
 */
export function pickFixedSeaSkimmerLauncherWithAmmoForForcedSide(
  launchers: readonly FixedSeaSkimmerLauncherSpec[] | undefined,
  ammoPort: number,
  ammoStarboard: number,
  forced: "port" | "starboard",
): FixedSeaSkimmerLauncherSpec | null {
  if (!launchers?.length) return null;
  const totalAmmo = ammoPort + ammoStarboard;
  if (totalAmmo <= 0) return null;

  const paired = launchers.filter((L) => L.side === "port" || L.side === "starboard");
  if (paired.length >= 2) {
    const other: "port" | "starboard" = forced === "port" ? "starboard" : "port";
    const forcedAmmo = forced === "port" ? ammoPort : ammoStarboard;
    const otherAmmo = forced === "port" ? ammoStarboard : ammoPort;
    if (forcedAmmo > 0) {
      const hit = launchers.find((L) => L.side === forced);
      if (hit) return hit;
    }
    if (otherAmmo > 0) {
      const hit = launchers.find((L) => L.side === other);
      if (hit) return hit;
    }
    return null;
  }

  for (const L of launchers) {
    if (L.side === "centerline") return L;
    if (L.side === "port" && ammoPort > 0) return L;
    if (L.side === "starboard" && ammoStarboard > 0) return L;
  }
  return null;
}

/** Ohne feste Rails: feste Seite (Softkey); Fallback auf andere Munition. */
export function pickAswmSideForFallbackFireForced(
  ammoPort: number,
  ammoStarboard: number,
  forced: "port" | "starboard",
): "port" | "starboard" | null {
  if (ammoPort + ammoStarboard <= 0) return null;
  const forcedAmmo = forced === "port" ? ammoPort : ammoStarboard;
  const otherAmmo = forced === "port" ? ammoStarboard : ammoPort;
  if (forcedAmmo > 0) return forced;
  if (otherAmmo > 0) return forced === "port" ? "starboard" : "port";
  return null;
}

/** Ohne feste Rails: Seite nach Aim (wie Port/Steuerbord-Rails); nur bei Restmunition. */
export function pickAswmSideForFallbackFire(
  aimX: number,
  aimZ: number,
  shipX: number,
  shipZ: number,
  headingRad: number,
  ammoPort: number,
  ammoStarboard: number,
): "port" | "starboard" | null {
  if (ammoPort + ammoStarboard <= 0) return null;
  const adx = aimX - shipX;
  const adz = aimZ - shipZ;
  const len = Math.hypot(adx, adz);
  let preferStarboard = true;
  if (len > 1e-3) {
    const ax = adx / len;
    const az = adz / len;
    const sbx = Math.cos(headingRad);
    const sbz = -Math.sin(headingRad);
    preferStarboard = ax * sbx + az * sbz >= 0;
  }
  const want: "port" | "starboard" = preferStarboard ? "starboard" : "port";
  const other: "port" | "starboard" = preferStarboard ? "port" : "starboard";
  const wantAmmo = want === "port" ? ammoPort : ammoStarboard;
  const otherAmmo = want === "port" ? ammoStarboard : ammoPort;
  if (wantAmmo > 0) return want;
  if (otherAmmo > 0) return other;
  return null;
}

/** Startpose an einer festen Rail: Weltposition Socket + Abstrahlrichtung `heading + yawFromBow`. */
export function spawnAswmFromFixedLauncher(
  shipX: number,
  shipZ: number,
  headingRad: number,
  launcher: FixedSeaSkimmerLauncherSpec,
): { x: number; z: number; headingRad: number } {
  const p = launcher.socket.position;
  const { x: wx, z: wz } = shipLocalToWorldXZ(shipX, shipZ, headingRad, p.x, p.z);
  const yawFromBow = launcherYawRadFromBow(launcher);
  const missileHeading = headingRad + yawFromBow;
  const f = forwardXZ(missileHeading);
  return {
    x: wx + f.x * ASWM_SPAWN_FROM_RAIL,
    z: wz + f.z * ASWM_SPAWN_FROM_RAIL,
    headingRad: missileHeading,
  };
}

export function stepAswmMissile(
  x: number,
  z: number,
  headingRad: number,
  dt: number,
  targetX: number | null,
  targetZ: number | null,
): { x: number; z: number; headingRad: number } {
  let h = headingRad;
  if (targetX != null && targetZ != null) {
    const dx = targetX - x;
    const dz = targetZ - z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.5) {
      const desired = Math.atan2(dx, dz);
      let delta = desired - h;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const maxTurn = ASWM_TURN_RATE_RAD_PER_S * dt;
      delta = Math.max(-maxTurn, Math.min(maxTurn, delta));
      h += delta;
    }
  }
  const f = forwardXZ(h);
  return {
    x: x + f.x * ASWM_SPEED * dt,
    z: z + f.z * ASWM_SPEED * dt,
    headingRad: h,
  };
}
