import type { ArraySchema } from "@colyseus/schema";
import type * as THREE from "three";
import {
  FEATURE_MINES_ENABLED,
  pickThreatMissilePositionForDefender,
  PlayerLifeState,
  PROGRESSION_MAX_LEVEL,
  SPEED_FEEL_FACTOR,
  getShipClassProfile,
  getAswmMagazineFromProfile,
  normalizeShipClassId,
  shipClassIdForProgressionLevel,
  progressionMovementScale,
  progressionNavalRankEn,
  progressionXpToNextLevel,
  esmDetectionRangeMul,
  esmEmitterStrokeCss,
  resolveAirDefenseDefenderIdForMissile,
  wreckVariantFromSessionId,
  isInSeaControlZone,
  launcherYawRadFromBow,
  type AirDefenseMissileSnapshot,
  type AirDefensePlayerSnapshot,
  type ShipClassId,
} from "@battlefleet/shared";
import { t } from "../../locale/t";
import { seaControlZoneHudTransition } from "./seaControlZoneHud";
import type { InputSample } from "../input/keyboardMouse";
import {
  TELEGRAPH_RUDDER_STEPS,
  TELEGRAPH_THROTTLE_STEPS,
  valueToStepIndex,
} from "../input/telegraphSteps";
import { computeWreckVisualPose } from "../scene/shipWreckAnimation";
import {
  applyShipVisualRuntimeTuning,
  setShipVisualLifeState,
  updateAimMountToTargetDebugLine,
  updateArtilleryTrainRotationsFromAim,
  type ArtilleryTrainAimOptions,
  type ShipVisual,
} from "../scene/shipVisual";
import {
  pruneVisualRollSmoothed,
  stepVisualRollSmoothed,
  visualRollRadFromRudderAndSpeed,
} from "../scene/shipVisualRoll";
import { getAuthoritativeHullProfile } from "./shipProfileRuntime";
import {
  DEFAULT_INTERPOLATION_DELAY_MS,
  createInterpolationBuffer,
  sampleInterpolatedPose,
} from "../network/remoteInterpolation";
import {
  type CameraCullState,
  refreshArtilleryCullFromLocalPlayer,
  updateLocalFollowCameraFromPlayer,
} from "./cameraCullRuntime";
import { applyCameraShakeStep } from "./cameraShakeRuntime";
import { worldToRenderX, worldToRenderYaw } from "./renderCoords";
import {
  getShipDebugTuningForVisualClass,
  getShipDebugTuningGeneration,
} from "./shipDebugTuning";
import type { CockpitRadarThreatLine, CockpitSsmRailLine } from "../hud/cockpitRadarKeys";
import {
  RADAR_ESM_RANGE_WORLD,
  RADAR_PLAN_SVG_BLIP_RADIUS,
  cockpitSsmRailTickLineNorthUp,
  esmLineTowardBlip,
  radarBlipNormalizedNorthUp,
  radarBlipNormalizedNorthUpClampedToRim,
  type RadarBlipNorm,
} from "../hud/radarHudMath";
import {
  hasVibeJamReturnPortal,
  VIBE_JAM_EXIT_PORTAL_X,
  VIBE_JAM_EXIT_PORTAL_Z,
  VIBE_JAM_RETURN_PORTAL_X,
  VIBE_JAM_RETURN_PORTAL_Z,
} from "../portal/vibeJamPortal";

/** Pro Frame wiederverwendet — vermeidet N× Array-Allokation für AD-Raketen-Snapshots. */
const adMissileSnapsScratch: AirDefenseMissileSnapshot[] = [];
const adPlayerSnapshotsScratch: AirDefensePlayerSnapshot[] = [];

type NetPlayerLike = {
  id: string;
  x: number;
  z: number;
  headingRad: number;
  speed: number;
  rudder: number;
  aimX: number;
  aimZ: number;
  oobCountdownSec: number;
  hp: number;
  maxHp: number;
  primaryCooldownSec: number;
  lifeState: string;
  respawnCountdownSec: number;
  spawnProtectionSec: number;
  secondaryCooldownSec: number;
  torpedoCooldownSec: number;
  score: number;
  kills: number;
  level: number;
  xp: number;
  shipClass: string;
  displayName: string;
  /** Serverzeit (ms) bei Tod; nur in `awaiting_respawn` gesetzt. */
  deathAtMs?: number;
  /** Session des Killers für die letzte Zerstörung; leer ohne Zuordnung. */
  killedBySessionId?: string;
  radarActive?: boolean;
  adHudIncomingAswm?: number;
  aswmRemainingPort: number;
  aswmRemainingStarboard: number;
};

