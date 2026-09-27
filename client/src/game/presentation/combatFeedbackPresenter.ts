import { PlayerLifeState } from "@battlefleet/shared/rules";
import type { PlayerView } from "./BattleReadModel";
import type { AirDefenseLayer } from "./MatchPresentationEvent";

type WorldSoundPosition = { worldX: number; worldZ: number };
type LocalPlayer = Pick<PlayerView, "x" | "z" | "headingRad" | "lifeState">;
type FeedbackText = "toast.aswmMagazineReloaded" | "toast.softkillSuccess" | "toast.softkillFailed"
  | "toast.feelArtilleryHullHit" | "toast.feelAswmImpactNear";

export interface CombatFeedbackOptions {
  mySessionId: string;
  now(): number;
  /** Borrowed synchronously; delayed puff audio explicitly samples a fresh position. */
  localPlayer(): LocalPlayer | undefined;
  text(key: FeedbackText): string;
  toast(message: string, kind: "info" | "danger", durationMs: number): void;
  shake(options: { durationMs: number; amplitude: number }): void;
  flash(options: { intensity: number }): void;
  effects: {
    chaff(x: number, z: number, headingRad: number, onPuff: () => void): void;
    destroyed(x: number, z: number): void;
  };
  audio: {
    airDefenseSamFire(position: WorldSoundPosition): void;
    airDefenseSamIntercept(position: WorldSoundPosition): void;
    airDefenseCiwsFire(position: WorldSoundPosition): void;
    airDefenseCiwsIntercept(position: WorldSoundPosition): void;
    shipShipCollision(): void;
    shipIslandCollision(): void;
    softkillChaff(gain: number, position?: WorldSoundPosition): void;
    pokeSfxDuck(durationMs: number): void;
    explosionSelf(): void;
    explosionOtherAt(x: number, z: number, peakGain: number): void;
  };
}

/**
 * Local feedback policy shared by event and state-transition presenters.
 * Owns threat-message cooldowns, not network subscriptions or rendering resources.
 * All positions stay in world coordinates; output adapters own their implementations.
 */
export function createCombatFeedbackPresenter(options: CombatFeedbackOptions) {
  let disposed = false;
  const lastThreatAt = { artillery_hull: 0, aswm_impact: 0 };
  const { audio } = options;

  return {
    onMineImpactNearLocalPlayer(distance: number): void {
      if (disposed) return;
      const proximity = 1 - Math.min(1, Math.max(0, distance / 360));
      if (proximity <= 0) return;
      options.shake({ durationMs: 120 + 190 * proximity, amplitude: 2 + 6 * proximity });
    },
    onAirDefenseSound(event: { phase: "fire" | "intercept"; layer: AirDefenseLayer; worldX: number; worldZ: number }): void {
      if (disposed) return;
      const position = { worldX: event.worldX, worldZ: event.worldZ };
      if (event.layer === "sam" || event.layer === "pd") {
        if (event.phase === "fire") audio.airDefenseSamFire(position);
        else audio.airDefenseSamIntercept(position);
      } else {
        if (event.phase === "fire") audio.airDefenseCiwsFire(position);
        else audio.airDefenseCiwsIntercept(position);
      }
    },
    onCollisionContact(kind: "ship" | "island"): void {
      if (disposed) return;
      if (kind === "ship") audio.shipShipCollision();
      else audio.shipIslandCollision();
    },
    onAswmMagazineReloaded(): void {
      if (!disposed) options.toast(options.text("toast.aswmMagazineReloaded"), "info", 3500);
    },
    onSoftkillResult(success: boolean): void {
      if (disposed) return;
      const player = options.localPlayer();
      if (player && player.lifeState !== PlayerLifeState.AwaitingRespawn) {
        // Chaff geometry uses the launch pose. Audio follows the local ship as before,
        // but never retains the borrowed read-model object across deferred puff callbacks.
        let position = { worldX: player.x, worldZ: player.z };
        options.effects.chaff(player.x, player.z, player.headingRad, () => {
          if (disposed) return;
          const current = options.localPlayer();
          if (current) position = { worldX: current.x, worldZ: current.z };
          // If removed, retain the last sampled owned position until session disposal.
          audio.softkillChaff(0.32 / Math.sqrt(8), position);
        });
      } else {
        audio.softkillChaff(0.32);
      }
      options.toast(options.text(success ? "toast.softkillSuccess" : "toast.softkillFailed"),
        success ? "info" : "danger", 3800);
    },
    onFeelLocalWeaponThreat(event: { tag: "artillery_hull" | "aswm_impact" }): void {
      if (disposed) return;
      const now = options.now();
      const artillery = event.tag === "artillery_hull";
      // Preserve initial suppression until the first full cooldown has elapsed.
      if (lastThreatAt[event.tag] + (artillery ? 2400 : 2000) > now) return;
      lastThreatAt[event.tag] = now;
      options.toast(options.text(artillery ? "toast.feelArtilleryHullHit" : "toast.feelAswmImpactNear"),
        "danger", artillery ? 2600 : 2800);
      options.shake(artillery ? { durationMs: 200, amplitude: 5.5 } : { durationMs: 280, amplitude: 8 });
      audio.pokeSfxDuck(artillery ? 115 : 135);
    },
    /** Called only for the existing state-based death transition, never for a hit event. */
    onShipDestroyed(player: Pick<PlayerView, "id" | "x" | "z">): void {
      if (disposed) return;
      options.effects.destroyed(player.x, player.z);
      const local = options.localPlayer();
      if (player.id === options.mySessionId) {
        audio.explosionSelf();
        options.flash({ intensity: 1 });
        options.shake({ durationMs: 520, amplitude: 15 });
      } else if (local) {
        const distance = Math.hypot(player.x - local.x, player.z - local.z);
        if (distance < 340) {
          const proximity = 1 - distance / 340;
          options.flash({ intensity: 0.26 + 0.55 * proximity });
          options.shake({ durationMs: 220 + 280 * proximity, amplitude: 4.5 + 12 * proximity });
        }
        if (distance <= 520) {
          const peak = 0.22 + 0.5 * (1 - Math.min(distance, 500) / 500);
          audio.explosionOtherAt(player.x, player.z, Math.max(0.1, peak));
        }
      } else {
        audio.explosionOtherAt(player.x, player.z, 0.38);
      }
    },
    dispose(): void { disposed = true; },
  };
}
