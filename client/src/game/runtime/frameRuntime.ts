import type { ArraySchema } from "@colyseus/schema";
import type * as THREE from "three";
import {
  PlayerLifeState,
  PROGRESSION_MAX_LEVEL,
  SPEED_FEEL_FACTOR,
  getShipClassProfile,
  progressionMovementScale,
  progressionNavalRankEn,
  progressionXpToNextLevel,
} from "@battlefleet/shared";
import {
  applyShipVisualRuntimeTuning,
  setShipVisualLifeState,
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
import { getShipDebugTuning, getShipDebugTuningGeneration } from "./shipDebugTuning";
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
};

type MissileLike = { missileId: number; x: number; z: number; headingRad: number };
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
};

type CockpitLike = {
  update: (model: {
    speed: number;
    maxSpeed: number;
    throttle: number;
    rudder: number;
    headingRad: number;
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
};

export function createFrameRuntimeState(initialHudLevel = 1): RuntimeState {
  return {
    lastHudLevel: initialHudLevel,
    lastOobCountdown: 0,
    lastLifeStateBySessionId: new Map<string, string>(),
    lastDamageSmokeAtBySessionId: new Map<string, number>(),
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
    artillerySpawnLocalZ: number;
    mineSpawnLocalZ: number;
    radarActive: boolean;
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

  const me = playersById.get(mySessionId);
  if (me) {
    const oobSec = me.oobCountdownSec ?? 0;
    if (oobSec > 0 && state.lastOobCountdown <= 0 && !matchEnded) {
      gameAudio.warning();
    }
    state.lastOobCountdown = oobSec;
  }

  const tuningGen = getShipDebugTuningGeneration();
  for (const [sessionId, vis] of visuals) {
    const p = playersById.get(sessionId);
    if (!p) continue;
    if (vis.debugTuningGenApplied !== tuningGen) {
      applyShipVisualRuntimeTuning(vis);
      vis.debugTuningGenApplied = tuningGen;
    }
    const tuning = getShipDebugTuning();

    const wreckSinkY = p.lifeState === PlayerLifeState.AwaitingRespawn ? -4.2 : 0;

    if (sessionId === mySessionId) {
      const yaw = worldToRenderYaw(p.headingRad);
      // Das sichtbare Sprite hat einen anderen Drehpunkt als die Simulationsposition.
      // Darum wird hier ein lokaler Z-Offset in Weltkoordinaten umgerechnet.
      const pivotDx = Math.sin(yaw) * tuning.shipPivotLocalZ;
      const pivotDz = Math.cos(yaw) * tuning.shipPivotLocalZ;
      vis.group.position.set(worldToRenderX(p.x) - pivotDx, wreckSinkY, p.z - pivotDz);
      vis.group.rotation.y = yaw;
      const yawAim = Math.atan2(inputSample.aimWorldX - p.x, inputSample.aimWorldZ - p.z);
      vis.aimLine.rotation.y = -(yawAim - p.headingRad);
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
      const yawAim = Math.atan2(r.aimX - r.x, r.aimZ - r.z);
      vis.aimLine.rotation.y = -(yawAim - r.headingRad);
    }

    setShipVisualLifeState(vis, p.lifeState, sessionId === mySessionId);

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
        const tuningNow = getShipDebugTuning();
        roomSendInput({
          throttle: inputSample.throttle,
          rudderInput: inputSample.rudderInput,
          aimX: inputSample.aimWorldX,
          aimZ: inputSample.aimWorldZ,
          primaryFire: inputSample.primaryFire,
          secondaryFire: inputSample.secondaryFire,
          torpedoFire: inputSample.torpedoFire,
          // Server erwartet Spawn-Offsets relativ zur Physikposition des Schiffs.
          // Wir korrigieren daher die visuellen Trim-Werte zurück auf den Simulationsursprung.
          artillerySpawnLocalZ:
            tuningNow.aimOriginLocalZ - tuningNow.shipPivotLocalZ + tuningNow.artillerySpawnLocalZ,
          mineSpawnLocalZ: tuningNow.mineSpawnLocalZ,
          radarActive: inputSample.radarActive,
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

      cockpit.update({
        speed: speedKn,
        maxSpeed: maxSpeedKn,
        throttle: inputSample.throttle,
        rudder: p.rudder,
        headingRad: p.headingRad,
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
