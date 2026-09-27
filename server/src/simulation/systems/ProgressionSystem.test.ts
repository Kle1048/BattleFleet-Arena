import assert from "node:assert/strict";
import { MATCH_PHASE_ENDED, MATCH_PHASE_RUNNING, PlayerLifeState, getAswmMagazineFromProfile,
  getAuthoritativeShipHullProfile, normalizeShipClassId, shipClassIdForProgressionLevel, progressionMaxHpForLevel, progressionMinXpForLevel,
  shipClassBaseMaxHp } from "@battlefleet/shared/rules";
import { testParticipants } from "../testParticipants.js";
import { ProgressionSystem } from "./ProgressionSystem.js";

const participants = testParticipants("outside", "zone", "protected", "dead");
const p = participants.players.get("outside")!;
const row = participants.simulations.get(p.id)!;
p.x = -1800; p.z = -1800;
participants.players.get("protected")!.lifeState = PlayerLifeState.SpawnProtected;
participants.players.get("dead")!.lifeState = PlayerLifeState.AwaitingRespawn;
let base = 5, interval = 1000, multiplier = 2, baseReads = 0;
const progression = new ProgressionSystem(participants, {
  intervalMs: () => interval, base: () => { baseReads++; return base; }, seaControlMultiplier: () => multiplier,
});
progression.resetClock(100);
progression.tick(1099, MATCH_PHASE_RUNNING);
assert.equal(baseReads, 0);
progression.tick(1100, MATCH_PHASE_RUNNING);
assert.equal(baseReads, 1, "settings read once per pass, not once per participant");
assert.equal(p.xp, 5);
assert.equal(participants.players.get("zone")!.xp, 10);
assert.equal(participants.players.get("protected")!.xp, 10);
assert.equal(participants.players.get("dead")!.xp, 0);
progression.tick(5100, MATCH_PHASE_ENDED);
assert.equal(baseReads, 1);
base = 7; multiplier = 3; interval = 500;
progression.tick(5100, MATCH_PHASE_RUNNING);
assert.equal(p.xp, 12, "long delay grants once, not a catch-up burst");
assert.equal(participants.players.get("zone")!.xp, 31);
row.aswmRemainingPort = 0; row.aswmRemainingStarboard = 0; row.aswmReloadUntilMs = 9000;
p.hp -= 9;
const beforeMaxHp = p.maxHp, beforeHp = p.hp;
progression.grant(p, row, progressionMinXpForLevel(5) - p.xp);
assert.equal(p.level, 5);
assert.equal(p.shipClass, shipClassIdForProgressionLevel(5));
assert.equal(p.maxHp, progressionMaxHpForLevel(5, shipClassBaseMaxHp(p.shipClass)));
assert.equal(p.hp, beforeHp + p.maxHp - beforeMaxHp);
assert.equal(row.aswmReloadUntilMs, 0);
const magazine = getAswmMagazineFromProfile(getAuthoritativeShipHullProfile(p.shipClass), normalizeShipClassId(p.shipClass));
assert.equal(row.aswmRemainingPort, magazine.port);
assert.equal(row.aswmRemainingStarboard, magazine.starboard);
const score = p.score;
progression.grant(p, row, 0);
progression.grant(p, row, -5);
assert.equal(p.score, score);
progression.grantKill(p);
assert.equal(p.score, score + 100);
console.log("headless progression cadence, live tuning, eligibility and class transition ok");
