import {
  ASWM_DAMAGE,
  ASWM_HIT_RADIUS,
  ASWM_ISLAND_COLLISION_RADIUS,
  ASWM_LIFETIME_MS,
  ASWM_SEEKER_ARM_DELAY_MS,
  type AswmTargetCandidate,
  DEFAULT_MAP_ISLAND_POLYGONS,
  PlayerLifeState,
  canTakeArtillerySplashDamage,
  canUsePrimaryWeapon,
  isCircleOverlappingAnyIslandPolygon,
  isInsideOperationalArea,
  pickAswmAcquisitionTarget,
  ASWM_SHOT_INTERVAL_MS,
  pickFixedSeaSkimmerLauncherWithAmmo,
  pickFixedSeaSkimmerLauncherWithAmmoForForcedSide,
  pickAswmSideForFallbackFire,
  pickAswmSideForFallbackFireForced,
  spawnAswmFromFixedLauncher,
  spawnAswmFromFireDirection,
  stepAswmMissile,
  progressionIncomingDamageFactor,
  getShipClassProfile,
  getAswmMagicReloadMsFromProfile,
  getAuthoritativeShipHullProfile,
  circleIntersectsAnyWreckHitboxFootprintXZ,
  circleIntersectsShipHitboxFootprintXZ,
} from "@battlefleet/shared/rules";
import type { GameEventSink, MissileValues, WreckValues } from "@battlefleet/shared/protocol";
import type { CombatParticipants, ReadSequence, MutableSequence } from "../CombatTypes.js";
import type { ParticipantState } from "../ParticipantState.js";
import type { SimulationEnvironment } from "../SimulationEnvironment.js";
import type { LifeSystem } from "./LifeSystem.js";
import { resetMagazine, consumeRound } from "./magazine.js";
import type { AirDefenseSystem } from "./AirDefenseSystem.js";

/** Owns missile launch, motion, lifetime and removal; delegates only interception decisions. */
export class MissileSystem {
  private nextMissileId = 1;
  private readonly missileSpawnedAt = new Map<number, number>();
  constructor(
    private readonly participants: CombatParticipants,
    private readonly missiles: MutableSequence<MissileValues>,
    private readonly wrecks: ReadSequence<WreckValues>,
    private readonly life: Pick<LifeSystem, "applyDamage">,
    private readonly defense: AirDefenseSystem,
    private readonly environment: SimulationEnvironment,
    private readonly events: GameEventSink,
    private readonly isMatchCombatActive: () => boolean,
    private readonly getOperationalHalfExtent: () => number,
  ) {}

  clear(): void {
    while (this.missiles.length) {
      const index = this.missiles.length - 1;
      const item = this.missiles.at(index);
      if (item) this.removeMissileAt(index, item.missileId);
      else this.missiles.deleteAt(index);
    }
    this.defense.clear();
  }

