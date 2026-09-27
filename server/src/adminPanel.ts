import express, { type Express, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { createAdminGuard } from "./serverSecurity.js";
import { getAdminConfig, getConfigRevision, updateAdminConfig } from "./adminConfig.js";
import type { AdminConfigPatch } from "./adminConfig.js";
import { leaderboardSize, leaderboardRevision, resetLeaderboard, topLeaderboard } from "./leaderboardStore.js";
import { storageLifecycle } from "./application/storageServices.js";
import { StorageError, storageErrorCode } from "./persistence/storageErrors.js";

export type AdminPanelControls = {
  activeRoomSummaries: () => {
    roomId: string;
    clients: number;
    bots: number;
    matchPhase: string;
    matchRemainingSec: number;
  }[];
  restartActiveRounds: () => { rooms: number; restarted: number };
};

function adminStatus(controls: AdminPanelControls) {
  return {
    config: getAdminConfig(),
    configRevision: getConfigRevision(),
    storage: storageLifecycle.snapshot(),
    leaderboard: {
      count: leaderboardSize(),
      revision: leaderboardRevision(),
      rows: topLeaderboard(10).map((r) => ({
        displayName: r.displayName,
        scoreTotal: r.scoreTotal,
        kills: r.kills,
        wins: r.wins,
        matches: r.matches,
        updatedAtMs: r.updatedAtMs,
      })),
    },
    server: {
      nodeEnv: process.env.NODE_ENV ?? "development",
      uptimeSec: Math.round(process.uptime()),
      pid: process.pid,
    },
    rooms: controls.activeRoomSummaries(),
  };
}

export function registerAdminPanel(app: Express, controls: AdminPanelControls, token = process.env.BFA_ADMIN_TOKEN): void {
  const requireAdmin = createAdminGuard(token);
  app.use(["/admin", "/api/admin"], (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });
  // Only the static login shell is public; no config, status or credential is embedded.
  app.get("/admin", (_req, res) => {
    const nonce = randomBytes(18).toString("base64");
    res.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
    res.type("html").send(adminHtml(nonce));
  });
  // Protect the whole namespace, including future endpoints; authenticate before parsing bodies.
  app.use("/api/admin", requireAdmin, express.json({ limit: "16kb" }));

  app.get("/api/admin/status", (_req, res) => {
    res.json(adminStatus(controls));
  });

  app.patch("/api/admin/config", committedRoute(async (req, res) => {
    const revision = requireRevision(req, res);
    if (revision === null) return;
    const patch: AdminConfigPatch = {};
    for (const key of Object.keys(getAdminConfig()) as (keyof AdminConfigPatch)[]) {
      const value: unknown = req.body[key];
      if (value === undefined) continue;
      if (key === "maintenanceMode") {
        if (typeof value !== "boolean") { res.status(400).json({ error: "Invalid config value" }); return; }
        patch[key] = value;
      } else {
        if (typeof value !== "number" || !Number.isFinite(value)) { res.status(400).json({ error: "Invalid config value" }); return; }
        patch[key] = value;
      }
    }
    const config = await updateAdminConfig(patch, revision);
    res.json({ config, configRevision: revision + 1 });
  }));

  app.post("/api/admin/leaderboard/reset", committedRoute(async (req, res) => {
    if (req.body?.confirm !== "RESET") {
      res.status(400).json({ error: 'Send {"confirm":"RESET"} to reset the leaderboard.' });
      return;
    }
    const revision = requireRevision(req, res);
    if (revision === null) return;
    const committed = await resetLeaderboard(revision);
    res.json({ ok: true, leaderboard: { count: 0, revision: committed } });
  }));

  app.post("/api/admin/round/restart", (req, res) => {
    const body = (req.body ?? {}) as { confirm?: unknown };
    if (body.confirm !== "RESTART") {
      res.status(400).json({ error: 'Send {"confirm":"RESTART"} to restart active rounds.' });
      return;
    }
    res.json({ ok: true, ...controls.restartActiveRounds() });
  });
}

function requireRevision(req: Request, res: Response): number | null {
  const revision: unknown = req.body?.expectedRevision;
  if (typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0) return revision;
  res.status(428).json({ error: "A current expectedRevision is required; reload status before changing data." });
  return null;
}

/** Express 4 does not observe async handler rejections. Never acknowledge a failed commit. */
function committedRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response): void => {
    void handler(req, res).catch(error => {
      const conflict = error instanceof StorageError && error.code === "conflict";
      console.error("[admin-storage] request failed code=%s", storageErrorCode(error));
      res.status(conflict ? 409 : 503).json({ error: conflict
        ? "Data changed; reload status before retrying."
        : "Storage commit failed. Reload status before retrying; do not assume a disconnected request was rolled back." });
    });
  };
}

