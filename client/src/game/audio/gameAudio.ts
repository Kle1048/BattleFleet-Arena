/**
 * Spiel-SFX: optional WAV unter `public/assets/sounds/` (siehe `soundCatalog.ts`),
 * sonst Web-Audio-Synth-Beeps. Erste Nutzeraktion nötig (Autoplay-Policy).
 *
 * **Stereo:** relativ zur Bug-Richtung des zuletzt gesetzten Hörers (`setListenerShipPose`);
 * Quellen mit Welt-XZ nutzen `StereoPannerNode.pan` + optionale Distanz-Dämpfung.
 */

import { ALL_SOUND_IDS, type SoundId, SoundUrls } from "./soundCatalog";
import { setDynamicMusicBufferMap, updateDynamicMusic as runDynamicMusicUpdate } from "./dynamicMusic";
import {
  type ListenerShipPose,
  type SpatialSoundOpts,
  SPATIAL_AIR_DEFENSE_MAX_M,
  SPATIAL_EXPLOSION_OTHER_MAX_M,
  SPATIAL_HIT_NEAR_MAX_M,
  SPATIAL_WEAPON_HIT_MAX_M,
  spatializedGainAndPan,
} from "./shipSpatialAudio";
import { effectiveSfxGain, extendDuckUntil } from "./sfxMix";
import { getEngineUserMult } from "./soundMixState";

let audioCtx: AudioContext | null = null;

let listenerPose: ListenerShipPose | null = null;

/** Kurzes Absenken anderer SFX nach Explosion / harten Treffern (Web-Audio one-shots). */
let sfxDuckUntilMs = 0;

function pokeSfxDuck(durationMs: number): void {
  sfxDuckUntilMs = extendDuckUntil(performance.now(), sfxDuckUntilMs, durationMs);
}

function applySfxMixToGain(g0: number): number {
  return effectiveSfxGain(g0, performance.now(), sfxDuckUntilMs);
}

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

const buffers = new Map<SoundId, AudioBuffer | null>();

/** Dauer-Loop: Maschinenraum; unabhängig von SFX-Duck. */
let engineBed: null | {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
} = null;
let engineSynth: null | { osc: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } = null;
let engineCurrentGain = 0;
let engineTargetRate = 1;
let engineCurrentRate = 1;
let engineTargetFilterHz = 420;
let engineCurrentFilterHz = 420;

/** Ziel-Gain vor Boost (0…1); Endpegel = × ENGINE_OUT_BOOST × `getEngineUserMult()`. */
const ENGINE_G_MIN = 0.2;
const ENGINE_G_MAX = 1.12;
/** Gesamt-Anhebung: Motor-Loop soll gegenüber Musik/SFX klar hörbar sein. */
const ENGINE_OUT_BOOST = 1.75;
const ENGINE_SMOOTH_HZ = 6.5;
const RATE_LO = 0.93;
const RATE_HI = 1.07;
const FILTER_HZ_LO = 620;
const FILTER_HZ_HI = 12000;

function smExp(prev: number, next: number, dtMs: number, smoothHz: number): number {
  if (dtMs < 0.001) return next;
  const a = 1 - Math.exp(-(dtMs / 1000) * smoothHz);
  return prev + (next - prev) * a;
}

function ensureEngineRumbleGraph(c: AudioContext): void {
  if (engineBed || engineSynth) return;
  const buf = buffers.get("engineLoop");
  if (buf) {
    const source = c.createBufferSource();
    source.buffer = buf;
    source.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 5200;
    const g = c.createGain();
    g.gain.value = 0.0001;
    source.connect(filter);
    filter.connect(g);
    g.connect(c.destination);
    try {
      source.start(0);
    } catch {
      return;
    }
    engineBed = { source, filter, gain: g };
  } else {
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 64;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    const g = c.createGain();
    g.gain.value = 0.0001;
    osc.connect(filter);
    filter.connect(g);
    g.connect(c.destination);
    osc.start(0);
    engineSynth = { osc, filter, gain: g };
  }
}

function engineIntensityFromInputs(throttle: number, speed: number, maxSpeed: number): number {
  const t = Math.max(0, Math.min(1, Math.abs(throttle)));
  const m = maxSpeed > 0.1 ? Math.min(1, Math.max(0, speed) / maxSpeed) : 0;
  return Math.min(1, 0.68 * t + 0.48 * m);
}

