import type { PlayerValues } from "@battlefleet/shared/protocol";
import { createShipState, PlayerLifeState, shipClassBaseMaxHp } from "@battlefleet/shared/rules";
import type { ParticipantState } from "./ParticipantState.js";
import { ParticipantRegistry } from "./ParticipantRegistry.js";
import { resetMagazine } from "./systems/magazine.js";

/** Plain-data fixture: subsystem tests must not need a Colyseus room or schema instance. */
export function testParticipants(...ids: string[]) {
  const registry = new ParticipantRegistry<PlayerValues, ParticipantState>();
  for (const id of ids) {
    const maxHp = shipClassBaseMaxHp("fac");
    const player: PlayerValues = {
      id, displayName: id, x: 0, z: 0, headingRad: 0, speed: 0, rudder: 0, aimX: 0, aimZ: 80,
      oobCountdownSec: 0, hp: maxHp, maxHp, primaryCooldownSec: 0, secondaryCooldownSec: 0,
      torpedoCooldownSec: 0, lifeState: PlayerLifeState.Alive, respawnCountdownSec: 0,
      spawnProtectionSec: 0, score: 0, kills: 0, level: 1, xp: 0, shipClass: "fac",
      radarActive: true, adHudIncomingAswm: 0, adHudCanCommitHardkill: false,
      adHardkillCommitRemainingSec: 0, adHudRadarAffectsSam: false,
      aswmRemainingPort: 0, aswmRemainingStarboard: 0, deathAtMs: 0, killedBySessionId: "",
    };
    const row: ParticipantState = {
      ship: createShipState(0, 0), lastRudderInput: 0, aimX: 0, aimZ: 80, mineSpawnLocalZ: -22,
      oobSinceMs: null, primaryReadyAtMs: 0, aswmRemainingPort: 0, aswmRemainingStarboard: 0,
      aswmNextShotAtMs: 0, aswmReloadUntilMs: 0, torpedoReadyAtMs: 0,
      adSamNextAtMs: 0, adPdNextAtMs: 0, adCiwsNextAtMs: 0, adSoftkillLastUsedAtMs: 0,
      respawnAtMs: null, invulnerableUntilMs: 0, radarActive: true,
    };
    resetMagazine(row, player.shipClass);
    player.aswmRemainingPort = row.aswmRemainingPort;
    player.aswmRemainingStarboard = row.aswmRemainingStarboard;
    registry.add(player, row);
  }
  return registry;
}
