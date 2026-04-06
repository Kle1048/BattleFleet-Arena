import type { ArraySchema } from "@colyseus/schema";
import type * as THREE from "three";
import {
  PlayerLifeState,
  PROGRESSION_MAX_LEVEL,
  getShipClassProfile,
  progressionMovementScale,
  progressionXpToNextLevel,
} from "@battlefleet/shared";
import {
  ARTILLERY_FX_CULL_MARGIN,
  artilleryFxCullRadiusSq,
  cameraPivotXZ,
  orthoVisibleHalfExtents,
  updateFollowCamera,
} from "../scene/createGameScene";
import { rudderRotationRad, setShipVisualLifeState, type ShipVisual } from "../scene/shipVisual";
import {
  DEFAULT_INTERPOLATION_DELAY_MS,
  createInterpolationBuffer,
  sampleInterpolatedPose,
} from "../network/remoteInterpolation";
import { toMissilePoses, toTorpedoPoses } from "./networkStateAdapter";

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
};

type MissileLike = { missileId: number; x: number; z: number; headingRad: number };
type TorpedoLike = { torpedoId: number; x: number; z: number; headingRad: number };

type InputSample = {
  throttle: number;
  rudderInput: number;
  aimWorldX: number;
  aimWorldZ: number;
  primaryFire: boolean;
  secondaryFire: boolean;
  torpedoFire: boolean;
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
    respawnCountdownSec: number;
    spawnProtectionSec: number;
    matchRemainingSec: number;
    score: number;
    kills: number;
    level: number;
    xpLine: string;
    shipClassLabel: string;
    playerDisplayName: string;
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
  missileFx: { sync: (poses: readonly MissileLike[]) => void; update: (now: number, dt: number) => void };
  torpedoFx: { sync: (poses: readonly TorpedoLike[]) => void; update: (now: number, dt: number) => void };
};

type RuntimeState = {
  lastHudLevel: number;
  lastOobCountdown: number;
  artyFxCullShipX: number;
  artyFxCullShipZ: number;
  artyFxCullRadiusSq: number;
  lastLifeStateBySessionId: Map<string, string>;
};

export function createFrameRuntimeState(initialHudLevel = 1): RuntimeState {
  return {
    lastHudLevel: initialHudLevel,
    lastOobCountdown: 0,
    artyFxCullShipX: 0,
    artyFxCullShipZ: 0,
    artyFxCullRadiusSq: Number.POSITIVE_INFINITY,
    lastLifeStateBySessionId: new Map<string, string>(),
  };
}

export function isArtyWorldPointInCullRange(state: RuntimeState, wx: number, wz: number): boolean {
  const dx = wx - state.artyFxCullShipX;
  const dz = wz - state.artyFxCullShipZ;
  return dx * dx + dz * dz <= state.artyFxCullRadiusSq;
}

export function shouldRenderArtyFiredClientVfx(
  state: RuntimeState,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): boolean {
  return isArtyWorldPointInCullRange(state, fromX, fromZ) || isArtyWorldPointInCullRange(state, toX, toZ);
}

export function runFrameRuntimeStep<
  TPlayer extends NetPlayerLike,
  TMissile extends MissileLike,
  TTorpedo extends TorpedoLike,
