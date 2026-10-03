import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { getAdminConfig, getConfigRevision } from "../adminConfig.js";
import { configuredBotIdentity } from "./botPolicy.js";

const unknownBuild = { id: "unknown", revision: "unknown", sourceHash: "unknown", dirty: null as boolean | null };
export function sanitizeBuildInfo(raw: unknown) {
  if (!raw || typeof raw !== "object") return { ...unknownBuild };
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || !/^[a-z0-9-]{1,100}$/.test(value.id) ||
      typeof value.revision !== "string" || !/^(unknown|[a-f0-9]{40,64})$/.test(value.revision) ||
      typeof value.sourceHash !== "string" || !/^[a-f0-9]{64}$/.test(value.sourceHash) || (value.dirty !== null && typeof value.dirty !== "boolean")) return { ...unknownBuild };
  return { id: value.id, revision: value.revision, sourceHash: value.sourceHash, dirty: value.dirty };
}
function loadBuild() {
  if (process.env.NODE_ENV !== "production") return { ...unknownBuild, id: "development" };
  try { return sanitizeBuildInfo(JSON.parse(readFileSync(new URL("../../../build-info.json", import.meta.url), "utf8"))); }
  catch { return { ...unknownBuild }; }
}
const build = loadBuild();
let cachedRevision = -1, configHash = "";
/** Explicit public DTO: no settings, paths, environment values or credentials. */
export function publicReleaseInfo() {
  const configRevision = getConfigRevision();
  if (configRevision !== cachedRevision) {
    const config = getAdminConfig();
    configHash = createHash("sha256").update(JSON.stringify(Object.entries(config).sort(([a],[b]) => a.localeCompare(b)))).digest("hex");
    cachedRevision = configRevision;
  }
  return { build: { ...build }, configRevision, configHash,
    bots: { strategy: configuredBotIdentity.strategy, artifactHashes: [...configuredBotIdentity.artifactHashes] } };
}
