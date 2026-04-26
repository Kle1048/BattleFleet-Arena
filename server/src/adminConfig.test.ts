import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "bfa-admin-config-"));
process.env.BFA_DATA_DIR = dataDir;
delete process.env.BFA_MATCH_DURATION_SEC;
delete process.env.BFA_MIN_ROOM_PLAYERS;

const {
  getAdminConfig,
  getMatchDurationMs,
  getMinRoomPlayers,
  getOobDestroyAfterMs,
  getOperationalAreaHalfExtent,
  getPassiveXpBase,
  getPassiveXpIntervalMs,
  getRespawnDelayMs,
  getSamCooldownMs,
  getSeaControlXpMultiplier,
  getSpawnProtectionMs,
  isMaintenanceMode,
  updateAdminConfig,
} = await import("./adminConfig.js");

assert.deepEqual(getAdminConfig(), {
  matchDurationSec: 300,
  minRoomPlayers: 10,
  maintenanceMode: false,
  operationalAreaHalfExtent: 0,
  passiveXpIntervalMs: 4000,
  passiveXpBase: 4,
  seaControlXpMultiplier: 5,
  respawnDelayMs: 5000,
  spawnProtectionMs: 3000,
  samCooldownMs: 3000,
  oobDestroyAfterMs: 10000,
});

assert.deepEqual(
  updateAdminConfig({
    matchDurationSec: 12,
    minRoomPlayers: 99,
    maintenanceMode: true,
    operationalAreaHalfExtent: 99999,
    passiveXpIntervalMs: 1,
    passiveXpBase: 999,
    seaControlXpMultiplier: 999,
    respawnDelayMs: -1,
    spawnProtectionMs: 99999,
    samCooldownMs: 1,
    oobDestroyAfterMs: 1,
  }),
  {
  matchDurationSec: 60,
  minRoomPlayers: 16,
    maintenanceMode: true,
    operationalAreaHalfExtent: 4800,
    passiveXpIntervalMs: 500,
    passiveXpBase: 100,
    seaControlXpMultiplier: 20,
    respawnDelayMs: 0,
    spawnProtectionMs: 30000,
    samCooldownMs: 500,
    oobDestroyAfterMs: 1000,
  },
);
assert.equal(getMatchDurationMs(), 60_000);
assert.equal(getMinRoomPlayers(), 16);
assert.equal(isMaintenanceMode(), true);
assert.equal(getOperationalAreaHalfExtent(1), 4800);
assert.equal(getPassiveXpIntervalMs(), 500);
assert.equal(getPassiveXpBase(), 100);
assert.equal(getSeaControlXpMultiplier(), 20);
assert.equal(getRespawnDelayMs(), 0);
assert.equal(getSpawnProtectionMs(), 30_000);
assert.equal(getSamCooldownMs(), 500);
assert.equal(getOobDestroyAfterMs(), 1000);

assert.deepEqual(updateAdminConfig({
  matchDurationSec: 420,
  minRoomPlayers: 4,
  maintenanceMode: false,
  operationalAreaHalfExtent: 0,
  passiveXpIntervalMs: 3500,
  passiveXpBase: 6.5,
  seaControlXpMultiplier: 3.25,
  respawnDelayMs: 4500,
  spawnProtectionMs: 2500,
  samCooldownMs: 4200,
  oobDestroyAfterMs: 8000,
}), {
  matchDurationSec: 420,
  minRoomPlayers: 4,
  maintenanceMode: false,
  operationalAreaHalfExtent: 0,
  passiveXpIntervalMs: 3500,
  passiveXpBase: 6.5,
  seaControlXpMultiplier: 3.25,
  respawnDelayMs: 4500,
  spawnProtectionMs: 2500,
  samCooldownMs: 4200,
  oobDestroyAfterMs: 8000,
});
assert.equal(getOperationalAreaHalfExtent(1), 2000);

const persisted = JSON.parse(
  readFileSync(path.join(dataDir, "admin-config.json"), "utf8"),
) as unknown;
assert.deepEqual(persisted, {
  matchDurationSec: 420,
  minRoomPlayers: 4,
  maintenanceMode: false,
  operationalAreaHalfExtent: 0,
  passiveXpIntervalMs: 3500,
  passiveXpBase: 6.5,
  seaControlXpMultiplier: 3.25,
  respawnDelayMs: 4500,
  spawnProtectionMs: 2500,
  samCooldownMs: 4200,
  oobDestroyAfterMs: 8000,
});

console.log("adminConfig tests ok");