>(options: {
  now: number;
  camera: THREE.OrthographicCamera;
  roomSendInput: (payload: {
    throttle: number;
    rudderInput: number;
    aimX: number;
    aimZ: number;
    primaryFire: boolean;
    secondaryFire: boolean;
    torpedoFire: boolean;
  }) => void;
  mySessionId: string;
  cfgMaxSpeed: number;
  playerList: ArraySchema<TPlayer>;
  visuals: Map<string, ShipVisual>;
  remoteInterp: Map<string, ReturnType<typeof createInterpolationBuffer>>;
  getPlayer: (list: ArraySchema<TPlayer>, sessionId: string) => TPlayer | undefined;
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
}): { me: TPlayer | undefined } {
  const {
    now,
    camera,
    roomSendInput,
    mySessionId,
    cfgMaxSpeed,
    playerList,
    visuals,
    remoteInterp,
    getPlayer,
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
    }
    state.lastLifeStateBySessionId.set(p.id, p.lifeState);
  }
  for (const id of state.lastLifeStateBySessionId.keys()) {
    if (!presentIds.has(id)) {
      state.lastLifeStateBySessionId.delete(id);
    }
  }

  const me = getPlayer(playerList, mySessionId);
  if (me) {
    const oobSec = me.oobCountdownSec ?? 0;
    if (oobSec > 0 && state.lastOobCountdown <= 0 && !matchEnded) {
      gameAudio.warning();
    }
    state.lastOobCountdown = oobSec;

    const { halfW, halfH } = orthoVisibleHalfExtents(window.innerWidth, window.innerHeight);
    const pivot = cameraPivotXZ(me.x, me.z, me.headingRad);
    state.artyFxCullShipX = me.x;
    state.artyFxCullShipZ = me.z;
    state.artyFxCullRadiusSq = artilleryFxCullRadiusSq(
      me.x,
      me.z,
      pivot.x,
      pivot.z,
      halfW,
      halfH,
      ARTILLERY_FX_CULL_MARGIN,
    );
  } else {
    state.artyFxCullRadiusSq = Number.POSITIVE_INFINITY;
  }

  for (const [sessionId, vis] of visuals) {
    const p = getPlayer(playerList, sessionId);
    if (!p) continue;

    const wreckSinkY = p.lifeState === PlayerLifeState.AwaitingRespawn ? -4.2 : 0;

    if (sessionId === mySessionId) {
      vis.group.position.set(p.x, wreckSinkY, p.z);
      vis.group.rotation.y = p.headingRad;
      vis.rudderLine.rotation.y = rudderRotationRad(p.rudder);
      const yawAim = Math.atan2(inputSample.aimWorldX - p.x, inputSample.aimWorldZ - p.z);
      vis.aimLine.rotation.y = yawAim - p.headingRad;
    } else {
      let buf = remoteInterp.get(sessionId);
      if (!buf) {
        buf = createInterpolationBuffer(p, now);
        remoteInterp.set(sessionId, buf);
      }
      const r = sampleInterpolatedPose(buf, now, DEFAULT_INTERPOLATION_DELAY_MS);
      vis.group.position.set(r.x, wreckSinkY, r.z);
      vis.group.rotation.y = r.headingRad;
      vis.rudderLine.rotation.y = rudderRotationRad(r.rudder);
      const yawAim = Math.atan2(r.aimX - r.x, r.aimZ - r.z);
      vis.aimLine.rotation.y = yawAim - r.headingRad;
    }

    setShipVisualLifeState(vis, p.lifeState, sessionId === mySessionId);

    if (sessionId === mySessionId && me) {
      updateFollowCamera(camera, p.x, p.z, p.headingRad);

      if (me.lifeState !== PlayerLifeState.AwaitingRespawn && !matchEnded) {
        roomSendInput({
          throttle: inputSample.throttle,
          rudderInput: inputSample.rudderInput,
          aimX: inputSample.aimWorldX,
          aimZ: inputSample.aimWorldZ,
          primaryFire: inputSample.primaryFire,
          secondaryFire: inputSample.secondaryFire,
          torpedoFire: inputSample.torpedoFire,
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

      if (progLevel > state.lastHudLevel) {
        gameMessageHud.showToast(`Level ${progLevel}!`, "info", 2800);
        gameAudio.levelUp();
      }
      state.lastHudLevel = progLevel;

      cockpit.update({
        speed: p.speed,
        maxSpeed: maxSp,
        throttle: inputSample.throttle,
        rudder: p.rudder,
        headingRad: p.headingRad,
        hp: p.hp,
        maxHp: p.maxHp,
        primaryCooldownSec: p.primaryCooldownSec,
        secondaryCooldownSec: me.secondaryCooldownSec,
        torpedoCooldownSec: me.torpedoCooldownSec,
        respawnCountdownSec: me.respawnCountdownSec,
        spawnProtectionSec: me.spawnProtectionSec,
        matchRemainingSec: matchEnded ? 0 : matchRemainingSecRaw,
        score: typeof me.score === "number" ? me.score : 0,
        kills: typeof me.kills === "number" ? me.kills : 0,
        level: progLevel,
        xpLine,
        shipClassLabel: profShip.labelDe,
        playerDisplayName:
          typeof me.displayName === "string" && me.displayName.trim().length > 0
            ? me.displayName.trim()
            : toShortSession(me.id),
      });
    }
  }

  if (missileList) {
    fx.missileFx.sync(toMissilePoses(missileList));
  } else {
    fx.missileFx.sync([]);
  }

  if (torpedoList) {
    fx.torpedoFx.sync(toTorpedoPoses(torpedoList));
  } else {
    fx.torpedoFx.sync([]);
  }

  fx.missileFx.update(now, 0);
  fx.torpedoFx.update(now, 0);
  fx.artilleryFx.update(now, 0);
  gameMessageHud.updateFrame(now, me?.oobCountdownSec ?? 0, me?.spawnProtectionSec ?? 0);

  return { me };
}
