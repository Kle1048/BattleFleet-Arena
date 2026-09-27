import { ARTILLERY_SPLASH_RADIUS, ASWM_HIT_RADIUS, PlayerLifeState } from "@battlefleet/shared/rules";
import type { PlayerView } from "./BattleReadModel";
import type {
  AirDefenseLayer, AirDefenseNotice, AirDefenseOutput, ArtilleryFired, ArtilleryImpact, MatchPresentationEvent, MissileFired,
} from "./MatchPresentationEvent";

type PlayerPosition = Pick<PlayerView, "id" | "x" | "z" | "lifeState">;
type ImpactOutput = { flashImpact(x: number, z: number, kind: string): void };

export interface MatchEventPresenterOptions {
  mySessionId: string;
  findPlayerBySessionId(id: string): PlayerPosition | undefined;
  artilleryFx: {
    onFired(message: ArtilleryFired): void;
    onImpact(message: ArtilleryImpact, options: { skipSplash: boolean }): void;
  };
  missileFx: ImpactOutput & { onFired?(message: MissileFired): void };
  torpedoFx: ImpactOutput;
  airDefense: AirDefenseOutput;
  shouldRenderArtyFiredClientVfx(fromX: number, fromZ: number, toX: number, toZ: number): boolean;
  isArtyWorldPointInCullRange(x: number, z: number): boolean;
  onPrimaryFireByLocalPlayer(): void;
  onMissileFireByLocalPlayer(): void;
  onTorpedoFireByLocalPlayer(): void;
  onMineImpactNearLocalPlayer(distance: number): void;
  onHitNearAt?(x: number, z: number): void;
  onWeaponHitAt?(x: number, z: number): void;
  onFeelLocalWeaponThreat?(event: { tag: "artillery_hull" | "aswm_impact" }): void;
  onAirDefenseSound?(event: { phase: "fire" | "intercept"; layer: AirDefenseLayer; worldX: number; worldZ: number }): void;
  onCollisionContact?(kind: "ship" | "island"): void;
  onMissileLockOn?(): void;
  onAswmMagazineReloaded?(): void;
  onSoftkillResult?(success: boolean): void;
  /** Muzzle position is already in world XZ; only its height is a render-space quantity. */
  getAirDefenseMuzzleSeek?(defenderId: string, slotId: string, layer: AirDefenseLayer): { x: number; y: number; z: number } | null;
  appendAirDefenseComms?(entry: { text: string; kind: "info" }): void;
  formatPlayerLabel?(id: string): string;
}

function layerLabel(layer: AirDefenseLayer): string {
  return layer === "sam" ? "SAM" : layer === "pd" ? "PDMS" : "CIWS";
}

/**
 * Synchronous presentation decisions only: no Room, DOM, Three.js, clocks or rule mutations.
 * A hit notice never creates a death transition; the state-based life presenter owns that effect.
 */
