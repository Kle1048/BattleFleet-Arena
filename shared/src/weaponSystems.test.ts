import assert from "node:assert/strict";
import { ARTILLERY_RANGE } from "./artillery";
import { AD_PD_RANGE } from "./airDefenseRanges";
import { isWeaponSystemId, weaponSystem, type MountedWeapon } from "./weaponSystems";
import { getAuthoritativeShipHullProfile } from "./shipProfiles";
import { getPrimaryArtilleryMountSocketLocal, hullProvidesAirDefensePdLayer,
  listPrimaryArtilleryMountConfigs, listRotatingMountWeaponGuideConfigs } from "./shipVisualLayout";
import { missileBearingInHardkillLayerMountSector } from "./airDefense";

const oldGun: MountedWeapon = { weaponId: "artillery", modelId: "gepard_artillery" };
const newGun: MountedWeapon = { weaponId: "artillery", modelId: "f124_76mm" };
assert.equal(weaponSystem(oldGun.weaponId), weaponSystem(newGun.weaponId));
assert.equal(weaponSystem(newGun.weaponId).engagementRange, ARTILLERY_RANGE);
assert.equal(weaponSystem("pdms").airDefenseLayer, "pd");
assert.equal(weaponSystem("pdms").engagementRange, AD_PD_RANGE);
assert(!isWeaponSystemId("f124_76mm"));
assert(!isWeaponSystemId("constructor"));
assert(Object.isFrozen(weaponSystem("pdms")));
const original = getAuthoritativeShipHullProfile("fac")!;
const swapped = structuredClone(original);
swapped.defaultLoadout!.main_fwd.modelId = "spruance_mk45";
swapped.defaultLoadout!.ciws_aft.modelId = "cruiser_sam";
assert.deepEqual(listPrimaryArtilleryMountConfigs(swapped, Math.PI), listPrimaryArtilleryMountConfigs(original, Math.PI));
assert.deepEqual(getPrimaryArtilleryMountSocketLocal(swapped), getPrimaryArtilleryMountSocketLocal(original));
assert(hullProvidesAirDefensePdLayer(swapped));
assert.deepEqual(listRotatingMountWeaponGuideConfigs(swapped, Math.PI).map(({ modelId, ...rules }) => rules),
  listRotatingMountWeaponGuideConfigs(original, Math.PI).map(({ modelId, ...rules }) => rules));
for (const heading of [0, 1.7, -2.4]) for (const x of [-200, 0, 200]) for (const z of [-200, 100]) {
  assert.equal(missileBearingInHardkillLayerMountSector(swapped, Math.PI, "pd", 10, 20, heading, x, z),
    missileBearingInHardkillLayerMountSector(original, Math.PI, "pd", 10, 20, heading, x, z));
}
const empty = { ...original, defaultLoadout: {} };
assert.equal(getPrimaryArtilleryMountSocketLocal(empty), null);
assert.deepEqual(listPrimaryArtilleryMountConfigs(empty, Math.PI), []);
assert.deepEqual(listRotatingMountWeaponGuideConfigs(empty, Math.PI), []);
assert(!hullProvidesAirDefensePdLayer(empty));
console.log("explicit weapon-system identity independent of interchangeable model IDs ok");
