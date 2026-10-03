import { SHIP_CLASS_FAC, DEFAULT_MAP_ISLAND_POLYGONS, MIN_RESPAWN_SEPARATION, tryPickRespawnPosition,
  pickRimSpawnDeterministic, createShipState, shipClassBaseMaxHp, progressionMaxHpForLevel,
  PlayerLifeState, assertPlayerLifeInvariant } from "@battlefleet/shared/rules";
import type { PlayerValues } from "@battlefleet/shared/protocol";
import type { ParticipantState } from "./ParticipantState.js";
import { resetMagazine } from "./systems/magazine.js";

/** New joins begin alive (not spawn-protected); round reset and respawn have distinct contracts. */
export function createParticipant(sessionId: string, displayName: string, players: readonly PlayerValues[],
  operationalHalfExtent: number, random: () => number, islandPolygons = DEFAULT_MAP_ISLAND_POLYGONS): { player: PlayerValues; simulation: ParticipantState } {
  const shipClass = SHIP_CLASS_FAC;
  const others: { x: number; z: number }[] = [];
  for (const q of players) {
    others.push({ x: q.x, z: q.z });
  }
  const angleForFallback =
    players.length * 2.5132741228718345 + sessionId.length * 0.37;
  const spawnHalf = operationalHalfExtent;
  const spawnPick =
    tryPickRespawnPosition(
      spawnHalf,
      islandPolygons,
      others,
      MIN_RESPAWN_SEPARATION,
      random,
    ) ??
    pickRimSpawnDeterministic(
      spawnHalf,
      islandPolygons,
      others,
      MIN_RESPAWN_SEPARATION,
      angleForFallback,
    );
  const spawnX = spawnPick.x;
  const spawnZ = spawnPick.z;

  const ship = createShipState(spawnX, spawnZ);
  ship.headingRad = spawnPick.headingRad;
  const aimX = spawnX;
  const aimZ = spawnZ + 80;
  const simRow: ParticipantState = {
    ship,
    lastRudderInput: 0,
    aimX,
    aimZ,
    mineSpawnLocalZ: -22,
    oobSinceMs: null,
    primaryReadyAtMs: 0,
    aswmRemainingPort: 0,
    aswmRemainingStarboard: 0,
    aswmNextShotAtMs: 0,
    aswmReloadUntilMs: 0,
    torpedoReadyAtMs: 0,
    adSamNextAtMs: 0,
    adPdNextAtMs: 0,
    adCiwsNextAtMs: 0,
    adSoftkillLastUsedAtMs: 0,
    respawnAtMs: null,
    invulnerableUntilMs: 0,
    radarActive: true,
  };
  resetMagazine(simRow, shipClass);

  const baseHp = shipClassBaseMaxHp(shipClass);
  const maxHp = progressionMaxHpForLevel(1, baseHp);
  const ps: PlayerValues = {
    id: sessionId,
    x: ship.x,
    z: ship.z,
    headingRad: ship.headingRad,
    speed: ship.speed,
    rudder: ship.rudder,
    aimX: aimX,
    aimZ: aimZ,
    oobCountdownSec: 0,
    shipClass: shipClass,
    displayName: displayName,
    level: 1,
    xp: 0,
    maxHp: maxHp,
    hp: maxHp,
    primaryCooldownSec: 0,
    lifeState: PlayerLifeState.Alive,
    respawnCountdownSec: 0,
    spawnProtectionSec: 0,
    secondaryCooldownSec: 0,
    torpedoCooldownSec: 0,
    score: 0,
    kills: 0,
    radarActive: true,
    adHudIncomingAswm: 0,
    adCooldownMask: 0,
    adHudCanCommitHardkill: false,
    adHardkillCommitRemainingSec: 0,
    adHudRadarAffectsSam: false,
    aswmRemainingPort: simRow.aswmRemainingPort,
    aswmRemainingStarboard: simRow.aswmRemainingStarboard,
    deathAtMs: 0,
    killedBySessionId: "",
  };
  assertPlayerLifeInvariant(ps.lifeState, ps.hp, ps.maxHp);
  return { player: ps, simulation: simRow };
}
