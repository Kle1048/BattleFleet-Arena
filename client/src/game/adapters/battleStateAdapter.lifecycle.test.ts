import assert from "node:assert/strict";
import { Room } from "colyseus.js";
import { BattleState, PlayerState } from "@battlefleet/shared/protocol/schema";
import { createBattleStateAdapter } from "./battleStateAdapter";

// Real Colyseus signals are deliberately used: a Set mock hides its unsafe remove(-1).
const room = new Room("read-model-leave", BattleState);
const source = createBattleStateAdapter(room, () => 0);
room.onLeave.invoke(1000);
let unrelated = 0;
room.onStateChange(() => unrelated++);
source.dispose(); source.dispose();
await Promise.resolve();
room.onStateChange.invoke(room.state);
assert.equal(unrelated, 1, "disposal after leave must not remove a newly registered foreign listener");

const duringState = new Room("read-model-dispatch", BattleState);
const current = createBattleStateAdapter(duringState, () => 0);
let siblingCalls = 0;
current.subscribe({ onState() { current.dispose(); } });
duringState.onStateChange(() => siblingCalls++);
duringState.onStateChange.invoke(duringState.state);
assert.equal(siblingCalls, 1, "disposal inside notification must not skip the next Colyseus callback");
await Promise.resolve();
duringState.onStateChange.invoke(duringState.state);
assert.equal(siblingCalls, 2);
assert.equal(current.model.stateSyncCount, 1);

// Leave can occur before deferred unsubscription runs; it has already cleared the signals.
const immediateLeave = new Room("read-model-dispose-then-leave", BattleState);
const last = createBattleStateAdapter(immediateLeave, () => 0);
last.dispose();
immediateLeave.onLeave.invoke(1000);
let newer = 0;
immediateLeave.onStateChange(() => newer++);
await Promise.resolve();
immediateLeave.onStateChange.invoke(immediateLeave.state);
assert.equal(newer, 1);

// The leave marker may run after a different listener synchronously disposes this adapter.
const reentrantLeave = new Room("read-model-reentrant-leave", BattleState);
reentrantLeave.onLeave(() => reentrant.dispose());
const reentrant = createBattleStateAdapter(reentrantLeave, () => 0);
reentrantLeave.onLeave.invoke(1000);
let newerLeaveListener = 0;
reentrantLeave.onLeave(() => newerLeaveListener++);
await Promise.resolve();
reentrantLeave.onLeave.invoke(1000);
assert.equal(newerLeaveListener, 1);

const lateState = new Room("read-model-late-state", BattleState);
const disposed = createBattleStateAdapter(lateState, () => 0);
disposed.dispose();
lateState.state.playerList.push(Object.assign(new PlayerState(), { id: "late" }));
lateState.onStateChange.invoke(lateState.state);
assert.equal(disposed.model.playerList.length, 0, "callbacks become inert synchronously on dispose");
await Promise.resolve();
console.log("read model real-signal disposal, sibling dispatch, leave and late-state ownership ok");
