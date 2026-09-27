import assert from "node:assert/strict";
import { ArraySchema } from "@colyseus/schema";
import { BattleState, PlayerState, MissileState, TorpedoState, ShipWreckState } from "@battlefleet/shared/protocol/schema";
import { createBattleStateAdapter } from "./battleStateAdapter";

const callbacks = new Set<() => void>();
const onStateChange = Object.assign((callback: () => void) => { callbacks.add(callback); }, {
  remove(callback: () => void) { callbacks.delete(callback); },
});
const wire = new BattleState();
assert.equal(wire.islandsEnabled, false, "no speculative island load before the first server snapshot");
wire.islandsEnabled = true;
const player = new PlayerState(); player.id = "a";
wire.playerList.push(player);
const missile = new MissileState(); missile.missileId = 7;
wire.missileList.push(missile);
const torpedo = new TorpedoState(); torpedo.torpedoId = 8;
wire.torpedoList.push(torpedo);
const wreck = new ShipWreckState(); wreck.wreckId = "wreck";
wire.wreckList.push(wreck);
let now = 100;
const room = { state: new BattleState(), onStateChange,
  onLeave: Object.assign((_callback: (code: number) => void) => {}, { remove(_callback: (code: number) => void) {} }),
};
room.state.decode(wire.encodeAll()); wire.discardAllChanges();
const source = createBattleStateAdapter(room, () => now);
const model = source.model;
assert.equal(model.islandsEnabled, true, "explicit server opt-in survives the full snapshot");
const listIdentity = model.playerList;
const a = model.playersById.get("a")!;
assert.equal(callbacks.size, 1);
assert.equal(model.stateSyncCount, 0);
assert.deepEqual(a, player.toJSON());
assert.notEqual(a, room.state.playerList.at(0));
assert.equal(Object.getPrototypeOf(a), Object.prototype);
assert(!("$changes" in a));
assert.deepEqual(model.missileList[0], missile.toJSON());
assert.deepEqual(model.torpedoList[0], torpedo.toJSON());
assert.deepEqual(model.wreckList[0], wreck.toJSON());
assert.equal(model.missilesById.get(7), model.missileList[0]);

const notifications: string[] = [];
const unsubscribe = source.subscribe({
  onPlayerAdded: p => notifications.push(`add:${p.id}`),
  onPlayerRemoved: p => notifications.push(`remove:${p.id}`),
  onState: time => notifications.push(`state:${time}:${model.matchRemainingSec}`),
});
assert.deepEqual(notifications, [], "hydration is not replayed as joins");
const patch = () => {
  room.state.decode(wire.encode()); wire.discardAllChanges();
  now += 50;
  for (const callback of callbacks) callback();
};

// Exercise every scalar, not just movement/HP; projection must never enumerate Schema internals.
for (const entity of [player, missile, torpedo, wreck]) {
  for (const [field, value] of Object.entries(entity.toJSON())) {
    if (["id", "missileId", "torpedoId", "wreckId"].includes(field)) continue;
    Reflect.set(entity, field, typeof value === "number" ? value + 7 : typeof value === "boolean" ? !value : value + "_changed");
  }
}
wire.matchPhase = "ended"; wire.matchRemainingSec = 23; wire.operationalAreaHalfExtent = 1500;
wire.islandsEnabled = false;
patch();
assert.equal(model.playerList, listIdentity);
assert.equal(model.playersById.get("a"), a, "surviving entity identity is stable");
assert.deepEqual(a, player.toJSON());
assert.deepEqual(model.missileList[0], missile.toJSON());
assert.deepEqual(model.torpedoList[0], torpedo.toJSON());
assert.deepEqual(model.wreckList[0], wreck.toJSON());
assert.equal(model.matchPhase, "ended"); assert.equal(model.operationalAreaHalfExtent, 1500);
assert.equal(model.islandsEnabled, false);
assert.deepEqual(notifications, ["state:150:23"]);
const hp = a.hp;
room.state.playerList.at(0)!.hp = -1;
assert.equal(a.hp, hp, "no live Schema reference escapes the patch boundary");

const b = new PlayerState(); b.id = "b";
wire.playerList.push(b); patch();
assert.deepEqual(notifications.slice(-2), ["add:b", "state:200:23"]);
const bView = model.playersById.get("b");
// Round reset changes values, not membership or history identity.
player.hp = 100; wire.matchPhase = "running"; wire.matchRemainingSec = 60; patch();
assert.equal(model.playersById.get("a"), a);
assert.equal(notifications.at(-1), "state:250:60");

wire.playerList.deleteAt(0);
const rejoined = new PlayerState(); rejoined.id = "a";
wire.playerList.push(rejoined); patch();
assert.notEqual(model.playersById.get("a"), a);
assert.equal(model.playersById.get("b"), bView);
assert.deepEqual(model.playerList.map(p => p.id), ["b", "a"]);
assert.deepEqual(notifications.slice(-3), ["remove:a", "add:a", "state:300:60"]);

// Full snapshots can replace both state and collections. Do not keep listeners on stale arrays.
const replacement = new BattleState();
replacement.decode(wire.encodeAll());
room.state = replacement;
const beforeSnapshotNotifications = notifications.length;
const beforeSnapshotPlayer = model.playersById.get("a");
for (const callback of callbacks) callback();
assert.equal(model.playerList, listIdentity);
assert.equal(model.playersById.get("a"), beforeSnapshotPlayer);
assert.equal(notifications.length, beforeSnapshotNotifications + 1, "snapshot rebind is not another join announcement");
assert.deepEqual(model.playerList.map(p => p.id), ["b", "a"]);
room.state.playerList = new ArraySchema();
room.state.missileList.clear(); room.state.torpedoList.clear(); room.state.wreckList.clear();
for (const callback of callbacks) callback();
assert.equal(model.playersById.size, 0);
assert.deepEqual([model.playerList.length, model.missileList.length, model.torpedoList.length, model.wreckList.length], [0, 0, 0, 0]);
unsubscribe();
const count = notifications.length;
for (const callback of callbacks) callback();
assert.equal(notifications.length, count);
const lateCallback = [...callbacks][0]!;
source.dispose(); source.dispose();
await Promise.resolve(); // Detached after an in-flight Colyseus signal dispatch has completed.
assert.equal(callbacks.size, 0);
lateCallback();
source.subscribe({ onState() { assert.fail("cannot subscribe after disposal"); } });
lateCallback();
assert.equal(model.playerList.length, 0);
console.log("read model: real full/delta decoding, every scalar, stable identities, replacement and disposal ok");
