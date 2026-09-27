import {
  DESTROYER_LIKE_MVP,
  type ShipMovementConfig,
  ISLAND_SCRAPE_BASE_HP,
  resolveShipIslandPolygonCollisions,
  resolveShipAndWreckObbOverlaps,
  resolveShipShipCollisions,
  type ShipCollisionParticipant,
  accumulateShipRamDamage,
  accumulateWreckRamDamage,
  smoothRudder,
  movementConfigForPlayer,
  stepMovement,
  shipOverlapsAnyIslandPolygons,
  shipOverlapsAnyWreck,
  twoShipsObbOverlap,
  DEFAULT_MAP_ISLAND_POLYGONS, participatesInWorldSimulation, canTakeArtillerySplashDamage,
  getAuthoritativeShipHullProfile, getShipClassProfile, progressionIncomingDamageFactor,
} from "@battlefleet/shared/rules";
import type { PlayerValues, WreckValues } from "@battlefleet/shared/protocol";
import type { ParticipantState } from "../ParticipantState.js";
import type { LifeSystem } from "./LifeSystem.js";

type Participants = {
  players: ReadonlyMap<string, PlayerValues>;
  simulations: ReadonlyMap<string, ParticipantState>;
};
/** Borrowed synchronous view, compatible with plain arrays without copying wrecks each tick. */
type Wrecks = { readonly length: number; at(index: number): WreckValues | undefined };

/** Movement and collision share a candidate pass; damage remains exclusively owned by LifeSystem. */
export class MovementSystem {
  private readonly cfg = DESTROYER_LIKE_MVP;
  private readonly movementConfigs = new WeakMap<PlayerValues, { shipClass: string; level: number; config: ShipMovementConfig }>();
  private readonly collisionParticipantsScratch: ShipCollisionParticipant[] = [];
  private readonly collisionIslandOverlapPrev = new Map<string, boolean>();
  private readonly collisionWreckOverlapPrev = new Map<string, boolean>();
  private collisionShipPairScratch = new Set<string>();
  private collisionShipPairPrev = new Set<string>();

  constructor(
    private readonly participants: Participants,
    private readonly life: Pick<LifeSystem, "applyDamage">,
    private readonly sendCollisionContact: (sessionId: string, kind: "island" | "ship") => void,
    private readonly getIslandPolygons = () => DEFAULT_MAP_ISLAND_POLYGONS,
  ) {}

  remove(sessionId: string): void {
    this.collisionIslandOverlapPrev.delete(sessionId);
    this.collisionWreckOverlapPrev.delete(sessionId);
  }

  resetRoundContacts(): void {
    this.collisionIslandOverlapPrev.clear();
    this.collisionWreckOverlapPrev.clear();
    // Preserve legacy pair-edge timing: the next overlap pass replaces ship pairs.
  }

  dispose(): void {
    this.resetRoundContacts();
    this.collisionParticipantsScratch.length = 0;
    this.collisionShipPairScratch.clear();
    this.collisionShipPairPrev.clear();
  }

  configForPlayer(p: PlayerValues): ShipMovementConfig {
    const cached = this.movementConfigs.get(p);
    if (cached?.shipClass === p.shipClass && cached.level === p.level) return cached.config;
    const config = movementConfigForPlayer(
      this.cfg,
      getShipClassProfile(p.shipClass),
      p.level,
      getAuthoritativeShipHullProfile(p.shipClass)?.movement ?? null,
    );
    this.movementConfigs.set(p, { shipClass: p.shipClass, level: p.level, config });
    return config;
  }

  step(dt: number, now: number, combatActive: boolean, wreckList: Wrecks): void {
    this.moveAndResolveTerrain(dt, now, combatActive, wreckList);
    const candidates = this.collectCollisionCandidates();
    if (combatActive) this.applyRamDamage(candidates, wreckList, dt, now);
    // Contacts observe pre-correction overlaps but exclude participants killed by ram damage.
    this.updateShipContacts(candidates);
    this.correctOverlaps(candidates, wreckList);
  }

  private moveAndResolveTerrain(dt: number, now: number, combatActive: boolean, wreckList: Wrecks): void {
    const islandPolys = this.getIslandPolygons();
    for (const [sessionId, row] of this.participants.simulations) {
      const p = this.participants.players.get(sessionId);
      if (!p) continue;

      if (participatesInWorldSimulation(p.lifeState)) {
        row.ship.rudder = smoothRudder(
          row.ship.rudder,
          row.lastRudderInput,
          this.cfg.rudderResponsiveness,
          dt,
        );
        stepMovement(row.ship, this.configForPlayer(p), dt);
        const islandNow = shipOverlapsAnyIslandPolygons(
          {
            x: row.ship.x,
            z: row.ship.z,
            headingRad: row.ship.headingRad,
            shipClass: p.shipClass,
          },
          islandPolys,
        );
        const islandPrev = this.collisionIslandOverlapPrev.get(sessionId) ?? false;
        if (islandNow && !islandPrev) {
          this.sendCollisionContact(sessionId, "island");
          if (combatActive && canTakeArtillerySplashDamage(p.lifeState)) {
            const sc = getShipClassProfile(p.shipClass);
            const scrape = Math.round(
              ISLAND_SCRAPE_BASE_HP *
                sc.islandCollisionDamageMul *
                progressionIncomingDamageFactor(p.level) *
                sc.incomingDamageTakenMul,
            );
            if (scrape > 0) {
              this.life.applyDamage(sessionId, scrape, now);
            }
          }
        }
        this.collisionIslandOverlapPrev.set(sessionId, islandNow);

        const wreckNow = shipOverlapsAnyWreck(
          {
            x: row.ship.x,
            z: row.ship.z,
            headingRad: row.ship.headingRad,
            shipClass: p.shipClass,
          },
          wreckList,
        );
        const wreckPrev = this.collisionWreckOverlapPrev.get(sessionId) ?? false;
        if (wreckNow && !wreckPrev) {
          this.sendCollisionContact(sessionId, "ship");
        }
        this.collisionWreckOverlapPrev.set(sessionId, wreckNow);

        resolveShipIslandPolygonCollisions(
          row.ship,
          islandPolys,
          getAuthoritativeShipHullProfile(p.shipClass)?.collisionHitbox,
        );
      } else {
        this.collisionIslandOverlapPrev.delete(sessionId);
        this.collisionWreckOverlapPrev.delete(sessionId);
      }
    }
  }

