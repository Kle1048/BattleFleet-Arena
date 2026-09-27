import assert from "node:assert/strict";
import { DEFAULT_MAP_ISLAND_POLYGONS, PlayerLifeState } from "@battlefleet/shared/rules";
import { testParticipants } from "../testParticipants.js";
import { MovementSystem } from "./MovementSystem.js";

{
  const participants = testParticipants("ship");
  const row = participants.simulations.get("ship")!;
  const p = participants.players.get("ship")!;
  const events: string[] = [];
  const vertices = DEFAULT_MAP_ISLAND_POLYGONS[0]!.verts;
  const x = vertices.reduce((sum, v) => sum + v.x, 0) / vertices.length;
  const z = vertices.reduce((sum, v) => sum + v.z, 0) / vertices.length;
  const placeInside = () => { row.ship.x = x; row.ship.z = z; };
  const movement = new MovementSystem(participants, {
    applyDamage(id, damage, now) {
      assert.equal(id, "ship"); assert(damage > 0); assert.equal(now, 100);
      assert.deepEqual([row.ship.x, row.ship.z], [x, z], "damage precedes island correction");
      events.push("damage");
    },
  }, (id, kind) => { events.push(id + ":" + kind); });
  placeInside(); movement.step(0, 100, true, []);
  assert.deepEqual(events, ["ship:island", "damage"], "terrain contact is delivered before damage");
  assert.notDeepEqual([row.ship.x, row.ship.z], [x, z]);
  placeInside(); movement.step(0, 100, true, []);
  assert.equal(events.length, 2, "continuing terrain overlap is not a new contact");
  movement.remove("ship");
  placeInside(); movement.step(0, 100, false, []);
  assert.deepEqual(events, ["ship:island", "damage", "ship:island"], "ended rounds still resolve contacts without damage");
  movement.resetRoundContacts();
  p.lifeState = PlayerLifeState.SpawnProtected;
  placeInside(); movement.step(0, 100, true, []);
  assert.equal(events.at(-1), "ship:island");
  assert.equal(events.filter(e => e === "damage").length, 1);
  movement.dispose(); movement.dispose();
  placeInside(); movement.step(0, 100, true, []);
  assert.equal(events.length, 5, "dispose releases previous contacts");
}

{
  const participants = testParticipants("a", "b");
  const events: string[] = [];
  const rowA = participants.simulations.get("a")!;
  const rowB = participants.simulations.get("b")!;
  const place = () => {
    for (const [id, row] of participants.simulations) {
      row.ship.x = -1800; row.ship.z = -1800;
      row.ship.headingRad = id === "a" ? 0 : Math.PI;
      row.ship.speed = 30;
    }
  };
  const movement = new MovementSystem(participants, {
    applyDamage(id, damage, _now, killer) {
      assert(damage > 0); assert.equal(killer, id === "a" ? "b" : "a");
      assert.equal(rowA.ship.x, rowB.ship.x, "ram damage precedes hull separation");
      events.push("damage:" + id);
    },
  }, id => { events.push("contact:" + id); });
  place(); movement.step(0.1, 100, true, []);
  assert.deepEqual(events, ["damage:a", "damage:b", "contact:a", "contact:b"]);
  assert.notDeepEqual([rowA.ship.x, rowA.ship.z], [rowB.ship.x, rowB.ship.z]);
  events.length = 0;
  movement.resetRoundContacts();
  place(); movement.step(0.1, 100, true, []);
  assert.deepEqual(events, ["damage:a", "damage:b"], "round reset preserves historical ship-pair edge timing");
  const p = participants.players.get("a")!;
  const cached = movement.configForPlayer(p);
  assert.equal(movement.configForPlayer(p), cached);
  p.level++;
  assert.notEqual(movement.configForPlayer(p), cached);
  movement.dispose();
}
console.log("headless movement, contact/damage/correction ordering, protection and cache ok");
