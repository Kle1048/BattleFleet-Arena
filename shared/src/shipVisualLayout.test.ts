import assert from "node:assert/strict";
import { SHIP_HULL_PROFILE_BY_CLASS } from "./shipProfiles";
import { SHIP_CLASS_DESTROYER, SHIP_CLASS_FAC, getShipClassProfile } from "./shipClass";
import {
  getPrimaryArtilleryMountSocketLocal,
  hullProvidesAirDefenseCiwsLayer,
  hullProvidesAirDefensePdLayer,
  hullProvidesAirDefenseSamLayer,
  listRotatingMountWeaponGuideConfigs,
  type ShipHullVisualProfile,
} from "./shipVisualLayout";

{
  const p: ShipHullVisualProfile = {
    profileId: "t",
    shipClassId: "fac",
    hullGltfId: "fac",
    defaultLoadout: { main: { weaponId: "artillery", modelId: "test_model" } },
    mountSlots: [
      {
        id: "ciws",
        compatibleKinds: ["ciws"],
        socket: { position: { x: 0, y: 1, z: 0 } },
      },
      {
        id: "main",
        compatibleKinds: ["artillery"],
        socket: { position: { x: 1, y: 2, z: 3 } },
      },
    ],
  };
  const s = getPrimaryArtilleryMountSocketLocal(p);
  assert.ok(s);
  assert.equal(s!.x, 1);
  assert.equal(s!.y, 2);
  assert.equal(s!.z, 3);
}

{
  assert.equal(getPrimaryArtilleryMountSocketLocal(undefined), null);
}

{
  const fac = SHIP_HULL_PROFILE_BY_CLASS[SHIP_CLASS_FAC];
  const arc = getShipClassProfile(SHIP_CLASS_FAC).artilleryArcHalfAngleRad;
  const guides = listRotatingMountWeaponGuideConfigs(fac, arc);
  assert.equal(guides.length, 2);
  assert.equal(fac.defaultLoadout?.ciws_aft.weaponId, "pdms");
  assert.equal(hullProvidesAirDefenseSamLayer(fac), false);
  assert.equal(hullProvidesAirDefensePdLayer(fac), true);
  assert.equal(hullProvidesAirDefenseCiwsLayer(fac), false);
  assert.equal(
    hullProvidesAirDefensePdLayer({
      ...fac,
      defaultLoadout: { ...fac.defaultLoadout, ciws_aft: { weaponId: "artillery", modelId: "test_model" } },
    }),
    false,
  );
}

{
  const dd = SHIP_HULL_PROFILE_BY_CLASS[SHIP_CLASS_DESTROYER];
  assert.equal(dd.defaultLoadout?.ciws_fwd.weaponId, "ciws");
  assert.equal(hullProvidesAirDefenseCiwsLayer(dd), true);
}

console.log("shipVisualLayout tests ok");
