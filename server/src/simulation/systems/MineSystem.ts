import {
  ARTILLERY_SPLASH_RADIUS,
  DEFAULT_MAP_ISLAND_POLYGONS,
  FEATURE_MINES_ENABLED,
  TORPEDO_HIT_RADIUS,
  TORPEDO_ISLAND_COLLISION_RADIUS,
  TORPEDO_LIFETIME_MS,
  PlayerLifeState,
  canUsePrimaryWeapon,
  isCircleOverlappingAnyIslandPolygon,
  isInsideOperationalArea,
  spawnTorpedoFromFireDirection,
  stepTorpedoStraight,
  progressionTorpedoCooldownMs,
  getShipClassProfile,
  getAuthoritativeShipHullProfile,
  circleIntersectsAnyWreckHitboxFootprintXZ,
  circleIntersectsShipHitboxFootprintXZ,
} from "@battlefleet/shared/rules";
import type { GameEventSink, TorpedoValues, WreckValues } from "@battlefleet/shared/protocol";
import type { CombatParticipants, ReadSequence, MutableSequence } from "../CombatTypes.js";
import type { ParticipantState } from "../ParticipantState.js";
import type { SimulationEnvironment } from "../SimulationEnvironment.js";
import type { LifeSystem } from "./LifeSystem.js";

/** Owns the dormant mine/torpedo path without changing its feature flag or protection exception. */
export class MineSystem {
  private nextTorpedoId = 1;
  private readonly torpedoSpawnedAt = new Map<number, number>();
  constructor(
    private readonly participants: CombatParticipants,
    private readonly torpedoes: MutableSequence<TorpedoValues>,
    private readonly wrecks: ReadSequence<WreckValues>,
    private readonly life: Pick<LifeSystem, "applyDamage">,
    private readonly environment: SimulationEnvironment,
    private readonly events: GameEventSink,
    private readonly isMatchCombatActive: () => boolean,
    private readonly getOperationalHalfExtent: () => number,
  ) {}

  clear(): void {
    while (this.torpedoes.length) {
      const index = this.torpedoes.length - 1;
      const item = this.torpedoes.at(index);
      if (item) this.removeTorpedoAt(index, item.torpedoId);
      else this.torpedoes.deleteAt(index);
    }
  }

  removeOwner(id: string): void {
    for (let i = this.torpedoes.length - 1; i >= 0; i--) {
      const item = this.torpedoes.at(i);
      if (item?.ownerId === id) this.removeTorpedoAt(i, item.torpedoId);
    }
  }

  disarmAt(x: number, z: number): void {
    if (FEATURE_MINES_ENABLED) {
      // Minen im Artillerie-Splash werden entschärft und aus dem Spiel entfernt.
      const torpedoes = this.torpedoes;
      const splashSq = ARTILLERY_SPLASH_RADIUS * ARTILLERY_SPLASH_RADIUS;
      for (let i = torpedoes.length - 1; i >= 0; i--) {
        const t = torpedoes.at(i);
        if (!t) continue;
        const dx = t.x - x;
        const dz = t.z - z;
        if (dx * dx + dz * dz > splashSq) continue;
        this.events.broadcast("torpedoImpact", {
          torpedoId: t.torpedoId,
          x: t.x,
          z: t.z,
          kind: "water",
        });
        this.removeTorpedoAt(i, t.torpedoId);
      }
    }
  }

  fire(ownerSessionId: string, row: ParticipantState): void {
    if (!FEATURE_MINES_ENABLED) return;
    if (!this.isMatchCombatActive()) return;
    const p = this.participants.players.get(ownerSessionId);
    if (!p || !canUsePrimaryWeapon(p.lifeState)) return;

    const now = this.environment.nowMs();
    if (now < row.torpedoReadyAtMs) return;

    const torpCap = getShipClassProfile(p.shipClass).torpedoMaxPerOwner;
    let owned = 0;
    for (const t of this.torpedoes) {
      if (t.ownerId === ownerSessionId) owned++;
    }
    if (owned >= torpCap) return;

    const pose = spawnTorpedoFromFireDirection(
      row.ship.x,
      row.ship.z,
      row.aimX,
      row.aimZ,
      row.ship.headingRad,
      row.mineSpawnLocalZ,
    );
    const torpedoId = this.nextTorpedoId++;
    this.torpedoes.push({ torpedoId, ownerId: ownerSessionId, ...pose });
    this.torpedoSpawnedAt.set(torpedoId, now);
    const profT = getShipClassProfile(p.shipClass);
    const torpCd = Math.round(
      progressionTorpedoCooldownMs(p.level) * profT.torpedoCooldownFactor,
    );
    row.torpedoReadyAtMs = now + Math.max(1000, torpCd);
    this.events.broadcast("torpedoFired", { torpedoId, ownerId: ownerSessionId });
  }

