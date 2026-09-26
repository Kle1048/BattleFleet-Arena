import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

// Dev/tests must never consume the potentially stale production bundle.
// Resolve only: this check also works on a fresh checkout without dist/.
for (const [flags, expectedPath] of [
  [["--conditions=bfa-source"], "/shared/src/index.ts"],
  [[], "/shared/dist/index.js"],
] as const) {
  const result = spawnSync(process.execPath, [
    ...flags,
    "--input-type=module",
    "-e",
    "console.log(import.meta.resolve('@battlefleet/shared'))",
  ], { encoding: "utf8", timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.ok(result.stdout.trim().endsWith(expectedPath), result.stdout);
}

console.log("shared package resolution tests ok");