type MissileLike = {
  missileId: number;
  ownerId: string;
  targetId: string;
  x: number;
  z: number;
  headingRad: number;
};
type TorpedoLike = { torpedoId: number; x: number; z: number; headingRad: number };
type OwnedTorpedoLike = TorpedoLike & { ownerId: string };

type CockpitLike = {
  update: (model: {
    speed: number;
    maxSpeed: number;
    headingRad: number;
    worldX: number;
    worldZ: number;
    mainMountTrainRad: number;
    aswmMagPortCap: number;
    aswmMagStarboardCap: number;
    aswmRemainingPort: number;
    aswmRemainingStarboard: number;
    hp: number;
    maxHp: number;
    primaryCooldownSec: number;
    secondaryCooldownSec: number;
    torpedoCooldownSec: number;
    mineCount: number;
    mineMaxCount: number;
    respawnCountdownSec: number;
    spawnProtectionSec: number;
    matchRemainingSec: number;
    score: number;
    kills: number;
    rankLabelEn: string;
    xpLine: string;
    shipClassLabel: string;
    playerDisplayName: string;
    shipClassId: ShipClassId;
    radarBlips: RadarBlipNorm[];
    radarPortalMarkers: RadarBlipNorm[];
    radarVisible: boolean;
    ownRadarActive: boolean;
    esmLines: { x1: number; y1: number; x2: number; y2: number; stroke?: string }[];
    radarThreatLines: CockpitRadarThreatLine[];
    ssmRailLines: CockpitSsmRailLine[];
  }) => void;
};

type GameMessageHudLike = {
  showToast: (message: string, kind: "danger" | "info", durationMs: number) => void;
  updateFrame: (now: number, oobCountdownSec: number, spawnProtectionSec: number) => void;
};

