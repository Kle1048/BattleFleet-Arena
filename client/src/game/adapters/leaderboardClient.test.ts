import assert from "node:assert/strict";
import { fetchOverallLeaderboard } from "./leaderboardClient";

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "http://example.invalid/api/leaderboard?limit=10");
    assert.ok(init?.signal);
    return new Response(JSON.stringify({ rows: [null, { displayName: " <img> ", kills: 2, wins: "3" }] }));
  };
  const controller = new AbortController();
  const rows = await fetchOverallLeaderboard("http://example.invalid", controller.signal);
  assert.deepEqual(rows, [
    { displayName: "—", kills: 0, scoreTotal: 0, wins: 0, matches: 0 },
    { displayName: "<img>", kills: 2, scoreTotal: 0, wins: 0, matches: 0 },
  ]);
  let observedSignal: AbortSignal | undefined;
  globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
    observedSignal = init!.signal!;
    const abort = () => reject(observedSignal!.reason);
    if (observedSignal.aborted) abort();
    else observedSignal.addEventListener("abort", abort, { once: true });
  });
  const pending = fetchOverallLeaderboard("http://example.invalid", controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(observedSignal?.aborted, true);
  await assert.rejects(fetchOverallLeaderboard("http://example.invalid", controller.signal), { name: "AbortError" });
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  await assert.rejects(fetchOverallLeaderboard("http://example.invalid", new AbortController().signal), /HTTP 503/);
} finally { globalThis.fetch = originalFetch; }
console.log("Public leaderboard DTO normalization, fetch cancellation and HTTP failure propagation ok");
