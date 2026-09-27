// Local-only production-server soak: 11 automated WS clients + 5 real server bots.
// Build first, then run separately from browser measurements/builds/tests:
// node scripts/benchmark-live.mjs
// No live configuration is read or changed. Temporary result storage is retained.
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

const summarize = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = fraction => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
  return { count: sorted.length, p50: at(.5), p95: at(.95), max: sorted.at(-1) ?? null };
};

if (process.argv[2] === "--server") {
  if (!process.send || process.env.LISTEN_HOST !== "127.0.0.1") throw new Error("IPC/loopback-only diagnostic child");
  const histogram = monitorEventLoopDelay({ resolution: 10 }); histogram.enable();
  let lastCpu = process.cpuUsage(), lastAt = performance.now();
  const { BattleRoom } = await import("../server/dist/rooms/BattleRoom.js");
  const { storageLifecycle } = await import("../server/dist/application/storageServices.js");
  await import("../server/dist/index.js");
  process.on("message", message => {
    if (message.type === "stop") { histogram.disable(); process.emit("SIGTERM"); return; }
    if (message.type !== "sample") return;
    const now = performance.now(), cpu = process.cpuUsage(lastCpu);
    lastCpu = process.cpuUsage();
    const cpuPercentOneCore = (cpu.user + cpu.system) / ((now - lastAt) * 10); lastAt = now;
    // Only requested between rounds; never force GC inside a timed round.
    if (message.gc) global.gc?.();
    process.send({ type: "sample", id: message.id, rooms: BattleRoom.activeRoomSummaries(),
      memory: process.memoryUsage(), forcedGc: !!message.gc,
      eventLoopMs: { p95: histogram.percentile(95) / 1e6, max: histogram.max / 1e6 },
      cpuPercentOneCore, storage: storageLifecycle.snapshot() });
    histogram.reset();
  });
  process.on("disconnect", () => process.emit("SIGTERM"));
} else {
  if (process.argv.length !== 2) throw new Error("No CLI options supported");
  const directory = await mkdtemp(path.join(tmpdir(), "bfa-live-bench-"));
  // Reserve a free loopback port, then release immediately before spawning.
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = fork(fileURLToPath(import.meta.url), ["--server"], {
    execArgv: ["--expose-gc"], windowsHide: true, silent: true,
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), LISTEN_HOST: "127.0.0.1",
      BFA_DATA_DIR: directory, BFA_ADMIN_TOKEN: "", BFA_DEBUG_SHIP_SWITCH: "0", BFA_LOG_COMMS: "0",
      BFA_MIN_ROOM_PLAYERS: "16", BFA_MAX_ROOMS: "1", BFA_MATCH_DURATION_SEC: "60", BFA_ALLOWED_ORIGINS: "" },
  });
  const childExit = new Promise(resolve => child.once("exit", (code, signal) => resolve({ code, signal })));
  const logs = [];
  const keepLog = chunk => { logs.push(String(chunk)); if (logs.length > 80) logs.shift(); };
  child.stdout.on("data", keepLog); child.stderr.on("data", keepLog);
  const pending = new Map(); let nextId = 0;
  child.on("message", message => { const done = pending.get(message.id); if (done) { pending.delete(message.id); done(message); } });
  const sample = async (gc = false) => {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error("Diagnostic child timeout")); }, 5000);
      pending.set(id, value => { clearTimeout(timeout); resolve(value); });
      child.send({ type: "sample", id, gc });
    });
  };
  const clients = [], errors = [], rounds = [], samples = [], events = {}, rtts = [], patchIntervals = [];
  let inputTimer, pingTimer, plannedLeave = false, sentInputs = 0, patchCount = 0, previousPatch;
  try {
    const endpoint = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error("Server failed: " + logs.join(""));
      try { const response = await fetch(endpoint + "/api/leaderboard"); ready = response.ok; } catch {}
      if (ready) break; await delay(100);
    }
    assert(ready, "server startup deadline");
    const { Client } = await import("colyseus.js");
    const { createBotController } = await import("@battlefleet/shared/rules");
    const join = async (index, roomId) => {
      const transport = new Client(endpoint);
      const room = roomId ? await transport.joinById(roomId, { displayName: `Load ${index}` })
        : await transport.create("battle", { displayName: `Load ${index}` });
      const brain = createBotController({ wallNow: Date.now, monotonicNow: () => performance.now() }); brain.enable();
      room.onError((code, message) => errors.push({ code, message }));
      room.onLeave(code => { if (!plannedLeave) errors.push({ unexpectedLeave: index, code }); });
      room.onMessage("*", (type, payload) => {
        if (index !== 0) return;
        events[type] = (events[type] ?? 0) + 1;
        if (type === "pong" && rtts.length < 500) rtts.push(performance.now() - payload.clientTime);
      });
      room.onStateChange(() => {
        if (index !== 0) return;
        const now = performance.now(); patchCount++;
        if (previousPatch !== undefined && patchIntervals.length < 10000) patchIntervals.push(now - previousPatch);
        previousPatch = now;
      });
      const result = { room, brain }; clients.push(result); return result;
    };
    const first = await join(0);
    for (let i = 1; i < 11; i++) { await delay(250); await join(i, first.room.roomId); }
    inputTimer = setInterval(() => {
      for (const { room, brain } of clients) {
        const state = room.state; if (!state?.playerList?.length || state.matchPhase !== "running") continue;
        const input = brain.update(Date.now(), state.playerList, room.sessionId, state.missileList,
          state.torpedoList, state.operationalAreaHalfExtent, state.islandsEnabled);
        if (!input) continue;
        room.send("input", { throttle: input.throttle, rudderInput: input.rudderInput,
          aimX: input.aimWorldX, aimZ: input.aimWorldZ, primaryFire: input.primaryFire,
          secondaryFire: input.secondaryFire, torpedoFire: input.torpedoFire, radarActive: input.radarActive });
        sentInputs++;
      }
    }, 50);
    pingTimer = setInterval(() => first.room.send("ping", { clientTime: performance.now() }), 1000);
    const started = performance.now(); let lastSample = -5000, endedHandled = false;
    while (rounds.length < 3 && performance.now() - started < 205000) {
      await delay(100);
      if (errors.length) throw new Error(JSON.stringify(errors));
      if (performance.now() - started - lastSample >= 5000) {
        lastSample = performance.now() - started;
        const value = await sample(); samples.push(value);
        console.log(JSON.stringify({ progressSec: Math.round(lastSample / 1000), rooms: value.rooms,
          eventLoopP95Ms: value.eventLoopMs.p95 }));
      }
      if (first.room.state.matchPhase !== "ended") { endedHandled = false; continue; }
      if (endedHandled) continue; endedHandled = true;
      await delay(150); // All clients receive the final patch before agreement check.
      const expected = JSON.stringify(first.room.state.playerList.toJSON());
      assert(clients.every(({ room }) => room.state.matchPhase === "ended" && JSON.stringify(room.state.playerList.toJSON()) === expected), "all 11 clients agree on final player state");
      const end = await sample(true);
      assert.equal(first.room.state.playerList.length, 16);
      assert.equal(end.rooms[0].bots, 5);
      rounds.push({ round: rounds.length + 1, events: { ...events }, end,
        players: first.room.state.playerList.map(p => ({ shipClass: p.shipClass, kills: p.kills, score: p.score })) });
      console.log(JSON.stringify({ roundCompleted: rounds.length, heapAfterGc: end.memory.heapUsed }));
      if (rounds.length < 3) {
        if (rounds.length === 1) {
          plannedLeave = true; const last = clients.pop(); last.brain.disable(); await last.room.leave();
          await join(10, first.room.roomId); plannedLeave = false;
        }
        first.room.send("playAgain");
        for (let i = 0; i < 50 && first.room.state.matchPhase === "ended"; i++) await delay(100);
        assert.equal(first.room.state.matchPhase, "running", "round restarts through the public message handler");
      }
    }
    assert.equal(rounds.length, 3, "three naturally ended 60-second rounds");
    clearInterval(inputTimer); clearInterval(pingTimer); plannedLeave = true;
    for (const client of clients) { client.brain.disable(); await client.room.leave(); }
    clients.length = 0; await delay(1000);
    const afterLeave = await sample(true); assert.equal(afterLeave.rooms.length, 0, "empty room disposed");
    console.log("RESULT " + JSON.stringify({ scenario: "11-ws-autopilots-5-server-bots", production: true,
      dataDirectory: directory, sentInputs, patchCount, pingMs: summarize(rtts), patchIntervalMs: summarize(patchIntervals),
      rounds, samples, afterLeave, errors,
      limitations: ["loopback only", "same-machine server and 11 client brains", "no browser rendering in this run",
        "live RNG, not a golden replay", "tick metrics exclude message handlers and encoding", "forced GC only at round ends", "3 minutes is not a long-duration soak"] }));
  } catch (error) {
    console.error(logs.join("")); throw error;
  } finally {
    clearInterval(inputTimer); clearInterval(pingTimer); plannedLeave = true;
    for (const client of clients) { client.brain.disable(); await client.room.leave().catch(() => {}); }
    if (child.connected) child.send({ type: "stop" });
    const stopped = await Promise.race([childExit, delay(12000).then(() => null)]);
    if (!stopped) { child.kill(); throw new Error("Diagnostic server did not shut down cleanly"); }
    if (stopped.code !== 0) throw new Error("Diagnostic server shutdown failed: " + JSON.stringify(stopped));
  }
}
