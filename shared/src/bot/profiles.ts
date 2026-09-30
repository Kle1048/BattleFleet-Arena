import type { BotIntent, PerceptionSnapshot, BotMemory } from "./types";
import { isInSeaControlZone } from "../seaControl";

export const BOT_PROFILES = ["standard", "aggressive", "cautious", "objective"] as const;
export type BotProfile = typeof BOT_PROFILES[number];
/** Planner semantics changed; v1 personality weights must not silently run as v2. */
export const PROFILE_CONTROLLER_VERSION = "balanced-v2.1";
export const profileControllerVersion = (profile: BotProfile) =>
  profile === "objective" ? "balanced-v2.2-objective" : PROFILE_CONTROLLER_VERSION;
export function botProfile(value: unknown): BotProfile {
  if (value === undefined) return "standard";
  if (!BOT_PROFILES.includes(value as BotProfile)) throw new Error("Unknown bot profile");
  return value as BotProfile;
}

/** Doctrine constraints apply equally in training and gameplay, after network inference. */
export function profileIntent(intent: BotIntent, s: PerceptionSnapshot, memory: BotMemory): BotIntent {
  if (!s.profile || s.profile === "standard") return intent;
  const incoming = s.self.adHudIncomingAswm > 0 || s.missiles.some(m =>
    Math.hypot(m.x - s.self.x, m.z - s.self.z) <= 240);
  if (s.profile === "objective" && Math.max(Math.abs(s.self.x), Math.abs(s.self.z)) > 500 &&
      !incoming && intent !== "RETREAT" && intent !== "TAKE_COVER") return "SEEK_SEA_CONTROL";
  const healthyAndUnthreatened = s.self.hp / Math.max(1, s.self.maxHp) >= 0.6 && !s.enemies.length && !incoming;
  if (healthyAndUnthreatened && (!isInSeaControlZone(s.self.x, s.self.z) ||
      intent === "RETREAT" || intent === "TAKE_COVER" || intent === "EVADE_MISSILES")) return "SEEK_SEA_CONTROL";
  // Safety decisions outrank pursuit or the common mission.
  if (intent === "RETREAT" || intent === "EVADE_MISSILES" || intent === "TAKE_COVER") return intent;
  if (s.profile === "aggressive" && !s.enemies.length && memory.pursuit &&
      s.timestamp - memory.pursuit.at < 30000) return "CHASE";
  // All personalities share the mission when there is no current combat contact.
  if (!s.enemies.length && !s.esmBearings?.length) return "SEEK_SEA_CONTROL";
  return intent;
}
