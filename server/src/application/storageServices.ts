import path from "node:path";
import { defaultConfig } from "./configValues.js";
import { readMinTotalParticipantsFromEnv } from "../serverBotPopulation.js";
import { JsonConfigRepository } from "../persistence/jsonConfigRepository.js";
import { JsonLeaderboardRepository } from "../persistence/jsonLeaderboardRepository.js";
import { ConfigService } from "./ConfigService.js";
import { MatchResultService } from "./MatchResultService.js";

// Exactly one pair per process, not one queue/cache per room. Loading must finish
// before importing hosts can accept requests; corrupt stores fail startup closed.
const dataDir = process.env.BFA_DATA_DIR?.trim() || path.resolve(process.cwd(), "server-data");
const duration = Number.parseInt(process.env.BFA_MATCH_DURATION_SEC ?? "", 10);
const configRepository = new JsonConfigRepository(path.resolve(dataDir, "admin-config.json"),
  defaultConfig(Number.isFinite(duration) ? duration : undefined, readMinTotalParticipantsFromEnv()));
export const leaderboardRepository = new JsonLeaderboardRepository(path.resolve(dataDir, "leaderboard.json"));
export const configService = new ConfigService(configRepository);
export const matchResultService = new MatchResultService(leaderboardRepository);
await Promise.all([configService.initialize(), leaderboardRepository.load()]);

export const storageLifecycle = {
  async flush(timeoutMs = 5000) {
    await Promise.all([configRepository.queue.flush(timeoutMs), leaderboardRepository.queue.flush(timeoutMs)]);
  },
  async close(timeoutMs = 5000) {
    await Promise.all([configRepository.queue.close(timeoutMs), leaderboardRepository.queue.close(timeoutMs)]);
  },
  snapshot() {
    return { config: { queue: configRepository.queue.snapshot(), file: configRepository.file.snapshot() },
      leaderboard: { queue: leaderboardRepository.queue.snapshot(), file: leaderboardRepository.file.snapshot(), retries: leaderboardRepository.retryCount() },
      matches: matchResultService.snapshot() };
  },
};
