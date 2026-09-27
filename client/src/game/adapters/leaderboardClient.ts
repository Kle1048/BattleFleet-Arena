/** Public leaderboard read. Session cancellation and the request deadline both
 * abort fetch; neither may leave a timer/listener attached after completion. */
export async function fetchOverallLeaderboard(baseUrl: string, signal: AbortSignal) {
  const request = new AbortController();
  const abort = () => request.abort(signal.reason);
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => request.abort(), 4_000);
  try {
    const response = await fetch(`${baseUrl}/api/leaderboard?limit=10`, { signal: request.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json() as { rows?: unknown } | null;
    const rows = Array.isArray(json?.rows) ? json.rows : [];
    return rows.map((raw: unknown) => {
      const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
      return {
        displayName: typeof row.displayName === "string" && row.displayName.trim() ? row.displayName.trim() : "—",
        scoreTotal: number(row.scoreTotal), kills: number(row.kills),
        wins: number(row.wins), matches: number(row.matches),
      };
    });
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
