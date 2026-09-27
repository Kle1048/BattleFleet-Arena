import {
  PlayerLifeState, assertPlayerLifeInvariant, canTakeArtillerySplashDamage,
  isValidKillAttribution, shipClassIdForProgressionLevel, progressionMinXpForLevel,
  progressionMaxHpForLevel, shipClassBaseMaxHp, SHIP_CLASS_FAC,
  DEFAULT_MAP_ISLAND_POLYGONS, MIN_RESPAWN_SEPARATION,
  tryPickRespawnPosition, pickRimSpawnDeterministic, wreckVariantFromSessionId, WRECK_DURATION_MS,
} from "@battlefleet/shared/rules";
import type { PlayerValues, WreckValues } from "@battlefleet/shared/protocol";
import type { ParticipantState } from "../ParticipantState.js";
import { resetMagazine, clearMagazine } from "./magazine.js";

type Participants = {
  players: ReadonlyMap<string, PlayerValues>;
  simulations: ReadonlyMap<string, ParticipantState>;
};
export type LifeSettings = {
  respawnDelayMs(): number;
  spawnProtectionMs(): number;
  operationalHalfExtent(): number;
};
export type LifePorts = {
  isCombatActive(): boolean;
  grantKill(player: PlayerValues): void;
  clearOwnedShells(sessionId: string): void;
  addWreck(wreck: WreckValues): void;
};

/** Owns damage, death, protection and respawn. No transport, timers or storage are owned here. */
export class LifeSystem {
  constructor(
    private readonly participants: Participants,
    private readonly settings: LifeSettings,
    private readonly ports: LifePorts,
    private readonly random: () => number,
    private readonly getIslandPolygons = () => DEFAULT_MAP_ISLAND_POLYGONS,
  ) {}

  /**
   * Combat callers calculate hit/damage; life eligibility and the lethal transition live here.
   * Dormant mines historically bypass protection. Keep that exception explicit at their call site.
   */
  applyDamage(sessionId: string, damage: number, now: number, killerSessionId?: string,
    bypassSpawnProtection = false): void {
    const player = this.participants.players.get(sessionId);
    if (!player || player.lifeState === PlayerLifeState.AwaitingRespawn) return;
    if (!bypassSpawnProtection && !canTakeArtillerySplashDamage(player.lifeState)) return;
    player.hp = Math.max(0, player.hp - damage);
    if (player.hp <= 0) this.destroy(sessionId, now, { killerSessionId });
  }

