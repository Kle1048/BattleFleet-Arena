import assert from "node:assert/strict";
import { Room } from "colyseus.js";
import { PlayerLifeState } from "@battlefleet/shared/rules";
import { createRoomEventAdapter } from "./roomEventAdapter";
import { createMatchEventPresenter } from "../presentation/matchEventPresenter";
import { connectionClosedMessage } from "../presentation/connectionStatus";

// The pre-extraction expectations run through actual Colyseus dispatch and the new boundary.
const room = new Room("event-characterization");
let heartbeat: (() => void) | undefined;
let cleared = 0;
const sent: Array<string | number> = [];
room.send = type => { sent.push(type); };
const effects: string[] = [];
const me = { id: "me", x: 0, z: 0, lifeState: PlayerLifeState.Alive as string };
let visible = true;
let ping: number | null = null;
let warning = "";
const presenter = createMatchEventPresenter({
    mySessionId: "me",
    airDefense: { fire() {}, intercept() {} },
    artilleryFx: {
      onFired: m => effects.push(`shell:${m.shellId}`),
      onImpact: (m, options) => effects.push(`splash:${m.shellId}:${options?.skipSplash}`),
    },
    missileFx: { flashImpact: () => effects.push("missile-impact") },
    torpedoFx: { flashImpact: () => effects.push("mine-impact") },
    shouldRenderArtyFiredClientVfx: () => visible,
    isArtyWorldPointInCullRange: () => visible,
    findPlayerBySessionId: id => id === "me" ? me : undefined,
    onPrimaryFireByLocalPlayer: () => effects.push("gun-audio"),
    onMissileFireByLocalPlayer: () => effects.push("missile-audio"),
    onTorpedoFireByLocalPlayer: () => effects.push("mine-audio"),
    onMineImpactNearLocalPlayer: d => effects.push(`mine-near:${d}`),
    onCollisionContact: kind => effects.push(`contact:${kind}`),
    onMissileLockOn: () => effects.push("lock"),
    onAswmMagazineReloaded: () => effects.push("reload"),
    onSoftkillResult: success => effects.push(`softkill:${success}`),
    onWeaponHitAt: () => effects.push("hit"),
    onFeelLocalWeaponThreat: e => effects.push(e.tag),
    onHitNearAt: () => effects.push("near-audio"),
  });
const adapter = createRoomEventAdapter({
  room, now: () => performance.now(),
  every(callback, ms) {
    assert.equal(ms, 2000);
    heartbeat = callback;
    return () => { cleared++; };
  },
  onEvent: presenter.present,
  onPing: value => { ping = value; },
  onError() {},
  onLeave(code, reason) { warning = connectionClosedMessage(code, reason); effects.push("closed"); },
});
const emit = (type: string, payload: unknown = {}) => room["dispatchMessage"](type, payload);
try {
  assert.deepEqual(sent, ["ping"]); heartbeat!(); assert.deepEqual(sent, ["ping", "ping"]);
  emit("pong", { clientTime: performance.now() - 20 }); assert(ping !== null && ping >= 20);
  const shot = { shellId: 1, ownerId: "me", fromX: 0, fromZ: 0, toX: 10, toZ: 10, flightMs: 800 };
  emit("artyFired", shot); assert.deepEqual(effects.splice(0), ["shell:1", "gun-audio"]);
  emit("artyFired", { ...shot, ownerId: "remote" }); assert.deepEqual(effects.splice(0), ["shell:1"]);
  visible = false; emit("artyFired", shot); assert.deepEqual(effects, []);
  emit("artyImpact", { shellId: 1, x: 0, z: 0, kind: "hit" });
  assert.deepEqual(effects.splice(0), ["splash:1:true", "artillery_hull", "near-audio"], "culling suppresses splash/hit FX, not local artillery threat audio");
  visible = true;
  emit("artyImpact", { shellId: 2, x: 0, z: 0, kind: "hit" });
  assert.deepEqual(effects.splice(0), ["splash:2:false", "hit", "artillery_hull", "near-audio"]);
  me.lifeState = PlayerLifeState.AwaitingRespawn;
  emit("artyImpact", { shellId: 3, x: 0, z: 0, kind: "hit" });
  assert.deepEqual(effects.splice(0), ["splash:3:false", "hit"], "death presentation belongs to state transition, not hit event");
  me.lifeState = PlayerLifeState.Alive;
  emit("aswmFired", { ownerId: "remote" }); emit("aswmFired", { ownerId: "me" });
  emit("torpedoFired", { ownerId: "me" });
  assert.deepEqual(effects.splice(0), ["missile-audio", "mine-audio"]);
  emit("aswmImpact", { x: 0, z: 0, kind: "hit" });
  assert.deepEqual(effects.splice(0), ["missile-impact", "hit", "aswm_impact"]);
  visible = false; emit("aswmImpact", { x: 0, z: 0, kind: "hit" });
  assert.deepEqual(effects, [], "ASuM culling also suppresses threat feedback, unlike artillery");
  visible = true; emit("torpedoImpact", { x: 3, z: 4, kind: "hit" });
  assert.deepEqual(effects.splice(0), ["mine-impact", "hit", "mine-near:5"]);
  emit("collisionContact", { kind: "ship" }); emit("collisionContact", { kind: "island" });
  emit("collisionContact", { kind: "other" }); emit("missileLockOn"); emit("aswmMagazineReloaded");
  emit("softkillResult", { success: true }); emit("softkillResult", { success: false });
  emit("matchEnded"); emit("matchRestarted");
  assert.deepEqual(effects.splice(0), ["contact:ship", "contact:island", "lock", "reload", "softkill:true", "softkill:false"]);
  for (const name of ["artyFired", "artyImpact", "aswmImpact", "torpedoImpact", "aswmFired", "torpedoFired"]) emit(name, null);
  assert.deepEqual(effects, []);
  room.onLeave.invoke(4002, "destroyed_in_combat");
  assert.equal(cleared, 1); assert.equal(ping, null); assert(warning.includes("Destroyed in combat"));
  assert.deepEqual(effects, ["closed"]);
} finally {
  adapter.dispose();
  presenter.dispose();
}
assert.equal(cleared, 1, "leave and explicit cleanup must not cancel the heartbeat twice");
console.log("unchanged event characterization through Colyseus, decoder and transport-free presenter ok");
