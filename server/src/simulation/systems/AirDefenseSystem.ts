import {
  PlayerLifeState,
  canTakeArtillerySplashDamage,
  AD_SAM_RANGE_SQ,
  AD_SOFTKILL_RANGE_SQ,
  AD_SOFTKILL_SAME_TARGET_REACQUIRE_BLOCK_MS,
  type AirDefenseHardkillLayer,
  applyHardkillCooldownAfterRoll,
  isHardkillLayerInRange,
  pickHardkillEngagementLayer,
  rollHardkillHit,
  trySoftkillBreakLock,
  computeSamPdInterceptTravelMs,
  isAswmMissileClosingOnWorldPoint,
  getShipClassProfile,
  getAuthoritativeShipHullProfile,
  minDistSqPointToShipHitboxFootprintXZ,
  pickHardkillMountForTarget,
  mountSlotMuzzleWorld,
} from "@battlefleet/shared/rules";
import type { GameEventSink, MissileValues } from "@battlefleet/shared/protocol";
import type { CombatParticipants, ReadSequence } from "../CombatTypes.js";
import type { SimulationEnvironment } from "../SimulationEnvironment.js";

/** Owns interception deadlines, defender choice and softkill memory, never projectile membership. */
export class AirDefenseSystem {
  private readonly adIncomingScratch = new Map<string, number>();
  private readonly adRadarHintScratch = new Set<string>();
  /**
   * Nach `airDefenseFire`: SAM/PD warten `rollReadyAtMs` (Flug bis ASuM), dann Trefferwurf;
   * CIWS: `rollReadyAtMs === now` → nächster Tick.
   */
  private readonly adPendingRollByMissileId = new Map<
    number,
    {
      defenderId: string;
      layer: AirDefenseHardkillLayer;
      rollReadyAtMs: number;
      /** Für SAM: Cooldown wurde bereits beim `airDefenseFire` reserviert. */
      samCooldownReservedAtFire?: boolean;
    }
  >();
  /** Softkill: höchstens ein Versuch pro Rakete+Verteidiger. */
  private readonly adSoftkillAttemptedMissileDefender = new Set<string>();
  /** Nach erfolgreichem Softkill: Seeker-Ziel `defenderId` bis `untilMs` nicht wieder annehmen. */
  private readonly aswmSoftkillReacquireBlockByMissileId = new Map<
    number,
    { defenderId: string; untilMs: number }
  >();


  constructor(
    private readonly participants: CombatParticipants,
    private readonly environment: SimulationEnvironment,
    private readonly events: GameEventSink,
    private readonly getSamCooldownMs: () => number,
  ) {}

  clear(): void {
    this.adPendingRollByMissileId.clear();
    this.adSoftkillAttemptedMissileDefender.clear();
    this.aswmSoftkillReacquireBlockByMissileId.clear();
    this.adIncomingScratch.clear();
    this.adRadarHintScratch.clear();
  }

  filterAcquisition(missileId: number, acquired: string | null, now: number): string | null {
    let reBlock = this.aswmSoftkillReacquireBlockByMissileId.get(missileId);
    if (reBlock && now >= reBlock.untilMs) {
      this.aswmSoftkillReacquireBlockByMissileId.delete(missileId);
      reBlock = undefined;
    }
    if (reBlock && acquired === reBlock.defenderId) {
      acquired = null;
    }
    return acquired;
  }

  removeMissile(missileId: number): void {
    this.adPendingRollByMissileId.delete(missileId);
    const prefix = `${missileId}|`;
    for (const k of this.adSoftkillAttemptedMissileDefender) {
      if (k.startsWith(prefix)) this.adSoftkillAttemptedMissileDefender.delete(k);
    }
    this.aswmSoftkillReacquireBlockByMissileId.delete(missileId);
  }

  private findClosestAirDefenseDefenderForMissile(
    mx: number,
    mz: number,
    ownerId: string,
  ): string | null {
    let best: string | null = null;
    let bestD2 = Infinity;
    for (const pl of this.participants.players.values()) {
      if (pl.id === ownerId) continue;
      if (!canTakeArtillerySplashDamage(pl.lifeState)) continue;
      const hb = getAuthoritativeShipHullProfile(pl.shipClass)?.collisionHitbox;
      const d2 = minDistSqPointToShipHitboxFootprintXZ(mx, mz, pl.x, pl.z, pl.headingRad, hb);
      if (d2 <= AD_SAM_RANGE_SQ && d2 < bestD2) {
        bestD2 = d2;
        best = pl.id;
      }
    }
    return best;
  }