type AudioLike = {
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

type FxLike = {
  artilleryFx: { update: (now: number, dt: number) => void };
  missileFx: {
    sync: (poses: Iterable<MissileLike> | null) => void;
    update: (now: number, dt: number) => void;
  };
  torpedoFx: {
    sync: (poses: Iterable<TorpedoLike> | null) => void;
    update: (now: number, dt: number) => void;
  };
  shipDamageSmokeTick: (
    worldX: number,
    worldZ: number,
    headingRad: number,
    severity: "damaged" | "heavily_damaged",
  ) => void;
};

type RuntimeState = {
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
  /** Letzter Telegraf-Raster (Motor), für Rasterton; −1 = noch nicht initialisiert. */
  lastTelegraphThrottleIndex: number;
  lastTelegraphRudderIndex: number;
  /** 0=ruhig, 1=Kontakt, 2=Gefecht — geglättet für Musikkreuzblenden. */
  musicSmoothedTierF: number;
};

export function createFrameRuntimeState(initialHudLevel = 1): RuntimeState {
  return {
    lastHudLevel: initialHudLevel,
    lastOobCountdown: 0,
    lastLifeStateBySessionId: new Map<string, string>(),
    lastDamageSmokeAtBySessionId: new Map<string, number>(),
    lastSeaControlZone: null,
    lastAdHudIncomingAswm: 0,
    aimLineSectorDebug: "",
    lastInputDedupKey: null,
    lastInputDedupAtMs: 0,
    lastTelegraphThrottleIndex: -1,
    lastTelegraphRudderIndex: -1,
    musicSmoothedTierF: 0,
  };
}

const INPUT_HEARTBEAT_MS = 1200;
const INPUT_AIM_QUANT = 4;

function quantInput(n: number): number {
  return Math.round(n * INPUT_AIM_QUANT) / INPUT_AIM_QUANT;
}

function buildInputDedupKey(input: InputSample, mineSpawnLocalZ: number): string {
  /** Nur explizit `true` = Maschinentelegraf; `false`/`undefined` (z. B. Bot) = analog throttle/rudder. */
  const telegraph = input.useTelegraphWire === true;
  const aim = `${quantInput(input.aimWorldX)},${quantInput(input.aimWorldZ)}`;
  const mineZ = quantInput(mineSpawnLocalZ);
  const f = `${input.primaryFire ? 1 : 0}${input.secondaryFire ? 1 : 0}${
    FEATURE_MINES_ENABLED && input.torpedoFire ? 1 : 0
  }`;
  if (telegraph) {
    return `T|${input.engineOrder}|${input.rudderOrder}|${aim}|${input.radarActive ? 1 : 0}|${mineZ}|${f}`;
  }
  return `A|${quantInput(input.throttle)}|${quantInput(input.rudderInput)}|${aim}|${
    input.radarActive ? 1 : 0
  }|${mineZ}|${f}`;
}

/**
 * 0: kein/ferner Gegner, 1: Fahrwasser-Kontakt, 2: dichtes Gefecht (Entfernung/Stack).
 * Heuristik, später mit Raketen-Alarmen / Treffer erweiterbar.
 */
function musicTargetTierFromField(
  me: NetPlayerLike,
  myId: string,
  list: Iterable<NetPlayerLike>,
): 0 | 1 | 2 {
  let minD = Infinity;
  let in520 = 0;
  for (const pl of list) {
    if (pl.id === myId) continue;
    if (pl.lifeState === PlayerLifeState.AwaitingRespawn) continue;
    const d = Math.hypot(pl.x - me.x, pl.z - me.z);
    if (d < minD) minD = d;
    if (d < 520) in520++;
  }
  if (!Number.isFinite(minD) || minD > 2000) return 0;
  if (minD < 400 || in520 >= 2) return 2;
  return 1;
}

export function runFrameRuntimeStep<
  TPlayer extends NetPlayerLike,
  TMissile extends MissileLike,
  TTorpedo extends OwnedTorpedoLike,
>(options: {
  now: number;
  dtMs: number;
  camera: THREE.PerspectiveCamera;
  roomSendInput: (payload: {
    throttle?: number;
    rudderInput?: number;
    engineOrder?: string;
    rudderOrder?: string;
    aimX: number;
    aimZ: number;
    primaryFire: boolean;
    secondaryFire: boolean;
    torpedoFire: boolean;
    mineSpawnLocalZ: number;
    radarActive: boolean;
    aswmFireSide?: "port" | "starboard";
  }) => void;
  mySessionId: string;
  cfgMaxSpeed: number;
  playerList: ArraySchema<TPlayer>;
  visuals: Map<string, ShipVisual>;
  remoteInterp: Map<string, ReturnType<typeof createInterpolationBuffer>>;
  inputSample: InputSample;
  matchEnded: boolean;
  matchRemainingSecRaw: number;
  cockpit: CockpitLike;
  gameMessageHud: GameMessageHudLike;
  gameAudio: AudioLike;
  shortSessionIdForMessage: (sessionId: string) => string;
  playerDisplayLabel: (p: { id: string; displayName?: string }) => string;
  fx: FxLike;
  missileList: ArraySchema<TMissile> | null;
  torpedoList: ArraySchema<TTorpedo> | null;
  state: RuntimeState;
  cameraCullState: CameraCullState;
  /** Schiff wechselt zu „zerstört“ (AwaitingRespawn); z. B. großes FX. */
  onShipDestroyed?: (player: TPlayer) => void;
}): { me: TPlayer | undefined } {
  const {
    now,
    dtMs,
    camera,
    roomSendInput,
    mySessionId,
    cfgMaxSpeed,
    playerList,
    visuals,
    remoteInterp,
    inputSample,
    matchEnded,
    matchRemainingSecRaw,
    cockpit,
    gameMessageHud,
    gameAudio,
    shortSessionIdForMessage: toShortSession,
    playerDisplayLabel: toDisplayLabel,
    fx,
    missileList,
    torpedoList,
    state,
    cameraCullState,
    onShipDestroyed,
  } = options;

  const playersById = new Map<string, TPlayer>();
  for (const pl of playerList) {
    playersById.set(pl.id, pl);
  }

  const killerLabelForVictim = (victim: TPlayer): string => {
    const kid = typeof victim.killedBySessionId === "string" ? victim.killedBySessionId.trim() : "";
    if (!kid) return "";
    const kp = playersById.get(kid);
    return kp ? toDisplayLabel(kp) : toDisplayLabel({ id: kid });
  };

  const presentIds = new Set<string>();
  for (const p of playerList) {
    presentIds.add(p.id);
    const prev = state.lastLifeStateBySessionId.get(p.id);
    if (
      prev !== undefined &&
      prev !== PlayerLifeState.AwaitingRespawn &&
      p.lifeState === PlayerLifeState.AwaitingRespawn
    ) {
      const killerName = killerLabelForVictim(p);
      if (p.id === mySessionId) {
        if (killerName) {
          gameMessageHud.showToast(
            t("toast.destroyedWaitingRespawnByKiller", { killer: killerName }),
            "danger",
            5500,
          );
        } else {
          gameMessageHud.showToast(t("toast.destroyedWaitingRespawn"), "danger", 5500);
        }
      } else if (killerName) {
        gameMessageHud.showToast(
          t("toast.playerKilledByKiller", { killer: killerName, victim: toDisplayLabel(p) }),
          "info",
          5200,
        );
      } else {
        gameMessageHud.showToast(t("toast.playerDestroyedNoKiller", { victim: toDisplayLabel(p) }), "info", 5000);
      }
      onShipDestroyed?.(p);
    }
    state.lastLifeStateBySessionId.set(p.id, p.lifeState);
  }
  for (const id of state.lastLifeStateBySessionId.keys()) {
    if (!presentIds.has(id)) {
      state.lastLifeStateBySessionId.delete(id);
      state.lastDamageSmokeAtBySessionId.delete(id);
    }
  }

  adPlayerSnapshotsScratch.length = 0;
  for (const pl of playerList) {
    adPlayerSnapshotsScratch.push({
      id: pl.id,
      x: pl.x,
      z: pl.z,
      headingRad: pl.headingRad,
      lifeState: pl.lifeState,
      shipClass: pl.shipClass,
    });
  }
  adMissileSnapsScratch.length = 0;
  if (missileList) {
    for (let mi = 0; mi < missileList.length; mi++) {
      const m = missileList.at(mi);
      if (!m) continue;
      adMissileSnapsScratch.push({
        ownerId: m.ownerId,
        targetId: m.targetId,
        x: m.x,
        z: m.z,
      });
    }
  }
  const adPlayerSnapshots = adPlayerSnapshotsScratch;

  const me = playersById.get(mySessionId);
  if (me) {
    const oobSec = me.oobCountdownSec ?? 0;
    if (oobSec > 0 && state.lastOobCountdown <= 0 && !matchEnded) {
      gameAudio.warning();
    }
    state.lastOobCountdown = oobSec;
  }

  if (matchEnded || !me || me.lifeState === PlayerLifeState.AwaitingRespawn) {
    state.lastAdHudIncomingAswm = 0;
    state.lastSeaControlZone = null;
  } else {
    const inc = typeof me.adHudIncomingAswm === "number" ? me.adHudIncomingAswm : 0;
    const prev = state.lastAdHudIncomingAswm;
    if (!matchEnded && prev === 0 && inc > 0) {
      gameMessageHud.showToast(t("toast.vampireIncomingAd"), "info", 5500);
    }
    state.lastAdHudIncomingAswm = inc;

    const inSeaControl = isInSeaControlZone(me.x, me.z);
    const sc = seaControlZoneHudTransition(state.lastSeaControlZone, inSeaControl);
    state.lastSeaControlZone = sc.next;
    if (sc.edge === "enter") {
      gameMessageHud.showToast(t("toast.seaControlEntered"), "info", 3800);
    } else if (sc.edge === "leave") {
      gameMessageHud.showToast(t("toast.seaControlLeft"), "info", 3800);
    }
  }

  if (matchEnded || !me || me.lifeState === PlayerLifeState.AwaitingRespawn) {
    gameAudio.updateEngineBedOff();
    state.lastTelegraphThrottleIndex = -1;
    state.lastTelegraphRudderIndex = -1;
    state.musicSmoothedTierF = 0;
    gameAudio.updateDynamicMusic({ active: false, dtMs, smoothedTier0to2: 0 });
  } else {
    const progLevel = Math.min(
      PROGRESSION_MAX_LEVEL,
      Math.max(1, Math.floor(typeof me.level === "number" ? me.level : 1)),
    );
    const classId = normalizeShipClassId(me.shipClass) as ShipClassId;
    const profShip = getShipClassProfile(classId);
    const maxSpForEngine =
      cfgMaxSpeed * profShip.movementSpeedMul * progressionMovementScale(progLevel).maxSpeedFactor;
    const tIdx = valueToStepIndex(inputSample.throttle, TELEGRAPH_THROTTLE_STEPS);
    const rIdx = valueToStepIndex(inputSample.rudderInput, TELEGRAPH_RUDDER_STEPS);
    if (state.lastTelegraphThrottleIndex >= 0) {
      if (tIdx !== state.lastTelegraphThrottleIndex) gameAudio.telegraphNotchClick();
      if (rIdx !== state.lastTelegraphRudderIndex) gameAudio.telegraphNotchClick();
    }
    state.lastTelegraphThrottleIndex = tIdx;
    state.lastTelegraphRudderIndex = rIdx;
    gameAudio.updateEngineBed({
      dtMs,
      active: true,
      throttle: inputSample.throttle,
      speed: Math.abs(me.speed),
      maxSpeed: maxSpForEngine,
    });
    const mTarget = musicTargetTierFromField(me, mySessionId, playerList);
    const f = state.musicSmoothedTierF;
    const smoothHz = mTarget > f - 0.02 ? 0.6 : 0.22;
    const aM = 1 - Math.exp(-(dtMs / 1000) * smoothHz);
    state.musicSmoothedTierF = f + (mTarget - f) * aM;
    gameAudio.updateDynamicMusic({
      dtMs,
      active: true,
      smoothedTier0to2: state.musicSmoothedTierF,
    });
  }

  const tuningGen = getShipDebugTuningGeneration();
  const wallNowMs = Date.now();
  for (const [sessionId, vis] of visuals) {
    const p = playersById.get(sessionId);
    if (!p) continue;
    if (sessionId.startsWith("wreck:")) continue;
    if (vis.debugTuningGenApplied !== tuningGen) {
      applyShipVisualRuntimeTuning(vis);
      vis.debugTuningGenApplied = tuningGen;
    }
    const tuning = getShipDebugTuningForVisualClass(p.shipClass);

    const isDeadVis = p.lifeState === PlayerLifeState.AwaitingRespawn;
    const deathMs = typeof p.deathAtMs === "number" && p.deathAtMs > 0 ? p.deathAtMs : 0;
    const deathPose =
      isDeadVis && deathMs > 0
        ? computeWreckVisualPose(
            Math.max(0, wallNowMs - deathMs),
            wreckVariantFromSessionId(sessionId) as 0 | 1 | 2 | 3,
          )
        : null;
    const wreckSinkY = isDeadVis ? (deathPose ? deathPose.sinkY : -6.5) : 0;

    let shipLineSimX = p.x;
    let shipLineSimZ = p.z;
    let shipLineHeadingRad = p.headingRad;
    let aimLineSimX = p.x;
    let aimLineSimZ = p.z;
    let rudderForRoll = p.rudder;
    if (sessionId === mySessionId) {
      const yaw = worldToRenderYaw(p.headingRad);
      // Das sichtbare Sprite hat einen anderen Drehpunkt als die Simulationsposition.
      // Darum wird hier ein lokaler Z-Offset in Weltkoordinaten umgerechnet.
      const pivotDx = Math.sin(yaw) * tuning.shipPivotLocalZ;
      const pivotDz = Math.cos(yaw) * tuning.shipPivotLocalZ;
      vis.group.position.set(worldToRenderX(p.x) - pivotDx, wreckSinkY, p.z - pivotDz);
      vis.group.rotation.y = yaw;
      rudderForRoll = p.rudder;
      aimLineSimX = inputSample.aimWorldX;
      aimLineSimZ = inputSample.aimWorldZ;
    } else {
      let buf = remoteInterp.get(sessionId);
      if (!buf) {
        buf = createInterpolationBuffer(p, now);
        remoteInterp.set(sessionId, buf);
      }
      const r = sampleInterpolatedPose(buf, now, DEFAULT_INTERPOLATION_DELAY_MS);
      const yaw = worldToRenderYaw(r.headingRad);
      const pivotDx = Math.sin(yaw) * tuning.shipPivotLocalZ;
      const pivotDz = Math.cos(yaw) * tuning.shipPivotLocalZ;
      vis.group.position.set(worldToRenderX(r.x) - pivotDx, wreckSinkY, r.z - pivotDz);
      vis.group.rotation.y = yaw;
      rudderForRoll = r.rudder;
      aimLineSimX = r.aimX;
      aimLineSimZ = r.aimZ;
      shipLineSimX = r.x;
      shipLineSimZ = r.z;
      shipLineHeadingRad = r.headingRad;
    }

    if (deathPose) {
      vis.group.rotation.order = "YXZ";
      vis.group.rotation.x = deathPose.pitchX;
      vis.group.rotation.z = deathPose.rollZ;
    } else {
      vis.group.rotation.x = 0;
      const rollTarget = visualRollRadFromRudderAndSpeed(rudderForRoll, p.speed);
      vis.group.rotation.z = stepVisualRollSmoothed(sessionId, rollTarget, dtMs / 1000);
    }

    /** LW-Mounts zur Rakete: solange Server „incoming“ meldet. */
    const layered = typeof p.adHudIncomingAswm === "number" && p.adHudIncomingAswm > 0;
      let aimOpts: ArtilleryTrainAimOptions | undefined;
    if (!isDeadVis && vis.rotatingMountTrains.some((t) => t.isAirDefense)) {
      let missileSim: { x: number; z: number } | null = null;
      if (layered && adMissileSnapsScratch.length > 0) {
        missileSim = pickThreatMissilePositionForDefender(
          adMissileSnapsScratch,
          sessionId,
          adPlayerSnapshots,
        );
      }
      aimOpts = {
        layeredDefenseActive: layered,
        missileSim,
        shipSimX: shipLineSimX,
        shipSimZ: shipLineSimZ,
        shipHeadingRad: shipLineHeadingRad,
      };
    }
    if (!isDeadVis) {
      updateArtilleryTrainRotationsFromAim(vis, aimLineSimX, aimLineSimZ, aimOpts);
    }

    setShipVisualLifeState(vis, p.lifeState, sessionId === mySessionId);

    if (p.lifeState !== PlayerLifeState.AwaitingRespawn) {
      const aimDebug = updateAimMountToTargetDebugLine(
        vis,
        shipLineSimX,
        shipLineSimZ,
        shipLineHeadingRad,
        aimLineSimX,
        aimLineSimZ,
      );
      if (sessionId === mySessionId) {
        state.aimLineSectorDebug = aimDebug.join(" | ");
      }
    } else {
      for (const c of vis.aimLine.children) {
        (c as THREE.Line).visible = false;
      }
      if (sessionId === mySessionId) {
        state.aimLineSectorDebug = "local: awaiting_respawn";
      }
    }

    if (p.lifeState !== PlayerLifeState.AwaitingRespawn) {
      const hpPercent = p.maxHp > 0 ? p.hp / p.maxHp : 1;
      const severity =
        hpPercent < 0.3 ? "heavily_damaged" : hpPercent < 0.9 ? "damaged" : null;
      if (severity) {
        const intervalMs = severity === "heavily_damaged" ? 80 : 170;
        const last = state.lastDamageSmokeAtBySessionId.get(sessionId) ?? 0;
        if (now - last >= intervalMs) {
          fx.shipDamageSmokeTick(p.x, p.z, p.headingRad, severity);
          state.lastDamageSmokeAtBySessionId.set(sessionId, now);
        }
      }
    }

    if (sessionId === mySessionId && me) {
      updateLocalFollowCameraFromPlayer(camera, p, dtMs);

      if (me.lifeState !== PlayerLifeState.AwaitingRespawn && !matchEnded) {
        const tuningNow = getShipDebugTuningForVisualClass(me.shipClass);
        const firing =
          inputSample.primaryFire ||
          inputSample.secondaryFire ||
          (FEATURE_MINES_ENABLED && inputSample.torpedoFire);
        const dedupKey = buildInputDedupKey(inputSample, tuningNow.mineSpawnLocalZ);
        const mustSend =
          firing ||
          dedupKey !== state.lastInputDedupKey ||
          now - state.lastInputDedupAtMs >= INPUT_HEARTBEAT_MS;
        if (mustSend) {
          const base = {
            aimX: inputSample.aimWorldX,
            aimZ: inputSample.aimWorldZ,
            primaryFire: inputSample.primaryFire,
            secondaryFire: inputSample.secondaryFire,
            torpedoFire: FEATURE_MINES_ENABLED && inputSample.torpedoFire,
            mineSpawnLocalZ: tuningNow.mineSpawnLocalZ,
            radarActive: inputSample.radarActive,
            ...(inputSample.aswmFireSide ? { aswmFireSide: inputSample.aswmFireSide } : {}),
          };
          if (inputSample.useTelegraphWire === true) {
            roomSendInput({
              ...base,
              engineOrder: inputSample.engineOrder,
              rudderOrder: inputSample.rudderOrder,
            });
          } else {
            roomSendInput({
              ...base,
              throttle: inputSample.throttle,
              rudderInput: inputSample.rudderInput,
            });
          }
          state.lastInputDedupKey = dedupKey;
          state.lastInputDedupAtMs = now;
        }
      }

      const progLevel = Math.min(
        PROGRESSION_MAX_LEVEL,
        Math.max(1, Math.floor(typeof me.level === "number" ? me.level : 1)),
      );
      const progXp = typeof me.xp === "number" ? me.xp : 0;
      const xpSeg = progressionXpToNextLevel(progLevel, progXp);
      const xpLine =
        progLevel >= PROGRESSION_MAX_LEVEL
          ? t("hud.xpMax")
          : t("hud.xpProgress", { current: xpSeg.intoLevel, need: xpSeg.need });
      /** Während Respawn-Warte: Server behält Wrack-Rumpf in `shipClass`; HUD zeigt Zielklasse nach Degradierung. */
      const cockpitClassId = normalizeShipClassId(
        me.lifeState === PlayerLifeState.AwaitingRespawn
          ? shipClassIdForProgressionLevel(progLevel)
          : me.shipClass,
      ) as ShipClassId;
      const profShip = getShipClassProfile(cockpitClassId);
      const hullVis = getAuthoritativeHullProfile(cockpitClassId);
      const maxSp =
        cfgMaxSpeed *
        profShip.movementSpeedMul *
        progressionMovementScale(progLevel).maxSpeedFactor;
      const speedKn = p.speed / SPEED_FEEL_FACTOR;
      const maxSpeedKn = maxSp / SPEED_FEEL_FACTOR;
      let ownedMines = 0;
      if (torpedoList) {
        // "TorpedoList" ist im aktuellen Feature semantisch die aktive Minenliste.
        for (const t of torpedoList) {
          if (t.ownerId === mySessionId) ownedMines++;
        }
      }

      if (progLevel > state.lastHudLevel) {
        const rankEn = progressionNavalRankEn(progLevel);
        gameMessageHud.showToast(t("toast.levelRank", { level: progLevel, rank: rankEn }), "info", 3600);
        gameAudio.levelUp();
      }
      state.lastHudLevel = progLevel;

      const radarBlips: RadarBlipNorm[] = [];
      const radarPortalMarkers: RadarBlipNorm[] = [];
      const esmLines: { x1: number; y1: number; x2: number; y2: number; stroke?: string }[] = [];
      const radarThreatLines: CockpitRadarThreatLine[] = [];
      const ssmRailLines: CockpitSsmRailLine[] = [];
      let radarVisible = false;
      const ownRadarActive = me.radarActive !== false;
      if (!matchEnded && me.lifeState !== PlayerLifeState.AwaitingRespawn) {
        radarVisible = true;
        const launchers = hullVis?.fixedSeaSkimmerLaunchers;
        if (launchers?.length) {
          for (const L of launchers) {
            const yb = launcherYawRadFromBow(L);
            const line = cockpitSsmRailTickLineNorthUp(p.headingRad, yb, {
              rimPx: RADAR_PLAN_SVG_BLIP_RADIUS,
            });
            let stroke: string | undefined;
            if (L.side === "port") stroke = "rgba(255, 72, 88, 0.94)";
            else if (L.side === "starboard") stroke = "rgba(72, 255, 128, 0.94)";
            else stroke = "rgba(210, 225, 255, 0.85)";
            ssmRailLines.push({ ...line, stroke });
          }
        }
        const pe = radarBlipNormalizedNorthUpClampedToRim(
          p.x,
          p.z,
          VIBE_JAM_EXIT_PORTAL_X,
          VIBE_JAM_EXIT_PORTAL_Z,
        );
        if (pe) radarPortalMarkers.push(pe);
        if (hasVibeJamReturnPortal()) {
          const pr = radarBlipNormalizedNorthUpClampedToRim(
            p.x,
            p.z,
            VIBE_JAM_RETURN_PORTAL_X,
            VIBE_JAM_RETURN_PORTAL_Z,
          );
          if (pr) radarPortalMarkers.push(pr);
        }
        for (const other of playerList) {
          if (other.id === mySessionId) continue;
          if (other.lifeState === PlayerLifeState.AwaitingRespawn) continue;
          const b = radarBlipNormalizedNorthUp(p.x, p.z, other.x, other.z);
          if (b && ownRadarActive) radarBlips.push(b);
          const emitterOn = other.radarActive !== false;
          if (emitterOn) {
            const esmRangeWorld = RADAR_ESM_RANGE_WORLD * esmDetectionRangeMul(other.shipClass);
            const bEsm = radarBlipNormalizedNorthUp(p.x, p.z, other.x, other.z, esmRangeWorld);
            if (bEsm) {
              const line = esmLineTowardBlip(bEsm);
              esmLines.push({ ...line, stroke: esmEmitterStrokeCss(other.shipClass) });
            }
          }
        }
        for (let ri = 0; ri < adMissileSnapsScratch.length; ri++) {
          const m = adMissileSnapsScratch[ri]!;
          if (m.ownerId === mySessionId) continue;
          if (resolveAirDefenseDefenderIdForMissile(m, adPlayerSnapshots) !== mySessionId) {
            continue;
          }
          const bM = radarBlipNormalizedNorthUp(p.x, p.z, m.x, m.z, RADAR_ESM_RANGE_WORLD);
          if (!bM) continue;
          const line = esmLineTowardBlip(bM);
          const lockedOnMe = m.targetId === mySessionId;
          radarThreatLines.push({ ...line, dashed: !lockedOnMe });
        }
      }

      const shipClassId = cockpitClassId;
      const magCaps = getAswmMagazineFromProfile(hullVis, shipClassId);
      const aswmMagPortCap = magCaps.port;
      const aswmMagStarboardCap = magCaps.starboard;
      const remPort =
        typeof me.aswmRemainingPort === "number" && Number.isFinite(me.aswmRemainingPort)
          ? me.aswmRemainingPort
          : 0;
      const remSb =
        typeof me.aswmRemainingStarboard === "number" && Number.isFinite(me.aswmRemainingStarboard)
          ? me.aswmRemainingStarboard
          : 0;
      const aimWorld = Math.atan2(me.aimX - p.x, me.aimZ - p.z);
      let mainMountTrainRad = aimWorld - p.headingRad;
      while (mainMountTrainRad > Math.PI) mainMountTrainRad -= Math.PI * 2;
      while (mainMountTrainRad < -Math.PI) mainMountTrainRad += Math.PI * 2;

      cockpit.update({
        speed: speedKn,
        maxSpeed: maxSpeedKn,
        headingRad: p.headingRad,
        worldX: p.x,
        worldZ: p.z,
        mainMountTrainRad,
        aswmMagPortCap,
        aswmMagStarboardCap,
        aswmRemainingPort: remPort,
        aswmRemainingStarboard: remSb,
        hp: p.hp,
        maxHp: p.maxHp,
        primaryCooldownSec: p.primaryCooldownSec,
        secondaryCooldownSec: me.secondaryCooldownSec,
        torpedoCooldownSec: me.torpedoCooldownSec,
        mineCount: ownedMines,
        mineMaxCount: profShip.torpedoMaxPerOwner,
        respawnCountdownSec: me.respawnCountdownSec,
        spawnProtectionSec: me.spawnProtectionSec,
        matchRemainingSec: matchEnded ? 0 : matchRemainingSecRaw,
        score: typeof me.score === "number" ? me.score : 0,
        kills: typeof me.kills === "number" ? me.kills : 0,
        rankLabelEn: progressionNavalRankEn(progLevel),
        xpLine,
        shipClassLabel: profShip.labelDe,
        playerDisplayName:
          typeof me.displayName === "string" && me.displayName.trim().length > 0
            ? me.displayName.trim()
            : toShortSession(me.id),
        shipClassId,
        radarBlips,
        radarPortalMarkers,
        radarVisible,
        ownRadarActive,
        esmLines,
        radarThreatLines,
        ssmRailLines: radarVisible ? ssmRailLines : [],
      });
    }
  }

  pruneVisualRollSmoothed(new Set(visuals.keys()));

  refreshArtilleryCullFromLocalPlayer(cameraCullState, me, window.innerWidth, window.innerHeight);

  fx.missileFx.sync(missileList);
  fx.torpedoFx.sync(torpedoList);

  fx.missileFx.update(now, dtMs);
  fx.torpedoFx.update(now, dtMs);
  fx.artilleryFx.update(now, dtMs);
  gameMessageHud.updateFrame(now, me?.oobCountdownSec ?? 0, me?.spawnProtectionSec ?? 0);

  applyCameraShakeStep(camera, dtMs);

  return { me };
}