export function createMatchEventPresenter(options: MatchEventPresenterOptions) {
  let disposed = false;
  const localPlayer = () => options.findPlayerBySessionId(options.mySessionId);

  function airDefense(type: "airDefenseFire" | "airDefenseIntercept", notice: AirDefenseNotice): void {
    const { x, z, layer } = notice;
    const defenderName = notice.defenderId !== null
      ? (options.formatPlayerLabel?.(notice.defenderId) ?? notice.defenderId.slice(0, 8)) : "Verteidiger";
    const targetLabel = notice.missileId !== null ? ` (Ziel ASuM #${notice.missileId})` : "";
    if (type === "airDefenseIntercept") {
      options.appendAirDefenseComms?.({ text: `LW: ${layerLabel(layer)} Abfang ERFOLG — ${defenderName}${targetLabel}`, kind: "info" });
      options.onAirDefenseSound?.({ phase: "intercept", layer, worldX: x, worldZ: z });
      options.airDefense.intercept(x, z, layer);
      return;
    }
    let fromX = notice.fromX ?? notice.defenderX, fromZ = notice.fromZ ?? notice.defenderZ;
    if (fromX === null || fromZ === null) {
      if (!notice.defenderId) return;
      const position = options.findPlayerBySessionId(notice.defenderId);
      if (!position) return;
      fromX = position.x;
      fromZ = position.z;
    }
    let launchY = notice.fromY;
    if (notice.slotId && notice.defenderId) {
      const muzzle = options.getAirDefenseMuzzleSeek?.(notice.defenderId, notice.slotId, layer);
      if (muzzle) {
        fromX = muzzle.x; fromZ = muzzle.z; launchY = muzzle.y;
      }
    }
    options.appendAirDefenseComms?.({ text: `LW: ${layerLabel(layer)} Feuer — ${defenderName}${targetLabel}`, kind: "info" });
    options.onAirDefenseSound?.({ phase: "fire", layer, worldX: fromX, worldZ: fromZ });
    options.airDefense.fire({
      layer, fromX, fromZ, toX: x, toZ: z, launchY,
      trackedMissileId: layer !== "ciws" && notice.missileId !== null ? notice.missileId : undefined,
    });
  }

  function present(event: MatchPresentationEvent): void {
    if (disposed) return;
    switch (event.type) {
      case "collisionContact": options.onCollisionContact?.(event.payload.kind); return;
      case "missileLockOn": options.onMissileLockOn?.(); return;
      case "aswmMagazineReloaded": options.onAswmMagazineReloaded?.(); return;
      case "softkillResult": options.onSoftkillResult?.(event.payload.success); return;
      case "artyFired": {
        const m = event.payload;
        if (!options.shouldRenderArtyFiredClientVfx(m.fromX, m.fromZ, m.toX, m.toZ)) return;
        options.artilleryFx.onFired(m);
        if (m.ownerId === options.mySessionId) options.onPrimaryFireByLocalPlayer();
        return;
      }
      case "artyImpact": {
        const m = event.payload;
        const skipSplash = !options.isArtyWorldPointInCullRange(m.x, m.z);
        options.artilleryFx.onImpact(m, { skipSplash });
        if (m.kind === "hit" && !skipSplash) options.onWeaponHitAt?.(m.x, m.z);
        if (m.kind !== "hit") return;
        const me = localPlayer();
        if (!me || me.lifeState === PlayerLifeState.AwaitingRespawn) return;
        const distanceSq = (m.x - me.x) ** 2 + (m.z - me.z) ** 2;
        // Unlike ASuM below, offscreen artillery still gives nearby local threat feedback.
        if (distanceSq <= (ARTILLERY_SPLASH_RADIUS * 1.28) ** 2) {
          options.onFeelLocalWeaponThreat?.({ tag: "artillery_hull" });
        }
        if (distanceSq < 300 * 300) options.onHitNearAt?.(m.x, m.z);
        return;
      }
      case "aswmFired":
        if (event.payload.launcherId !== undefined) options.missileFx.onFired?.(event.payload as MissileFired);
        if (event.payload.ownerId === options.mySessionId) options.onMissileFireByLocalPlayer();
        return;
      case "torpedoFired":
        if (event.payload.ownerId === options.mySessionId) options.onTorpedoFireByLocalPlayer();
        return;
      case "aswmImpact": {
        const m = event.payload;
        if (!options.isArtyWorldPointInCullRange(m.x, m.z)) return;
        options.missileFx.flashImpact(m.x, m.z, m.kind);
        if (m.kind !== "hit") return;
        options.onWeaponHitAt?.(m.x, m.z);
        const me = localPlayer();
        if (me && me.lifeState !== PlayerLifeState.AwaitingRespawn &&
          (m.x - me.x) ** 2 + (m.z - me.z) ** 2 <= (ASWM_HIT_RADIUS * 3.2) ** 2) {
          options.onFeelLocalWeaponThreat?.({ tag: "aswm_impact" });
        }
        return;
      }
      case "torpedoImpact": {
        const m = event.payload;
        if (!options.isArtyWorldPointInCullRange(m.x, m.z)) return;
        options.torpedoFx.flashImpact(m.x, m.z, m.kind);
        if (m.kind === "hit") options.onWeaponHitAt?.(m.x, m.z);
        const me = localPlayer();
        if (me) {
          const distance = Math.hypot(m.x - me.x, m.z - me.z);
          if (distance < 360) options.onMineImpactNearLocalPlayer(distance);
        }
        return;
      }
      case "airDefenseFire":
      case "airDefenseIntercept": airDefense(event.type, event.payload); return;
    }
    const exhaustive: never = event;
    return exhaustive;
  }

  return { present, dispose() { disposed = true; } };
}
