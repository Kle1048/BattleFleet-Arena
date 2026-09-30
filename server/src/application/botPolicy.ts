import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { LearnedPolicyStrategy, validatePolicyArtifact } from "@battlefleet/shared/rules";

/** Explicit, local operator setting. Loaded once; invalid configured models fail startup. */
export function loadBotPolicy(path: string | undefined): (() => LearnedPolicyStrategy) | undefined {
  if (!path) return undefined;
  const absolute = resolve(path);
  if (statSync(absolute).size > 2_000_000) throw new Error("Bot policy exceeds 2 MB");
  const artifact = validatePolicyArtifact(JSON.parse(readFileSync(absolute, "utf8")));
  return () => new LearnedPolicyStrategy(artifact);
}

export const configuredBotPolicy = loadBotPolicy(process.env.BFA_BOT_POLICY_PATH);
