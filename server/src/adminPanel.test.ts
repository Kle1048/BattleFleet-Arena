import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { Script } from "node:vm";
import express from "express";
import { createAdminGuard } from "./serverSecurity.js";

const dataDir = mkdtempSync(path.join(tmpdir(), "bfa-admin-auth-"));
process.env.BFA_DATA_DIR = dataDir;
const { registerAdminPanel } = await import("./adminPanel.js");
const { getAdminConfig } = await import("./adminConfig.js");
const token = randomBytes(32).toString("hex");
let restarts = 0;
const controls = {
  activeRoomSummaries: () => [],
  restartActiveRounds: () => { restarts++; return { rooms: 1, restarted: 1 }; },
};
const app = express();
registerAdminPanel(app, controls, token);
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
const auth = { authorization: `Bearer ${token}` };

try {
  assert.throws(() => createAdminGuard("weak"), /32/);
  const shell = await fetch(`${base}/admin`);
  assert.equal(shell.status, 200);
  assert.equal(shell.headers.get("cache-control"), "no-store");
  const html = await shell.text();
  assert(!html.includes(token));
  assert(!html.includes("localStorage") && !html.includes("sessionStorage"));
  const script = /<script nonce="([^"]+)">([\s\S]*?)<\/script>/.exec(html)!;
  assert(shell.headers.get("content-security-policy")?.includes(`'nonce-${script[1]}'`));
  assert(shell.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"));
  new Script(script[2]!); // Template escaping must produce valid browser JavaScript.

  const before = getAdminConfig();
  for (const [route, method, body] of [
    ["status", "GET", undefined],
    ["config", "PATCH", { matchDurationSec: 120 }],
    ["leaderboard/reset", "POST", { confirm: "RESET" }],
    ["round/restart", "POST", { confirm: "RESTART" }],
    ["future-endpoint", "POST", {}],
  ] as const) {
    for (const headers of [
      {},
      { "x-forwarded-for": "127.0.0.1", "x-forwarded-proto": "https" },
      { "x-forwarded-for": "203.0.113.10, 127.0.0.1" },
      { authorization: `Bearer ${"x".repeat(64)}` },
      { authorization: "Basic invalid", "x-admin-token": token },
      { cookie: `BFA_ADMIN_TOKEN=${token}` },
    ] as Record<string, string>[]) {
      const res = await fetch(`${base}/api/admin/${route}?token=${token}`, {
        method, headers: { "content-type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      assert.equal(res.status, 401, `${method} ${route}`);
      assert.equal(res.headers.get("cache-control"), "no-store");
      assert(!res.headers.has("access-control-allow-origin"));
      await res.arrayBuffer();
    }
  }
  assert.deepEqual(getAdminConfig(), before);
  assert.deepEqual(readdirSync(dataDir), []);
  assert.equal(restarts, 0);
  for (const origin of ["https://attacker.example", "null", `${base}.attacker.example`]) {
    const res = await fetch(`${base}/api/admin/round/restart`, {
      method: "POST", headers: { ...auth, origin, "content-type": "application/json" },
      body: JSON.stringify({ confirm: "RESTART" }),
    });
    assert.equal(res.status, 403);
    await res.arrayBuffer();
  }
  assert.equal(restarts, 0);
  for (const headers of [auth, { "x-admin-token": token }, { ...auth, origin: base }] as Record<string, string>[]) {
    const res = await fetch(`${base}/api/admin/status`, { headers });
    assert.equal(res.status, 200);
    assert((await res.json() as { config: unknown }).config);
  }
  const patch = await fetch(`${base}/api/admin/config`, {
    method: "PATCH", headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ matchDurationSec: 120 }),
  });
  assert.equal(patch.status, 200);
  await patch.arrayBuffer();
  assert.equal(JSON.parse(readFileSync(path.join(dataDir, "admin-config.json"), "utf8")).matchDurationSec, 120);
  for (const [route, confirm] of [["round/restart", "RESTART"], ["leaderboard/reset", "RESET"]]) {
    const res = await fetch(`${base}/api/admin/${route}`, {
      method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ confirm }),
    });
    assert.equal(res.status, 200);
    await res.arrayBuffer();
  }
  assert.equal(restarts, 1);
  const disabled = express();
  registerAdminPanel(disabled, controls, "");
  const disabledServer = disabled.listen(0, "127.0.0.1");
  await once(disabledServer, "listening");
  try {
    const disabledAddress = disabledServer.address();
    assert(disabledAddress && typeof disabledAddress === "object");
    const res = await fetch(`http://127.0.0.1:${disabledAddress.port}/api/admin/status`, { headers: auth });
    assert.equal(res.status, 503);
    await res.arrayBuffer();
  } finally {
    await new Promise<void>((resolve) => disabledServer.close(() => resolve()));
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true }); // Only this test's mkdtemp directory.
}
console.log("admin authentication and route boundary tests ok");
