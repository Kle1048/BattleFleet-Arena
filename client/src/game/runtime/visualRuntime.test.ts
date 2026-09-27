import assert from "node:assert/strict";
import * as THREE from "three";
import { BattleState, PlayerState } from "@battlefleet/shared/protocol/schema";
import { createBattleStateAdapter } from "../adapters/battleStateAdapter";
import { createVisualRuntime } from "./visualRuntime";
import { sampleInterpolatedPose } from "../network/remoteInterpolation";

const callbacks = new Set<() => void>();
const onStateChange = Object.assign((callback: () => void) => { callbacks.add(callback); }, {
  remove(callback: () => void) { callbacks.delete(callback); },
});
const state = new BattleState();
const me = new PlayerState(); me.id = "me";
const other = new PlayerState(); other.id = "other";
state.playerList.push(me, other);
let now = 100;
const source = createBattleStateAdapter({ state, onStateChange,
  onLeave: Object.assign((_callback: (code: number) => void) => {}, { remove(_callback: (code: number) => void) {} }),
}, () => now);
const scene = new THREE.Scene();
const joins: string[] = [];
const visual = createVisualRuntime({ stateSource: source, scene, mySessionId: "me",
  onRemotePlayerJoinedRoom: p => joins.push(p.id) });
const publish = () => { for (const callback of callbacks) callback(); };
assert.deepEqual(joins, [], "initial players are not announced twice");
assert.equal(visual.visuals.size, 2);
publish();
const history = visual.remoteInterp.get("other")!;
assert(!visual.remoteInterp.has("me"));
assert.notEqual(history.next, source.model.playersById.get("other"));
now = 150; other.x = 20; publish();
assert.equal(history.prev.x, 0); assert.equal(history.next.x, 20);
other.x = 40;
assert.equal(history.next.x, 20, "history is detached even from mutable read model objects");
now = 200; publish();
assert.equal(history.prev.x, 20); assert.equal(history.next.x, 40);
assert.equal(sampleInterpolatedPose(history, 225, 50).x, 30);
const previousNext = history.next;
now = 250; me.hp--; publish();
assert.equal(history.next, previousNext, "unrelated patches must not move the interpolation window");
const late = new PlayerState(); late.id = "late";
state.playerList.push(late); publish(); publish();
assert.deepEqual(joins, ["late"]);
const oldVisual = visual.visuals.get("late");
state.playerList.deleteAt(2); publish();
assert(!visual.visuals.has("late")); assert(!visual.remoteInterp.has("late"));
const rejoin = new PlayerState(); rejoin.id = "late";
state.playerList.push(rejoin); publish();
assert.deepEqual(joins, ["late", "late"]);
assert.notEqual(visual.visuals.get("late"), oldVisual);
const stableVisual = visual.visuals.get("other");
other.hp = 100; other.x = 0; publish();
assert.equal(visual.visuals.get("other"), stableVisual, "round reset retains visual identity");
visual.dispose(); visual.dispose();
assert.equal(scene.children.length, 0);
state.playerList.push(Object.assign(new PlayerState(), { id: "after-dispose" })); publish();
assert.equal(scene.children.length, 0, "a late state cannot resurrect disposed visuals");
assert.equal(visual.remoteInterp.size, 0);
source.dispose(); await Promise.resolve(); assert.equal(callbacks.size, 0);
console.log("visual read-model subscription, detached interpolation history, joins and cleanup ok");
