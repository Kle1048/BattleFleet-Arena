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
  key("KeyF"); assert.equal(channel.getTargetId(), "middle");
  key("KeyF", true); assert.equal(channel.getTargetId(), "middle", "held key must not skip contacts");
  key("KeyF"); assert.equal(channel.getTargetId(), "edge", "800 m is included");
  assert.equal(channel.applyToInput(sample, players, false).aimWorldX, 800);
  assert.equal(channel.applyToInput({ ...sample, secondaryFire: true, aswmFireSide: "port" }, players, false).aswmFireSide, "port", "starboard designation cannot override mouse/keyboard port rail");
  assert.equal(channel.applyToInput({ ...sample, secondaryFire: true, aswmFireSide: "starboard" }, players, false).aswmFireSide, "starboard");
  key("KeyF"); assert.equal(channel.getTargetId(), "near", "cycle wraps and excludes 801 m");
  key("KeyR"); assert.equal(channel.getTargetId(), "near", "R no longer changes target");
  players[0]!.headingRad = Math.PI / 2;
  key("CapsLock"); assert.equal(channel.isAutofireEnabled(), true);
  key("CapsLock", true); assert.equal(channel.isAutofireEnabled(), true, "repeat must not toggle");
  assert.equal(channel.applyToInput(sample, players, false).primaryFire, true, "assigned target in gun sector fires");
  players[0]!.headingRad = -Math.PI / 2;
  assert.equal(channel.applyToInput(sample, players, false).primaryFire, false, "target behind gun does not fire");
  players[0]!.headingRad = Math.PI / 2;
  key("KeyF");
  assert.equal(channel.applyToInput(sample, players, false).primaryFire, false, "700m FC target beyond gun range waits");
  channel.selectNearestTarget();
  key("CapsLock"); assert.equal(channel.applyToInput(sample, players, false).primaryFire, false, "toggle off stops automatic shots");
  assert.equal(channel.applyToInput({ ...sample, primaryFire: true }, players, false).primaryFire, true, "manual fire still works");
  key("CapsLock"); events.dispatchEvent(new Event("blur")); assert.equal(channel.isAutofireEnabled(), false);
  key("CapsLock");
  key("KeyC"); assert.equal(channel.getTargetId(), null);
  assert.equal(channel.applyToInput(sample, players, false).primaryFire, false, "no assigned target never autofires");
  assert.equal(channel.applyToInput(sample, players, false), sample, "clearing restores manual aim");
  key("KeyF"); players[2]!.x = 801;
  channel.applyToInput(sample, players, false); assert.equal(channel.getTargetId(), null, "leaving range releases channel");
  key("KeyF"); players[3]!.lifeState = PlayerLifeState.AwaitingRespawn;
  channel.applyToInput(sample, players, false); assert.equal(channel.getTargetId(), null, "destroyed contact releases channel");
  channel.applyToInput(sample, players, true); key("KeyF"); assert.equal(channel.getTargetId(), null);
  channel.dispose(); key("KeyF"); assert.equal(channel.getTargetId(), null);
  assert.equal(scene.children.length, 0);
} finally {
  channel.dispose();
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
}
console.log("Fire control: nearest/cycle/clear, 800 m boundary, loss and disposal passed");
