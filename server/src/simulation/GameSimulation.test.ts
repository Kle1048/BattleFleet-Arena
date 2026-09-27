import assert from "node:assert/strict";
import type { GameEventSink } from "@battlefleet/shared/protocol";
import type { MatchPlayerResult } from "./SimulationSettings.js";
import { MATCH_PHASE_ENDED, MATCH_PHASE_RUNNING, PlayerLifeState } from "@battlefleet/shared/rules";
import { GameSimulation } from "./GameSimulation.js";
import { testSettings } from "./testSettings.js";

let now = 10000, seed = 42;
const emitted: string[] = [];
const results: (readonly MatchPlayerResult[])[] = [];
const events: GameEventSink = {
  broadcast: type => { emitted.push(type); },
  send: (recipient, type) => { emitted.push(recipient + ":" + type); },
};
const game = new GameSimulation({
  nowMs: () => now, random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32),
}, testSettings, events, () => 2, () => now, result => { results.push(result); }, () => "fixture-match");
game.start(); game.join("a", "Alpha"); game.join("b", "Bravo");
const a = game.findPlayer("a")!, row = game.participants.simulations.get("a")!;
assert.equal(Object.getPrototypeOf(a), Object.prototype, "domain participants are not schema instances");
assert.throws(() => game.join("a", "Duplicate"), /already joined/);
game.applyInput("a", { throttle: 0.5, rudderInput: 0.2,
  aimX: a.x + Math.sin(a.headingRad) * 160, aimZ: a.z + Math.cos(a.headingRad) * 160,
  primaryFire: true, secondaryFire: true, aswmFireSide: "port" });
assert.deepEqual(emitted, ["artyFired", "aswmFired"], "fire is observable before a step");
assert.equal(row.ship.throttle, 0.5); assert.equal(row.lastRudderInput, 0.2);
assert.equal(Object.getPrototypeOf(game.state.missileList[0]), Object.prototype);
a.score = 999; a.kills = 3; a.xp = 80;
now += testSettings.getMatchDurationMs();
game.step(0);
assert.equal(game.state.matchPhase, MATCH_PHASE_ENDED);
assert.equal(game.state.missileList.length, 0);
assert.equal(results.length, 1); assert.equal(results[0]![0]!.won, true);
const completed = structuredClone(results[0]);
game.step(0); assert.equal(results.length, 1);
game.reset(now);
assert.equal(game.state.matchPhase, MATCH_PHASE_RUNNING);
assert.equal(game.findPlayer("a"), a, "reset keeps the domain identity");
assert.equal(a.lifeState, PlayerLifeState.SpawnProtected);
assert.equal(a.score, 0);
assert.deepEqual(results[0], completed, "completed result has no borrowed live values");
game.reset(now, true);
assert.equal(results.length, 1, "admin abort does not persist an incomplete round");
game.remove("a"); game.join("a", "Again");
assert.notEqual(game.findPlayer("a"), a);
assert.deepEqual(game.state.playerList.map(p => p.id), ["b", "a"]);
game.dispose(); game.dispose();
assert.equal(game.state.playerList.length, 0);
assert.equal(game.state.missileList.length, 0);
console.log("canonical headless match, immediate input, detached results and identity lifecycle ok");
