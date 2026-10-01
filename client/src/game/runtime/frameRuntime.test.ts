import assert from "node:assert/strict";
import * as THREE from "three";
import { PlayerState, PlayerLifeState, getAuthoritativeShipHullProfile } from "@battlefleet/shared";
import { createFrameRuntimeState, runFrameRuntimeStep } from "./frameRuntime";
import { createShipVisual, disposeShipVisual } from "../scene/shipVisual";
import { createCameraCullRuntimeState } from "./cameraCullRuntime";
import type { CockpitHudUpdate, RadarBlipNorm } from "../presentation/CockpitModel";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", { configurable: true, value: { innerWidth: 1280, innerHeight: 720 } });
const me = new PlayerState();
me.id = "me"; me.shipClass = "fac"; me.hp = me.maxHp = 100; me.lifeState = PlayerLifeState.Alive;
const other = new PlayerState(); other.id = "other";
const list = [me, other];
const visual = createShipVisual({ isLocal: true, shipClassId: "fac", profile: getAuthoritativeShipHullProfile("fac") });
let hud = 0;
let blips: RadarBlipNorm[] = [];
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
  cockpit: { update(model: CockpitHudUpdate) { hud++; blips = model.radarBlips; } },
  fireControlTargetId: null as string | null,
  gameMessageHud: { showToast() {}, updateFrame() { frames++; } },
  gameAudio: { warning() {}, levelUp() {}, telegraphNotchClick() {}, updateEngineBed() {}, updateEngineBedOff() {}, updateDynamicMusic() {} },
  shortSessionIdForMessage: (id: string) => id, playerDisplayLabel: (p: { id: string }) => p.id,
  fx: { artilleryFx: { update() {} }, missileFx: { sync() {}, update() {} }, torpedoFx: { sync() {}, update() {} }, shipDamageSmokeTick() {} },
  missileList: null, torpedoList: null, state, cameraCullState: createCameraCullRuntimeState(),
  onShipDestroyed() { destroyed++; },
};
try {
  for (let i = 0; i < 120; i++) { options.now = i * 1000 / 120; runFrameRuntimeStep(options); }
  assert.equal(hud, 20); assert.equal(sent, 20); assert.equal(frames, 120);
  assert.equal(state.adPlayers[0], me); // no per-player snapshot copies
  assert.equal(state.playersById.get("me"), me);
  me.lifeState = PlayerLifeState.AwaitingRespawn;
  options.now += 1; runFrameRuntimeStep(options);
  assert.equal(hud, 21); assert.equal(destroyed, 1); assert.equal(sent, 20);
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
  list.push(other); other.x = 800; other.z = 0; other.lifeState = PlayerLifeState.Alive;
  options.matchEnded = false; me.lifeState = PlayerLifeState.Alive;
  options.fireControlTargetId = other.id;
  options.now += 100; runFrameRuntimeStep(options);
  assert.deepEqual(blips, [{ nx: 800/2000, ny: -0, designated: true }], "fire-control contact at 800 m appears even with search radar off");
  options.fireControlTargetId = null;
  options.now += 100; runFrameRuntimeStep(options);
  assert.equal(blips.length, 0, "clearing the channel removes its radar marker");
  me.radarActive = true; other.x = 700;
  options.now += 100; runFrameRuntimeStep(options);
  assert.deepEqual(blips, [{ nx: 700/2000, ny: -0 }], "active radar detects FAC beyond visual range");
  other.x = 600; options.now += 100; runFrameRuntimeStep(options);
  assert.deepEqual(blips, [{ nx: .3, ny: -0 }], "search contacts use the same 2000 m contact display scale");
  me.radarActive = false; other.shipClass = "cruiser"; other.hp = 89; other.maxHp = 100;
  other.x = 800; options.now += 100; runFrameRuntimeStep(options);
  assert.deepEqual(blips, [{ nx: (800)/2000, ny: -0 }], "smoking cruiser is identified at its smoke boundary with own radar off");
  other.x = 800 + 0.01; options.now += 100; runFrameRuntimeStep(options);
  assert.equal(blips.length, 0);
  other.x = 1000; other.hp = 100; options.now += 100; runFrameRuntimeStep(options);
  assert.deepEqual(blips, [{ nx: .5, ny: -0 }], "healthy cruiser sight range is 1000m");
  me.radarActive=true; other.x=2000; options.now+=100; runFrameRuntimeStep(options);
  assert.deepEqual(blips,[{nx:1,ny:-0}],"active radar shows a cruiser at the 2000m display rim");
  other.x=2000.01; options.now+=100; runFrameRuntimeStep(options); assert.equal(blips.length,0);


} finally {
  disposeShipVisual(visual);
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
}
console.log("frame HUD/input cadence, urgent state and per-frame rendering regressions ok");
