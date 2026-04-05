/**
 * Explizite Lebensphasen (Task 6) — Server ist maßgebend; Client zeigt replizierte Felder.
 *
 * Invarianten:
 * - `awaiting_respawn` ⇔ `hp === 0`
 * - `alive` | `spawn_protected` ⇔ `0 < hp <= maxHp`
 */

export const PlayerLifeState = {
  Alive: "alive",
  AwaitingRespawn: "awaiting_respawn",
  SpawnProtected: "spawn_protected",
} as const;

export type PlayerLifeStateValue = (typeof PlayerLifeState)[keyof typeof PlayerLifeState];

export const RESPAWN_DELAY_MS = 5_000;
export const SPAWN_PROTECTION_DURATION_MS = 3_000;

/** Mindestabstand Schiffsmittelpunkte bei Respawn (lebende Gegner). */
export const MIN_RESPAWN_SEPARATION = 220;

export function isValidPlayerLifeState(s: string): s is PlayerLifeStateValue {
  return (
    s === PlayerLifeState.Alive ||
    s === PlayerLifeState.AwaitingRespawn ||
    s === PlayerLifeState.SpawnProtected
  );
}

/** Nur diese Phasen erhalten Artillerie-Splash-Schaden. */
export function canTakeArtillerySplashDamage(lifeState: string): boolean {
  return lifeState === PlayerLifeState.Alive;
}

/** Primärfeuer erlaubt (Cooldown weiter serverseitig). */
export function canUsePrimaryWeapon(lifeState: string): boolean {
  return lifeState === PlayerLifeState.Alive || lifeState === PlayerLifeState.SpawnProtected;
}

/** Physik (stepMovement, OOB) nur für lebende / geschützte Phasen. */
export function participatesInWorldSimulation(lifeState: string): boolean {
  return lifeState === PlayerLifeState.Alive || lifeState === PlayerLifeState.SpawnProtected;
}

/**
 * Konsistenz Schema — bei Verletzung werfen (serverseitig), um Drift sofort zu finden.
 */
export function assertPlayerLifeInvariant(
  lifeState: string,
  hp: number,
  maxHp: number,
): void {
  if (!isValidPlayerLifeState(lifeState)) {
    throw new Error(`[playerLife] invalid lifeState: ${lifeState}`);
  }
  if (lifeState === PlayerLifeState.AwaitingRespawn) {
    if (hp !== 0) {
      throw new Error(`[playerLife] awaiting_respawn requires hp===0, got hp=${hp}`);
    }
    return;
  }
  if (hp <= 0) {
    throw new Error(
      `[playerLife] ${lifeState} requires hp>0, got hp=${hp}`,
    );
  }
  if (hp > maxHp) {
    throw new Error(`[playerLife] hp ${hp} exceeds maxHp ${maxHp}`);
  }
}
