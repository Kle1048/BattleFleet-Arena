import assert from "node:assert/strict";
import { seaControlZoneHudTransition } from "./seaControlZoneHud";

assert.deepEqual(seaControlZoneHudTransition(null, true), { next: true, edge: null });
assert.deepEqual(seaControlZoneHudTransition(null, false), { next: false, edge: null });

assert.deepEqual(seaControlZoneHudTransition(true, true), { next: true, edge: null });
assert.deepEqual(seaControlZoneHudTransition(false, false), { next: false, edge: null });

assert.deepEqual(seaControlZoneHudTransition(false, true), { next: true, edge: "enter" });
assert.deepEqual(seaControlZoneHudTransition(true, false), { next: false, edge: "leave" });

console.log("seaControlZoneHud tests ok");
