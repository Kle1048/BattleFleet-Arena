import assert from "node:assert/strict";
import * as THREE from "three";
import { PlayerState, PlayerLifeState } from "@battlefleet/shared";
import { createFrameRuntimeState, runFrameRuntimeStep } from "./frameRuntime";
import { createShipVisual, disposeShipVisual } from "../scene/shipVisual";
import { createCameraCullRuntimeState } from "./cameraCullRuntime";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", { configurable: true, value: { innerWidth: 1280, innerHeight: 720 } });
const me = new PlayerState();
me.id = "me"; me.shipClass = "fac"; me.hp = me.maxHp = 100; me.lifeState = PlayerLifeState.Alive;
const other = new PlayerState(); other.id = "other";
const list = [me, other];
const visual = createShipVisual({ isLocal: true, shipClassId: "fac" });
let hud = 0;
let sent = 0;
let frames = 0;
let destroyed = 0;
const state = createFrameRuntimeState();
const options = {
  now: 0, dtMs: 1000 / 120, camera: new THREE.PerspectiveCamera(),
  roomSendInput: () => { sent++; }, mySessionId: "me", cfgMaxSpeed: 100,
  playerList: list, visuals: new Map([["me", visual]]), remoteInterp: new Map(),
  inputSample: { throttle: 1, rudderInput: 0, aimWorldX: 100, aimWorldZ: 100,
    primaryFire: true, secondaryFire: false, torpedoFire: false, radarActive: true },
  matchEnded: false, matchRemainingSecRaw: 60,
  cockpit: { update() { hud++; } },
  gameMessageHud: { showToast() {}, updateFrame() { frames++; } },
  gameAudio: { warning() {}, levelUp() {}, telegraphNotchClick() {}, updateEngineBed() {}, updateEngineBedOff() {}, updateDynamicMusic() {} },
  shortSessionIdForMessage: (id: string) => id, playerDisplayLabel: (p: { id: string }) => p.id,
  fx: { artilleryFx: { update() {} }, missileFx: { sync() {}, update() {} }, torpedoFx: { sync() {}, update() {} }, shipDamageSmokeTick() {} },
  missileList: null, torpedoList: null, state, cameraCullState: createCameraCullRuntimeState(),
  onShipDestroyed() { destroyed++; },
};
try {
  for (let i = 0; i < 120; i++) { options.now = i * 1000 / 120; runFrameRuntimeStep(options); }
  assert.equal(hud, 20); assert.equal(sent, 120); assert.equal(frames, 120);
  assert.equal(state.adPlayers[0], me); // no per-player snapshot copies
  assert.equal(state.playersById.get("me"), me);
  me.lifeState = PlayerLifeState.AwaitingRespawn;
  options.now += 1; runFrameRuntimeStep(options);
  assert.equal(hud, 21); assert.equal(destroyed, 1); assert.equal(sent, 120);
  me.lifeState = PlayerLifeState.SpawnProtected;
  options.now += 1; runFrameRuntimeStep(options);
  assert.equal(hud, 22);
  options.matchEnded = true; options.now += 1; runFrameRuntimeStep(options);
  assert.equal(hud, 23);
  me.radarActive = false; options.now += 1; runFrameRuntimeStep(options);
  assert.equal(hud, 24);
  list.splice(1, 1); options.now += 1; runFrameRuntimeStep(options);
  assert(!state.playersById.has("other")); assert(!state.lastLifeStateBySessionId.has("other"));
  assert.notEqual(createFrameRuntimeState().adPlayers, state.adPlayers);
} finally {
  disposeShipVisual(visual);
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
}
console.log("frame HUD cadence, urgent state and per-frame input regressions ok");
