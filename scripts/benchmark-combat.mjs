// Moving humans + actual bot brains + complete projectile lifetimes, without sockets/encoding.
// Run separately from tests/builds: node --conditions=bfa-source --import tsx scripts/benchmark-combat.mjs
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fingerprintCombatContent, readCombatContent } from "./combat-content.mjs";

// Explicit diagnostic mode prints a candidate, but never overwrites an expectation.
// Content changes require review and an intentional fixture edit; normal runs stay strict.
const candidate = process.argv.slice(2).includes("--candidate");
if (process.argv.slice(2).some(arg => arg !== "--candidate")) throw new Error("Only --candidate is supported");
const simulationContentSha256 = fingerprintCombatContent(readCombatContent());
const baseline = JSON.parse(readFileSync(new URL("./fixtures/combat-baseline.json", import.meta.url), "utf8"));
if (!candidate) {
  assert.equal(baseline.formatVersion, 2, "Legacy model content baseline: explicit migration required");
  assert.deepEqual(simulationContentSha256, baseline.simulationContentSha256, "Gameplay/model spatial content changed; review before replacing the reference");
}

const directory = mkdtempSync(path.join(tmpdir(), "bfa-combat-bench-"));
process.env.BFA_DATA_DIR = directory;
const { BattleRoom } = await import("../server/src/rooms/BattleRoom.ts");
const { updateAdminConfig } = await import("../server/src/adminConfig.ts");
const { defaultConfig } = await import("../server/src/application/configValues.ts");
const { storageLifecycle } = await import("../server/src/application/storageServices.ts");
await updateAdminConfig({ ...defaultConfig(300, 16), operationalAreaHalfExtent: 4000, islandsEnabled: false });
let now = 1_800_000_000_000;
let seed = 42;
const room = new BattleRoom({
  nowMs: () => now,
  random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32),
});
room.autoDispose = false;
room.setPatchRate(null);
const events = new Map();
const trace = createHash("sha256");
const record = (recipient, type, payload) => {
  events.set(type, (events.get(type) ?? 0) + 1);
  trace.update(JSON.stringify({ now, recipient, type, payload }));
};
room.broadcast = (type, payload) => record("*", type, payload);
try {
  room.onCreate();
  room.setSimulationInterval();
  for (let i = 0; i < 11; i++) {
    const id = `human-${i}`;
    const client = { sessionId: id, send: (type, payload) => record(id, type, payload) };
    // Population reconciliation reads the live transport count, independently of participants.
    room.clients.push(client);
    room.onJoin(client, { displayName: id });
  }
  for (let i = 0; i < 5; i++) room.simulation.bots.spawn();
  const initial = [...room.simulation.state.playerList];
  initial.forEach((player, i) => {
    const row = room.simulation.participants.simulations.get(player.id);
    const angle = i * Math.PI * 2 / initial.length;
    row.ship.x = player.x = -1800 + Math.sin(angle) * 240;
    row.ship.z = player.z = -1800 + Math.cos(angle) * 240;
    row.ship.headingRad = player.headingRad = angle + Math.PI;
  });
  const samples = [];
  for (let tick = 0; tick < 1200; tick++) {
    now += 50;
    // Human fire remains between physics operations, matching the current transport contract.
    for (let i = 0; i < 11; i++) {
      const target = initial[(i + 8) % initial.length];
      room.applyInputPayload(initial[i].id, {
        throttle: 0.6, rudderInput: i % 2 ? 0.2 : -0.2,
        aimX: target.x, aimZ: target.z, primaryFire: true, secondaryFire: true, radarActive: true,
      });
    }
    const started = performance.now();
    room.physicsStep(0.05);
    const elapsed = performance.now() - started;
    if (tick >= 200) samples.push(elapsed);
    if (tick % 50 === 0) trace.update(JSON.stringify(room.state.toJSON()));
  }
  trace.update(JSON.stringify(room.state.toJSON()));
  const digest = trace.digest("hex");
  if (!candidate) {
    assert.deepEqual(Object.fromEntries(events), baseline.events, "combat event counts changed");
    assert.equal(digest, baseline.traceSha256, "state/event trace changed; investigate before updating the baseline");
  }
  samples.sort((a, b) => a - b);
  console.log(JSON.stringify({ formatVersion: 2, baselineCheck: candidate ? "SKIPPED: unapproved candidate" : "passed",
    scenario: "combat-11-humans-5-bots-canonical-open-water", islandsEnabled: false, seconds: 60, samples: samples.length,
    medianMs: samples[Math.floor(samples.length * 0.5)], p95Ms: samples[Math.floor(samples.length * 0.95)],
    p99Ms: samples[Math.floor(samples.length * 0.99)], events: Object.fromEntries(events), traceSha256: digest, simulationContentSha256 }));
} finally {
  room.setSimulationInterval(); room.setPatchRate(null); room.clock.clear(); room.clock.stop(); room.onDispose();
  await storageLifecycle.close();
  for (const name of readdirSync(directory)) unlinkSync(path.join(directory, name));
  rmdirSync(directory);
}
