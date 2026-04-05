/**
 * Task 12 — Minimales Feedback (Web Audio, kurze Töne). Erste Nutzeraktion muss erfolgen (Autoplay-Policy).
 */

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

export const gameAudio = {
  unlockFromUserGesture(): void {
    void ctx()?.resume();
  },
  primaryFire(): void {
    beep(440, 70, 0.055, "triangle");
  },
  missileFire(): void {
    beep(660, 90, 0.05, "square");
  },
  torpedoFire(): void {
    beep(220, 120, 0.07, "sine");
  },
  hitNear(): void {
    beep(180, 160, 0.07, "sawtooth");
  },
  levelUp(): void {
    beep(523, 55, 0.065);
    window.setTimeout(() => beep(784, 80, 0.06), 70);
  },
  warning(): void {
    beep(310, 220, 0.08, "triangle");
  },
};