function setEngineRumbleFromIntensity(intensity: number, dtMs: number, off: boolean): void {
  const node = engineBed ?? engineSynth;
  if (!node) return;
  const ac = ctx();
  if (!ac) return;

  const int = off ? 0 : Math.max(0, Math.min(1, Math.pow(intensity, 0.92)));
  const gTarget = off
    ? 0
    : int < 0.0005
      ? 0
      : ENGINE_G_MIN * int + (ENGINE_G_MAX - ENGINE_G_MIN) * int * int;
  const rateT = RATE_LO + (RATE_HI - RATE_LO) * int;
  const filtT = FILTER_HZ_LO + (FILTER_HZ_HI - FILTER_HZ_LO) * int;
  if (off) {
    engineTargetRate = RATE_LO;
    engineTargetFilterHz = FILTER_HZ_LO;
  } else {
    engineTargetRate = rateT;
    engineTargetFilterHz = filtT;
  }

  engineCurrentGain = smExp(engineCurrentGain, gTarget, dtMs, ENGINE_SMOOTH_HZ);
  engineCurrentRate = smExp(engineCurrentRate, engineTargetRate, dtMs, ENGINE_SMOOTH_HZ);
  engineCurrentFilterHz = smExp(engineCurrentFilterHz, engineTargetFilterHz, dtMs, ENGINE_SMOOTH_HZ * 0.9);

  const t = ac.currentTime;
  if (engineBed) {
    const { source, filter, gain } = engineBed;
    const engM = getEngineUserMult();
    const out = engineCurrentGain * engM * ENGINE_OUT_BOOST;
    gain.gain.setValueAtTime(Math.max(0, Math.min(2.1, out)), t);
    source.playbackRate.setValueAtTime(
      Math.max(0.5, Math.min(1.3, engineCurrentRate)),
      t,
    );
    filter.frequency.setValueAtTime(Math.max(120, Math.min(20000, engineCurrentFilterHz)), t);
  } else {
    const { osc, filter, gain } = engineSynth!;
    const engM = getEngineUserMult();
    const out = engineCurrentGain * engM * ENGINE_OUT_BOOST;
    gain.gain.setValueAtTime(Math.max(0, Math.min(2.1, out)), t);
    const f = 52 + int * 68;
    osc.frequency.setValueAtTime(f, t);
    filter.frequency.setValueAtTime(Math.max(200, 900 + int * 4200), t);
  }
}

function beep(
  freq: number,
  durMs: number,
  gain = 0.06,
  type: OscillatorType = "sine",
  spatial?: SpatialSoundOpts,
): void {
  const c = ctx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();

  const { gain: g0, pan, skip } = spatializedGainAndPan(gain, listenerPose, spatial);
  if (skip) return;
  const gEff = applySfxMixToGain(g0);

  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  const panner = c.createStereoPanner();
  panner.pan.value = pan;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, gEff), t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.connect(g);
  g.connect(panner);
  panner.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.05);
}

function playBuffer(id: SoundId, gain = 0.35, spatial?: SpatialSoundOpts): boolean {
  const c = ctx();
  if (!c) return false;
  if (c.state === "suspended") void c.resume();
  const buf = buffers.get(id);
  if (!buf) return false;

  const { gain: g0, pan, skip } = spatializedGainAndPan(gain, listenerPose, spatial);
  if (skip) return false;

  const src = c.createBufferSource();
  const g = c.createGain();
  const panner = c.createStereoPanner();
  panner.pan.value = pan;
  g.gain.value = applySfxMixToGain(g0);
  src.buffer = buf;
  src.connect(g);
  g.connect(panner);
  panner.connect(c.destination);
  src.start();
  return true;
}