function adminHtml(nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BattleFleet Admin</title>
  <style nonce="${nonce}">
    :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; background: #07111d; color: #edf6ff; }
    body { margin: 0; padding: 24px; background: radial-gradient(circle at top, #17314c, #07111d 52%); }
    main { max-width: 960px; margin: 0 auto; display: grid; gap: 16px; }
    h1 { margin: 0 0 4px; font-size: 28px; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    p { color: #a9bdd1; line-height: 1.5; }
    section { background: rgba(8, 22, 38, 0.86); border: 1px solid rgba(142, 198, 255, 0.18); border-radius: 16px; padding: 18px; box-shadow: 0 14px 32px rgba(0,0,0,0.26); }
    label { display: grid; gap: 6px; color: #cfe4f8; font-size: 14px; }
    label.checkbox { display: flex; gap: 10px; align-items: center; min-height: 42px; }
    input { border: 1px solid rgba(142, 198, 255, 0.25); background: #081421; color: #edf6ff; border-radius: 10px; padding: 10px 12px; font: inherit; }
    input[type="checkbox"] { width: 18px; height: 18px; }
    button { border: 0; border-radius: 10px; background: #4fa3ff; color: #04101d; padding: 10px 14px; font-weight: 700; cursor: pointer; }
    button.danger { background: #ff6b6b; color: #250606; }
    button:disabled { opacity: 0.5; cursor: wait; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; align-items: end; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
    .stat { background: rgba(255,255,255,0.06); border-radius: 12px; padding: 12px; }
    .stat b { display: block; font-size: 22px; margin-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; border-bottom: 1px solid rgba(142, 198, 255, 0.12); padding: 9px 6px; }
    th { color: #9fc7ee; font-size: 13px; }
    .note { margin-top: 10px; font-size: 13px; color: #9fb4c8; }
    #message { min-height: 22px; color: #9ff0b0; }
  </style>
</head>
<body>
<main>
  <header>
    <h1>BattleFleet Server Admin</h1>
    <p>Local admin panel for quick live tuning. Match duration applies to newly created or restarted rounds; bot fill target is reconciled by active rooms.</p>
  </header>

  <section>
    <h2>Admin authentication</h2>
    <form id="loginForm" class="grid">
      <label>Admin token<input id="adminToken" type="password" autocomplete="off" required minlength="32" maxlength="256" /></label>
      <button type="submit">Connect</button>
      <button id="logout" type="button">Disconnect</button>
      <button id="refreshStatus" type="button">Refresh status</button>
    </form>
    <p>The token is kept in this tab's memory only. Use HTTPS or a local SSH tunnel. Reloading disconnects.</p>
  </section>

  <section>
    <h2>Status</h2>
    <div class="stats">
      <div class="stat"><b id="uptime">-</b><span>Uptime seconds</span></div>
      <div class="stat"><b id="leaderboardCount">-</b><span>Leaderboard rows</span></div>
      <div class="stat"><b id="activeRooms">-</b><span>Active rooms</span></div>
      <div class="stat"><b id="nodeEnv">-</b><span>Node env</span></div>
    </div>
  </section>

  <section>
    <h2>Runtime Config</h2>
    <form id="configForm" class="grid">
      <label>Match duration (seconds)
        <input id="matchDurationSec" name="matchDurationSec" type="number" min="60" max="3600" step="1" />
      </label>
      <label>Bot fill target players
        <input id="minRoomPlayers" name="minRoomPlayers" type="number" min="1" max="16" step="1" />
      </label>
      <label class="checkbox">
        <input id="maintenanceMode" name="maintenanceMode" type="checkbox" />
        Maintenance mode blocks new joins
      </label>
      <label>Map half extent (0 = auto)
        <input id="operationalAreaHalfExtent" name="operationalAreaHalfExtent" type="number" min="0" max="4800" step="100" />
      </label>
      <label>Passive XP interval (ms)
        <input id="passiveXpIntervalMs" name="passiveXpIntervalMs" type="number" min="500" max="60000" step="100" />
      </label>
      <label>Passive XP base
        <input id="passiveXpBase" name="passiveXpBase" type="number" min="0" max="100" step="0.5" />
      </label>
      <label>Sea Control XP multiplier
        <input id="seaControlXpMultiplier" name="seaControlXpMultiplier" type="number" min="1" max="20" step="0.25" />
      </label>
      <label>Respawn delay (ms)
        <input id="respawnDelayMs" name="respawnDelayMs" type="number" min="0" max="60000" step="500" />
      </label>
      <label>Spawn protection (ms)
        <input id="spawnProtectionMs" name="spawnProtectionMs" type="number" min="0" max="30000" step="500" />
      </label>
      <label>SAM cooldown (ms)
        <input id="samCooldownMs" name="samCooldownMs" type="number" min="500" max="30000" step="100" />
      </label>
      <label>Out-of-bounds destroy timer (ms)
        <input id="oobDestroyAfterMs" name="oobDestroyAfterMs" type="number" min="1000" max="60000" step="500" />
      </label>
      <button type="submit">Save config</button>
    </form>
    <div class="note">Example: target 6 means one human player gets up to five bots, depending on the server bot cap.</div>
  </section>

  <section>
    <h2>Rounds</h2>
    <button id="restartRounds" class="danger" type="button">Restart active rounds</button>
    <div class="note">Immediately resets currently active rooms without recording the interrupted round to the leaderboard.</div>
    <table>
      <thead><tr><th>Room</th><th>Clients</th><th>Bots</th><th>Phase</th><th>Remaining</th></tr></thead>
      <tbody id="roomRows"></tbody>
    </table>
  </section>

  <section>
    <h2>Leaderboard</h2>
    <button id="resetLeaderboard" class="danger" type="button">Reset leaderboard</button>
    <div class="note">Requires typing RESET in the confirmation dialog.</div>
    <table>
      <thead><tr><th>Name</th><th>Score</th><th>Kills</th><th>Wins</th><th>Matches</th></tr></thead>
      <tbody id="leaderboardRows"></tbody>
    </table>
  </section>

  <section>
    <h2>Output</h2>
    <div id="message"></div>
  </section>
</main>
<script nonce="${nonce}">
const $ = (id) => document.getElementById(id);
let adminToken = "";
let configRevision = null;
let leaderboardRevision = null;

async function requestJson(url, options = {}) {
  if (!adminToken) throw new Error("Enter the admin token and connect first.");
  const res = await fetch(url, {
    ...options,
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    headers: { ...(options.headers || {}), "content-type": "application/json", "authorization": "Bearer " + adminToken },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json;
}

function setMessage(text, isError = false) {
  $("message").textContent = text;
  $("message").style.color = isError ? "#ff9a9a" : "#9ff0b0";
}

function renderLeaderboard(rows) {
  $("leaderboardRows").innerHTML = rows.map((r) => (
    "<tr><td>" + escapeHtml(r.displayName) + "</td><td>" + r.scoreTotal + "</td><td>" + r.kills + "</td><td>" + r.wins + "</td><td>" + r.matches + "</td></tr>"
  )).join("");
}

function renderRooms(rows) {
  $("roomRows").innerHTML = rows.map((r) => (
    "<tr><td>" + escapeHtml(r.roomId) + "</td><td>" + r.clients + "</td><td>" + r.bots + "</td><td>" + escapeHtml(r.matchPhase) + "</td><td>" + r.matchRemainingSec + "s</td></tr>"
  )).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function refresh() {
  const status = await requestJson("/api/admin/status");
  configRevision = status.configRevision;
  leaderboardRevision = status.leaderboard.revision;
  $("matchDurationSec").value = status.config.matchDurationSec;
  $("minRoomPlayers").value = status.config.minRoomPlayers;
  $("maintenanceMode").checked = status.config.maintenanceMode;
  $("operationalAreaHalfExtent").value = status.config.operationalAreaHalfExtent;
  $("passiveXpIntervalMs").value = status.config.passiveXpIntervalMs;
  $("passiveXpBase").value = status.config.passiveXpBase;
  $("seaControlXpMultiplier").value = status.config.seaControlXpMultiplier;
  $("respawnDelayMs").value = status.config.respawnDelayMs;
  $("spawnProtectionMs").value = status.config.spawnProtectionMs;
  $("samCooldownMs").value = status.config.samCooldownMs;
  $("oobDestroyAfterMs").value = status.config.oobDestroyAfterMs;
  $("uptime").textContent = status.server.uptimeSec;
  $("nodeEnv").textContent = status.server.nodeEnv;
  $("leaderboardCount").textContent = status.leaderboard.count;
  $("activeRooms").textContent = status.rooms.length;
  renderRooms(status.rooms);
  renderLeaderboard(status.leaderboard.rows);
}

$("configForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await requestJson("/api/admin/config", {
      method: "PATCH",
      body: JSON.stringify({
        expectedRevision: configRevision,
        matchDurationSec: Number($("matchDurationSec").value),
        minRoomPlayers: Number($("minRoomPlayers").value),
        maintenanceMode: $("maintenanceMode").checked,
        operationalAreaHalfExtent: Number($("operationalAreaHalfExtent").value),
        passiveXpIntervalMs: Number($("passiveXpIntervalMs").value),
        passiveXpBase: Number($("passiveXpBase").value),
        seaControlXpMultiplier: Number($("seaControlXpMultiplier").value),
        respawnDelayMs: Number($("respawnDelayMs").value),
        spawnProtectionMs: Number($("spawnProtectionMs").value),
        samCooldownMs: Number($("samCooldownMs").value),
        oobDestroyAfterMs: Number($("oobDestroyAfterMs").value),
      }),
    });
    setMessage("Config saved.");
    await refresh();
  } catch (error) {
    setMessage(String(error.message || error), true);
  }
});

$("resetLeaderboard").addEventListener("click", async () => {
  if (prompt("Type RESET to clear the leaderboard") !== "RESET") return;
  try {
    await requestJson("/api/admin/leaderboard/reset", {
      method: "POST",
      body: JSON.stringify({ confirm: "RESET", expectedRevision: leaderboardRevision }),
    });
    setMessage("Leaderboard reset.");
    await refresh();
  } catch (error) {
    setMessage(String(error.message || error), true);
  }
});

$("restartRounds").addEventListener("click", async () => {
  if (prompt("Type RESTART to reset all active rounds") !== "RESTART") return;
  try {
    const result = await requestJson("/api/admin/round/restart", {
      method: "POST",
      body: JSON.stringify({ confirm: "RESTART" }),
    });
    setMessage("Restarted " + result.restarted + " active round(s).");
    await refresh();
  } catch (error) {
    setMessage(String(error.message || error), true);
  }
});

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  adminToken = $("adminToken").value.trim();
  $("adminToken").value = "";
  try {
    await refresh();
    setMessage("Connected.");
  } catch (error) {
    adminToken = "";
    setMessage(String(error.message || error), true);
  }
});
$("logout").addEventListener("click", () => {
  adminToken = "";
  location.reload();
});
$("refreshStatus").addEventListener("click", async () => {
  try { await refresh(); setMessage("Status refreshed. Review values before retrying a change."); }
  catch (error) { setMessage(String(error.message || error), true); }
});
</script>
</body>
</html>`;
}