  private collectCollisionCandidates(): ShipCollisionParticipant[] {
    const shipShipParticipants = this.collisionParticipantsScratch;
    shipShipParticipants.length = 0;
    for (const [sessionId, row] of this.participants.simulations) {
      const p = this.participants.players.get(sessionId);
      if (!p || !participatesInWorldSimulation(p.lifeState)) continue;
      shipShipParticipants.push({
        ship: row.ship,
        hitbox: getAuthoritativeShipHullProfile(p.shipClass)?.collisionHitbox,
        sessionId,
      });
    }
    return shipShipParticipants;
  }

  private applyRamDamage(shipShipParticipants: ShipCollisionParticipant[], wreckList: Wrecks,
    dt: number, now: number): void {
    const ram = accumulateShipRamDamage(shipShipParticipants, dt);
    const wreckRam = accumulateWreckRamDamage(
      shipShipParticipants,
      wreckList,
      (sc) => getAuthoritativeShipHullProfile(sc)?.collisionHitbox,
      dt,
    );
    // The result is tick-local; reuse it rather than copying all entries into a third map.
    const combinedRaw = ram.rawDamageBySessionId;
    for (const [id, r] of wreckRam) {
      combinedRaw.set(id, (combinedRaw.get(id) ?? 0) + r);
    }
    for (const [sessionId, raw] of combinedRaw) {
      const p = this.participants.players.get(sessionId);
      if (!p || !canTakeArtillerySplashDamage(p.lifeState)) continue;
      const dmg = Math.round(
        raw *
          progressionIncomingDamageFactor(p.level) *
          getShipClassProfile(p.shipClass).incomingDamageTakenMul,
      );
      if (dmg <= 0) continue;
      this.life.applyDamage(sessionId, dmg, now, ram.killerByVictimSessionId.get(sessionId));
    }
  }

  private updateShipContacts(shipShipParticipants: ShipCollisionParticipant[]): void {
    const nextShipPairs = this.collisionShipPairScratch;
    nextShipPairs.clear();
    const n = shipShipParticipants.length;
    for (let i = 0; i < n; i++) {
      const A = shipShipParticipants[i]!;
      const idA = A.sessionId;
      const pa = idA ? this.participants.players.get(idA) : undefined;
      if (!pa || !participatesInWorldSimulation(pa.lifeState)) continue;
      for (let j = i + 1; j < n; j++) {
        const B = shipShipParticipants[j]!;
        const idB = B.sessionId;
        if (!idA || !idB) continue;
        const pb = this.participants.players.get(idB);
        if (!pa || !pb) continue;
        if (
          !participatesInWorldSimulation(pa.lifeState) ||
          !participatesInWorldSimulation(pb.lifeState)
        ) {
          continue;
        }
        if (!A.hitbox || !B.hitbox) continue;
        if (
          !twoShipsObbOverlap(
            {
              x: A.ship.x,
              z: A.ship.z,
              headingRad: A.ship.headingRad,
              shipClass: pa.shipClass,
            },
            {
              x: B.ship.x,
              z: B.ship.z,
              headingRad: B.ship.headingRad,
              shipClass: pb.shipClass,
            },
          )
        ) {
          continue;
        }
        const key = idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
        nextShipPairs.add(key);
        if (!this.collisionShipPairPrev.has(key)) {
          this.sendCollisionContact(idA, "ship");
          this.sendCollisionContact(idB, "ship");
        }
      }
    }
    this.collisionShipPairScratch = this.collisionShipPairPrev;
    this.collisionShipPairPrev = nextShipPairs;
  }

  private correctOverlaps(shipShipParticipants: ShipCollisionParticipant[], wreckList: Wrecks): void {
    resolveShipShipCollisions(shipShipParticipants);

    if (wreckList.length > 0) {
      const getWreckHb = (sc: string) => getAuthoritativeShipHullProfile(sc)?.collisionHitbox;
      for (const [sessionId, row] of this.participants.simulations) {
        const p = this.participants.players.get(sessionId);
        if (!p || !participatesInWorldSimulation(p.lifeState)) continue;
        const hb = getAuthoritativeShipHullProfile(p.shipClass)?.collisionHitbox;
        if (!hb) continue;
        resolveShipAndWreckObbOverlaps(row.ship, hb, wreckList, getWreckHb);
      }
    }
  }
}
