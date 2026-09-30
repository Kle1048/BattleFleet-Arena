import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { MATCH_PASSIVE_XP_BASE, MATCH_PASSIVE_XP_INTERVAL_MS, SEA_CONTROL_XP_MULTIPLIER } from "@battlefleet/shared/rules";

const root = fileURLToPath(new URL("../", import.meta.url));
const profile = process.argv[2] ?? "standard";
if (!["standard", "aggressive", "cautious", "objective", "mixed"].includes(profile)) throw new Error("Unknown local bot profile");
const personalityPath = (name: string) => resolve(root,
  `training/runs/personality-${name}-balanced${name === "objective" ? "-final" : ""}/policy.json`);
delete process.env.BFA_BOT_POLICY_PATHS;
if (profile === "mixed") {
  delete process.env.BFA_BOT_POLICY_PATH;
  process.env.BFA_BOT_POLICY_PATHS = JSON.stringify(["objective", "aggressive", "aggressive", "cautious"].map(personalityPath));
} else {
  process.env.BFA_BOT_POLICY_PATH = profile === "standard"
    ? resolve(root, "training/runs/tactics-v2-sensors/policy.json") : personalityPath(profile);
}
const participants = profile === "mixed" ? 5 : 3;
process.env.BFA_DATA_DIR = resolve(root, "training/runs/local-play/server-data");
process.env.BFA_MIN_ROOM_PLAYERS = String(participants);
process.env.LISTEN_HOST = "127.0.0.1";
process.env.PORT = "2567";
process.env.BFA_ALLOWED_ORIGINS = "http://127.0.0.1:5173,http://localhost:5173";
delete process.env.BFA_ADMIN_TOKEN;

// Validate the model before touching this test session's isolated configuration.
await import("../server/src/application/botPolicy.js");
const { configService } = await import("../server/src/application/storageServices.js");
await configService.patch({
  minRoomPlayers: participants, islandsEnabled: false, maintenanceMode: false,
  operationalAreaHalfExtent: 1200, matchDurationSec: 300,
  passiveXpBase: MATCH_PASSIVE_XP_BASE,
  passiveXpIntervalMs: MATCH_PASSIVE_XP_INTERVAL_MS,
  seaControlXpMultiplier: SEA_CONTROL_XP_MULTIPLIER,
});
console.log(`[local-play] Trained ${profile} model; radar/ESM restrictions; one human + ${participants - 1} bots; 5-minute rounds.`);
await import("../server/src/index.js");