function emitSoundId(id: SoundId, gain = 0.35, spatial?: SpatialSoundOpts): void {
  if (playBuffer(id, gain, spatial)) return;
  switch (id) {
    case "primaryFire":
      beep(440, 70, 0.055, "triangle", spatial);
      break;
    case "missileFire":
      beep(660, 90, 0.05, "square", spatial);
      break;
    case "torpedoFire":
      beep(220, 120, 0.07, "sine", spatial);
      break;
    case "hitNear":
      beep(180, 160, 0.07, "sawtooth", spatial);
      break;
    case "levelUp":
      beep(523, 55, 0.065, "sine", spatial);
      window.setTimeout(() => beep(784, 80, 0.06, "sine", spatial), 70);
      break;
    case "warning":
      beep(310, 220, 0.08, "triangle", spatial);
      break;
    case "shipShipCollision":
      beep(195, 85, 0.07, "sawtooth", spatial);
      break;
    case "shipIslandCollision":
      beep(125, 95, 0.065, "triangle", spatial);
      break;
    case "missileLockOn":
      beep(1180, 42, 0.055, "square");
      window.setTimeout(() => beep(1520, 38, 0.052, "square"), 48);
      window.setTimeout(() => beep(1180, 32, 0.048, "square"), 100);
      break;
    case "airDefenseSamFire":
      beep(720, 55, 0.055, "square", spatial);
      break;
    case "airDefenseSamIntercept":
      beep(960, 75, 0.06, "sine", spatial);
      break;
    case "airDefenseCiwsFire":
      beep(1400, 28, 0.045, "square", spatial);
      window.setTimeout(() => beep(1650, 22, 0.038, "square", spatial), 34);
      break;
    case "airDefenseCiwsIntercept":
      beep(1850, 38, 0.05, "triangle", spatial);
      break;
    case "weaponHit":
      beep(320, 55, 0.065, "triangle", spatial);
      window.setTimeout(() => beep(180, 40, 0.05, "square", spatial), 38);
      break;
    case "explosion":
      beep(95, 140, 0.09, "sawtooth", spatial);
      window.setTimeout(() => beep(55, 180, 0.07, "sine", spatial), 45);
      break;
    case "softkillChaff":
      beep(420, 45, 0.042, "square", spatial);
      window.setTimeout(() => beep(280, 55, 0.038, "triangle", spatial), 38);
      window.setTimeout(() => beep(190, 70, 0.034, "sawtooth", spatial), 95);
      break;
    case "telegraphNotchClick":
      beep(1280, 12, 0.006, "triangle", spatial);
      break;
    default:
      break;
  }
}

