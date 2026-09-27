import type { MissileValues, PlayerValues } from "@battlefleet/shared/protocol";

export const FIXTURE_ID = "client-combat-v1";
export const FIXTURE_STEP_MS = 1000 / 60;
export const FIXTURE_WARMUP_FRAMES = 300;
export const FIXTURE_SAMPLE_FRAMES = 1800;
export const FIXTURE_SEED = 42;

export function seededRandom(initial: number): () => number {
  let seed = initial >>> 0;
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/** Explicit synthetic input, not a second game simulation. Membership/poses update at 20 Hz. */
export function createCombatFixture() {
  const players: PlayerValues[] = Array.from({ length: 16 }, (_, index) => ({
    id: `fixture-${index}`, displayName: `Fixture ${index}`, shipClass: ["fac", "destroyer", "cruiser"][index % 3]!,
    x: 0, z: 0, headingRad: 0, speed: 35, rudder: 0.25, aimX: 0, aimZ: 0,
    hp: 100, maxHp: 100, primaryCooldownSec: 0, secondaryCooldownSec: 0, torpedoCooldownSec: 0,
    lifeState: "alive", respawnCountdownSec: 0, spawnProtectionSec: 0, oobCountdownSec: 0,
    score: 0, kills: 0, level: 1, xp: 0, radarActive: true, adHudIncomingAswm: 0,
    adHudCanCommitHardkill: false, adHardkillCommitRemainingSec: 0, adHudRadarAffectsSam: false,
    aswmRemainingPort: 2, aswmRemainingStarboard: 2, deathAtMs: 0, killedBySessionId: "",
  }));
  const missiles: MissileValues[] = Array.from({ length: 12 }, (_, index) => ({
    missileId: index, ownerId: `fixture-${index + 1}`, targetId: "fixture-0", x: 0, z: 0, headingRad: 0,
  }));
  function step(frame: number): void {
    if (frame % 3 !== 0) return;
    const seconds = frame / 60;
    for (let index = 0; index < players.length; index++) {
      const player = players[index]!;
      const angle = index * Math.PI * 2 / players.length + seconds * 0.06;
      const radius = index === 0 ? 80 : 180 + (index % 4) * 90;
      player.x = Math.sin(angle) * radius; player.z = Math.cos(angle) * radius;
      player.headingRad = angle + Math.PI * 0.5;
      player.aimX = players[0]!.x; player.aimZ = players[0]!.z;
      player.hp = index % 4 === 0 ? 30 : index % 4 === 1 ? 60 : 100;
      const deathFrame = 900 + index * 3;
      const dead = frame >= deathFrame && frame < deathFrame + 120;
      player.lifeState = dead ? "awaiting_respawn" : "alive";
      player.deathAtMs = dead ? 1_800_000_000_000 + deathFrame * FIXTURE_STEP_MS : 0;
      player.respawnCountdownSec = dead ? (deathFrame + 120 - frame) / 60 : 0;
      player.radarActive = Math.floor(frame / 240) % 2 === 0;
      player.adHudIncomingAswm = index === 0 ? 3 : 0;
    }
    for (let index = 0; index < missiles.length; index++) {
      const missile = missiles[index]!;
      const cycle = Math.floor((frame + index * 12) / 240);
      const remaining = 1 - ((frame + index * 12) % 240) / 240;
      const angle = index * Math.PI * 2 / missiles.length;
      missile.missileId = cycle * 100 + index;
      missile.x = Math.sin(angle) * 500 * remaining; missile.z = Math.cos(angle) * 500 * remaining;
      missile.headingRad = angle + Math.PI;
    }
  }
  step(0);
  return { players, missiles, step };
}
