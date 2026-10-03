import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildInfo } from "./build-info.mjs";
const root = mkdtempSync(path.join(tmpdir(), "bfa-build-id-"));
try {
  for (const dir of ["client/src", "client/public", "server/src", "shared/src", "scripts/fixtures"]) mkdirSync(path.join(root,dir), { recursive: true });
  for (const file of ["package.json", "package-lock.json", "client/package.json", "server/package.json", "shared/package.json",
    "client/index.html", "client/manual.html", "client/editor.html", "client/island-polygon-editor.html",
    "client/tsconfig.json", "server/tsconfig.json", "shared/tsconfig.json", "client/vite.config.ts",
    "scripts/fixtures/combat-baseline.json"]) writeFileSync(path.join(root,file), "{}");
  const env = { BFA_BUILD_REVISION: "a".repeat(40), BFA_ADMIN_TOKEN: "NEVER_EXPORT" };
  const first = buildInfo(root, env);
  assert.equal(first.revision, env.BFA_BUILD_REVISION);
  assert.equal(first.dirty, null, "archive without Git cannot prove a clean checkout");
  assert.deepEqual(first, buildInfo(root, env));
  writeFileSync(path.join(root,"client/tsconfig.json"), "{\"compilerOptions\":{}}");
  assert.notEqual(buildInfo(root, env).sourceHash, first.sourceHash);
  writeFileSync(path.join(root,"client/src/test.ts"), "changed source");
  assert.notEqual(buildInfo(root, env).sourceHash, first.sourceHash);
  assert(!JSON.stringify(buildInfo(root, env)).includes("NEVER_EXPORT"));
  assert.equal(buildInfo(root, {}).revision, "unknown");
  assert.throws(() => buildInfo(root, { BFA_BUILD_REVISION: "a branch or a token" }));
} finally { rmSync(root, { recursive: true }); }
console.log("build identity repeatability, changed-source detection, archive provenance and secret exclusion ok");
