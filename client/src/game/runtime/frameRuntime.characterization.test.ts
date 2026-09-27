import assert from "node:assert/strict";
import * as THREE from "three";
import { PlayerLifeState, PlayerState, getAuthoritativeShipHullProfile } from "@battlefleet/shared";
import { createShipVisual, disposeShipVisual } from "../scene/shipVisual";
import { createCameraCullRuntimeState } from "./cameraCullRuntime";
import { createFrameRuntimeState, runFrameRuntimeStep } from "./frameRuntime";
import type { InputSample } from "../input/keyboardMouse";
import { pruneVisualRollSmoothed } from "../scene/shipVisualRoll";

// Characterize the existing interleaving before splitting the frame. In particular,
// input/HUD run inside the local visual update, not ahead of all world updates.
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", { configurable: true, value: { innerWidth: 1280, innerHeight: 720 } });
const me = new PlayerState();
Object.assign(me, { id: "me", x: 5000, z: 5000, hp: 100, maxHp: 100, shipClass: "fac",
  level: 2, lifeState: PlayerLifeState.Alive, oobCountdownSec: 5, adHudIncomingAswm: 1 });
const other = new PlayerState();
Object.assign(other, { id: "other", x: 5200, z: 5000, lifeState: PlayerLifeState.Alive });
const visual = createShipVisual({ isLocal: true, shipClassId: "fac", profile: getAuthoritativeShipHullProfile("fac") });
const remoteVisual = createShipVisual({ isLocal: false, shipClassId: "fac", profile: getAuthoritativeShipHullProfile("fac") });
const trace: string[] = [];
const payloads: unknown[] = [];
const state = createFrameRuntimeState();
const inputSample: InputSample = { throttle: 0, rudderInput: 0, aimWorldX: 5100, aimWorldZ: 5000,
  primaryFire: false, secondaryFire: false, torpedoFire: false, radarActive: true };
const options = {
  now: 0, dtMs: 16, camera: new THREE.PerspectiveCamera(), mySessionId: "me", cfgMaxSpeed: 100,
  playerList: [me, other], visuals: new Map([["me", visual]]), remoteInterp: new Map(), inputSample,
  matchEnded: false, matchRemainingSecRaw: 60, state, cameraCullState: createCameraCullRuntimeState(),
  roomSendInput(payload: unknown) {
    assert.notEqual(visual.group.position.x, 0, "pose precedes input");
    trace.push("input"); payloads.push(payload);
  },
  cockpit: { update() { trace.push("cockpit"); } },
  gameMessageHud: { showToast() { trace.push("toast"); }, updateFrame() { trace.push("messages"); } },
  gameAudio: {
    warning() { trace.push("warning"); }, levelUp() { trace.push("level"); },
    telegraphNotchClick() { trace.push("notch"); }, updateEngineBed() { trace.push("engine"); },
    updateEngineBedOff() { trace.push("engineOff"); }, updateDynamicMusic() { trace.push("music"); },
  },
  shortSessionIdForMessage: (id: string) => id, playerDisplayLabel: (p: { id: string }) => p.id,
  fx: {
    artilleryFx: { update() { trace.push("artillery"); } },
    missileFx: { sync() { trace.push("missileSync"); }, update() { trace.push("missile"); } },
    torpedoFx: { sync() { trace.push("torpedoSync"); }, update() { trace.push("torpedo"); } },
    shipDamageSmokeTick() { trace.push("smoke"); },
  },
  missileList: null, torpedoList: null,
  onShipDestroyed(p: PlayerState) { trace.push(`death:${p.id}`); },
};
const tail = ["missileSync", "torpedoSync", "missile", "torpedo", "artillery", "messages"];
function step(now: number) { trace.length = 0; options.now = now; return runFrameRuntimeStep(options); }
try {
  assert.equal(step(0).me, me);
  assert.deepEqual(trace, ["warning", "toast", "engine", "music", "input", "toast", "level", "cockpit", ...tail]);
  assert.deepEqual(payloads[0], { aimX: 5100, aimZ: 5000, primaryFire: false, secondaryFire: false,
    torpedoFire: false, mineSpawnLocalZ: -22,
    radarActive: true, throttle: 0, rudderInput: 0 });
  step(16);
  assert.deepEqual(trace, ["engine", "music", ...tail]);
  step(1199); assert(!trace.includes("input"));
  step(1200); assert(trace.includes("input"), "heartbeat at exactly 1200 ms");
  inputSample.aimWorldX += 0.1; step(1216); assert(!trace.includes("input"), "quantized aim dedup");
  inputSample.aimWorldX += 0.1; step(1232); assert(!trace.includes("input"), "aim changes coalesce until send slot");
  inputSample.primaryFire = true;
  step(1248); assert(!trace.includes("input"));
  step(1264); assert(trace.includes("input"), "held fire sends at the next 50ms slot");
  inputSample.primaryFire = false;
  inputSample.useTelegraphWire = true; inputSample.engineOrder = "ahead_full"; inputSample.rudderOrder = "midships";
  step(1314);
  const telegraph = payloads.at(-1) as Record<string, unknown>;
  assert.equal(telegraph.engineOrder, "ahead_full"); assert.equal(telegraph.rudderOrder, "midships");
  assert(!("throttle" in telegraph)); assert(!("rudderInput" in telegraph));

  other.lifeState = PlayerLifeState.AwaitingRespawn;
  me.lifeState = PlayerLifeState.AwaitingRespawn;
  step(1330);
  assert.deepEqual(trace, ["toast", "death:me", "toast", "death:other", "engineOff", "music", "cockpit", ...tail]);
  step(1346); assert.deepEqual(trace, ["engineOff", "music", ...tail]);
  me.lifeState = PlayerLifeState.SpawnProtected;
  step(1362); assert(trace.includes("cockpit"), "respawn bypasses HUD cadence");
  options.matchEnded = true;
  step(1378); assert.deepEqual(trace, ["engineOff", "music", "cockpit", ...tail]);
  options.matchEnded = false;
  options.visuals.clear();
  step(1400); assert(!trace.includes("input")); assert(!trace.includes("cockpit"));
  assert(trace.includes("engine"), "audio is not coupled to visual availability");
  options.playerList.length = 0;
  assert.equal(step(1416).me, undefined);
  assert.deepEqual(trace, ["engineOff", "music", ...tail]);
  assert.equal(state.lastLifeStateBySessionId.size, 0);

  // The visual Map's order is observable: remote smoke can precede or follow the
  // local input/cockpit hook. Extracting phases must not turn this into two passes.
  me.lifeState = other.lifeState = PlayerLifeState.Alive;
  me.oobCountdownSec = 0; me.adHudIncomingAswm = 0;
  other.hp = 20; other.maxHp = 100;
  inputSample.primaryFire = true;
  options.playerList.push(me, other);
  options.visuals.set("other", remoteVisual); options.visuals.set("me", visual);
  step(2000);
  assert.deepEqual(trace, ["engine", "music", "smoke", "input", "cockpit", ...tail]);
  options.visuals.clear();
  options.visuals.set("me", visual); options.visuals.set("other", remoteVisual);
  step(2100);
  assert.deepEqual(trace, ["engine", "music", "input", "cockpit", "smoke", ...tail]);
} finally {
  disposeShipVisual(visual);
  disposeShipVisual(remoteVisual);
  pruneVisualRollSmoothed(new Set());
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else Reflect.deleteProperty(globalThis, "window");
}
console.log("frame ordering, heartbeat, wire shape, death and missing-visual characterization ok");