export const gameAudio = {
  unlockFromUserGesture(): void {
    void ctx()?.resume();
  },

  /** Kurzzeitig andere SFX leiser (z. B. nach HUD-/Shake-Feedback von außen). */
  pokeSfxDuck,

  setListenerShipPose(p: ListenerShipPose | null): void {
    listenerPose = p;
  },

  async preloadSounds(): Promise<void> {
    const c = ctx();
    if (!c) return;
    for (const id of ALL_SOUND_IDS) {
      buffers.set(id, null);
    }
    await Promise.all(
      ALL_SOUND_IDS.map(async (id) => {
        const url = SoundUrls[id];
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const arr = await res.arrayBuffer();
          const copy = arr.slice(0);
          const decoded = await c.decodeAudioData(copy);
          buffers.set(id, decoded);
        } catch {
          buffers.set(id, null);
        }
      }),
    );
    setDynamicMusicBufferMap(buffers);
  },

  hasSoundFile(id: SoundId): boolean {
    return buffers.get(id) != null;
  },

  playSoundId: emitSoundId,

  primaryFire(): void {
    emitSoundId("primaryFire");
  },
  missileFire(): void {
    emitSoundId("missileFire");
  },
  torpedoFire(): void {
    emitSoundId("torpedoFire");
  },

  hitNearAt(worldX: number, worldZ: number): void {
    if (!listenerPose) return;
    emitSoundId("hitNear", 0.085, {
      worldX,
      worldZ,
      maxAudibleM: SPATIAL_HIT_NEAR_MAX_M,
      floorAtMax: 0.18,
    });
  },

  levelUp(): void {
    emitSoundId("levelUp", 0.4);
  },
  warning(): void {
    emitSoundId("warning");
  },

  shipShipCollision(): void {
    emitSoundId("shipShipCollision", 0.38);
  },
  shipIslandCollision(): void {
    emitSoundId("shipIslandCollision", 0.38);
  },
  missileLockOn(): void {
    emitSoundId("missileLockOn", 0.34);
  },

  airDefenseSamFire(spatial?: SpatialSoundOpts): void {
    if (spatial && Number.isFinite(spatial.worldX) && Number.isFinite(spatial.worldZ)) {
      emitSoundId("airDefenseSamFire", 0.32, {
        worldX: spatial.worldX,
        worldZ: spatial.worldZ,
        maxAudibleM: spatial.maxAudibleM ?? SPATIAL_AIR_DEFENSE_MAX_M,
        floorAtMax: spatial.floorAtMax ?? 0.08,
      });
    } else {
      emitSoundId("airDefenseSamFire", 0.32);
    }
  },
  airDefenseSamIntercept(spatial?: SpatialSoundOpts): void {
    if (spatial && Number.isFinite(spatial.worldX) && Number.isFinite(spatial.worldZ)) {
      emitSoundId("airDefenseSamIntercept", 0.34, {
        worldX: spatial.worldX,
        worldZ: spatial.worldZ,
        maxAudibleM: spatial.maxAudibleM ?? SPATIAL_AIR_DEFENSE_MAX_M,
        floorAtMax: spatial.floorAtMax ?? 0.08,
      });
    } else {
      emitSoundId("airDefenseSamIntercept", 0.34);
    }
  },
  airDefenseCiwsFire(spatial?: SpatialSoundOpts): void {
    if (spatial && Number.isFinite(spatial.worldX) && Number.isFinite(spatial.worldZ)) {
      emitSoundId("airDefenseCiwsFire", 0.28, {
        worldX: spatial.worldX,
        worldZ: spatial.worldZ,
        maxAudibleM: spatial.maxAudibleM ?? SPATIAL_AIR_DEFENSE_MAX_M,
        floorAtMax: spatial.floorAtMax ?? 0.08,
      });
    } else {
      emitSoundId("airDefenseCiwsFire", 0.28);
    }
  },
  airDefenseCiwsIntercept(spatial?: SpatialSoundOpts): void {
    if (spatial && Number.isFinite(spatial.worldX) && Number.isFinite(spatial.worldZ)) {
      emitSoundId("airDefenseCiwsIntercept", 0.3, {
        worldX: spatial.worldX,
        worldZ: spatial.worldZ,
        maxAudibleM: spatial.maxAudibleM ?? SPATIAL_AIR_DEFENSE_MAX_M,
        floorAtMax: spatial.floorAtMax ?? 0.08,
      });
    } else {
      emitSoundId("airDefenseCiwsIntercept", 0.3);
    }
  },

  weaponHitAt(worldX: number, worldZ: number): void {
    if (!listenerPose) return;
    emitSoundId("weaponHit", 0.42, {
      worldX,
      worldZ,
      maxAudibleM: SPATIAL_WEAPON_HIT_MAX_M,
      floorAtMax: 0.1,
    });
  },

  explosionSelf(): void {
    pokeSfxDuck(220);
    emitSoundId("explosion", 0.58);
  },

  explosionOtherAt(worldX: number, worldZ: number, peakGain: number): void {
    const g = Math.max(0.08, Math.min(0.65, peakGain));
    pokeSfxDuck(95 + Math.round(85 * (g / 0.65)));
    if (!listenerPose) {
      emitSoundId("explosion", g * 0.55);
      return;
    }
    emitSoundId("explosion", g, {
      worldX,
      worldZ,
      maxAudibleM: SPATIAL_EXPLOSION_OTHER_MAX_M,
      floorAtMax: 0.06,
    });
  },

  softkillChaff(gain = 0.34, spatial?: SpatialSoundOpts): void {
    const g = Math.max(0.08, Math.min(0.55, gain));
    emitSoundId("softkillChaff", g, spatial);
  },

  /** Kurzer Rasterton Maschinentelegraf / Ruder. */
  telegraphNotchClick(): void {
    emitSoundId("telegraphNotchClick", 0.034);
  },

  /**
   * Motorbrummen (Loop): aktiv nur bei lebendem, steuerbarem Match.
   * Dämpfung/Rate aus Throttle- und Geschwindigkeitsanteil.
   */
  updateEngineBed(opts: {
    dtMs: number;
    active: boolean;
    throttle?: number;
    speed?: number;
    maxSpeed?: number;
  }): void {
    const c = ctx();
    if (!c) return;
    if (c.state === "suspended") void c.resume();
    if (!opts.active) {
      if (engineBed || engineSynth) {
        setEngineRumbleFromIntensity(0, Math.max(8, opts.dtMs), true);
      }
      return;
    }
    const th = typeof opts.throttle === "number" && Number.isFinite(opts.throttle) ? opts.throttle : 0;
    const sp = typeof opts.speed === "number" && Number.isFinite(opts.speed) ? opts.speed : 0;
    const mx = typeof opts.maxSpeed === "number" && Number.isFinite(opts.maxSpeed) ? opts.maxSpeed : 1;
    const int = engineIntensityFromInputs(th, sp, mx);
    ensureEngineRumbleGraph(c);
    setEngineRumbleFromIntensity(int, Math.max(8, opts.dtMs), false);
  },

  updateEngineBedOff(): void {
    if (!engineBed && !engineSynth) return;
    if (!ctx()) return;
    setEngineRumbleFromIntensity(0, 32, true);
  },

  /**
   * 3 Ebenen dynamische Hintergrundmusik (0–2) mit geglättetem Tiefwert; nutzt
   * dieselben WAV-Puffer und einen gemeinsamen `AudioContext`.
   */
  updateDynamicMusic(o: { dtMs: number; active: boolean; smoothedTier0to2: number }): void {
    const c = ctx();
    if (!c) return;
    runDynamicMusicUpdate(c, o);
  },
};