  removeOwner(id: string): void {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const item = this.missiles.at(i);
      if (item?.ownerId === id) this.removeMissileAt(i, item.missileId);
    }
  }

  private removeMissileAt(index: number, missileId: number): void {
    this.missileSpawnedAt.delete(missileId);
    this.defense.removeMissile(missileId);
    this.missiles.deleteAt(index);
  }

  reloadMagazines(now: number): void {
    for (const [sessionId, row] of this.participants.simulations) {
      if (row.aswmReloadUntilMs <= 0 || now < row.aswmReloadUntilMs) continue;
      const p = this.participants.players.get(sessionId);
      if (!p) continue;
      row.aswmReloadUntilMs = 0;
      resetMagazine(row, p.shipClass);
      this.events.send(sessionId, "aswmMagazineReloaded", {});
    }
  }

  fire(
    ownerSessionId: string,
    row: ParticipantState,
    explicitSide?: "port" | "starboard",
  ): void {
    if (!this.isMatchCombatActive()) return;
    const p = this.participants.players.get(ownerSessionId);
    if (!p || !canUsePrimaryWeapon(p.lifeState)) return;

    const now = this.environment.nowMs();
    if (now < row.aswmReloadUntilMs) return;
    if (now < row.aswmNextShotAtMs) return;

    const aswmCap = getShipClassProfile(p.shipClass).aswmMaxPerOwner;
    let owned = 0;
    for (const m of this.missiles) {
      if (m.ownerId === ownerSessionId) owned++;
    }
    if (owned >= aswmCap) return;

    const hullAswm = getAuthoritativeShipHullProfile(p.shipClass);
    const launchers = hullAswm?.fixedSeaSkimmerLaunchers;
    let pose: { x: number; z: number; headingRad: number } | null = null;

    if (launchers?.length) {
      const launcher =
        explicitSide !== undefined
          ? pickFixedSeaSkimmerLauncherWithAmmoForForcedSide(
              launchers,
              row.aswmRemainingPort,
              row.aswmRemainingStarboard,
              explicitSide,
            )
          : pickFixedSeaSkimmerLauncherWithAmmo(
              launchers,
              row.aimX,
              row.aimZ,
              row.ship.x,
              row.ship.z,
              row.ship.headingRad,
              row.aswmRemainingPort,
              row.aswmRemainingStarboard,
            );
      if (!launcher) return;
      consumeRound(row, launcher);
      pose = spawnAswmFromFixedLauncher(row.ship.x, row.ship.z, row.ship.headingRad, launcher);
    } else {
      const side =
        explicitSide !== undefined
          ? pickAswmSideForFallbackFireForced(
              row.aswmRemainingPort,
              row.aswmRemainingStarboard,
              explicitSide,
            )
          : pickAswmSideForFallbackFire(
              row.aimX,
              row.aimZ,
              row.ship.x,
              row.ship.z,
              row.ship.headingRad,
              row.aswmRemainingPort,
              row.aswmRemainingStarboard,
            );
      if (!side) return;
      if (side === "port") row.aswmRemainingPort--;
      else row.aswmRemainingStarboard--;
      pose = spawnAswmFromFireDirection(
        row.ship.x,
        row.ship.z,
        row.aimX,
        row.aimZ,
        row.ship.headingRad,
      );
    }

    const totalLeft = row.aswmRemainingPort + row.aswmRemainingStarboard;
    if (totalLeft > 0) {
      row.aswmNextShotAtMs = now + ASWM_SHOT_INTERVAL_MS;
    } else {
      row.aswmNextShotAtMs = 0;
      row.aswmReloadUntilMs = now + getAswmMagicReloadMsFromProfile(hullAswm);
    }

    const missileId = this.nextMissileId++;
    this.missiles.push({ missileId, ownerId: ownerSessionId, targetId: "", ...pose });
    this.missileSpawnedAt.set(missileId, now);
    this.events.broadcast("aswmFired", { missileId, ownerId: ownerSessionId });
  }

  step(dt: number, now: number): void {
    const half = this.getOperationalHalfExtent();
    const list = this.missiles;

    for (let i = list.length - 1; i >= 0; i--) {
      const m = list.at(i);
      if (!m) continue;

      const spawned = this.missileSpawnedAt.get(m.missileId) ?? now;
      if (now - spawned > ASWM_LIFETIME_MS) {
        this.removeMissileAt(i, m.missileId);
        continue;
      }

      const candidates: AswmTargetCandidate[] = [];
      for (const q of this.participants.players.values()) {
        candidates.push({
          id: q.id,
          x: q.x,
          z: q.z,
          lifeState: q.lifeState,
        });
      }
      let acquired = pickAswmAcquisitionTarget(
        m.x,
        m.z,
        m.headingRad,
        m.ownerId,
        candidates,
      );
      acquired = this.defense.filterAcquisition(m.missileId, acquired, now);
      if (now - spawned < ASWM_SEEKER_ARM_DELAY_MS) {
        acquired = null;
      }
      let tx: number | null = null;
      let tz: number | null = null;
      if (acquired != null) {
        const tgt = this.participants.players.get(acquired);
        if (tgt && tgt.lifeState !== PlayerLifeState.AwaitingRespawn) {
          tx = tgt.x;
          tz = tgt.z;
        }
      }
      const prevTargetId = m.targetId;
      m.targetId = acquired ?? "";
      if (prevTargetId === "" && m.targetId !== "") {
        this.events.send(m.ownerId, "missileLockOn", {});
      }

      const step = stepAswmMissile(m.x, m.z, m.headingRad, dt, tx, tz);
      m.x = step.x;
      m.z = step.z;
      m.headingRad = step.headingRad;

      if (!isInsideOperationalArea(m.x, m.z, half)) {
        this.events.broadcast("aswmImpact", {
          missileId: m.missileId,
          x: m.x,
          z: m.z,
          kind: "oob",
        });
        this.removeMissileAt(i, m.missileId);
        continue;
      }

      if (
        isCircleOverlappingAnyIslandPolygon(
          m.x,
          m.z,
          ASWM_ISLAND_COLLISION_RADIUS,
          DEFAULT_MAP_ISLAND_POLYGONS,
        ) ||
        circleIntersectsAnyWreckHitboxFootprintXZ(
          m.x,
          m.z,
          ASWM_ISLAND_COLLISION_RADIUS,
          this.wrecks,
        )
      ) {
        this.events.broadcast("aswmImpact", {
          missileId: m.missileId,
          x: m.x,
          z: m.z,
          kind: "island",
        });
        this.removeMissileAt(i, m.missileId);
        continue;
      }

      if (this.defense.engage(m, now)) {
        this.removeMissileAt(i, m.missileId);
        continue;
      }

      let hitId: string | null = null;
      for (const pl of this.participants.players.values()) {
        if (pl.id === m.ownerId) continue;
        if (!canTakeArtillerySplashDamage(pl.lifeState)) continue;
        const hb = getAuthoritativeShipHullProfile(pl.shipClass)?.collisionHitbox;
        if (
          circleIntersectsShipHitboxFootprintXZ(m.x, m.z, ASWM_HIT_RADIUS, pl.x, pl.z, pl.headingRad, hb)
        ) {
          hitId = pl.id;
          break;
        }
      }

      if (hitId != null) {
        const victim = this.participants.players.get(hitId);
        if (victim) {
          const aswmDmg = Math.round(
            ASWM_DAMAGE *
              progressionIncomingDamageFactor(victim.level) *
              getShipClassProfile(victim.shipClass).incomingDamageTakenMul,
          );
          this.life.applyDamage(victim.id, aswmDmg, now, m.ownerId);
        }
        this.events.broadcast("aswmImpact", {
          missileId: m.missileId,
          x: m.x,
          z: m.z,
          kind: "hit",
        });
        this.removeMissileAt(i, m.missileId);
      }
    }
  }

}
