import assert from "node:assert/strict";
import { createHudRuntime } from "./hudRuntime";

const writes: string[] = [];
const originalFetch = globalThis.fetch;
let requests = 0;
globalThis.fetch = async () => { requests++; throw new Error("Round results must not fetch an overall leaderboard"); };
const hud = createHudRuntime({
  mySessionId: "me", joinedAt: 0,
  debugOverlay: { update() { writes.push("debug"); } },
  matchEndHud: {
    show(rows, myId) {
      writes.push("show");
      assert.equal(myId, "me");
      assert.deepEqual(rows.map(r => r.sessionId), ["a", "me", "b", "c"]);
      assert.deepEqual(rows.at(-1), { sessionId: "c", displayName: "", shipClass: "—", level: 1, score: 0, kills: 0 });
    },
    hide() { writes.push("hide"); },
  },
});
const players = [
  { id: "b", score: 20, kills: 1 }, { id: "me", score: 20, kills: 2 },
  { id: "a", score: 20, kills: 2 }, { id: "c" },
];
const end = () => hud.updateMatchEndHud({ matchEnded: true, players });
const reset = () => hud.updateMatchEndHud({ matchEnded: false, players });
try {
  reset();
  end(); end();
  assert.deepEqual(writes, ["show"], "one synchronous result rendering per round");
  reset(); reset(); end();
  assert.deepEqual(writes, ["show", "hide", "show"]);
  assert.deepEqual(players.map(p => p.id), ["b", "me", "a", "c"], "sorting does not mutate source players");
  hud.dispose(); hud.dispose();
  const finalWrites = writes.slice();
  assert.equal(finalWrites.at(-1), "hide");
  end(); reset();
  hud.updateDebugOverlay({ now: 1, roomState: {}, roomId: "test", playerCount: 0, pingMs: null,
    stateSyncCount: 0, colyseusWarn: "", fps: 0 });
  await Promise.resolve();
  assert.deepEqual(writes, finalWrites);
  assert.equal(requests, 0, "no long-term leaderboard HTTP requests at round end or restart");
} finally {
  hud.dispose(); globalThis.fetch = originalFetch;
}
console.log("Round-only scoreboard sorting, cadence, restart, disposal and absence of network requests ok");
