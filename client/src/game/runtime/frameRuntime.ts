import type { ArraySchema } from "@colyseus/schema";
import type * as THREE from "three";
import {
  pickThreatMissilePositionForDefender,
  PlayerLifeState,
  PROGRESSION_MAX_LEVEL,
  SPEED_FEEL_FACTOR,
  getShipClassProfile,
  getAswmMagazineFromProfile,
  getShipHullProfileByClass,
  normalizeShipClassId,
  progressionMovementScale,
  progressionNavalRankEn,
  progressionXpToNextLevel,
  type AirDefenseMissileSnapshot,
  type AirDefensePlayerSnapshot,
  type ShipClassId,
} from "@battlefleet/shared";
import {
  applyShipVisualRuntimeTuning,
  setShipVisualLifeState,
  updateAimMountToTargetDebugLine,
  updateArtilleryTrainRotationsFromAim,
  type ArtilleryTrainAimOptions,
  type ShipVisual,
} from "../scene/shipVisual";
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
import {
  RADAR_ESM_RANGE_WORLD,
  esmLineTowardBlip,
  radarBlipNormalized,
  type RadarBlipNorm,
} from "../hud/radarHudMath";

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
  radarActive?: boolean;
  adHudIncomingAswm?: number;
  adHardkillCommitRemainingSec?: number;
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

type InputSample = {
  throttle: number;
  rudderInput: number;
  aimWorldX: number;
  aimWorldZ: number;
  primaryFire: boolean;
  secondaryFire: boolean;
  torpedoFire: boolean;
  radarActive: boolean;
  airDefenseEngage: boolean;
};

type CockpitLike = {
  update: (model: {
    speed: number;
    maxSpeed: number;
    throttle: number;
    rudder: number;
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
    radarVisible: boolean;
    ownRadarActive: boolean;
    esmLines: { x1: number; y1: number; x2: number; y2: number }[];
  }) => void;
};

type GameMessageHudLike = {
  showToast: (message: string, kind: "danger" | "info", durationMs: number) => void;
  updateFrame: (now: number, oobCountdownSec: number, spawnProtectionSec: number) => void;
};

type AudioLike = {
  warning: () => void;
  levelUp: () => void;
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
  /** Vorheriger Wert von `adHudIncomingAswm` (lokaler Spieler) für Vampire-Toast. */
  lastAdHudIncomingAswm: number;
  /** Live-Debug für Aim-Linien/Sektorprüfung (lokaler Spieler). */
  aimLineSectorDebug: string;
};

