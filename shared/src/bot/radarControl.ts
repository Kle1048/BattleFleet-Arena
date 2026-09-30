import type { BotIntent, PerceptionSnapshot } from "./types";

/** Shared tactical EMCON policy. Quiet on passive tracks/retreat; pulse-search when blind. */
export function desiredBotRadar(snapshot: PerceptionSnapshot, intent: BotIntent): boolean {
  if (snapshot.profile === "aggressive") return true;
  if (snapshot.profile === "cautious") {
    // Briefly maintain a useful gun contact; otherwise remain mostly silent.
    const gunDefense = intent !== "RETREAT" && intent !== "TAKE_COVER" && intent !== "EVADE_MISSILES" &&
      snapshot.self.hp / Math.max(1, snapshot.self.maxHp) >= 0.4 && snapshot.enemies.some(e =>
        Math.hypot(e.x - snapshot.self.x, e.z - snapshot.self.z) <= 320);
    return gunDefense || snapshot.timestamp % 12000 < 2000;
  }
  if (intent === "RETREAT" || intent === "EVADE_MISSILES" || intent === "TAKE_COVER") return false;
  if (snapshot.enemies.length) return true;
  if (snapshot.esmBearings?.length) return false;
  // Each ship searches for 2 seconds per 8-second cycle, staggered to avoid fleet synchrony.
  let phase = 0;
  for (const ch of snapshot.self.id) phase = (phase * 31 + ch.charCodeAt(0)) >>> 0;
  return ((snapshot.timestamp + phase % 8000) % 8000 + 8000) % 8000 < 2000;
}
