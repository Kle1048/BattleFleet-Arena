import {
  ARTILLERY_DAMAGE,
  ARTILLERY_SPLASH_RADIUS,
  DEFAULT_MAP_ISLAND_POLYGONS,
  canTakeArtillerySplashDamage,
  canUsePrimaryWeapon,
  classifyArtilleryImpactVisual,
  tryComputeArtillerySalvo,
  progressionIncomingDamageFactor,
  progressionPrimaryCooldownMs,
  getShipClassProfile,
  getAuthoritativeShipHullProfile,
  listPrimaryArtilleryMountConfigs,
  circleIntersectsShipHitboxFootprintXZ,
  mountSlotMuzzleWorld,
} from "@battlefleet/shared/rules";
import type { GameEventSink } from "@battlefleet/shared/protocol";
import type { CombatParticipants } from "../CombatTypes.js";
import type { ParticipantState } from "../ParticipantState.js";
import type { SimulationEnvironment } from "../SimulationEnvironment.js";
import type { LifeSystem } from "./LifeSystem.js";

type PendingShell = {
  impactAtMs: number;
  landX: number;
  landZ: number;
  ownerSessionId: string;
  shellId: number;
};

/** Owns launch IDs, cooldown application and delayed artillery impacts. */
export class ArtillerySystem {
  private pendingShells: PendingShell[] = [];
  private nextShellId = 1;
  constructor(
    private readonly participants: CombatParticipants,
    private readonly life: Pick<LifeSystem, "applyDamage">,
    private readonly environment: SimulationEnvironment,
    private readonly events: GameEventSink,
    private readonly isMatchCombatActive: () => boolean,
    private readonly disarmMinesAt: (x: number, z: number) => void,
    private readonly getIslandPolygons = () => DEFAULT_MAP_ISLAND_POLYGONS,
  ) {}

  clear(): void { this.pendingShells = []; }
  removeOwner(id: string): void {
    this.pendingShells = this.pendingShells.filter(shell => shell.ownerSessionId !== id);
  }

  fire(ownerSessionId: string, row: ParticipantState): void {
    if (!this.isMatchCombatActive()) return;
    const p = this.participants.players.get(ownerSessionId);
    if (!p || !canUsePrimaryWeapon(p.lifeState)) return;

    const now = this.environment.nowMs();
    if (now < row.primaryReadyAtMs) return;

    const classProf = getShipClassProfile(p.shipClass);
    const hull = getAuthoritativeShipHullProfile(p.shipClass);
    const mounts = listPrimaryArtilleryMountConfigs(hull, classProf.artilleryArcHalfAngleRad);
    if (mounts.length === 0) return;

    let anyShell = false;
    for (const m of mounts) {
      const w = mountSlotMuzzleWorld(hull!, m.slotId, row.ship.x, row.ship.z, row.ship.headingRad,
        { x: row.aimX, z: row.aimZ });
      const salvo = tryComputeArtillerySalvo(
        row.ship.x,
        row.ship.z,
        row.ship.headingRad,
        row.aimX,
        row.aimZ,
        this.environment.random,
        m.sector,
        w.x,
        w.z,
      );
      if (!salvo.ok) continue;
      anyShell = true;
      const shellId = this.nextShellId++;
      this.pendingShells.push({
        impactAtMs: now + salvo.flightMs,
        landX: salvo.landX,
        landZ: salvo.landZ,
        ownerSessionId,
        shellId,
      });

      this.events.broadcast("artyFired", {
        shellId,
        ownerId: ownerSessionId,
        slotId: m.slotId,
        fromX: w.x,
        fromY: w.y,
        fromZ: w.z,
        toX: salvo.landX,
        toZ: salvo.landZ,
        flightMs: salvo.flightMs,
      });
    }
    if (!anyShell) return;

    row.primaryReadyAtMs = now + progressionPrimaryCooldownMs(p.level);
  }

  resolveImpacts(now: number): void {
    const stay: PendingShell[] = [];

    for (const sh of this.pendingShells) {
      if (sh.impactAtMs > now) {
        stay.push(sh);
        continue;
      }

      let damagedAnyEnemy = false;
      for (const p of this.participants.players.values()) {
        if (p.id === sh.ownerSessionId) continue;
        if (!canTakeArtillerySplashDamage(p.lifeState)) continue;
        const hb = getAuthoritativeShipHullProfile(p.shipClass)?.collisionHitbox;
        if (
          !circleIntersectsShipHitboxFootprintXZ(
            sh.landX,
            sh.landZ,
            ARTILLERY_SPLASH_RADIUS,
            p.x,
            p.z,
            p.headingRad,
            hb,
          )
        ) {
          continue;
        }
        const artyDmg = Math.round(
          ARTILLERY_DAMAGE *
            progressionIncomingDamageFactor(p.level) *
            getShipClassProfile(p.shipClass).incomingDamageTakenMul,
        );
        this.life.applyDamage(p.id, artyDmg, now, sh.ownerSessionId);
        damagedAnyEnemy = true;
      }

      this.disarmMinesAt(sh.landX, sh.landZ);

      const kind = classifyArtilleryImpactVisual(
        sh.landX,
        sh.landZ,
        damagedAnyEnemy,
        this.getIslandPolygons(),
      );
      this.events.broadcast("artyImpact", {
        shellId: sh.shellId,
        x: sh.landX,
        z: sh.landZ,
        kind,
      });
    }

    this.pendingShells = stay;
  }
}
