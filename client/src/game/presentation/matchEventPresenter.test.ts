import assert from "node:assert/strict";
import { createMatchEventPresenter } from "./matchEventPresenter";
import type { AirDefenseFireRequest, AirDefenseNotice } from "./MatchPresentationEvent";
import { connectionClosedMessage, connectionErrorMessage } from "./connectionStatus";

const order: string[] = [];
const fires: AirDefenseFireRequest[] = [];
let muzzle: { x: number; y: number; z: number } | null = { x: 20, y: 15, z: 30 };
const presenter = createMatchEventPresenter({
  mySessionId: "me",
  findPlayerBySessionId: id => id === "def" ? { id, x: 10, z: 12, lifeState: "alive" } : undefined,
  artilleryFx: { onFired() {}, onImpact() {} }, missileFx: { flashImpact() {} }, torpedoFx: { flashImpact() {} },
  airDefense: {
    fire: request => { order.push("fire-fx"); fires.push(request); },
    intercept: (x, z, layer) => order.push(`intercept-fx:${x}:${z}:${layer}`),
  },
  shouldRenderArtyFiredClientVfx: () => false, isArtyWorldPointInCullRange: () => false,
  onPrimaryFireByLocalPlayer() {}, onMissileFireByLocalPlayer() {}, onTorpedoFireByLocalPlayer() {},
  onMineImpactNearLocalPlayer() {},
  getAirDefenseMuzzleSeek: () => muzzle,
  formatPlayerLabel: id => `name:${id}`,
  appendAirDefenseComms: entry => order.push(entry.text),
  onAirDefenseSound: e => order.push(`sound:${e.phase}:${e.worldX}:${e.worldZ}:${e.layer}`),
});
const notice: AirDefenseNotice = { x: 100, z: 200, layer: "sam", defenderX: 1, defenderZ: 2, defenderId: "def", missileId: 5 };
presenter.present({ type: "airDefenseFire", payload: notice });
assert.deepEqual(order.splice(0), ["LW: SAM Feuer — name:def (Ziel ASuM #5)", "sound:fire:1:2:sam", "fire-fx"]);
assert.deepEqual(fires.pop(), { layer: "sam", fromX: 1, fromZ: 2, toX: 100, toZ: 200, launchY: undefined, trackedMissileId: 5 });
presenter.present({ type: "airDefenseFire", payload: { ...notice, layer: "pd", defenderX: null, defenderZ: null, slotId: "aft_pd", fromX: 3, fromY: 4, fromZ: 5 } });
assert.deepEqual(order.splice(0), ["LW: PDMS Feuer — name:def (Ziel ASuM #5)", "sound:fire:20:30:pd", "fire-fx"]);
assert.deepEqual(fires.pop(), { layer: "pd", fromX: 20, fromZ: 30, toX: 100, toZ: 200, launchY: 15, trackedMissileId: 5 });
for (const layer of ["sam", "pd", "ciws"] as const) {
  presenter.present({ type: "airDefenseFire", payload: { ...notice, layer, slotId: "chosen", fromX: 3, fromY: 4, fromZ: 5 } });
  assert.deepEqual([fires.at(-1)!.fromX, fires.at(-1)!.launchY, fires.pop()!.fromZ], [20, 15, 30]);
}
muzzle = null;
presenter.present({ type: "airDefenseFire", payload: { ...notice, slotId: "not-loaded", fromX: 3, fromY: 4, fromZ: 5 } });
assert.deepEqual([fires.at(-1)!.fromX, fires.at(-1)!.launchY, fires.pop()!.fromZ], [3, 4, 5], "missing render asset uses server model muzzle");
presenter.present({ type: "airDefenseFire", payload: { ...notice, layer: "pd", defenderX: null } });
assert.equal(fires.pop()!.fromX, 10, "partial server origin falls back to the full read-model position");
order.length = 0;
presenter.present({ type: "airDefenseFire", payload: { ...notice, layer: "ciws" } });
assert.equal(fires.pop()!.trackedMissileId, undefined, "CIWS tracers do not track an ASuM position");
order.length = 0;
presenter.present({ type: "airDefenseFire", payload: { ...notice, defenderId: "missing", defenderX: null } });
assert.deepEqual(order, [], "no origin means no invented launch or comms notice");
presenter.present({ type: "airDefenseIntercept", payload: { ...notice, defenderId: null, missileId: null, layer: "ciws" } });
assert.deepEqual(order.splice(0), ["LW: CIWS Abfang ERFOLG — Verteidiger", "sound:intercept:100:200:ciws", "intercept-fx:100:200:ciws"]);
assert.equal(notice.x, 100, "presenter does not mirror or mutate input values");
presenter.dispose(); presenter.dispose();
presenter.present({ type: "airDefenseFire", payload: notice });
presenter.present({ type: "airDefenseIntercept", payload: notice });
assert.deepEqual(order, []);
assert.equal(connectionErrorMessage(500, "offline"), "[500] offline");
assert.equal(connectionClosedMessage(4002, "left_operational_area"), "Destroyed: left the Area of Operations. Reload the page to play again.");
assert.equal(connectionClosedMessage(1000), "Connection closed (1000). Reload the page.");
console.log("air-defense presentation order, muzzle/fallback/tracking, world coordinates and disposal ok");
