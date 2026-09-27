import assert from "node:assert/strict";
import { getAuthoritativeShipHullProfile } from "../shipProfiles";
import { shipLocalToWorldXZ, spawnAswmFromFixedLauncher, ASWM_SPAWN_FROM_RAIL } from "../aswm";
import { listPrimaryArtilleryMountConfigs } from "../shipVisualLayout";

// Approved content revision, separate from the unchanged simulation/refactoring contract.
// Local +Z is bow: the new forward gun and aft defense sockets affect gameplay origins.
const profile = getAuthoritativeShipHullProfile("fac")!;
assert.equal(profile.hullGltfId, "gepard");
assert.equal(profile.defaultLoadout?.main_fwd, "visual_artillery");
assert.equal(profile.defaultLoadout?.ciws_aft, "visual_pdms");
assert.deepEqual(profile.aswmMagazine, { port: 2, starboard: 2 });
assert.equal(profile.aswmMagicReloadMs, 20_000);
const gun = listPrimaryArtilleryMountConfigs(profile, Math.PI)[0]!;
assert.equal(gun.socket.z, 17.25);
assert.equal(profile.mountSlots?.find(slot => slot.id === "ciws_aft")?.socket.position.z, -23.35);
const rails = profile.fixedSeaSkimmerLaunchers!;
assert.equal(rails.length, 2);
assert.deepEqual(rails.map(rail => [rail.side, rail.visualId, rail.socket.position.x, rail.socket.position.z]),
  [["port", "visual_ssm", 0, -18.2], ["starboard", "visual_ssm", 0, -10.6]]);
for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
  for (const rail of rails) {
    const pose = spawnAswmFromFixedLauncher(100, 200, heading, rail);
    const socket = shipLocalToWorldXZ(100, 200, heading, rail.socket.position.x, rail.socket.position.z);
    const expectedYaw = heading + (rail.side === "port" ? -Math.PI / 4 : Math.PI / 4);
    assert.equal(pose.headingRad, expectedYaw);
    assert(Math.abs(pose.x - socket.x - Math.sin(expectedYaw) * ASWM_SPAWN_FROM_RAIL) < 1e-9);
    assert(Math.abs(pose.z - socket.z - Math.cos(expectedYaw) * ASWM_SPAWN_FROM_RAIL) < 1e-9);
  }
}
console.log("Approved Gepard content: semantic weapons/ammunition retained, new gun and rail origins explicit");
