import assert from "node:assert/strict";
import type { Client } from "@colyseus/core";
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  FEATURE_MINES_ENABLED, MATCH_PHASE_ENDED, MATCH_PHASE_RUNNING, PlayerLifeState,
  getAswmMagazineFromProfile, getAuthoritativeShipHullProfile, progressionMinXpForLevel,
  DEFAULT_MAP_ISLAND_POLYGONS,
} from "@battlefleet/shared";

// Characterization uses the real room operations, not a rewritten reference model.
// The private access is deliberately confined to tests until the headless API exists.
const dataDir = mkdtempSync(path.join(tmpdir(), "bfa-characterization-"));
process.env.BFA_DATA_DIR = dataDir;
const { BattleRoom } = await import("./BattleRoom.js");
const { updateAdminConfig } = await import("../adminConfig.js");
const { topLeaderboard, resetLeaderboard, leaderboardRevision } = await import("../leaderboardStore.js");
const { storageLifecycle } = await import("../application/storageServices.js");
await updateAdminConfig({ minRoomPlayers: 1, respawnDelayMs: 1000, spawnProtectionMs: 1000, operationalAreaHalfExtent: 4000 });

type Event = { recipient: string; type: string; payload: unknown };
let now = 1_800_000_000_000;
let seed = 42;
const environment = {
  nowMs: () => now,
  random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32),
};

async function fixture(run: (room: InstanceType<typeof BattleRoom>, events: Event[], join: (id: string) => Client) => void | Promise<void>,
  random = environment.random) {
  now = 1_800_000_000_000;
  seed = 42;
  const room = new BattleRoom({ ...environment, random });
  const events: Event[] = [];
  room.autoDispose = false;
  room.setPatchRate(null);
  // Copy payloads at delivery time: retaining mutable references would hide regressions.
  room.broadcast = (type: string | number, payload: unknown) => { events.push({ recipient: "*", type: String(type), payload: structuredClone(payload) }); };
  const join = (id: string) => {
    const client = { sessionId: id, send(type: string, payload: unknown) {
      events.push({ recipient: id, type, payload: structuredClone(payload) });
    } } as unknown as Client;
    room.onJoin(client, { displayName: id, playerToken: `fixture_${id}` });
    return client;
  };
  try {
    room.onCreate();
    room.setSimulationInterval();
    await run(room, events, join);
  } finally {
    room.setSimulationInterval(); room.setPatchRate(null);
    room.clock.clear(); room.clock.stop(); room.onDispose();
  }
}

