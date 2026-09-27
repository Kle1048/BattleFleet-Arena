import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { JsonConfigRepository } from "./jsonConfigRepository.js";
import { JsonLeaderboardRepository } from "./jsonLeaderboardRepository.js";
import { AtomicJsonFile, type JsonFileIO } from "./atomicJsonFile.js";
import { ConfigService } from "../application/ConfigService.js";
import { defaultConfig } from "../application/configValues.js";
import type { MatchResult } from "./ports.js";

const directory = await fs.mkdtemp(path.join(tmpdir(), "bfa-async-storage-"));
const location = (name: string) => path.join(directory, name + ".json");
const result = (id: string): MatchResult => ({ matchId: id, completedAtMs: 100,
  rows: [{ playerKey: "private-key", displayName: "Alpha", kills: 2, score: 10, xp: 5, won: true }] });
try {
  const configPath = location("config");
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { entered = resolve; });
  const io: JsonFileIO = { ...fs, rename: async (source, target) => {
    if (target === configPath && !release) {
      entered(); await new Promise<void>(resolve => { release = resolve; });
    }
    await fs.rename(source, target);
  } };
  const configRepo = new JsonConfigRepository(configPath, defaultConfig(), io);
  const config = new ConfigService(configRepo);
  await config.initialize();
  const first = config.patch({ minRoomPlayers: 3 });
  const second = config.patch({ passiveXpBase: 9 });
  await gate;
  assert.equal(config.snapshot().config.minRoomPlayers, 10, "uncommitted writes must not reach rules");
  assert.equal(config.snapshot().revision, 0);
  let turns = 0;
  for (let i = 0; i < 5; i++) await new Promise<void>(resolve => setTimeout(() => { turns++; resolve(); }, 0));
  assert.equal(turns, 5, "slow disk yields the event loop");
  release(); await first; await second;
  assert.equal(config.snapshot().config.minRoomPlayers, 3);
  assert.equal(config.snapshot().config.passiveXpBase, 9);
  assert.equal(config.snapshot().revision, 2);
  await assert.rejects(config.patch({ passiveXpBase: 8 }, 0), /revision/);
  assert.equal(config.snapshot().revision, 2);
  const concurrent = await Promise.allSettled([config.patch({ passiveXpBase: 11 }, 2), config.patch({ passiveXpBase: 12 }, 2)]);
  assert.deepEqual(concurrent.map(value => value.status), ["fulfilled", "rejected"]);
  assert.equal(config.snapshot().config.passiveXpBase, 11);

  const boardPath = location("board");
  const board = new JsonLeaderboardRepository(boardPath);
  await board.load();
  const owned = result("match-1");
  const record = board.recordMatch(owned);
  (owned.rows[0] as { score: number }).score = 999;
  await record;
  assert.equal(board.top()[0]!.scoreTotal, 10);
  const rows = board.top(); rows[0]!.scoreTotal = -10;
  assert.equal(board.top()[0]!.scoreTotal, 10, "query DTOs cannot mutate committed data");
  const restarted = new JsonLeaderboardRepository(boardPath); await restarted.load();
  assert.equal((await restarted.recordMatch(result("match-1"))).duplicate, true);
  assert.equal(restarted.top()[0]!.matches, 1, "restart preserves deduplication");
  const record2 = restarted.recordMatch(result("match-2"));
  // Reset is conditional on the revision it will observe in this ordered prefix.
  const reset = restarted.reset(2);
  const record3 = restarted.recordMatch(result("match-3"));
  await Promise.all([record2, reset, record3]);
  assert.equal(restarted.top()[0]!.matches, 1);
  assert.equal(restarted.revision(), 4);
  await restarted.recordMatch(result("match-2"));
  assert.equal(restarted.top()[0]!.matches, 1, "reset preserves tombstones");
  await assert.rejects(restarted.reset(2), /revision/);

  // Simulated low-level failures must preserve primary bytes and published values.
  for (const operation of ["open", "write", "sync", "rename", "read"] as const) {
    const target = location("failure-" + operation);
    const initial = new JsonConfigRepository(target, defaultConfig()); await initial.load();
    await initial.patch({ passiveXpBase: 7 });
    const before = await fs.readFile(target, "utf8");
    let armed = false;
    const failure = () => { throw Object.assign(new Error("injected disk fault"), { code: "EIO" }); };
    const failingIO: JsonFileIO = { ...fs,
      readFile: ((...args: Parameters<typeof fs.readFile>) => armed && operation === "read" ? failure() : fs.readFile(...args)) as typeof fs.readFile,
      rename: async (source, destination) => {
        if (armed && operation === "rename" && destination === target) failure();
        await fs.rename(source, destination);
      },
      open: async (...args: Parameters<typeof fs.open>) => {
        const writing = args[1] === "wx";
        if (armed && operation === "open" && writing) failure();
        const handle = await fs.open(...args);
        if (armed && writing && (operation === "write" || operation === "sync")) {
          handle[operation === "write" ? "writeFile" : "sync"] = failure;
        }
        return handle;
      },
    };
    const failing = new JsonConfigRepository(target, defaultConfig(), failingIO);
    const service = new ConfigService(failing);
    if (operation === "read") { armed = true; await assert.rejects(service.initialize(), /injected/); }
    else {
      await service.initialize(); armed = true;
      await assert.rejects(service.patch({ passiveXpBase: 8 }), /injected/);
      assert.equal(service.snapshot().config.passiveXpBase, 7);
    }
    assert.equal(await fs.readFile(target, "utf8"), before);
  }

  // Bounded retry occupies the FIFO slot until success/failure; reset cannot pass it.
  let attempts = 0;
  const retryPath = location("retry");
  const retryBoard = new JsonLeaderboardRepository(retryPath, { ...fs, rename: async (a, b) => {
    if (b === retryPath && ++attempts <= 2) throw new Error("temporary rename failure");
    await fs.rename(a, b);
  } }, 0);
  await retryBoard.load();
  await Promise.all([retryBoard.recordMatch(result("retry-match")), retryBoard.reset(1)]);
  assert.equal(attempts, 4); assert.equal(retryBoard.size(), 0);
  const exhausted = new JsonLeaderboardRepository(location("exhausted"), { ...fs, rename: async () => { throw new Error("permanent"); } }, 0);
  await exhausted.load();
  await assert.rejects(exhausted.recordMatch(result("failed-match")), /permanent/);
  assert.equal(exhausted.size(), 0); assert.equal(exhausted.revision(), 0);

  const legacy = location("legacy");
  const legacyRaw = JSON.stringify({ matchDurationSec: 120, minRoomPlayers: 4 });
  await fs.writeFile(legacy, legacyRaw);
  const migrated = new JsonConfigRepository(legacy, defaultConfig()); await migrated.load();
  assert.equal(await fs.readFile(legacy + ".migration.bak", "utf8"), legacyRaw);
  assert.equal(JSON.parse(await fs.readFile(legacy, "utf8")).version, 1);
  await migrated.patch({ minRoomPlayers: 8 });
  const preserved = await migrated.file.restore("migration");
  assert(preserved); assert.equal(JSON.parse(await fs.readFile(preserved, "utf8")).config.minRoomPlayers, 8);
  assert.equal(await fs.readFile(legacy, "utf8"), legacyRaw);
  const restored = new JsonConfigRepository(legacy, defaultConfig());
  assert.equal((await restored.load()).config.minRoomPlayers, 4);

  const legacyBoard = location("legacy-board");
  const originalBoard = JSON.stringify({ version: 1, rows: board.top() });
  await fs.writeFile(legacyBoard, originalBoard);
  const migratedBoard = new JsonLeaderboardRepository(legacyBoard); await migratedBoard.load();
  assert.deepEqual(migratedBoard.top(), board.top());
  assert.equal(await fs.readFile(legacyBoard + ".migration.bak", "utf8"), originalBoard);

  for (const [name, raw] of [["corrupt", "{incomplete"], ["unknown", '{"version":999}'], ["bad-field", '{"version":1,"rows":[{}]}']]) {
    const target = location(name!); await fs.writeFile(target, raw!);
    await assert.rejects(new JsonLeaderboardRepository(target).load());
    assert.equal(await fs.readFile(target, "utf8"), raw);
  }
  const missing = location("missing"); await fs.writeFile(missing + ".partial.tmp", "{incomplete");
  await assert.rejects(new JsonLeaderboardRepository(missing).load(), /recovery/);
  await fs.writeFile(boardPath + ".partial.tmp", "{incomplete");
  const withOrphan = new JsonLeaderboardRepository(boardPath); await withOrphan.load();
  assert.equal(withOrphan.file.snapshot().orphanCount, 1);
  assert.equal(withOrphan.size(), 1, "valid primary wins, orphan is never promoted");
  await fs.writeFile(boardPath + ".bak", "bad backup");
  const primary = await fs.readFile(boardPath, "utf8");
  await assert.rejects(withOrphan.file.restore("previous"), /validation/);
  assert.equal(await fs.readFile(boardPath, "utf8"), primary);

  const tiny = new AtomicJsonFile(location("tiny"), { empty: () => ({}), decode: value => ({ value, migrated: false }) }, fs, 20);
  await tiny.load(); await assert.rejects(tiny.save({ excessive: "x".repeat(100) }), /size limit/);
} finally {
  // This test owns only direct files in its freshly created directory.
  for (const name of await fs.readdir(directory)) await fs.unlink(path.join(directory, name));
  await fs.rmdir(directory);
}
console.log("async committed snapshots, revision races, durable dedup/reset, I/O failures, retry, migration and offline restore ok");
