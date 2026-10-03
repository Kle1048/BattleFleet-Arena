import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const directory = mkdtempSync(path.join(tmpdir(), "bfa-release-info-"));
process.env.BFA_DATA_DIR = directory;
delete process.env.BFA_BOT_POLICY_PATH; delete process.env.BFA_BOT_POLICY_PATHS;
const { publicReleaseInfo, sanitizeBuildInfo } = await import("./releaseInfo.js");
const { updateAdminConfig } = await import("../adminConfig.js");
const { storageLifecycle } = await import("./storageServices.js");
try {
  const before = publicReleaseInfo();
  const afterSame = publicReleaseInfo();
  assert.deepEqual(before, afterSame);
  await updateAdminConfig({ maintenanceMode: true });
  const after = publicReleaseInfo();
  assert.equal(after.configRevision, before.configRevision + 1);
  assert.notEqual(after.configHash, before.configHash);
  assert.deepEqual(Object.keys(after).sort(), ["bots", "build", "configHash", "configRevision"]);
  assert.deepEqual(after.bots, { strategy: "decision-tree", artifactHashes: [] });
  const clean = sanitizeBuildInfo({ id: "release-1", revision: "a".repeat(40), sourceHash: "b".repeat(64), dirty: false, token: "SECRET" });
  assert(!JSON.stringify(clean).includes("SECRET"));
  assert.equal(sanitizeBuildInfo({ id: "<secret>" }).id, "unknown");
} finally {
  await storageLifecycle.close();
  for (const file of readdirSync(directory)) unlinkSync(path.join(directory, file));
  rmdirSync(directory);
}
console.log("public version allowlist, config revision/hash and unknown-build fallback ok");
