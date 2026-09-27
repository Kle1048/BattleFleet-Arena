import assert from "node:assert/strict";
import { getAuthoritativeShipHullProfile } from "../shipProfiles";
import { shipLocalToWorldXZ, spawnAswmFromFixedLauncher } from "../aswm";
import { listPrimaryArtilleryMountConfigs } from "../shipVisualLayout";

// Approved content revision, separate from the unchanged simulation/refactoring contract.
// Local +Z is bow: the new forward gun and aft defense sockets affect gameplay origins.
const profile = getAuthoritativeShipHullProfile("fac")!;
assert.equal(profile.hullGltfId, "gepard");
assert.deepEqual(profile.defaultLoadout?.main_fwd, { weaponId: "artillery", modelId: "gepard_artillery" });
assert.deepEqual(profile.defaultLoadout?.ciws_aft, { weaponId: "pdms", modelId: "gepard_pdms" });
assert.deepEqual(profile.aswmMagazine, { port: 2, starboard: 2 });
assert.equal(profile.aswmMagicReloadMs, 20_000);
const gun = listPrimaryArtilleryMountConfigs(profile, Math.PI)[0]!;
const scale = 60.016 / 57.6;
assert(Math.abs(gun.socket.z - 17.25 * scale) < 1e-5);
assert(Math.abs(profile.mountSlots.find(slot => slot.id === "ciws_aft")!.socket.position.z - (-23.35 * scale)) < 1e-5);
const rails = profile.fixedSeaSkimmerLaunchers!;
assert.equal(rails.length, 2);
assert.deepEqual(rails.map(rail => [rail.side, rail.equipment?.weaponId, rail.equipment?.modelId]),
  [["port", "ssm", "gepard_exocet"], ["starboard", "ssm", "gepard_exocet"]]);
for (const [i, z] of [-18.2, -10.6].entries()) assert(Math.abs(rails[i].socket.position.z - z * scale) < 1e-5);
for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
  for (const rail of rails) {
    const pose = spawnAswmFromFixedLauncher(100, 200, heading, rail);
    const socket = shipLocalToWorldXZ(100, 200, heading, rail.socket.position.x, rail.socket.position.z);
    const expectedYaw = heading + (rail.side === "port" ? -Math.PI / 4 : Math.PI / 4);
    assert(Math.abs(pose.headingRad - expectedYaw) < 1e-7);
    // Approved model muzzle: 2.72 author metres along the Exocet rail, 1.43 m above its foot.
    assert(Math.abs(pose.x - socket.x - Math.sin(expectedYaw) * 2.72 * scale) < 1e-5);
    assert(Math.abs(pose.z - socket.z - Math.cos(expectedYaw) * 2.72 * scale) < 1e-5);
    assert(Math.abs(pose.y - rail.socket.position.y - 1.43 * scale) < 1e-5);
  }
}
console.log("Approved Gepard content: semantic weapons/ammunition retained, new gun and rail origins explicit");
