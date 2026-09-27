import assert from "node:assert/strict";
import type { WreckValues } from "@battlefleet/shared/protocol";
import { PlayerLifeState, WRECK_DURATION_MS, getAswmMagazineFromProfile,
  getAuthoritativeShipHullProfile, progressionMinXpForLevel, shipClassIdForProgressionLevel } from "@battlefleet/shared/rules";
import { testParticipants } from "../testParticipants.js";
import { LifeSystem } from "./LifeSystem.js";

const participants = testParticipants("killer", "victim");
const killer = participants.players.get("killer")!;
const victim = participants.players.get("victim")!;
const row = participants.simulations.get(victim.id)!;
const wrecks: WreckValues[] = [], cleared: string[] = [];
let combat = true, rewards = 0, protectionMs = 1000, randomCalls = 0, seed = 42;
const life = new LifeSystem(participants, {
  respawnDelayMs: () => 1000, spawnProtectionMs: () => protectionMs, operationalHalfExtent: () => 4000,
}, {
  isCombatActive: () => combat, grantKill: () => { rewards++; },
  clearOwnedShells: id => { cleared.push(id); }, addWreck: wreck => { wrecks.push(wreck); },
}, () => { randomCalls++; return ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32); });

victim.level = 5; victim.xp = 650; victim.shipClass = shipClassIdForProgressionLevel(5);
victim.score = 999; victim.kills = 7;
const destroyedClass = victim.shipClass;
row.ship.x = 321; row.ship.z = -456; row.ship.headingRad = 1.25;
row.lastRudderInput = 0.8; row.primaryReadyAtMs = 9000; row.adSamNextAtMs = 9000;
life.applyDamage(victim.id, 1e6, 100, killer.id);
life.applyDamage(victim.id, 1e6, 101, killer.id);
life.destroy(victim.id, 102, { killerSessionId: killer.id });
assert.equal(killer.kills, 1); assert.equal(rewards, 1);
assert.deepEqual(cleared, [victim.id]);
assert.equal(victim.level, 4); assert.equal(victim.xp, progressionMinXpForLevel(4));
assert.equal(victim.shipClass, destroyedClass, "wreck retains destroyed hull across level loss");
assert.equal(victim.score, 999); assert.equal(victim.kills, 7);
assert.equal(row.primaryReadyAtMs, 0); assert.equal(row.adSamNextAtMs, 0);
assert.equal(row.aswmRemainingPort, 0); assert.equal(row.aswmReloadUntilMs, 0);
assert.equal(wrecks.length, 0); assert.equal(randomCalls, 0);
life.tick(600);
assert.equal(victim.respawnCountdownSec, 0.5);
life.tick(1099); assert.equal(wrecks.length, 0);
life.tick(1100);
assert.equal(wrecks.length, 1); assert(randomCalls > 0);
assert.deepEqual({ ...wrecks[0], variant: 0 }, {
  wreckId: "w-victim-1100", anchorX: 321, anchorZ: -456, headingRad: 1.25, variant: 0,
  shipClass: destroyedClass, deathAtMs: 100, createdAtMs: 1100, expiresAtMs: 1100 + WRECK_DURATION_MS,
});
assert.equal(victim.shipClass, shipClassIdForProgressionLevel(4));
assert.equal(victim.hp, victim.maxHp); assert.equal(victim.deathAtMs, 0);
assert.equal(victim.killedBySessionId, ""); assert.equal(row.lastRudderInput, 0.8);
assert.equal(row.aimX, row.ship.x + Math.sin(row.ship.headingRad) * 80);
assert.equal(row.aimZ, row.ship.z + Math.cos(row.ship.headingRad) * 80);
life.applyDamage(victim.id, 20, 1101, killer.id);
assert.equal(victim.hp, victim.maxHp, "ordinary damage respects spawn protection");
life.applyDamage(victim.id, 20, 1101, killer.id, true);
assert.equal(victim.hp, victim.maxHp - 20, "dormant mine exception remains explicit");
life.regenerate(victim, 1);
assert.equal(victim.hp, victim.maxHp - 20 + victim.maxHp * 0.01);
life.tick(1600); assert.equal(victim.spawnProtectionSec, 0.5);
life.tick(2100); assert.equal(victim.lifeState, PlayerLifeState.Alive);
assert.equal(row.invulnerableUntilMs, 0);
life.tick(2100); assert.equal(wrecks.length, 1, "no repeated respawn");
combat = false;
life.applyDamage(victim.id, 1e6, 2200, killer.id);
assert.equal(killer.kills, 1, "life does not award ended-match kills");
protectionMs = 2000;
life.resetPlayers(2500);
assert.equal(victim.level, 1); assert.equal(victim.xp, 0);
assert.equal(victim.score, 0); assert.equal(victim.kills, 0);
assert.equal(row.lastRudderInput, 0);
assert.equal(row.aimX, row.ship.x); assert.equal(row.aimZ, row.ship.z + 80);
assert.equal(victim.primaryCooldownSec, 0); assert.equal(victim.secondaryCooldownSec, 0);
assert.equal(victim.shipClass, "fac");
assert.equal(victim.aswmRemainingPort, getAswmMagazineFromProfile(getAuthoritativeShipHullProfile("fac"), "fac").port);
assert.equal(victim.spawnProtectionSec, 2);
assert.equal(row.invulnerableUntilMs, 4500);
life.destroy(victim.id, 2600, { killerSessionId: victim.id });
assert.equal(victim.lifeState, PlayerLifeState.AwaitingRespawn, "OOB bypasses protection");
assert.equal(victim.killedBySessionId, "", "self kills are not attributed");
life.regenerate(victim, 100); assert.equal(victim.hp, 0);
life.applyDamage("missing", 1, 2700);
life.destroy("missing", 2700);
console.log("headless damage, death, attribution, protection, wreck, respawn and reset ok");
