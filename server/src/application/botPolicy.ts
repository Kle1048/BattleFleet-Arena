import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { LearnedPolicyStrategy, validatePolicyArtifact } from "@battlefleet/shared/rules";
const loadedHashes = new Map<string, string>();

/** Explicit, local operator setting. Loaded once; invalid configured models fail startup. */
export function loadBotPolicy(path: string | undefined): (() => LearnedPolicyStrategy) | undefined {
  if (!path) return undefined;
  const absolute = resolve(path);
  if (statSync(absolute).size > 2_000_000) throw new Error("Bot policy exceeds 2 MB");
  const source = readFileSync(absolute, "utf8");
  const artifact = validatePolicyArtifact(JSON.parse(source));
  loadedHashes.set(absolute, createHash("sha256").update(source).digest("hex"));
  return () => new LearnedPolicyStrategy(artifact);
}

/** Each room gets its own roster cursor; repeated paths deliberately repeat a personality. */
export function loadBotRoster(raw: string): () => (() => LearnedPolicyStrategy) {
  const paths: unknown = JSON.parse(raw);
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 16 ||
      !paths.every(path => typeof path === "string" && path.length > 0)) throw new Error("Invalid bot policy roster");
  const factories = paths.map(path => loadBotPolicy(path)!);
  return () => {
    let next = 0;
    return () => factories[next++ % factories.length]!();
  };
}

const roster = process.env.BFA_BOT_POLICY_PATHS ? loadBotRoster(process.env.BFA_BOT_POLICY_PATHS) : undefined;
const single = roster ? undefined : loadBotPolicy(process.env.BFA_BOT_POLICY_PATH);
export const createConfiguredBotPolicy = () => roster ? roster() : single;
const configuredPaths: string[] = roster ? JSON.parse(process.env.BFA_BOT_POLICY_PATHS!)
  : single ? [process.env.BFA_BOT_POLICY_PATH!] : [];
export const configuredBotIdentity = Object.freeze({
  strategy: roster ? "learned-roster" : single ? "learned-single" : "decision-tree",
  artifactHashes: Object.freeze(configuredPaths.map(file => loadedHashes.get(resolve(file))!)),
});
