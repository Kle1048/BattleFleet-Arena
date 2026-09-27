import assert from "node:assert/strict";
import { createHudRuntime } from "./hudRuntime";

const writes: string[] = [];
const requests: { signal: AbortSignal; resolve(value: []): void; reject(error: unknown): void }[] = [];
const hud = createHudRuntime({
  mySessionId: "me", joinedAt: 0,
  debugOverlay: { update() { writes.push("debug"); } },
  matchEndHud: {
    show() { writes.push("show"); }, hide() { writes.push("hide"); },
    setOverallLeaderboard({ status }) { writes.push(status); },
  },
  fetchOverallLeaderboard: signal => new Promise((resolve, reject) => {
    requests.push({ signal, resolve, reject });
  }),
});
const end = () => hud.updateMatchEndHud({ matchEnded: true, players: [] });
const reset = () => hud.updateMatchEndHud({ matchEnded: false, players: [] });
end(); end();
assert.deepEqual(writes, ["show", "loading"]);
assert.equal(requests.length, 1);
reset();
assert.equal(requests[0]!.signal.aborted, true);
end();
requests[0]!.resolve([]); // Old response must not overwrite the next round's loading state.
await Promise.resolve();
assert.deepEqual(writes, ["show", "loading", "hide", "show", "loading"]);
requests[1]!.resolve([]);
await Promise.resolve();
assert.equal(writes.at(-1), "ready");
reset(); end();
requests[2]!.reject(new Error("HTTP 503"));
await Promise.resolve();
assert.equal(writes.at(-1), "error");
reset(); end();
hud.dispose(); hud.dispose();
assert.equal(requests[3]!.signal.aborted, true);
const finalWrites = writes.slice();
requests[3]!.resolve([]);
await Promise.resolve();
end(); reset();
hud.updateDebugOverlay({ now: 1, roomState: {}, roomId: "test", playerCount: 0, pingMs: null,
  stateSyncCount: 0, colyseusWarn: "", fps: 0 });
assert.deepEqual(writes, finalWrites);
assert.equal(requests.length, 4);
console.log("HUD request ownership, reset/rejoin races and inert callbacks after disposal ok");
