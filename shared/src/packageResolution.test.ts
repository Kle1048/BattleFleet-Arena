import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as compatibility from "@battlefleet/shared";
import * as rules from "@battlefleet/shared/rules";
import * as schema from "@battlefleet/shared/protocol/schema";

// Dev/tests must never consume the potentially stale production bundle.
// Resolve only: this check also works on a fresh checkout without dist/.
for (const entry of ["", "/rules", "/protocol", "/protocol/schema"]) {
  for (const [flags, directory, extension] of [
    [["--conditions=bfa-source"], "src", "ts"],
    [[], "dist", "js"],
  ] as const) {
    const tail = entry === "" ? "/index" : entry === "/protocol/schema" ? entry : `${entry}/index`;
    const expectedPath = `/shared/${directory}${tail}.${extension}`;
    const result = spawnSync(process.execPath, [
      ...flags,
      "--input-type=module",
      "-e",
      `console.log(import.meta.resolve('@battlefleet/shared${entry}'))`,
    ], { encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    assert.ok(result.stdout.trim().endsWith(expectedPath), result.stdout);
  }
}

// A separate schema entry must not register a second set of schema constructors.
assert.equal(compatibility.BattleState, schema.BattleState);
assert.equal(compatibility.PlayerState, schema.PlayerState);
assert.equal(compatibility.getAuthoritativeShipHullProfile, rules.getAuthoritativeShipHullProfile);
assert(!("BattleState" in rules));

console.log("shared package resolution tests ok");
