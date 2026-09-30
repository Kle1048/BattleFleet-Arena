import assert from "node:assert/strict";
import type { InputCommand } from "@battlefleet/shared/protocol";
import type { BotVisiblePlayer } from "@battlefleet/shared/rules";
import { BotSystem } from "./BotSystem.js";

let now = 10_000;
let randomCalls = 0;
const joins: { id: string; name: string }[] = [];
const removes: string[] = [];
const commands: { id: string; input: InputCommand }[] = [];
const system = new BotSystem({
  environment: { nowMs: () => now, random: () => { randomCalls++; return 0.5; } },
  diagnosticNowMs: () => 123,
  joinParticipant: (id, name) => joins.push({ id, name }),
  removeParticipant: id => removes.push(id),
  applyInput: (id, input) => commands.push({ id, input }),
});

system.reconcile(now, 10, 0);
assert.equal(system.ids.size, 0, "no autonomous population without a human");
system.reconcile(now, 10, 1);
assert.deepEqual(joins, [{ id: "bfa_bot_1_i", name: "Nelson (Bot)" }]);
system.reconcile(now + 449, 10, 1);
assert.equal(system.ids.size, 1);
for (let i = 1; i <= 8; i++) system.reconcile(now + i * 450, 10, 1);
assert.equal(system.ids.size, 5, "population cap remains five bots");
assert.equal(randomCalls, 5, "one ID draw per admitted bot");
assert.deepEqual(joins.map(j => j.name), ["Nelson (Bot)", "Nimitz (Bot)", "Yamamoto (Bot)", "Togo (Bot)", "Yi Sun-sin (Bot)"]);

const players: BotVisiblePlayer[] = joins.map(({ id }, i) => ({
  id, x: -1800 + i * 100, z: -1800, headingRad: Math.PI / 2, shipClass: "fac",
  hp: 100, maxHp: 100, lifeState: "alive", primaryCooldownSec: 0, secondaryCooldownSec: 0,
  torpedoCooldownSec: 0, adHudIncomingAswm: 0,
}));
system.tick(now, players, [], [], 4000);
assert.equal(commands.length, 5, "each real brain submits one command through the same input port");
assert.deepEqual(commands.map(c => c.id), [...system.ids]);
for (const { input } of commands) {
  assert(Number.isFinite(input.throttle) && Number.isFinite(input.rudderInput));
  assert(Number.isFinite(input.aimX) && Number.isFinite(input.aimZ));
}
system.reconcile(now + 1599, 10, 16);
assert.equal(system.ids.size, 5);
system.reconcile(now + 1600, 10, 16);
assert.deepEqual(removes, [joins[0]!.id], "oldest admitted bot leaves first");
system.reconcile(now + 3199, 10, 16);
assert.equal(system.ids.size, 4);
system.reconcile(now + 3200, 10, 16);
assert.equal(system.ids.size, 3);
system.remove(joins[0]!.id);
assert.equal(removes.length, 2, "duplicate removal does not detach twice");
system.dispose(); system.dispose();
assert.equal(system.ids.size, 0);
commands.length = 0;
system.tick(now + 4000, players, [], [], 4000);
assert.equal(commands.length, 0, "disposed brains cannot submit stale input");
console.log("bot population cadence, IDs, input dispatch and disposal tests ok");

let strategiesCreated = 0, strategyDecisions = 0;
const learnedSystem = new BotSystem({
  environment: { nowMs: () => now, random: () => 0.5 }, diagnosticNowMs: () => now,
  joinParticipant: () => {}, removeParticipant: () => {}, applyInput: () => {},
  createStrategy: () => {
    strategiesCreated++;
    return { decide: () => { strategyDecisions++; return "RETREAT"; } };
  },
});
learnedSystem.spawn(); learnedSystem.spawn();
learnedSystem.tick(now, players, [], [], 4000);
assert.equal(strategiesCreated, 2, "each server bot receives its own strategy instance");
assert.equal(strategyDecisions, 2, "server brains use the injected strategy");
learnedSystem.dispose();
