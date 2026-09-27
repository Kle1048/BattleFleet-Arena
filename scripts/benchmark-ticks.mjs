// Synthetic headless tick benchmark; no network/encoding/browser GPU measurements.
// node --conditions=bfa-source --import tsx scripts/benchmark-ticks.mjs
import { performance } from "node:perf_hooks";
import { mkdtempSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "bfa-tick-bench-"));
process.env.BFA_DATA_DIR = dir;
const { BattleRoom } = await import("../server/src/rooms/BattleRoom.ts");
let seed = 42;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
let now = 1_800_000_000_000;
try {
  for (const count of [16, 64]) {
    const room = new BattleRoom({ nowMs: () => now, random });
    room.autoDispose = false;
    room.setPatchRate(null);
    try {
      room.onCreate();
      room.setSimulationInterval();
      for (let i = 0; i < count; i++) {
        room.simulation.join(`bench-${i}`, `Bench ${i}`);
        const p = room.simulation.state.playerList.at(i);
        const row = room.simulation.participants.simulations.get(p.id);
        row.ship.x = p.x = -1800 + (i % 8) * 450;
        row.ship.z = p.z = -1800 + Math.floor(i / 8) * 450;
      }
      const times = [];
      for (let tick = 0; tick < 500; tick++) {
        now += 50;
        // Replenish outside the measured step: stable two-missiles-per-participant load.
        while (room.simulation.state.missileList.length) {
          const index = room.simulation.state.missileList.length - 1;
          room.simulation.missiles.removeMissileAt(index, room.simulation.state.missileList.at(index).missileId);
        }
        for (let i = 0; i < count * 2; i++) {
          const owner = room.simulation.state.playerList.at(i % count);
          const missile = { missileId: 0, ownerId: "", targetId: "", x: 0, z: 0, headingRad: 0 };
          missile.missileId = tick * count * 2 + i + 1;
          missile.ownerId = owner.id;
          missile.x = owner.x + 150;
          missile.z = owner.z + 150;
          missile.headingRad = 0;
          room.simulation.state.missileList.push(missile);
          room.simulation.missiles.missileSpawnedAt.set(missile.missileId, now);
        }
        const started = performance.now();
        room.physicsStep(0.05);
        const elapsed = performance.now() - started;
        if (tick >= 100) times.push(elapsed);
      }
      times.sort((a, b) => a - b);
      console.log(JSON.stringify({ participants: count, missilesPerTick: count * 2, samples: times.length,
        medianMs: times[Math.floor(times.length * 0.5)], p95Ms: times[Math.floor(times.length * 0.95)],
        p99Ms: times[Math.floor(times.length * 0.99)] }));
    } finally {
      room.setSimulationInterval(); room.setPatchRate(null); room.clock.clear(); room.clock.stop(); room.onDispose();
    }
  }
} finally {
  rmdirSync(dir);
}
