import assert from "node:assert/strict";
import { Room } from "colyseus.js";
import { BattleState, PlayerState } from "@battlefleet/shared/protocol/schema";
import { createGameSession, type SessionConnection } from "./GameSession";

function fixture() {
  const room = new Room("session-test", BattleState);
  room.roomId = "room"; room.sessionId = "me";
  const sent: string[] = [];
  let leaves = 0, closes = 0;
  room.send = type => { sent.push(String(type)); };
  room.leave = async () => { leaves++; return 1000; };
  room.connection = { close() { closes++; room.onLeave.invoke(1000); } } as typeof room.connection;
  return { room, sent, counts: () => ({ leaves, closes }) };
}
for (let cycle = 0; cycle < 20; cycle++) {
  const { room, sent, counts } = fixture();
  let frames = 0, events = 0, releases = 0, states = 0;
  let ports!: SessionConnection;
  const session = createGameSession(room, (source, connection) => {
    ports = connection;
    source.subscribe({ onState() { states++; } });
    return {
      frame() { frames++; }, present() { events++; },
      dispose() {
        releases++;
        room.onMessage("*", () => {}); // Foreign listener keeps this late dispatch intentionally handled.
        // A final queued state or event must already be inert before view cleanup.
        room.onStateChange.invoke(room.state);
        room["dispatchMessage"]("missileLockOn", {});
      },
    };
  });
  assert.deepEqual(sent, ["ping"]);
  room.state.playerList.push(Object.assign(new PlayerState(), { id: "me" }));
  room.onStateChange.invoke(room.state);
  session.frame(100, 16);
  room["dispatchMessage"]("missileLockOn", {});
  assert.equal(frames, 1); assert.equal(events, 1); assert.equal(states, 1);
  session.dispose(); session.dispose();
  await session.ended;
  session.frame(116, 16);
  ports.setDebugShipClass("fac");
  room.onStateChange.invoke(room.state);
  room["dispatchMessage"]("missileLockOn", {});
  assert.equal(frames, 1); assert.equal(events, 1); assert.equal(states, 1);
  assert.equal(releases, 1);
  assert.deepEqual(sent, ["ping"]);
  assert.deepEqual(counts(), { leaves: 1, closes: 1 });
  assert.equal(session.disposed, true);
}

const remoteLeave = fixture();
let released = 0;
const remote = createGameSession(remoteLeave.room, () => ({
  frame() {}, present() {}, dispose() { released++; },
}));
remoteLeave.room.onLeave.invoke(1006, "disconnected");
await remote.ended;
remote.dispose();
assert.equal(released, 1);
assert.match(remote.endNotice, /Connection lost/);
assert.deepEqual(remoteLeave.counts(), { leaves: 0, closes: 0 });

const broken = fixture();
assert.throws(() => createGameSession(broken.room, () => { throw new Error("view setup failed"); }), /view setup failed/);
assert.deepEqual(broken.counts(), { leaves: 1, closes: 1 });
const heartbeatFailure = fixture();
heartbeatFailure.room.send = () => { throw new Error("heartbeat failed"); };
assert.throws(() => createGameSession(heartbeatFailure.room, () => ({
  frame() {}, present() {}, dispose() { released++; },
})), /heartbeat failed/);
assert.equal(released, 2);
assert.deepEqual(heartbeatFailure.counts(), { leaves: 1, closes: 1 });
console.log("Session ownership: 20 joins/leaves, inert work, remote leave and startup rollback ok");
const expiredFixture = fixture();
const expired = createGameSession(expiredFixture.room, () => ({ frame() {}, present() {}, dispose() {} }));
expiredFixture.room.onLeave.invoke(4001);
await expired.ended;
assert.match(expired.endNotice, /round has finished/);