try {
  await fixture((room, events, join) => {
    const client = join("shooter");
    const p = room["simulation"]["findPlayer"]("shooter")!;
    const row = room["simulation"]["participants"].simulations.get(p.id)!;
    const command = { throttle: 0, rudderInput: 0,
      aimX: p.x + Math.sin(p.headingRad) * 160, aimZ: p.z + Math.cos(p.headingRad) * 160,
      primaryFire: true, secondaryFire: true, aswmFireSide: "port" as const, torpedoFire: true };
    room["applyInputPayload"](p.id, command);
    assert.deepEqual(events.map(e => [e.recipient, e.type]), [["*", "artyFired"], ["*", "aswmFired"]]);
    assert.equal(FEATURE_MINES_ENABLED, false, "changing the dormant mine feature is not a refactor");
    assert.equal(room["simulation"].state.torpedoList.length, 0);
    assert.equal(room["simulation"]["artillery"]["pendingShells"].length, 1, "fire is applied before any physics step");
    assert.equal(room["simulation"].state.missileList.length, 1);
    assert(row.primaryReadyAtMs > now);
    assert.equal(room["simulation"]["missiles"]["missileSpawnedAt"].get(1), now);
    const firstEvents = structuredClone(events);
    room["applyInputPayload"](p.id, command);
    assert.deepEqual(events, firstEvents, "held fire still observes cooldowns");
    assert.equal(row.ship.throttle, 0);
    room.onLeave(client);
    assert.equal(room["simulation"]["artillery"]["pendingShells"].length, 0);
    assert.equal(room["simulation"].state.missileList.length, 0);
    assert.equal(room["simulation"]["missiles"]["missileSpawnedAt"].size, 0);
    assert.equal(room["simulation"]["participants"].players.size, 0);
    assert.equal(room["clientsById"].size, 0);
  });

  await fixture((room, _events, join) => {
    join("tick-order");
    const order: string[] = [];
    const phases = ["getOperationalHalfExtent", "updateMatchTimer", "reconcileServerBots", "tickServerBotBrains",
      "applyPassiveXpTick", "resolveShellImpacts", "processLifeTransitions", "processAswmMagazineReload",
      "pruneExpiredWrecks", "stepMissiles", "stepTorpedoes", "syncAirDefenseHud"] as const;
    const extracted: Record<string, [object, string]> = {
      resolveShellImpacts: [room["simulation"]["artillery"], "resolveImpacts"],
      processAswmMagazineReload: [room["simulation"]["missiles"], "reloadMagazines"],
      stepMissiles: [room["simulation"]["missiles"], "step"],
      stepTorpedoes: [room["simulation"]["mines"], "step"],
      syncAirDefenseHud: [room["simulation"]["defense"], "syncHud"],
    };
    for (const name of phases) {
      const [target, key] = extracted[name] ?? [room["simulation"], name];
      const original = Reflect.get(target, key);
      Object.defineProperty(target, key, { value: (...args: unknown[]) => {
        order.push(name);
        return Reflect.apply(original, target, args);
      } });
    }
    now += 50;
    room["physicsStep"](0.05);
    assert.deepEqual(order, [...phases.slice(0, 10), "getOperationalHalfExtent", ...phases.slice(10)],
      "missiles read the current boundary after movement; retain phase and nested read order");
  });

  await fixture((room, events, join) => {
    join("killer"); join("victim");
    const killer = room["simulation"]["findPlayer"]("killer")!;
    const victim = room["simulation"]["findPlayer"]("victim")!;
    const row = room["simulation"]["participants"].simulations.get(victim.id)!;
    victim.hp = 1;
    room["simulation"]["artillery"]["pendingShells"].push(...[81, 82].map(shellId => ({
      shellId, ownerSessionId: killer.id, impactAtMs: now, landX: victim.x, landZ: victim.z,
    })));
    room["simulation"]["artillery"].resolveImpacts(now);
    assert.equal(victim.lifeState, PlayerLifeState.AwaitingRespawn);
    assert.equal(victim.hp, 0);
    assert.equal(killer.kills, 1, "two simultaneous impacts must not credit two kills");
    assert.equal(victim.killedBySessionId, killer.id);
    assert.equal(victim.deathAtMs, now);
    assert.equal(row.respawnAtMs, now + 1000);
    assert.equal(room["simulation"].state.wreckList.length, 0, "wreck is inserted at respawn, not at death");
    assert.deepEqual(events.map(e => [e.type, (e.payload as { shellId: number }).shellId]), [["artyImpact", 81], ["artyImpact", 82]]);
    now += 999;
    room["simulation"]["processLifeTransitions"](now);
    assert.equal(victim.lifeState, PlayerLifeState.AwaitingRespawn);
    now += 1;
    room["simulation"]["processLifeTransitions"](now);
    assert.equal(victim.lifeState, PlayerLifeState.SpawnProtected);
    assert.equal(victim.hp, victim.maxHp);
    assert.equal(room["simulation"].state.wreckList.length, 1);
    const wreck = room["simulation"].state.wreckList.at(0)!;
    assert.equal(wreck.createdAtMs, now);
    assert.equal(wreck.deathAtMs, now - 1000);
    now += 999;
    room["simulation"]["processLifeTransitions"](now);
    assert.equal(victim.lifeState, PlayerLifeState.SpawnProtected);
    now++;
    room["simulation"]["processLifeTransitions"](now);
    assert.equal(victim.lifeState, PlayerLifeState.Alive);
    now = wreck.expiresAtMs;
    room["simulation"]["pruneExpiredWrecks"](now);
    assert.equal(room["simulation"].state.wreckList.length, 0);
    assert.equal(killer.kills, 1);
  });

  await fixture((room, events, join) => {
    join("reload");
    const p = room["simulation"]["findPlayer"]("reload")!;
    const row = room["simulation"]["participants"].simulations.get(p.id)!;
    room["simulation"]["progression"].grant(p, row, progressionMinXpForLevel(5));
    assert.equal(p.level, 5);
    assert.equal(p.shipClass, "cruiser");
    const expected = getAswmMagazineFromProfile(getAuthoritativeShipHullProfile(p.shipClass), p.shipClass);
    row.aswmRemainingPort = 0; row.aswmRemainingStarboard = 0;
    row.aswmReloadUntilMs = now + 50;
    room["simulation"]["missiles"].reloadMagazines(now);
    assert.equal(events.length, 0);
    now += 50;
    room["simulation"]["missiles"].reloadMagazines(now);
    room["simulation"]["missiles"].reloadMagazines(now);
    assert.deepEqual({ port: row.aswmRemainingPort, starboard: row.aswmRemainingStarboard }, expected);
    assert.deepEqual(events, [{ recipient: p.id, type: "aswmMagazineReloaded", payload: {} }]);
  });

  await fixture(async (room, events, join) => {
    await resetLeaderboard(leaderboardRevision());
    join("winner"); join("runnerup");
    room["simulation"]["findPlayer"]("winner")!.score = 20;
    room["simulation"]["findPlayer"]("runnerup")!.score = 10;
    room["simulation"]["bots"].spawn();
    const botId = [...room["simulation"]["bots"].ids][0]!;
    room["simulation"]["findPlayer"](botId)!.score = 100;
    const playerIdentity = room["simulation"]["findPlayer"]("winner");
    now = room["simulation"]["match"].endsAtMs;
    room["simulation"]["updateMatchTimer"](now);
    room["simulation"]["updateMatchTimer"](now + 50);
    assert.equal(room["simulation"].state.matchPhase, MATCH_PHASE_ENDED);
    assert.deepEqual(events, [{ recipient: "*", type: "matchEnded", payload: {} }]);
    await storageLifecycle.flush(); // Tick/end publication is synchronous; committed ranking is now asynchronous.
    assert.equal(topLeaderboard().length, 2, "bots do not enter persistent human rankings");
    assert.deepEqual(topLeaderboard().map(p => [p.displayName, p.matches, p.wins]), [["winner", 1, 1], ["runnerup", 1, 0]]);
    room.restartRoundFromAdmin();
    room.restartRoundFromAdmin();
    assert.equal(room["simulation"].state.matchPhase, MATCH_PHASE_RUNNING);
    assert.equal(room["simulation"]["findPlayer"]("winner"), playerIdentity);
    assert.equal(topLeaderboard()[0]!.matches, 1, "admin restart never records the interrupted round");
    assert.deepEqual(events.map(e => e.type), ["matchEnded", "matchRestarted", "matchRestarted"]);
  });

  await fixture((room, events, join) => {
    join("oob");
    const p = room["simulation"]["findPlayer"]("oob")!;
    const row = room["simulation"]["participants"].simulations.get(p.id)!;
    row.ship.x = p.x = room["simulation"].state.operationalAreaHalfExtent + 100;
    row.ship.z = p.z = -1800;
    room["physicsStep"](0);
    assert.equal(p.oobCountdownSec, 10);
    now += 9999;
    room["physicsStep"](0);
    assert.equal(p.lifeState, PlayerLifeState.Alive);
    now++;
    room["physicsStep"](0);
    assert.equal(p.lifeState, PlayerLifeState.AwaitingRespawn);
    assert.equal(p.hp, 0);
    assert.equal(p.killedBySessionId, "");
    assert.equal(events.length, 0, "OOB death is represented by state, not an extra explosion event");
  });

  await fixture((room, events, join) => {
    join("island-contact");
    const p = room["simulation"]["findPlayer"]("island-contact")!;
    const row = room["simulation"]["participants"].simulations.get(p.id)!;
    const verts = DEFAULT_MAP_ISLAND_POLYGONS[0]!.verts;
    const x = verts.reduce((sum, v) => sum + v.x, 0) / verts.length;
    const z = verts.reduce((sum, v) => sum + v.z, 0) / verts.length;
    const placeInside = () => { row.ship.x = p.x = x; row.ship.z = p.z = z; };
    placeInside();
    const hp = p.hp;
    room["physicsStep"](0);
    assert(p.hp < hp, "first contact applies scrape damage even before positional correction");
    assert.notDeepEqual([p.x, p.z], [x, z], "island overlap is resolved");
    const scrapedHp = p.hp;
    placeInside();
    room["physicsStep"](0);
    assert.equal(p.hp, scrapedHp, "ongoing overlap must not reapply edge-triggered scrape");
    assert.deepEqual(events, [{ recipient: p.id, type: "collisionContact", payload: { kind: "island" } }]);
    row.ship.x = p.x = -1800; row.ship.z = p.z = -1800;
    room["physicsStep"](0);
    placeInside(); room["physicsStep"](0);
    assert.equal(events.length, 2, "leaving then re-entering produces a new contact");
  });

  await fixture((room, events, join) => {
    join("ram-a"); join("ram-b");
    const a = room["simulation"]["findPlayer"]("ram-a")!;
    const b = room["simulation"]["findPlayer"]("ram-b")!;
    for (const p of [a, b]) {
      const row = room["simulation"]["participants"].simulations.get(p.id)!;
      row.ship.x = p.x = -1800; row.ship.z = p.z = -1800;
      row.ship.headingRad = p.headingRad = p === a ? 0 : Math.PI;
      row.ship.speed = 30;
    }
    const hp = [a.hp, b.hp];
    room["physicsStep"](0.1);
    assert(a.hp < hp[0]! && b.hp < hp[1]!, "ram damage is evaluated before separating hulls");
    assert.notDeepEqual([a.x, a.z], [b.x, b.z]);
    assert.deepEqual(events, [
      { recipient: a.id, type: "collisionContact", payload: { kind: "ship" } },
      { recipient: b.id, type: "collisionContact", payload: { kind: "ship" } },
    ]);
  });

  await fixture((room, events, join) => {
    join("wreck-contact");
    const p = room["simulation"]["findPlayer"]("wreck-contact")!;
    const row = room["simulation"]["participants"].simulations.get(p.id)!;
    row.ship.x = p.x = -1800; row.ship.z = p.z = -1800;
    row.ship.headingRad = p.headingRad = 0; row.ship.speed = 30;
    const wreck = { wreckId: "", anchorX: 0, anchorZ: 0, headingRad: 0, variant: 0, shipClass: "fac", deathAtMs: 0, createdAtMs: 0, expiresAtMs: 0 };
    Object.assign(wreck, { wreckId: "fixture-wreck", anchorX: -1800, anchorZ: -1800,
      headingRad: 0, shipClass: "fac", expiresAtMs: now + 60_000 });
    room["simulation"].state.wreckList.push(wreck);
    const hp = p.hp;
    room["physicsStep"](0.1);
    assert(p.hp < hp);
    assert.notDeepEqual([p.x, p.z], [wreck.anchorX, wreck.anchorZ]);
    assert.deepEqual(events, [{ recipient: p.id, type: "collisionContact", payload: { kind: "ship" } }]);
  });

  await fixture((room, events, join) => {
    join("attacker"); join("defender");
    const owner = room["simulation"]["findPlayer"]("attacker")!;
    const target = room["simulation"]["findPlayer"]("defender")!;
    for (const [p, z] of [[owner, -2400], [target, -1800]] as const) {
      const row = room["simulation"]["participants"].simulations.get(p.id)!;
      row.ship.x = p.x = -1800; row.ship.z = p.z = z;
      row.ship.headingRad = p.headingRad = 0;
    }
    target.shipClass = "cruiser";
    const missile = { missileId: 0, ownerId: "", targetId: "", x: 0, z: 0, headingRad: 0 };
    Object.assign(missile, { missileId: 91, ownerId: owner.id, x: -1800, z: -2100, headingRad: 0 });
    room["simulation"].state.missileList.push(missile);
    room["simulation"]["missiles"]["missileSpawnedAt"].set(missile.missileId, now - 2000);
    room["simulation"]["missiles"].step(0, now);
    assert.deepEqual(events.map(e => [e.recipient, e.type]), [[owner.id, "missileLockOn"], ["*", "airDefenseFire"]]);
    const pending = room["simulation"]["defense"]["adPendingRollByMissileId"].get(missile.missileId)!;
    assert.equal(pending.layer, "sam");
    assert(pending.rollReadyAtMs > now);
    const reservedCooldown = room["simulation"]["participants"].simulations.get(target.id)!.adSamNextAtMs;
    now = pending.rollReadyAtMs - 1;
    room["simulation"]["missiles"].step(0, now);
    assert.equal(room["simulation"].state.missileList.length, 1);
    now++;
    room["simulation"]["missiles"].step(0, now);
    assert.equal(events.at(-1)!.type, "airDefenseIntercept");
    assert.equal(room["simulation"].state.missileList.length, 0);
    assert.equal(room["simulation"]["defense"]["adPendingRollByMissileId"].size, 0);
    assert.equal(room["simulation"]["missiles"]["missileSpawnedAt"].size, 0);
    assert.equal(room["simulation"]["participants"].simulations.get(target.id)!.adSamNextAtMs, reservedCooldown,
      "SAM reserves its cooldown at fire, not again on interception");
  }, () => 0);

  await fixture((room, events, join) => {
    join("softkill-owner"); join("softkill-target");
    const owner = room["simulation"]["findPlayer"]("softkill-owner")!;
    const target = room["simulation"]["findPlayer"]("softkill-target")!;
    owner.x = -1800; owner.z = -2400;
    target.x = -1800; target.z = -1800; target.headingRad = 0;
    const missile = { missileId: 0, ownerId: "", targetId: "", x: 0, z: 0, headingRad: 0 };
    Object.assign(missile, { missileId: 92, ownerId: owner.id, x: -1800, z: -1950, headingRad: 0 });
    room["simulation"].state.missileList.push(missile);
    room["simulation"]["missiles"]["missileSpawnedAt"].set(92, now - 2000);
    room["simulation"]["missiles"].step(0, now);
    assert.deepEqual(events.slice(0, 2), [
      { recipient: owner.id, type: "missileLockOn", payload: {} },
      { recipient: target.id, type: "softkillResult", payload: { success: true } },
    ]);
    assert.equal(missile.targetId, "");
    assert(room["simulation"]["defense"]["adSoftkillAttemptedMissileDefender"].has(`92|${target.id}`));
    assert.equal(room["simulation"]["defense"]["aswmSoftkillReacquireBlockByMissileId"].get(92)!.untilMs, now + 4500);
    now += 50;
    room["simulation"]["missiles"].step(0, now);
    assert.equal(missile.targetId, "", "successful softkill must suppress immediate reacquisition");
    assert.equal(events.filter(e => e.type === "softkillResult").length, 1);
    room["simulation"]["missiles"]["removeMissileAt"](0, 92);
    assert.equal(room["simulation"]["defense"]["adSoftkillAttemptedMissileDefender"].size, 0);
    assert.equal(room["simulation"]["defense"]["aswmSoftkillReacquireBlockByMissileId"].size, 0);
  }, () => 0);
} finally {
  // Only direct files in this test-created directory can be removed.
  for (const name of readdirSync(dataDir)) unlinkSync(path.join(dataDir, name));
  rmdirSync(dataDir);
}
console.log("room timing, combat/life, reload, event and match-result characterization ok");