  /** Called at the existing post-movement phase, including while a round has ended. */
  regenerate(player: PlayerValues, dtSec: number): void {
    if ((player.lifeState === PlayerLifeState.Alive || player.lifeState === PlayerLifeState.SpawnProtected) &&
      player.hp > 0 && player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.01 * dtSec);
    }
  }

  private participantIndex(sessionId: string): number {
    let index = 0;
    for (const id of this.participants.players.keys()) {
      if (id === sessionId) return index;
      index++;
    }
    return 0;
  }

  /** Environmental destruction intentionally bypasses spawn protection (e.g. OOB timeout). */
  destroy(
    sessionId: string,
    now: number,
    opts?: { killerSessionId?: string },
  ): void {
    const row = this.participants.simulations.get(sessionId);
    const p = this.participants.players.get(sessionId);
    if (!row || !p || p.lifeState === PlayerLifeState.AwaitingRespawn) return;

    const killerId = opts?.killerSessionId;
    p.killedBySessionId =
      killerId != null && isValidKillAttribution(killerId, sessionId) ? killerId : "";
    if (
      this.ports.isCombatActive() &&
      killerId != null &&
      isValidKillAttribution(killerId, sessionId)
    ) {
      const killer = this.participants.players.get(killerId);
      if (killer) {
        killer.kills += 1;
        this.ports.grantKill(killer);
      }
    }

    const newLevel = Math.max(1, p.level - 1);
    const nextClass = shipClassIdForProgressionLevel(newLevel);
    p.level = newLevel;
    p.xp = progressionMinXpForLevel(newLevel);
    // `shipClass` bleibt der zerstörte Rumpf (Wrack-GLB), bis `performRespawn` — nicht sofort degradiert.
    const baseHpDead = shipClassBaseMaxHp(nextClass);
    p.maxHp = progressionMaxHpForLevel(newLevel, baseHpDead);
    p.hp = 0;
    p.lifeState = PlayerLifeState.AwaitingRespawn;
    const respawnDelayMs = this.settings.respawnDelayMs();
    p.respawnCountdownSec = respawnDelayMs / 1000;
    p.spawnProtectionSec = 0;
    row.respawnAtMs = now + respawnDelayMs;
    row.invulnerableUntilMs = 0;
    row.ship.speed = 0;
    row.ship.throttle = 0;
    row.ship.rudder = 0;
    row.oobSinceMs = null;
    row.primaryReadyAtMs = 0;
    clearMagazine(row);
    row.torpedoReadyAtMs = 0;
    row.adSamNextAtMs = 0;
    row.adPdNextAtMs = 0;
    row.adCiwsNextAtMs = 0;
    row.adSoftkillLastUsedAtMs = 0;
    this.ports.clearOwnedShells(sessionId);
    p.deathAtMs = now;
    assertPlayerLifeInvariant(p.lifeState, p.hp, p.maxHp);
  }

  /** A new round resets scores and input as well as life; respawn deliberately does not. */
  resetPlayers(now: number): void {
    const placed: { x: number; z: number }[] = [];
    for (const p of this.participants.players.values()) {
      const row = this.participants.simulations.get(p.id);
      if (!row) continue;

      const angleSeed =
        placed.length * 2.5132741228718345 + p.id.length * 0.37;
      const spawnHalf = this.settings.operationalHalfExtent();
      const spawnPick =
        tryPickRespawnPosition(
          spawnHalf,
          this.getIslandPolygons(),
          placed,
          MIN_RESPAWN_SEPARATION,
          this.random,
        ) ??
        pickRimSpawnDeterministic(
          spawnHalf,
          this.getIslandPolygons(),
          placed,
          MIN_RESPAWN_SEPARATION,
          angleSeed,
        );
      const spawnX = spawnPick.x;
      const spawnZ = spawnPick.z;
      const headingRad = spawnPick.headingRad;
      placed.push({ x: spawnX, z: spawnZ });

      row.ship.x = spawnX;
      row.ship.z = spawnZ;
      row.ship.headingRad = headingRad;
      row.ship.speed = 0;
      row.ship.throttle = 0;
      row.ship.rudder = 0;
      row.lastRudderInput = 0;
      row.aimX = spawnX;
      row.aimZ = spawnZ + 80;
      row.mineSpawnLocalZ = -22;
      row.oobSinceMs = null;
      row.primaryReadyAtMs = 0;
      // Establish the new round's class before deriving its magazine and HP.
      p.shipClass = SHIP_CLASS_FAC;
      resetMagazine(row, p.shipClass);
      p.aswmRemainingPort = row.aswmRemainingPort;
      p.aswmRemainingStarboard = row.aswmRemainingStarboard;
      row.torpedoReadyAtMs = 0;
      row.adSamNextAtMs = 0;
      row.adPdNextAtMs = 0;
      row.adCiwsNextAtMs = 0;
      row.adSoftkillLastUsedAtMs = 0;
      row.respawnAtMs = null;
      const spawnProtectionMs = this.settings.spawnProtectionMs();
      row.invulnerableUntilMs = now + spawnProtectionMs;
      row.radarActive = true;

      p.x = spawnX;
      p.z = spawnZ;
      p.headingRad = headingRad;
      p.speed = 0;
      p.rudder = 0;
      p.aimX = row.aimX;
      p.aimZ = row.aimZ;
      p.oobCountdownSec = 0;
      p.level = 1;
      p.xp = 0;
      const baseHpR = shipClassBaseMaxHp(p.shipClass);
      p.maxHp = progressionMaxHpForLevel(1, baseHpR);
      p.hp = p.maxHp;
      p.primaryCooldownSec = 0;
      p.secondaryCooldownSec = 0;
      p.torpedoCooldownSec = 0;
      p.lifeState = PlayerLifeState.SpawnProtected;
      p.respawnCountdownSec = 0;
      p.spawnProtectionSec = spawnProtectionMs / 1000;
      p.score = 0;
      p.kills = 0;
      p.radarActive = true;
      p.deathAtMs = 0;
      p.killedBySessionId = "";

      assertPlayerLifeInvariant(p.lifeState, p.hp, p.maxHp);
    }
  }

  private performRespawn(sessionId: string, now: number): void {
    const row = this.participants.simulations.get(sessionId);
    const p = this.participants.players.get(sessionId);
    if (!row || !p || p.lifeState !== PlayerLifeState.AwaitingRespawn) return;
    if (row.respawnAtMs == null || now < row.respawnAtMs) return;

    const deadShipClass = p.shipClass;
    const deadHeading = row.ship.headingRad;
    const anchorX = row.ship.x;
    const anchorZ = row.ship.z;
    // The wreck records the destroyed hull before progression chooses the respawn class.
    this.ports.addWreck({
      wreckId: `w-${sessionId}-${now}`,
      anchorX, anchorZ, headingRad: deadHeading,
      variant: wreckVariantFromSessionId(sessionId),
      shipClass: deadShipClass,
      deathAtMs: p.deathAtMs > 0 ? p.deathAtMs : now,
      createdAtMs: now,
      expiresAtMs: now + WRECK_DURATION_MS,
    });

    const others: { x: number; z: number }[] = [];
    for (const q of this.participants.players.values()) {
      if (q.id === sessionId) continue;
      if (q.lifeState === PlayerLifeState.AwaitingRespawn) continue;
      others.push({ x: q.x, z: q.z });
    }

    const respawnHalf = this.settings.operationalHalfExtent();
    const spawn =
      tryPickRespawnPosition(
        respawnHalf,
        this.getIslandPolygons(),
        others,
        MIN_RESPAWN_SEPARATION,
        this.random,
      ) ??
      pickRimSpawnDeterministic(
        respawnHalf,
        this.getIslandPolygons(),
        others,
        MIN_RESPAWN_SEPARATION,
        this.participantIndex(sessionId) * 2.5132741228718345 +
          sessionId.length * 0.37,
      );

    row.ship.x = spawn.x;
    row.ship.z = spawn.z;
    row.ship.headingRad = spawn.headingRad;
    row.ship.speed = 0;
    row.ship.throttle = 0;
    row.ship.rudder = 0;
    row.aimX = spawn.x + Math.sin(spawn.headingRad) * 80;
    row.aimZ = spawn.z + Math.cos(spawn.headingRad) * 80;
    row.mineSpawnLocalZ = -22;
    row.respawnAtMs = null;
    row.oobSinceMs = null;
    row.primaryReadyAtMs = 0;
    p.shipClass = shipClassIdForProgressionLevel(p.level);
    resetMagazine(row, p.shipClass);
    row.torpedoReadyAtMs = 0;
    row.adSamNextAtMs = 0;
    row.adPdNextAtMs = 0;
    row.adCiwsNextAtMs = 0;
    row.adSoftkillLastUsedAtMs = 0;
    const spawnProtectionMs = this.settings.spawnProtectionMs();
    row.invulnerableUntilMs = now + spawnProtectionMs;
    row.radarActive = true;

    p.x = row.ship.x;
    p.z = row.ship.z;
    p.headingRad = row.ship.headingRad;
    p.speed = 0;
    p.rudder = 0;
    p.aimX = row.aimX;
    p.aimZ = row.aimZ;
    const baseHpResp = shipClassBaseMaxHp(p.shipClass);
    p.maxHp = progressionMaxHpForLevel(p.level, baseHpResp);
    p.hp = p.maxHp;
    p.lifeState = PlayerLifeState.SpawnProtected;
    p.respawnCountdownSec = 0;
    p.spawnProtectionSec = spawnProtectionMs / 1000;
    p.radarActive = true;
    p.deathAtMs = 0;
    p.killedBySessionId = "";

    assertPlayerLifeInvariant(p.lifeState, p.hp, p.maxHp);
  }

  tick(now: number): void {
    for (const [sessionId, row] of this.participants.simulations) {
      const p = this.participants.players.get(sessionId);
      if (!p) continue;

      if (p.lifeState === PlayerLifeState.AwaitingRespawn) {
        if (row.respawnAtMs != null && now >= row.respawnAtMs) {
          this.performRespawn(sessionId, now);
        } else if (row.respawnAtMs != null) {
          p.respawnCountdownSec = Math.max(0, (row.respawnAtMs - now) / 1000);
        }
        continue;
      }

      if (p.lifeState === PlayerLifeState.SpawnProtected) {
        p.spawnProtectionSec = Math.max(0, (row.invulnerableUntilMs - now) / 1000);
        if (now >= row.invulnerableUntilMs) {
          p.lifeState = PlayerLifeState.Alive;
          p.spawnProtectionSec = 0;
          row.invulnerableUntilMs = 0;
          assertPlayerLifeInvariant(p.lifeState, p.hp, p.maxHp);
        }
        continue;
      }

      if (p.lifeState === PlayerLifeState.Alive) {
        p.respawnCountdownSec = 0;
        p.spawnProtectionSec = 0;
      }
    }
  }
}
