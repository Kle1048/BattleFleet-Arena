import assert from "node:assert/strict";
import { Room } from "colyseus.js";
import { createRoomEventAdapter } from "./roomEventAdapter";

function fixture() {
  const room = new Room("event-lifecycle");
  let tick = () => {};
  let starts = 0, stops = 0, sends = 0, events = 0, leaves = 0;
  const pings: Array<number | null> = [];
  room.send = () => { sends++; };
  const create = () => createRoomEventAdapter({
    room, now: () => 1000,
    every(callback, ms) {
      assert.equal(ms, 2000); starts++; tick = callback;
      return () => { stops++; };
    },
    onEvent() { events++; }, onPing: ms => pings.push(ms), onError() {}, onLeave() { leaves++; },
  });
  return { room, create, pings, tick: () => tick(),
    counts: () => ({ starts, stops, sends, events, leaves }),
    emit: (type: string, payload: unknown = {}) => room["dispatchMessage"](type, payload),
  };
}

const a = fixture();
let unrelatedErrors = 0, unrelatedLeaves = 0;
a.room.onError(() => unrelatedErrors++);
a.room.onLeave(() => unrelatedLeaves++);
const first = a.create();
assert.deepEqual(a.counts(), { starts: 1, stops: 0, sends: 1, events: 0, leaves: 0 });
a.tick(); a.emit("pong", { clientTime: 960 }); a.emit("artyFired", null); a.emit("missileLockOn");
assert.deepEqual(a.pings, [40]);
assert.equal(a.counts().events, 1);
first.dispose(); first.dispose();
a.tick(); a.emit("missileLockOn");
assert.deepEqual(a.counts(), { starts: 1, stops: 1, sends: 2, events: 1, leaves: 0 });

// Reattach to the same live room: no duplicate heartbeat or presentation callbacks.
const second = a.create(); a.emit("missileLockOn"); a.tick();
assert.deepEqual(a.counts(), { starts: 2, stops: 1, sends: 4, events: 2, leaves: 0 });
a.room.onLeave.invoke(1000, "test");
assert.deepEqual(a.pings, [40, null]);
assert.equal(unrelatedLeaves, 1);
assert.equal(a.counts().leaves, 1);
assert.equal(a.counts().stops, 2);
second.dispose(); a.tick();
assert.equal(a.counts().sends, 4);
assert.equal(unrelatedErrors, 0);
// Removing an absent callback in Colyseus would pop this unrelated newly registered callback.
let afterLeave = 0;
a.room.onLeave(() => afterLeave++);
second.dispose(); a.room.onLeave.invoke(1000);
assert.equal(afterLeave, 1);

// Reentrant error cleanup must not skip the following listener during signal dispatch.
const room = new Room("error-cleanup");
room.send = () => {};
let errorCalls = 0, siblingCalls = 0, errorStops = 0;
const adapter = createRoomEventAdapter({
  room, now: () => 0, every: () => () => { errorStops++; },
  onEvent() {}, onPing() {}, onLeave() {},
  onError() { errorCalls++; adapter.dispose(); },
});
room.onError(() => siblingCalls++);
room.onError.invoke(500, "intentional lifecycle fixture");
assert.equal(siblingCalls, 1); assert.equal(errorStops, 1);
await Promise.resolve();
room.onError.invoke(501, "intentional lifecycle fixture after dispose");
assert.equal(errorCalls, 1); assert.equal(siblingCalls, 2);

// Startup failures roll back subscriptions/timers instead of leaking a half-built adapter.
const broken = new Room("failed-start");
broken.send = () => { throw new Error("send failed"); };
let stopped = 0, notified = 0;
assert.throws(() => createRoomEventAdapter({
  room: broken, now: () => 0, every: () => () => { stopped++; },
  onEvent() { notified++; }, onPing() {}, onError() {}, onLeave() { notified++; },
}), /send failed/);
assert.equal(stopped, 1);
broken["dispatchMessage"]("missileLockOn", {});
broken.onLeave.invoke(1000);
assert.equal(notified, 0);

// A pre-existing leave handler can dispose us after Room cleared the signal arrays.
const leaving = new Room("reentrant-leave");
leaving.send = () => {};
leaving.onLeave(() => leavingAdapter.dispose());
let leaveStops = 0;
const leavingAdapter = createRoomEventAdapter({
  room: leaving, now: () => 0, every: () => () => { leaveStops++; },
  onEvent() {}, onPing() {}, onError() {}, onLeave() { assert.fail("already disposed"); },
});
leaving.onLeave.invoke(1000);
let surviving = 0;
leaving.onError(() => surviving++);
await Promise.resolve();
leaving.onError.invoke(502);
assert.equal(surviving, 1);
assert.equal(leaveStops, 1);
console.log("room event ownership, reattachment, reentrant signal cleanup, leave and startup rollback ok");
