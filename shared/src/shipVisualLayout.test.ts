import assert from "node:assert/strict";
import { SHIP_HULL_PROFILE_BY_CLASS } from "./shipProfiles";
import { SHIP_CLASS_DESTROYER, SHIP_CLASS_FAC } from "./shipClass";
import {
  getPrimaryArtilleryMountSocketLocal,
  hullProvidesAirDefenseCiwsLayer,
  hullProvidesAirDefensePdLayer,
  hullProvidesAirDefenseSamLayer,
  type ShipHullVisualProfile,
} from "./shipVisualLayout";

{
  const p: ShipHullVisualProfile = {
    profileId: "t",
    shipClassId: "fac",
    hullGltfId: "fac",
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
  assert.equal(fac.defaultLoadout?.ciws_aft, "visual_pdms");
  assert.equal(hullProvidesAirDefenseSamLayer(fac), false);
  assert.equal(hullProvidesAirDefensePdLayer(fac), true);
  assert.equal(hullProvidesAirDefenseCiwsLayer(fac), false);
  assert.equal(
    hullProvidesAirDefensePdLayer({
      ...fac,
      defaultLoadout: { ...fac.defaultLoadout, ciws_aft: "visual_artillery" },
    }),
    false,
  );
}

{
  const dd = SHIP_HULL_PROFILE_BY_CLASS[SHIP_CLASS_DESTROYER];
  assert.equal(dd.defaultLoadout?.ciws_fwd, "visual_ciws");
  assert.equal(hullProvidesAirDefenseCiwsLayer(dd), true);
}

console.log("shipVisualLayout tests ok");
