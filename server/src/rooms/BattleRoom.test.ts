import assert from "node:assert/strict";
import { mkdtempSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resetMagazine } from "../simulation/systems/magazine.js";
import {
  getAswmMagazineFromProfile,
  getAuthoritativeShipHullProfile,
  MATCH_PHASE_ENDED,
  MATCH_PHASE_RUNNING,
  PlayerLifeState,
  SHIP_CLASS_CRUISER,
  SHIP_CLASS_DESTROYER,
  SHIP_CLASS_FAC,
  shipClassBaseMaxHp,
} from "@battlefleet/shared";

// Isolate the room from persisted local admin settings and leaderboard data.
const dataDir = mkdtempSync(path.join(tmpdir(), "bfa-round-reset-"));
process.env.BFA_DATA_DIR = dataDir;
const { BattleRoom } = await import("./BattleRoom.js");
const facMagazine = getAswmMagazineFromProfile(
  getAuthoritativeShipHullProfile(SHIP_CLASS_FAC),
  SHIP_CLASS_FAC,
);

try {
  for (const previousClass of [SHIP_CLASS_FAC, SHIP_CLASS_DESTROYER, SHIP_CLASS_CRUISER]) {
    for (const restartMode of ["ended-match", "admin"] as const) {
      const room = new BattleRoom();
      room.autoDispose = false;
      room.setPatchRate(null);
      try {
        room.onCreate();
        room.setSimulationInterval();
        // Exercise the real participant/reset paths without a WebSocket server or wall-clock ticks.
        room["simulation"].join("reset-player", "Reset Player");
        const player = room["simulation"].state.playerList.at(0)!;
        const sim = room["simulation"]["participants"].simulations.get(player.id)!;
        player.shipClass = previousClass;
        player.level = 7;
        player.hp = 1;
        player.score = 123;
        player.kills = 2;
        resetMagazine(sim, previousClass);
        player.aswmRemainingPort = sim.aswmRemainingPort;
        player.aswmRemainingStarboard = sim.aswmRemainingStarboard;
        sim.aswmNextShotAtMs = Date.now() + 5_000;
        sim.aswmReloadUntilMs = Date.now() + 30_000;

        if (restartMode === "admin") {
          room.restartRoundFromAdmin();
        } else {
          room["simulation"].state.matchPhase = MATCH_PHASE_ENDED;
          room["simulation"].reset(Date.now());
        }

        const context = `${previousClass} -> FAC (${restartMode})`;
        assert.equal(player.shipClass, SHIP_CLASS_FAC, context);
        assert.equal(player.level, 1, context);
        assert.equal(player.hp, shipClassBaseMaxHp(SHIP_CLASS_FAC), context);
        assert.equal(player.maxHp, player.hp, context);
        assert.equal(player.lifeState, PlayerLifeState.SpawnProtected, context);
        assert.equal(room["simulation"].state.matchPhase, MATCH_PHASE_RUNNING, context);
        assert.equal(player.score, 0, context);
        assert.equal(player.kills, 0, context);
        assert.deepEqual(
          { port: sim.aswmRemainingPort, starboard: sim.aswmRemainingStarboard },
          facMagazine,
          `server magazine: ${context}`,
        );
        assert.equal(sim.aswmNextShotAtMs, 0, context);
        assert.equal(sim.aswmReloadUntilMs, 0, context);
        assert.deepEqual(
          { port: player.aswmRemainingPort, starboard: player.aswmRemainingStarboard },
          facMagazine,
          `replicated magazine must be correct before the next tick: ${context}`,
        );
      } finally {
        room.setSimulationInterval();
        room.setPatchRate(null);
        room.clock.clear();
        room.clock.stop();
        room.onDispose();
      }
    }
  }
} finally {
  rmdirSync(dataDir);
}

console.log("BattleRoom round reset tests ok");
