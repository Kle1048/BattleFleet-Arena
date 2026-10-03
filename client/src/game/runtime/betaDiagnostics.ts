export type BetaContext = { roomId: string | null; pingMs: number | null; fps: number | null };
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : null;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const label = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : null;
const metric = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
export function safeFeedbackUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return;
  try { const url = new URL(value); if (url.protocol === "https:" && !url.username && !url.password) return url.href; } catch { /* unavailable */ }
}
/** Strict allowlist, including untrusted server responses. Never serialize source objects. */
export function diagnosticReport(build: unknown, server: unknown, context: BetaContext,
  browser: { userAgent: string; width: number; height: number; dpr: number }, now = new Date()) {
  const local = record(build), remote = record(server), remoteBuild = record(remote.build), bots = record(remote.bots);
  return {
    capturedAt: now.toISOString(),
    client: { id: label(local.id), revision: label(local.revision), sourceHash: hash(local.sourceHash),
      configHash: hash(local.clientConfigHash), dirty: typeof local.dirty === "boolean" ? local.dirty : null },
    server: { id: label(remoteBuild.id), revision: label(remoteBuild.revision), sourceHash: hash(remoteBuild.sourceHash),
      dirty: typeof remoteBuild.dirty === "boolean" ? remoteBuild.dirty : null,
      configRevision: Number.isSafeInteger(remote.configRevision) && Number(remote.configRevision) >= 0 ? remote.configRevision : null,
      configHash: hash(remote.configHash), botStrategy: label(bots.strategy),
      botArtifactHashes: Array.isArray(bots.artifactHashes) ? bots.artifactHashes.slice(0,16).map(hash).filter(Boolean) : [] },
    roomId: label(context.roomId), fps: metric(context.fps), pingMs: metric(context.pingMs),
    browser: { userAgent: browser.userAgent.slice(0,300), width: metric(browser.width), height: metric(browser.height),
      dpr: Number.isFinite(browser.dpr) && browser.dpr > 0 ? Math.min(browser.dpr, 10) : null },
  };
}
