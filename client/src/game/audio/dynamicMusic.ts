/**
 * Drei dynamische Musikstufen (0=ruhig, 1=Kontakt, 2=Gefecht), je mit zwei WAV-Loops
 * (A/B). Pro sichtbarer Stufe wird zufällig A oder B gewählt, wenn der Loop anläuft.
 * Crossfade zwischen benachbarten Stufen per Gewichtsvektor.
 */

import { SoundFiles, type SoundId } from "./soundCatalog";
import { getMusicUserMult } from "./soundMixState";

export const TIER_PAIRS: [SoundId, SoundId][] = [
  ["musicAmbientA", "musicAmbientB"],
  ["musicTensionA", "musicTensionB"],
  ["musicCombatA", "musicCombatB"],
];

const MUSIC_OUT_MULT = 0.28;

let bufferMap: Map<SoundId, AudioBuffer | null> | null = null;

export function setDynamicMusicBufferMap(m: Map<SoundId, AudioBuffer | null>): void {
  bufferMap = m;
}

function getBuf(id: SoundId): AudioBuffer | null {
  if (!bufferMap) return null;
  return bufferMap.get(id) ?? null;
}

/** Benachbarte Lautstärke-Curves, Summe 1, bei halbzahligen t zwei Stufen aktiv. */
export function musicBlendWeights(smoothedTier0to2: number): [number, number, number] {
  const t = Math.max(0, Math.min(2, smoothedTier0to2));
  if (t <= 1) return [1 - t, t, 0];
  return [0, 2 - t, t - 1];
}

type Voice = {
  source: AudioBufferSourceNode | null;
  gain: GainNode | null;
  useA: boolean;
};

const voices: Voice[] = [
  { source: null, gain: null, useA: true },
  { source: null, gain: null, useA: true },
  { source: null, gain: null, useA: true },
];
let musicMaster: { ctx: AudioContext; node: GainNode } | null = null;

function getOrCreateMaster(c: AudioContext): GainNode {
  if (!musicMaster || musicMaster.ctx !== c) {
    if (musicMaster) {
      try {
        musicMaster.node.disconnect();
      } catch {
        /* */
      }
    }
    const g = c.createGain();
    g.gain.value = MUSIC_OUT_MULT * getMusicUserMult();
    g.connect(c.destination);
    musicMaster = { ctx: c, node: g };
  } else {
    const t = c.currentTime;
    musicMaster.node.gain.setValueAtTime(MUSIC_OUT_MULT * getMusicUserMult(), t);
  }
  return musicMaster.node;
}

function stopVoice(v: Voice): void {
  if (v.source) {
    try {
      v.source.stop(0.001);
    } catch {
      /* */
    }
    v.source.disconnect();
  }
  v.source = null;
  if (v.gain) v.gain.disconnect();
  v.gain = null;
}

function pickBufferId(t: 0 | 1 | 2, useA: boolean): SoundId {
  return (useA ? TIER_PAIRS[t]![0]! : TIER_PAIRS[t]![1]!) as SoundId;
}

function startVoice(c: AudioContext, out: AudioNode, t: 0 | 1 | 2, v: Voice): void {
  v.useA = Math.random() < 0.5;
  const idA = pickBufferId(t, true);
  const idB = pickBufferId(t, false);
  const aBuf = getBuf(idA);
  const bBuf = getBuf(idB);
  const buf = v.useA
    ? aBuf && aBuf.length > 0
      ? aBuf
      : bBuf
    : bBuf && bBuf.length > 0
      ? bBuf
      : aBuf;
  if (!buf) return;
  const g = c.createGain();
  g.gain.value = 0.0001;
  const s = c.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.connect(g);
  g.connect(out);
  s.start(0);
  v.source = s;
  v.gain = g;
}

/**
 * Eine geglättete Ziel-Stufe 0…2 (darf auch Zwischenwerte annehmen).
 * Kein weitere Glättung in diesem Modul — stammt aus `frameRuntime`.
 */
export function updateDynamicMusic(
  c: AudioContext,
  opts: { smoothedTier0to2: number; active: boolean; dtMs: number },
): void {
  if (c.state === "suspended") void c.resume();
  if (!bufferMap) return;
  if (!opts.active) {
    for (let k = 0; k < 3; k++) {
      stopVoice(voices[k]!);
    }
    return;
  }

  const t01 = Math.max(0, Math.min(2, opts.smoothedTier0to2));
  const w = musicBlendWeights(t01);
  const bus = getOrCreateMaster(c);
  const tSec = c.currentTime;

  for (let k = 0; k < 3; k++) {
    const v = voices[k]!;
    const wk = w[k] ?? 0;
    if (wk < 0.02) {
      if (v.source) stopVoice(v);
      continue;
    }
    if (!v.source) {
      startVoice(c, bus, k as 0 | 1 | 2, v);
    }
    if (v.gain) v.gain.gain.setValueAtTime(Math.max(0, Math.min(1, wk)), tSec);
  }
}

export const dynamicMusicTuning = { MUSIC_OUT_MULT, TIER_PAIRS, SoundFiles };

export function getMusicFileNames(tier: 0 | 1 | 2): { a: string; b: string } {
  const [a, b] = TIER_PAIRS[tier] ?? TIER_PAIRS[0]!;
  return { a: SoundFiles[a]!, b: SoundFiles[b]! };
}
