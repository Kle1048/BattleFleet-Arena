/**
 * Spiel-SFX: optional WAV unter `public/assets/sounds/` (siehe `soundCatalog.ts`),
 * sonst Web-Audio-Synth-Beeps. Erste Nutzeraktion nötig (Autoplay-Policy).
 *
 * **Stereo:** relativ zur Bug-Richtung des zuletzt gesetzten Hörers (`setListenerShipPose`);
 * Quellen mit Welt-XZ nutzen `StereoPannerNode.pan` + optionale Distanz-Dämpfung.
 */

import { ALL_SOUND_IDS, type SoundId, SoundUrls } from "./soundCatalog";
import {
  type ListenerShipPose,
  type SpatialSoundOpts,
  SPATIAL_AIR_DEFENSE_MAX_M,
  SPATIAL_EXPLOSION_OTHER_MAX_M,
  SPATIAL_HIT_NEAR_MAX_M,
  SPATIAL_WEAPON_HIT_MAX_M,
  spatializedGainAndPan,
} from "./shipSpatialAudio";

let audioCtx: AudioContext | null = null;

let listenerPose: ListenerShipPose | null = null;

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

  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  const panner = c.createStereoPanner();
  panner.pan.value = pan;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(g0, t0 + 0.02);
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
  g.gain.value = g0;
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
    default:
      break;
  }
}

export const gameAudio = {
  unlockFromUserGesture(): void {
    void ctx()?.resume();
  },

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
    emitSoundId("explosion", 0.58);
  },

  explosionOtherAt(worldX: number, worldZ: number, peakGain: number): void {
    const g = Math.max(0.08, Math.min(0.65, peakGain));
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
};