  private removeTorpedoAt(index: number, torpedoId: number): void {
    this.torpedoSpawnedAt.delete(torpedoId);
    this.torpedoes.deleteAt(index);
  }
  step(dt: number, now: number): void {
    const list = this.torpedoes;
    if (!FEATURE_MINES_ENABLED) {
      for (let i = list.length - 1; i >= 0; i--) {
        const t = list.at(i);
        if (t) this.removeTorpedoAt(i, t.torpedoId);
      }
      return;
    }

    const half = this.getOperationalHalfExtent();

    for (let i = list.length - 1; i >= 0; i--) {
      const t = list.at(i);
      if (!t) continue;

      const spawned = this.torpedoSpawnedAt.get(t.torpedoId) ?? now;
      if (now - spawned > TORPEDO_LIFETIME_MS) {
        this.removeTorpedoAt(i, t.torpedoId);
        continue;
      }

      const step = stepTorpedoStraight(t.x, t.z, t.headingRad, dt);
      t.x = step.x;
      t.z = step.z;
      t.headingRad = step.headingRad;

      if (!isInsideOperationalArea(t.x, t.z, half)) {
        this.events.broadcast("torpedoImpact", {
          torpedoId: t.torpedoId,
          x: t.x,
          z: t.z,
          kind: "oob",
        });
        this.removeTorpedoAt(i, t.torpedoId);
        continue;
      }

      if (
        isCircleOverlappingAnyIslandPolygon(
          t.x,
          t.z,
          TORPEDO_ISLAND_COLLISION_RADIUS,
          DEFAULT_MAP_ISLAND_POLYGONS,
        ) ||
        circleIntersectsAnyWreckHitboxFootprintXZ(
          t.x,
          t.z,
          TORPEDO_ISLAND_COLLISION_RADIUS,
          this.wrecks,
        )
      ) {
        this.events.broadcast("torpedoImpact", {
          torpedoId: t.torpedoId,
          x: t.x,
          z: t.z,
          kind: "island",
        });
        this.removeTorpedoAt(i, t.torpedoId);
        continue;
      }

      let hitId: string | null = null;
      for (const pl of this.participants.players.values()) {
        // Minen sind Flächen-Trigger: alles außer bereits respawnenden Zielen kann auslösen.
        if (pl.lifeState === PlayerLifeState.AwaitingRespawn) continue;
        const hb = getAuthoritativeShipHullProfile(pl.shipClass)?.collisionHitbox;
        if (
          circleIntersectsShipHitboxFootprintXZ(t.x, t.z, TORPEDO_HIT_RADIUS, pl.x, pl.z, pl.headingRad, hb)
        ) {
          hitId = pl.id;
          break;
        }
      }

      if (hitId != null) {
        const victim = this.participants.players.get(hitId);
        if (victim) {
          // Mine verursacht 90% der Max-HP des Opfers, damit sie meist kampfunfähig macht,
          // aber bei voller HP nicht zwingend sofort tötet.
          const torpDmg = Math.max(1, Math.round(victim.maxHp * 0.9));
          this.life.applyDamage(victim.id, torpDmg, now, t.ownerId, true);
        }
        this.events.broadcast("torpedoImpact", {
          torpedoId: t.torpedoId,
          x: t.x,
          z: t.z,
          kind: "hit",
        });
        this.removeTorpedoAt(i, t.torpedoId);
      }
    }
  }

}
