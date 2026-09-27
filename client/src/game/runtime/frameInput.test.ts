import assert from "node:assert/strict";
import { PlayerLifeState, PlayerState } from "@battlefleet/shared";
import { updateFrameInput, type FrameInputPayload } from "./frameInput";
import { createFrameRuntimeState } from "./frameRuntime";
import type { InputSample } from "../input/keyboardMouse";

const me = new PlayerState(); me.shipClass = "fac"; me.lifeState = PlayerLifeState.Alive;
const neutral: InputSample = { throttle: 0, rudderInput: 0, aimWorldX: 100, aimWorldZ: 100,
  primaryFire: false, secondaryFire: false, torpedoFire: false, radarActive: true };
for (const fps of [30, 60, 120, 144, 240]) {
  const state = createFrameRuntimeState();
  const sent: number[] = [];
  for (let frame = 0; frame < fps * 10; frame++) {
    const now = frame * 1000 / fps;
    updateFrameInput({ me, now, matchEnded: false, state, inputSample: { ...neutral, primaryFire: true, aimWorldX: frame },
      roomSendInput: () => sent.push(now) });
  }
  assert(sent.length <= 200, `bounded at ${fps} FPS`);
  assert(sent.length >= 150, `held fire still sends at ${fps} FPS`);
  for (let i = 1; i < sent.length; i++) assert(sent[i]! - sent[i - 1]! >= 49.999);
}
const state = createFrameRuntimeState();
const sent: FrameInputPayload[] = [];
const step = (now: number, patch: Partial<InputSample> = {}, matchEnded = false) =>
  updateFrameInput({ me, now, state, matchEnded, inputSample: { ...neutral, ...patch }, roomSendInput: p => sent.push(p) });
step(0); step(10, { primaryFire: true, secondaryFire: true, aswmFireSide: "port" });
step(20); assert.equal(sent.length, 1);
step(50, { throttle: 1, aimWorldX: 200 });
assert.equal(sent.length, 2);
assert.equal(sent[1]!.primaryFire, true); assert.equal(sent[1]!.secondaryFire, true);
assert.equal(sent[1]!.aswmFireSide, "port");
assert.equal(sent[1]!.throttle, 1); assert.equal(sent[1]!.aimX, 200);
step(100); assert.equal(sent.at(-1)!.primaryFire, false, "release follows a latched tap");
step(200); assert.equal(sent.length, 3, "unchanged input is deduplicated");
step(1299); assert.equal(sent.length, 3);
step(1300); assert.equal(sent.length, 4, "heartbeat retained");
step(1310, { secondaryFire: true, aswmFireSide: "starboard" });
step(1311, {}, true); step(1350);
assert.equal(sent.length, 4, "match end drops pending fire");
step(1360, { secondaryFire: true, aswmFireSide: "starboard" });
assert.equal(sent.at(-1)!.aswmFireSide, "starboard");
step(1370, { primaryFire: true });
me.lifeState = PlayerLifeState.AwaitingRespawn; step(1380);
me.lifeState = PlayerLifeState.Alive; step(1410);
assert.equal(sent.at(-1)!.primaryFire, false, "death drops pending fire");
step(1420, { primaryFire: true });
const beforePause = sent.length;
step(10_000); step(10_001);
assert.equal(sent.length, beforePause + 1, "no catch-up after tab suspension");
assert.equal(sent.at(-1)!.primaryFire, false, "no stale buffered tap after a long pause");
console.log("input <=20 Hz at 30–240 FPS, tap latch, release, latest controls, heartbeat, death/end and pause ok");
