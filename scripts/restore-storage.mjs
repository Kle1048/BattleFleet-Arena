// Offline recovery. No HTTP endpoint, no environment-selected default target.
// node --conditions=bfa-source --import tsx scripts/restore-storage.mjs <absolute-data-dir> <config|leaderboard> <previous|migration> RESTORE
import path from "node:path";
import { AtomicJsonFile } from "../server/src/persistence/atomicJsonFile.ts";
import { configCodec } from "../server/src/persistence/jsonConfigRepository.ts";
import { leaderboardCodec } from "../server/src/persistence/jsonLeaderboardRepository.ts";
import { defaultConfig } from "../server/src/application/configValues.ts";

const [directory, store, backup, confirm, ...extra] = process.argv.slice(2);
if (!directory || !path.isAbsolute(directory) || !["config", "leaderboard"].includes(store) ||
    !["previous", "migration"].includes(backup) || confirm !== "RESTORE" || extra.length) {
  throw new Error("Stop the server first. Usage: restore-storage.mjs <absolute-data-dir> <config|leaderboard> <previous|migration> RESTORE");
}
const filename = store === "config" ? "admin-config.json" : "leaderboard.json";
const codec = store === "config" ? configCodec(defaultConfig()) : leaderboardCodec;
const preserved = await new AtomicJsonFile(path.join(directory, filename), codec).restore(backup);
console.log("Restored validated backup. Previous primary preserved at:", preserved ?? "(primary was absent)");
console.log("Start the server only after checking both stores and their desired recovery point.");
