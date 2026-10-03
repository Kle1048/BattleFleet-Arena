import assert from "node:assert/strict";
import { diagnosticReport, safeFeedbackUrl } from "./betaDiagnostics";
const digest = "a".repeat(64);
const report = diagnosticReport({ id: "abc123-dirty", revision: "a".repeat(40), sourceHash: digest, dirty: true, token: "SECRET" },
  { build: { id: "release-1", sourceHash: digest, token: "SECRET" }, configRevision: 3, configHash: digest,
    adminToken: "SECRET", roomState: { players: ["PRIVATE"] }, bots: { strategy: "learned-roster", artifactHashes: [digest, "secret-path"], paths: ["PRIVATE"] } },
  { roomId: "room-1", fps: 59.8, pingMs: 20.1 }, { userAgent: "Test browser", width: 1280, height: 720, dpr: 2 });
assert.equal(report.fps, 60); assert.equal(report.pingMs, 20); assert.equal(report.server.configRevision, 3);
assert.deepEqual(report.server.botArtifactHashes, [digest]);
assert(!/SECRET|PRIVATE|secret-path|adminToken|roomState/.test(JSON.stringify(report)));
const absent = diagnosticReport(null, { build: { id: "<script>" }, configRevision: -1 },
  { roomId: null, fps: NaN, pingMs: Infinity }, { userAgent: "x".repeat(1000), width: 0, height: 0, dpr: NaN });
assert.equal(absent.server.id, null); assert.equal(absent.server.configRevision, null);
assert.equal(absent.fps, null); assert.equal(absent.pingMs, null); assert.equal(absent.browser.userAgent.length, 300);
for (const bad of ["javascript:alert(1)", "http://example.com", "https://token:secret@example.com", "", undefined]) assert.equal(safeFeedbackUrl(bad), undefined);
assert.equal(safeFeedbackUrl("https://example.com/feedback"), "https://example.com/feedback");
console.log("beta diagnostics allowlist, missing fields, bounded metrics and safe feedback URLs ok");
