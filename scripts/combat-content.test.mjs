import assert from "node:assert/strict";
import { fingerprintCombatContent, readCombatContent } from "./combat-content.mjs";
const source = readCombatContent(), baseline = fingerprintCombatContent(source);
const changed = edit => { const copy = structuredClone(source); edit(copy); return fingerprintCombatContent(copy); };
assert.equal(Object.keys(baseline).length, 5);
for (const id of ["fac", "destroyer", "cruiser"]) {
  assert.notDeepEqual(changed(c => { c.ships[id].aswmMagicReloadMs++; }), baseline);
  assert.notDeepEqual(changed(c => { c.ships[id].futureRule = 17; }), baseline);
  assert.deepEqual(changed(c => { c.ships[id].labelDe = "Visual label"; }), baseline);
}
assert.notDeepEqual(changed(c => { c.models.gepard_artillery.yaw = false; }), baseline);
assert.notDeepEqual(changed(c => { c.spatial.gepard.sockets.main_fwd.position.z++; }), baseline);
assert.notDeepEqual(changed(c => { c.spatial.gepard_artillery.effects.muzzle.position.z++; }), baseline);
assert.notDeepEqual(changed(c => { c.spatial.gepard.futureSpatialRule = 17; }), baseline);
assert.deepEqual(changed(c => { for (const m of Object.values(c.spatial)) m.sourceSha256 = "texture-only-export"; }), baseline);
assert.deepEqual(changed(c => { c.models = Object.fromEntries(Object.entries(c.models).reverse()); }), baseline);
console.log("Combat fingerprints: all classes, model identity, spatial markers and new fields guarded; labels/binary-only exports ignored");