  private resolveAirDefenseDefenderId(m: MissileValues): string | null {
    let adDefenderId: string | null = null;
    if (m.targetId !== "") {
      const t = this.participants.players.get(m.targetId);
      if (t && canTakeArtillerySplashDamage(t.lifeState)) {
        adDefenderId = m.targetId;
      }
    }
    if (adDefenderId == null) {
      adDefenderId = this.findClosestAirDefenseDefenderForMissile(m.x, m.z, m.ownerId);
    }
    return adDefenderId;
  }

  syncHud(missiles: ReadSequence<MissileValues>): void {
    const incoming = this.adIncomingScratch;
    const radarHint = this.adRadarHintScratch;
    incoming.clear();
    radarHint.clear();
    for (let i = 0; i < missiles.length; i++) {
      const m = missiles.at(i);
      if (!m) continue;
      const defId = this.resolveAirDefenseDefenderId(m);
      if (!defId) continue;
      incoming.set(defId, (incoming.get(defId) ?? 0) + 1);
      const row = this.participants.simulations.get(defId);
      const tgt = this.participants.players.get(defId);
      if (!row || !tgt) continue;
      const hb = getAuthoritativeShipHullProfile(tgt.shipClass)?.collisionHitbox;
      const distSq = minDistSqPointToShipHitboxFootprintXZ(
        m.x,
        m.z,
        tgt.x,
        tgt.z,
        tgt.headingRad,
        hb,
      );
      if (!row.radarActive && distSq <= AD_SAM_RANGE_SQ) {
        radarHint.add(defId);
      }
    }
    for (const p of this.participants.players.values()) {
      if (p.lifeState === PlayerLifeState.AwaitingRespawn) {
        p.adHudIncomingAswm = 0;
        p.adHudCanCommitHardkill = false;
        p.adHardkillCommitRemainingSec = 0;
        p.adHudRadarAffectsSam = false;
        continue;
      }
      p.adHudIncomingAswm = incoming.get(p.id) ?? 0;
      p.adHudCanCommitHardkill = p.adHudIncomingAswm > 0;
      p.adHardkillCommitRemainingSec = 0;
      p.adHudRadarAffectsSam = radarHint.has(p.id);
    }
  }


