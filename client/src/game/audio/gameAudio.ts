/**
 * Spiel-SFX: optional WAV unter `public/assets/sounds/` (siehe `soundCatalog.ts`),
 * sonst Web-Audio-Synth-Beeps. Erste Nutzeraktion nötig (Autoplay-Policy).
 */

import { ALL_SOUND_IDS, type SoundId, SoundUrls } from "./soundCatalog";

let audioCtx: AudioContext | null = null;

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

function beep(freq: number, durMs: number, gain = 0.06, type: OscillatorType = "sine"): void {
  const c = ctx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();

  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.05);
}

function playBuffer(id: SoundId, gain = 0.35): boolean {
  const c = ctx();
  if (!c) return false;
  if (c.state === "suspended") void c.resume();
  const buf = buffers.get(id);
  if (!buf) return false;
  const src = c.createBufferSource();
  const g = c.createGain();
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(g);
  g.connect(c.destination);
  src.start();
  return true;
}

export const gameAudio = {
  unlockFromUserGesture(): void {
    void ctx()?.resume();
  },

  /**
   * Lädt alle konfigurierten WAVs (fehlende Dateien → weiterhin Synth).
   * Nach erstem Nutzer-Gesture aufrufen, damit `AudioContext` existiert.
   */
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

  /** Ob für diese Id eine WAV geladen wurde (Synth sonst). */
  hasSoundFile(id: SoundId): boolean {
    return buffers.get(id) != null;
  },

  playSoundId(id: SoundId, gain = 0.35): void {
    if (playBuffer(id, gain)) return;
    switch (id) {
      case "primaryFire":
        beep(440, 70, 0.055, "triangle");
        break;
      case "missileFire":
        beep(660, 90, 0.05, "square");
        break;
      case "torpedoFire":
        beep(220, 120, 0.07, "sine");
        break;
      case "hitNear":
        beep(180, 160, 0.07, "sawtooth");
        break;
      case "levelUp":
        beep(523, 55, 0.065);
        window.setTimeout(() => beep(784, 80, 0.06), 70);
        break;
      case "warning":
        beep(310, 220, 0.08, "triangle");
        break;
      case "shipShipCollision":
        beep(195, 85, 0.07, "sawtooth");
        break;
      case "shipIslandCollision":
        beep(125, 95, 0.065, "triangle");
        break;
      case "missileLockOn":
        beep(1180, 42, 0.055, "square");
        window.setTimeout(() => beep(1520, 38, 0.052, "square"), 48);
        window.setTimeout(() => beep(1180, 32, 0.048, "square"), 100);
        break;
      case "airDefenseSamFire":
        beep(720, 55, 0.055, "square");
        break;
      case "airDefenseSamIntercept":
        beep(960, 75, 0.06, "sine");
        break;
      case "airDefenseCiwsFire":
        beep(1400, 28, 0.045, "square");
        window.setTimeout(() => beep(1650, 22, 0.038, "square"), 34);
        break;
      case "airDefenseCiwsIntercept":
        beep(1850, 38, 0.05, "triangle");
        break;
      case "weaponHit":
        beep(320, 55, 0.065, "triangle");
        window.setTimeout(() => beep(180, 40, 0.05, "square"), 38);
        break;
      case "explosion":
        beep(95, 140, 0.09, "sawtooth");
        window.setTimeout(() => beep(55, 180, 0.07, "sine"), 45);
        break;
      default:
        break;
    }
  },

  primaryFire(): void {
    this.playSoundId("primaryFire");
  },
  missileFire(): void {
    this.playSoundId("missileFire");
  },
  torpedoFire(): void {
    this.playSoundId("torpedoFire");
  },
  hitNear(): void {
    this.playSoundId("hitNear");
  },
  levelUp(): void {
    this.playSoundId("levelUp", 0.4);
  },
  warning(): void {
    this.playSoundId("warning");
  },

  shipShipCollision(): void {
    this.playSoundId("shipShipCollision", 0.38);
  },
  shipIslandCollision(): void {
    this.playSoundId("shipIslandCollision", 0.38);
  },
  /** ASuM: Sucher schwenkt auf Ziel (nur Abschuss-Client). */
  missileLockOn(): void {
    this.playSoundId("missileLockOn", 0.34);
  },
  airDefenseSamFire(): void {
    this.playSoundId("airDefenseSamFire", 0.32);
  },
  airDefenseSamIntercept(): void {
    this.playSoundId("airDefenseSamIntercept", 0.34);
  },
  airDefenseCiwsFire(): void {
    this.playSoundId("airDefenseCiwsFire", 0.28);
  },
  airDefenseCiwsIntercept(): void {
    this.playSoundId("airDefenseCiwsIntercept", 0.3);
  },

  /** Waffentreffer am Ziel (kleiner als `explosion`). */
  weaponHit(gain = 0.38): void {
    this.playSoundId("weaponHit", Math.max(0.08, Math.min(0.65, gain)));
  },

  /** Schiffszerstörung — große Detonation. */
  explosion(gain = 0.42): void {
    this.playSoundId("explosion", Math.max(0.08, Math.min(0.65, gain)));
  },
};
