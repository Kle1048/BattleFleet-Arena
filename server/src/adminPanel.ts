import type { Express, NextFunction, Request, Response } from "express";
import { getAdminConfig, updateAdminConfig } from "./adminConfig.js";
import { leaderboardSize, resetLeaderboard, topLeaderboard } from "./leaderboardStore.js";

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

function isLoopbackAddress(raw: string | undefined): boolean {
  if (!raw) return false;
  const s = raw.replace("::ffff:", "").trim();
  return s === "127.0.0.1" || s === "::1" || s === "localhost";
}

function isLocalAdminRequest(req: Request): boolean {
  const forwardedFor = req.header("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (!isLoopbackAddress(first)) return false;
  }
  return isLoopbackAddress(req.socket.remoteAddress);
}

function hasAdminToken(req: Request): boolean {
  const expected = process.env.BFA_ADMIN_TOKEN?.trim();
  if (!expected) return false;
  const auth = req.header("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const headerToken = req.header("x-admin-token")?.trim() ?? "";
  return bearer === expected || headerToken === expected;
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (isLocalAdminRequest(req) || hasAdminToken(req)) {
    next();
    return;
  }
  res.status(403).json({
    error: "Admin panel is only available from localhost or with BFA_ADMIN_TOKEN.",
  });
}

function adminStatus(controls: AdminPanelControls) {
  return {
    config: getAdminConfig(),
    leaderboard: {
      count: leaderboardSize(),
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

export function registerAdminPanel(app: Express, controls: AdminPanelControls): void {
  app.get("/admin", requireAdmin, (_req, res) => {
    res.type("html").send(adminHtml());
  });

  app.get("/api/admin/status", requireAdmin, (_req, res) => {
    res.json(adminStatus(controls));
  });

  app.patch("/api/admin/config", requireAdmin, (req, res) => {
    const body = (req.body ?? {}) as {
      matchDurationSec?: unknown;
      minRoomPlayers?: unknown;
      maintenanceMode?: unknown;
      operationalAreaHalfExtent?: unknown;
      passiveXpIntervalMs?: unknown;
      passiveXpBase?: unknown;
      seaControlXpMultiplier?: unknown;
      respawnDelayMs?: unknown;
      spawnProtectionMs?: unknown;
      samCooldownMs?: unknown;
      oobDestroyAfterMs?: unknown;
    };
    const next = updateAdminConfig({
      matchDurationSec:
        body.matchDurationSec === undefined ? undefined : Number(body.matchDurationSec),
      minRoomPlayers: body.minRoomPlayers === undefined ? undefined : Number(body.minRoomPlayers),
      maintenanceMode:
        body.maintenanceMode === undefined ? undefined : body.maintenanceMode === true,
      operationalAreaHalfExtent:
        body.operationalAreaHalfExtent === undefined
          ? undefined
          : Number(body.operationalAreaHalfExtent),
      passiveXpIntervalMs:
        body.passiveXpIntervalMs === undefined ? undefined : Number(body.passiveXpIntervalMs),
      passiveXpBase: body.passiveXpBase === undefined ? undefined : Number(body.passiveXpBase),
      seaControlXpMultiplier:
        body.seaControlXpMultiplier === undefined
          ? undefined
          : Number(body.seaControlXpMultiplier),
      respawnDelayMs: body.respawnDelayMs === undefined ? undefined : Number(body.respawnDelayMs),
      spawnProtectionMs:
        body.spawnProtectionMs === undefined ? undefined : Number(body.spawnProtectionMs),
      samCooldownMs: body.samCooldownMs === undefined ? undefined : Number(body.samCooldownMs),
      oobDestroyAfterMs:
        body.oobDestroyAfterMs === undefined ? undefined : Number(body.oobDestroyAfterMs),
    });
    res.json({ config: next });
  });

  app.post("/api/admin/leaderboard/reset", requireAdmin, (req, res) => {
    const body = (req.body ?? {}) as { confirm?: unknown };
    if (body.confirm !== "RESET") {
      res.status(400).json({ error: 'Send {"confirm":"RESET"} to reset the leaderboard.' });
      return;
    }
    resetLeaderboard();
    res.json({ ok: true, leaderboard: { count: leaderboardSize() } });
  });

  app.post("/api/admin/round/restart", requireAdmin, (req, res) => {
    const body = (req.body ?? {}) as { confirm?: unknown };
    if (body.confirm !== "RESTART") {
      res.status(400).json({ error: 'Send {"confirm":"RESTART"} to restart active rounds.' });
      return;
    }
    res.json({ ok: true, ...controls.restartActiveRounds() });
  });
}

function adminHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BattleFleet Admin</title>
  <style>
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
<script>
const $ = (id) => document.getElementById(id);

async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
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
      body: JSON.stringify({ confirm: "RESET" }),
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

refresh().catch((error) => setMessage(String(error.message || error), true));
</script>
</body>
</html>`;
}