export function createFrameRuntimeState(initialHudLevel = 1): RuntimeState {
  return {
    lastHudLevel: initialHudLevel,
    lastOobCountdown: 0,
    lastLifeStateBySessionId: new Map<string, string>(),
    lastDamageSmokeAtBySessionId: new Map<string, number>(),
    lastAdHudIncomingAswm: 0,
    aimLineSectorDebug: "",
  };
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
    throttle: number;
    rudderInput: number;
    aimX: number;
    aimZ: number;
    primaryFire: boolean;
    secondaryFire: boolean;
    torpedoFire: boolean;
    mineSpawnLocalZ: number;
    radarActive: boolean;
    airDefenseEngage?: boolean;
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

  const presentIds = new Set<string>();
  for (const p of playerList) {
    presentIds.add(p.id);
    const prev = state.lastLifeStateBySessionId.get(p.id);
    if (
      prev !== undefined &&
      prev !== PlayerLifeState.AwaitingRespawn &&
      p.lifeState === PlayerLifeState.AwaitingRespawn
    ) {
      if (p.id === mySessionId) {
        gameMessageHud.showToast("Zerstört — Warte auf Respawn …", "danger", 5500);
      } else {
        gameMessageHud.showToast(`${toDisplayLabel(p)} zerstört`, "info", 5000);
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

  const playersById = new Map<string, TPlayer>();
  for (const p of playerList) {
    playersById.set(p.id, p);
  }

  const adPlayerSnapshots: AirDefensePlayerSnapshot[] = [];
  for (const pl of playerList) {
    adPlayerSnapshots.push({
      id: pl.id,
      x: pl.x,
      z: pl.z,
      headingRad: pl.headingRad,
      lifeState: pl.lifeState,
      shipClass: pl.shipClass,
    });
  }

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
  } else {
    const inc = typeof me.adHudIncomingAswm === "number" ? me.adHudIncomingAswm : 0;
    const prev = state.lastAdHudIncomingAswm;
    if (!matchEnded && prev === 0 && inc > 0) {
      gameMessageHud.showToast("Vampire incoming — Press E for Layered Defence", "info", 5500);
    }
    state.lastAdHudIncomingAswm = inc;
  }

  const tuningGen = getShipDebugTuningGeneration();
  for (const [sessionId, vis] of visuals) {
    const p = playersById.get(sessionId);
    if (!p) continue;
    if (vis.debugTuningGenApplied !== tuningGen) {
      applyShipVisualRuntimeTuning(vis);
      vis.debugTuningGenApplied = tuningGen;
    }
    const tuning = getShipDebugTuningForVisualClass(p.shipClass);

    const wreckSinkY = p.lifeState === PlayerLifeState.AwaitingRespawn ? -4.2 : 0;

    let shipLineSimX = p.x;
    let shipLineSimZ = p.z;
    let shipLineHeadingRad = p.headingRad;
    let aimLineSimX = p.x;
    let aimLineSimZ = p.z;
    if (sessionId === mySessionId) {
      const yaw = worldToRenderYaw(p.headingRad);
      // Das sichtbare Sprite hat einen anderen Drehpunkt als die Simulationsposition.
      // Darum wird hier ein lokaler Z-Offset in Weltkoordinaten umgerechnet.
      const pivotDx = Math.sin(yaw) * tuning.shipPivotLocalZ;
      const pivotDz = Math.cos(yaw) * tuning.shipPivotLocalZ;
      vis.group.position.set(worldToRenderX(p.x) - pivotDx, wreckSinkY, p.z - pivotDz);
      vis.group.rotation.y = yaw;
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
      aimLineSimX = r.aimX;
      aimLineSimZ = r.aimZ;
      shipLineSimX = r.x;
      shipLineSimZ = r.z;
      shipLineHeadingRad = r.headingRad;
    }

    const layered =
      typeof p.adHardkillCommitRemainingSec === "number" && p.adHardkillCommitRemainingSec > 0;
    let aimOpts: ArtilleryTrainAimOptions | undefined;
    if (vis.artilleryTrainIsAirDefense.some(Boolean)) {
      let missileSim: { x: number; z: number } | null = null;
      if (layered && missileList && missileList.length > 0) {
        const missileSnaps: AirDefenseMissileSnapshot[] = [];
        for (let mi = 0; mi < missileList.length; mi++) {
          const m = missileList.at(mi);
          if (!m) continue;
          missileSnaps.push({
            ownerId: m.ownerId,
            targetId: m.targetId,
            x: m.x,
            z: m.z,
          });
        }
        missileSim = pickThreatMissilePositionForDefender(missileSnaps, sessionId, adPlayerSnapshots);
      }
      aimOpts = {
        layeredDefenseActive: layered,
        missileSim,
        shipSimX: shipLineSimX,
        shipSimZ: shipLineSimZ,
        shipHeadingRad: shipLineHeadingRad,
      };
    }
    updateArtilleryTrainRotationsFromAim(vis, aimLineSimX, aimLineSimZ, aimOpts);

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
        roomSendInput({
          throttle: inputSample.throttle,
          rudderInput: inputSample.rudderInput,
          aimX: inputSample.aimWorldX,
          aimZ: inputSample.aimWorldZ,
          primaryFire: inputSample.primaryFire,
          secondaryFire: inputSample.secondaryFire,
          torpedoFire: inputSample.torpedoFire,
          mineSpawnLocalZ: tuningNow.mineSpawnLocalZ,
          radarActive: inputSample.radarActive,
          airDefenseEngage: inputSample.airDefenseEngage,
        });
      }

      const progLevel = Math.min(
        PROGRESSION_MAX_LEVEL,
        Math.max(1, Math.floor(typeof me.level === "number" ? me.level : 1)),
      );
      const progXp = typeof me.xp === "number" ? me.xp : 0;
      const xpSeg = progressionXpToNextLevel(progLevel, progXp);
      const xpLine = progLevel >= PROGRESSION_MAX_LEVEL ? "MAX" : `${xpSeg.intoLevel} / ${xpSeg.need}`;
      const profShip = getShipClassProfile(me.shipClass);
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
        gameMessageHud.showToast(`Level ${progLevel}: ${rankEn}`, "info", 3600);
        gameAudio.levelUp();
      }
      state.lastHudLevel = progLevel;

      const radarBlips: RadarBlipNorm[] = [];
      const esmLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
      let radarVisible = false;
      const ownRadarActive = me.radarActive !== false;
      if (!matchEnded && me.lifeState !== PlayerLifeState.AwaitingRespawn) {
        radarVisible = true;
        for (const other of playerList) {
          if (other.id === mySessionId) continue;
          if (other.lifeState === PlayerLifeState.AwaitingRespawn) continue;
          const b = radarBlipNormalized(p.x, p.z, p.headingRad, other.x, other.z);
          if (b && ownRadarActive) radarBlips.push(b);
          const emitterOn = other.radarActive !== false;
          if (emitterOn) {
            const bEsm = radarBlipNormalized(
              p.x,
              p.z,
              p.headingRad,
              other.x,
              other.z,
              RADAR_ESM_RANGE_WORLD,
            );
            if (bEsm) esmLines.push(esmLineTowardBlip(bEsm));
          }
        }
      }

      const shipClassId = normalizeShipClassId(me.shipClass) as ShipClassId;
      const hullVis = getShipHullProfileByClass(shipClassId);
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
        throttle: inputSample.throttle,
        rudder: p.rudder,
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
        radarVisible,
        ownRadarActive,
        esmLines,
      });
    }
  }

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
