import assert from "node:assert/strict";
import { loadShipProfile } from "./content/loadShipProfile";
import { modelSpatialMetadata } from "./content/modelMetadata";
import { mergeShipHullVisualProfile } from "./shipProfiles";
import fac from "./data/ships/fac.json";
const metadata = modelSpatialMetadata("gepard");
const profile = loadShipProfile(fac, metadata, "fac");
assert.deepEqual(profile.mountSlots[0].socket, metadata.sockets.main_fwd);
assert.throws(() => loadShipProfile({
  ...fac, mountSlots: fac.mountSlots.map(slot => ({ ...slot, socket: { position: { x: 7, y: 8, z: 9 } } })),
}, metadata, "fac"), /spatial values/);
assert.throws(() => loadShipProfile(fac, { ...metadata, sockets: {} }, "fac"), /missing model socket/);
assert.throws(() => mergeShipHullVisualProfile(profile, {
  mountSlots: [{ ...fac.mountSlots[0], socket: { position: { x: 7, y: 8, z: 9 } } }],
} as never), /spatial values/);
assert.throws(() => mergeShipHullVisualProfile(profile, { hullVisualScale: 2 } as never), /spatial values/);
assert.throws(() => loadShipProfile(fac, { ...metadata, rails: {} }, "fac"), /missing model rail/);
assert.throws(() => loadShipProfile(fac, { ...metadata, effects: {} }, "fac"), /missing wake marker/);
console.log("Model sockets are authoritative; inline/patch overrides and missing markers fail closed");
