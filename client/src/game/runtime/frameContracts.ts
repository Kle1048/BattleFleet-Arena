import type { PlayerView, MissileView, TorpedoView } from "../presentation/BattleReadModel";
import type { AirDefenseMissileSnapshot, AirDefensePlayerSnapshot } from "@battlefleet/shared/rules";
import type { createUpdateCadence } from "./updateCadence";
import type { CockpitHudUpdate } from "../presentation/CockpitModel";
import type { InputSample } from "../input/keyboardMouse";

/** Synchronous borrowed presentation values and output ports; no transport objects.
 * Each phase selects only its own state fields and dependencies from these contracts. */
export type FramePlayer = Pick<PlayerView,
  "id" | "x" | "z" | "headingRad" | "speed" | "rudder" | "aimX" | "aimZ" |
  "oobCountdownSec" | "hp" | "maxHp" | "primaryCooldownSec" | "lifeState" |
  "respawnCountdownSec" | "spawnProtectionSec" | "secondaryCooldownSec" |
  "torpedoCooldownSec" | "score" | "kills" | "level" | "xp" | "shipClass" |
  "displayName" | "aswmRemainingPort" | "aswmRemainingStarboard"
> & Partial<Pick<PlayerView, "deathAtMs" | "killedBySessionId" | "radarActive" | "adHudIncomingAswm" | "adCooldownMask">>;

export type FrameMissile = Pick<MissileView, "missileId" | "ownerId" | "targetId" | "x" | "z" | "headingRad">;
export type FrameTorpedo = Pick<TorpedoView, "torpedoId" | "x" | "z" | "headingRad">;
export type FrameOwnedTorpedo = FrameTorpedo & Pick<TorpedoView, "ownerId">;

export type CockpitOutput = { update: (model: CockpitHudUpdate) => void };

export type MessageOutput = {
  showToast: (message: string, kind: "danger" | "info", durationMs: number) => void;
  updateFrame: (now: number, oobCountdownSec: number, spawnProtectionSec: number) => void;
};

export type AudioOutput = {
  warning: () => void;
  levelUp: () => void;
  telegraphNotchClick: () => void;
  updateEngineBed: (opts: {
    dtMs: number;
    active: boolean;
    throttle?: number;
    speed?: number;
    maxSpeed?: number;
  }) => void;
  updateEngineBedOff: () => void;
  updateDynamicMusic: (opts: { dtMs: number; active: boolean; smoothedTier0to2: number }) => void;
};

export type FrameEffects = {
  artilleryFx: { update: (now: number, dt: number) => void };
  missileFx: {
    sync: (poses: Iterable<FrameMissile> | null) => void;
    update: (now: number, dt: number) => void;
  };
  torpedoFx: {
    sync: (poses: Iterable<FrameTorpedo> | null) => void;
    update: (now: number, dt: number) => void;
  };
  shipDamageSmokeTick: (
    worldX: number,
    worldZ: number,
    headingRad: number,
    severity: "damaged" | "heavily_damaged",
  ) => void;
};

export type FrameRuntimeState = {
  playersById: Map<string, FramePlayer>;
  adMissiles: AirDefenseMissileSnapshot[];
  adPlayers: AirDefensePlayerSnapshot[];
  hudDue: ReturnType<typeof createUpdateCadence>;
  lastHudLifeState: string;
  lastHudClass: string;
  lastHudRadar: boolean;
  lastHudMatchEnded: boolean;
  lastHudLevel: number;
  lastOobCountdown: number;
  lastLifeStateBySessionId: Map<string, string>;
  lastDamageSmokeAtBySessionId: Map<string, number>;
  /** `null` = noch kein Sample (kein Toast beim ersten Frame); sonst letzte Sea-Control-Zugehörigkeit. */
  lastSeaControlZone: boolean | null;
  /** Vorheriger Wert von `adHudIncomingAswm` (lokaler Spieler) für Vampire-Toast. */
  lastAdHudIncomingAswm: number;
  /** Live-Debug für Aim-Linien/Sektorprüfung (lokaler Spieler). */
  aimLineSectorDebug: string;
  /** Dedupe für `input`-Nachrichten (Telegraf / Ziel — nicht jedes Frame). */
  lastInputDedupKey: string | null;
  lastInputDedupAtMs: number;
  pendingInput: InputSample | null;
  /** Letzter Telegraf-Raster (Motor), für Rasterton; −1 = noch nicht initialisiert. */
  lastTelegraphThrottleIndex: number;
  lastTelegraphRudderIndex: number;
  /** 0=ruhig, 1=Kontakt, 2=Gefecht — geglättet für Musikkreuzblenden. */
  musicSmoothedTierF: number;
};
