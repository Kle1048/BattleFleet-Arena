import assert from "node:assert/strict";
import * as THREE from "three";
import { PlayerLifeState } from "@battlefleet/shared";
import { createFireControlChannel } from "./fireControlChannel";
import type { InputSample } from "./keyboardMouse";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const events = new EventTarget();
Object.defineProperty(globalThis, "window", { configurable: true, value: events });
const canvas = new EventTarget() as unknown as HTMLElement;
const scene = new THREE.Scene();
const channel = createFireControlChannel({ scene, camera: new THREE.PerspectiveCamera(), canvas,
  mySessionId: "me", playerLabel: p => p.id, onToast() {} });
const row = (id: string, x: number) => ({ id, x, z: 0, headingRad: 0, shipClass: "fac", lifeState: PlayerLifeState.Alive as string });
const players = [row("me", 0), row("edge", 800), row("near", 100), row("middle", 700), row("outside", 801)];
const sample: InputSample = { throttle: 0, rudderInput: 0, aimWorldX: -10, aimWorldZ: -20,
  primaryFire: false, secondaryFire: false, torpedoFire: false, radarActive: true };
const key = (code: string, repeat = false) => {
  const event = new Event("keydown", { cancelable: true });
  Object.defineProperties(event, { code: { value: code }, repeat: { value: repeat } });
  events.dispatchEvent(event);
};
try {
  channel.applyToInput(sample, players, false);
  channel.selectNearestTarget(); assert.equal(channel.getTargetId(), "near");
  channel.cycleNextTarget(); assert.equal(channel.getTargetId(), "middle");
  channel.selectNearestTarget(); assert.equal(channel.getTargetId(), "near");
  channel.clearTarget(); assert.equal(channel.getTargetId(), null);
  assert.equal(channel.applyToInput(sample, players, false), sample, "mobile clear restores manual aim");
  key("KeyF"); assert.equal(channel.getTargetId(), "near");
  key("KeyR"); assert.equal(channel.getTargetId(), "middle");
  key("KeyR", true); assert.equal(channel.getTargetId(), "middle", "held key must not skip contacts");
  key("KeyR"); assert.equal(channel.getTargetId(), "edge", "800 m is included");
  assert.equal(channel.applyToInput(sample, players, false).aimWorldX, 800);
  key("KeyR"); assert.equal(channel.getTargetId(), "near", "cycle wraps and excludes 801 m");
  key("KeyR"); key("KeyF"); assert.equal(channel.getTargetId(), "near", "F always selects nearest");
  key("KeyC"); assert.equal(channel.getTargetId(), null);
  assert.equal(channel.applyToInput(sample, players, false), sample, "clearing restores manual aim");
  key("KeyR"); players[2]!.x = 801;
  channel.applyToInput(sample, players, false); assert.equal(channel.getTargetId(), null, "leaving range releases channel");
  key("KeyF"); players[3]!.lifeState = PlayerLifeState.AwaitingRespawn;
  channel.applyToInput(sample, players, false); assert.equal(channel.getTargetId(), null, "destroyed contact releases channel");
  channel.applyToInput(sample, players, true); key("KeyF"); assert.equal(channel.getTargetId(), null);
  channel.dispose(); key("KeyR"); assert.equal(channel.getTargetId(), null);
  assert.equal(scene.children.length, 0);
} finally {
  channel.dispose();
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
}
console.log("Fire control: nearest/cycle/clear, 800 m boundary, loss and disposal passed");
