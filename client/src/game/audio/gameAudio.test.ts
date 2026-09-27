import assert from "node:assert/strict";
import { gameAudio } from "./gameAudio";
import { SoundUrls } from "./soundCatalog";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalContext = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
const originalFetch = globalThis.fetch;
const fetches = new Map<string, (response: Response) => void>();
const signals: AbortSignal[] = [];
let oscillators = 0;
let stoppedOscillators = 0;
let sources = 0;
let closed = false;
let decodes = 0;
const delayed = new Map<number, () => void>();
let nextTimer = 0;
let disconnected = 0;
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
const node = () => ({ connect() {}, disconnect() { disconnected++; }, gain: param(), frequency: param(), pan: param(), playbackRate: param() });
class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  resume() { return Promise.resolve(); }
  close() { closed = true; return Promise.resolve(); }
  async decodeAudioData() { decodes++; return { length: 100 }; }
  createGain = node;
  createBiquadFilter = node;
  createStereoPanner = node;
  createBufferSource() { sources++; return { ...node(), start() {}, stop() {} }; }
  createOscillator() { oscillators++; return { ...node(), start() {}, stop() { stoppedOscillators++; } }; }
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
try {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    setTimeout(run: () => void) { const id = ++nextTimer; delayed.set(id, run); return id; },
    clearTimeout(id: number) { delayed.delete(id); },
  } });
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: FakeAudioContext });
  globalThis.fetch = (input, init) => new Promise<Response>((resolve) => {
    const url = String(input);
    assert.ok(!fetches.has(url), `duplicate request: ${url}`);
    fetches.set(url, resolve);
    signals.push(init!.signal as AbortSignal);
  });
  gameAudio.startBackgroundAudio();
  gameAudio.startBackgroundAudio();
  await flush();
  assert.deepEqual([...fetches.keys()], [SoundUrls.engineLoop, SoundUrls.musicAmbientA]);
  gameAudio.updateEngineBed({ active: true, dtMs: 16, throttle: 1 });
  assert.equal(oscillators, 1, "engine synth plays before download");
  for (const resolve of fetches.values()) resolve(new Response(new Uint8Array([1])));
  await flush();
  await flush();
  assert.equal(decodes, 2);
  gameAudio.updateEngineBed({ active: true, dtMs: 16, throttle: 1 });
  assert.equal(stoppedOscillators, 1, "loaded engine replaces synth");
  assert.equal(sources, 1);
  gameAudio.primaryFire();
  assert.equal(oscillators, 2, "first SFX uses immediate fallback, no delayed replay");
  await flush();
  fetches.get(SoundUrls.primaryFire)!(new Response(new Uint8Array([2])));
  await flush();
  await flush();
  assert.equal(sources, 1, "loading must not replay an old event");
  gameAudio.primaryFire();
  assert.equal(sources, 2);
  assert.ok(!fetches.has(SoundUrls.musicCombatA));
  assert.ok(!fetches.has(SoundUrls.musicTensionA));
  gameAudio.updateDynamicMusic({ active: true, smoothedTier0to2: 2, dtMs: 16 });
  await flush();
  assert.ok(fetches.has(SoundUrls.musicCombatA) || fetches.has(SoundUrls.musicCombatB));
  gameAudio.missileLockOn();
  assert.equal(delayed.size, 2);
  const lateBeeps = [...delayed.values()];
  const beforeStop = oscillators;
  const beforeDisconnect = disconnected;
  gameAudio.stopSession();
  assert.equal(closed, false, "session stop retains the app audio context");
  assert.equal(delayed.size, 0);
  assert.ok(disconnected > beforeDisconnect, "session voices disconnect their audio graph");
  for (const run of lateBeeps) run();
  assert.equal(oscillators, beforeStop, "dequeued old beeps remain inert after session stop");
  gameAudio.primaryFire();
  assert.equal(sources, 3, "next session can reuse the already decoded sound");
  gameAudio.dispose();
  gameAudio.dispose();
  assert.ok(closed);
  assert.ok(signals.some((s) => s.aborted), "shutdown aborts pending downloads");
} finally {
  gameAudio.dispose();
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (originalContext) Object.defineProperty(globalThis, "AudioContext", originalContext);
  else Reflect.deleteProperty(globalThis, "AudioContext");
}
console.log("lazy game audio tests ok");