  /** True means intercepted; the caller removes the missile through its single release path. */
  engage(m: MissileValues, now: number): boolean {
    const adDefenderId = this.resolveAirDefenseDefenderId(m);
    if (adDefenderId != null) {
      const tgt = this.participants.players.get(adDefenderId);
      const defRow = this.participants.simulations.get(adDefenderId);
      if (!tgt || !defRow || !canTakeArtillerySplashDamage(tgt.lifeState)) {
        this.adPendingRollByMissileId.delete(m.missileId);
      } else {
        const hb = getAuthoritativeShipHullProfile(tgt.shipClass)?.collisionHitbox;
        const distSq = minDistSqPointToShipHitboxFootprintXZ(m.x, m.z, tgt.x, tgt.z, tgt.headingRad, hb);

        const skKey = `${m.missileId}|${adDefenderId}`;
        if (distSq <= AD_SOFTKILL_RANGE_SQ && !this.adSoftkillAttemptedMissileDefender.has(skKey)) {
          const sk = trySoftkillBreakLock({
            nowMs: now,
            defenderSoftkillLastUsedAtMs: defRow.adSoftkillLastUsedAtMs,
            random01: this.environment.random,
          });
          if (sk.attempted) {
            this.adSoftkillAttemptedMissileDefender.add(skKey);
            defRow.adSoftkillLastUsedAtMs = sk.newSoftkillLastUsedAtMs;
            if (sk.brokeLock) {
              m.targetId = "";
              this.aswmSoftkillReacquireBlockByMissileId.set(m.missileId, {
                defenderId: adDefenderId,
                untilMs: now + AD_SOFTKILL_SAME_TARGET_REACQUIRE_BLOCK_MS,
              });
            }
            this.events.send(adDefenderId, "softkillResult", { success: sk.brokeLock });
          }
        }

        const defenderHull = getAuthoritativeShipHullProfile(tgt.shipClass);
        const adClassArc = getShipClassProfile(tgt.shipClass).artilleryArcHalfAngleRad;
        const samClosingOnDefender = isAswmMissileClosingOnWorldPoint(
          m.x,
          m.z,
          m.headingRad,
          tgt.x,
          tgt.z,
        );
        const eligibleMount = (layer: AirDefenseHardkillLayer) =>
          pickHardkillMountForTarget(defenderHull, adClassArc, layer, tgt.x, tgt.z, tgt.headingRad, m.x, m.z);
        const samMount = samClosingOnDefender && defRow.radarActive ? eligibleMount("sam") : null;
        const pdMount = m.targetId === adDefenderId ? eligibleMount("pd") : null;
        const ciwsMount = eligibleMount("ciws");
        const adInput = {
          distSq,
          nowMs: now,
          samNextAtMs: defRow.adSamNextAtMs,
          pdNextAtMs: defRow.adPdNextAtMs,
          ciwsNextAtMs: defRow.adCiwsNextAtMs,
          samAllowed: samMount !== null,
          pdAllowed: pdMount !== null,
          ciwsAllowed: ciwsMount !== null,
        };

        let airDefenseConsumed = false;
        const pending = this.adPendingRollByMissileId.get(m.missileId);
        if (pending != null) {
          if (pending.defenderId !== adDefenderId) {
            this.adPendingRollByMissileId.delete(m.missileId);
          } else {
            airDefenseConsumed = true;
            if (!isHardkillLayerInRange(pending.layer, distSq)) {
              if (!(pending.layer === "sam" && pending.samCooldownReservedAtFire)) {
                const cdMiss = applyHardkillCooldownAfterRoll(
                  pending.layer,
                  now,
                  defRow.adSamNextAtMs,
                  defRow.adPdNextAtMs,
                  defRow.adCiwsNextAtMs,
                );
                defRow.adSamNextAtMs = cdMiss.samNextAtMs;
                defRow.adPdNextAtMs = cdMiss.pdNextAtMs;
                defRow.adCiwsNextAtMs = cdMiss.ciwsNextAtMs;
              }
              this.adPendingRollByMissileId.delete(m.missileId);
            } else if (
              (pending.layer === "sam" || pending.layer === "pd") &&
              now < pending.rollReadyAtMs
            ) {
              /* SAM/PD: Abfangkörper unterwegs — noch kein Wurf. */
            } else {
              const hit = rollHardkillHit(pending.layer, this.environment.random);
              if (!(pending.layer === "sam" && pending.samCooldownReservedAtFire)) {
                const cd = applyHardkillCooldownAfterRoll(
                  pending.layer,
                  now,
                  defRow.adSamNextAtMs,
                  defRow.adPdNextAtMs,
                  defRow.adCiwsNextAtMs,
                );
                defRow.adSamNextAtMs = cd.samNextAtMs;
                defRow.adPdNextAtMs = cd.pdNextAtMs;
                defRow.adCiwsNextAtMs = cd.ciwsNextAtMs;
              }
              if (hit) {
                this.events.broadcast("airDefenseIntercept", {
                  weapon: "aswm",
                  id: m.missileId,
                  defenderId: adDefenderId,
                  defenderX: tgt.x,
                  defenderZ: tgt.z,
                  layer: pending.layer,
                  x: m.x,
                  z: m.z,
                });
                this.adPendingRollByMissileId.delete(m.missileId);
                return true;
              }
              this.adPendingRollByMissileId.delete(m.missileId);
            }
          }
        }

        if (!airDefenseConsumed) {
          const layer = pickHardkillEngagementLayer(adInput);
          if (layer != null) {
            const mount = (layer === "sam" ? samMount : layer === "pd" ? pdMount : ciwsMount)!;
            const muzzle = mountSlotMuzzleWorld(defenderHull!, mount.id, tgt.x, tgt.z, tgt.headingRad, m);
            const distanceM = Math.hypot(m.x - muzzle.x, m.z - muzzle.z);
            const rollReadyAtMs =
              layer === "ciws" ? now : now + computeSamPdInterceptTravelMs(distanceM);
            const samCooldownReservedAtFire = layer === "sam";
            if (samCooldownReservedAtFire) {
              // Direkt beim Feuer: globalen SAM-Takt reservieren (verhindert mehrere SAM-Starts im selben Tick).
              defRow.adSamNextAtMs = now + this.getSamCooldownMs();
            }
            this.adPendingRollByMissileId.set(m.missileId, {
              defenderId: adDefenderId,
              layer,
              rollReadyAtMs,
              samCooldownReservedAtFire,
            });
            this.events.broadcast("airDefenseFire", {
              slotId: mount.id, fromX: muzzle.x, fromY: muzzle.y, fromZ: muzzle.z,
              weapon: "aswm",
              id: m.missileId,
              defenderId: adDefenderId,
              defenderX: tgt.x,
              defenderZ: tgt.z,
              layer,
              x: m.x,
              z: m.z,
            });
          }
        }
      }
    } else {
      this.adPendingRollByMissileId.delete(m.missileId);
    }
    return false;
  }
}
