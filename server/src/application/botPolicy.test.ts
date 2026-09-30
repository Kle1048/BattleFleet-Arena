import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBotPolicy, loadBotRoster } from "./botPolicy.js";
import { POLICY_VERSION, POLICY_FEATURES, POLICY_ACTIONS, profileControllerVersion, botProfile } from "@battlefleet/shared/rules";

assert.equal(loadBotPolicy(undefined), undefined);
const directory = mkdtempSync(join(tmpdir(), "bfa-policy-test-"));
try {
  const file = join(directory, "policy.json");
  writeFileSync(file, '{"version":"unknown"}');
  assert.throws(() => loadBotPolicy(file), /contract/);
  writeFileSync(file, " ".repeat(2_000_001));
  assert.throws(() => loadBotPolicy(file), /2 MB/);
  assert.throws(() => loadBotPolicy(join(directory, "missing.json")), /ENOENT/);
  assert.throws(() => loadBotRoster("[]"), /roster/);
  assert.throws(() => loadBotRoster('[null]'), /roster/);
  const sizes = [POLICY_FEATURES.length, 64, 64, POLICY_ACTIONS.length];
  const paths: string[] = [];
  for (const profile of ["objective", "aggressive", "aggressive", "cautious"]) {
    const path = join(directory, `${profile}.json`);
    writeFileSync(path, JSON.stringify({ version: POLICY_VERSION, features: POLICY_FEATURES,
      actions: POLICY_ACTIONS, activation: "tanh", metadata: { profile, profileControllerVersion: profileControllerVersion(botProfile(profile)) },
      layers: sizes.slice(1).map((size, i) => ({ bias: Array(size).fill(0),
        weight: Array.from({ length: size }, () => Array(sizes[i]).fill(0)) })) }));
    paths.push(path);
  }
  try {
    const createRoster = loadBotRoster(JSON.stringify(paths));
    const firstRoom = createRoster(), secondRoom = createRoster();
    assert.deepEqual(Array.from({ length: 4 }, () => firstRoom().profile), ["objective", "aggressive", "aggressive", "cautious"]);
    assert.equal(secondRoom().profile, "objective", "each room starts at its first roster slot");
    assert.equal(firstRoom().profile, "objective", "roster repeats predictably");
  } finally { for (const path of new Set(paths)) rmSync(path); }
} finally { rmSync(join(directory, "policy.json")); rmdirSync(directory); }
console.log("Policy loader defaults, incompatible artifacts and size limits passed");
const releaseProfiles = ["objective", "aggressive", "aggressive", "cautious"];
const releaseRoster = loadBotRoster(JSON.stringify(releaseProfiles.map(profile =>
  fileURLToPath(new URL(`../../policies/${profile}.json`, import.meta.url)))))();
assert.deepEqual(releaseProfiles.map(() => releaseRoster().profile), releaseProfiles,
  "shipped trained models must validate against the current controller contract");
