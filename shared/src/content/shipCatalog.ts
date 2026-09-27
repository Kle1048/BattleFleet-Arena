import type { ShipClassId } from "../shipClass";
import type { ShipHullVisualProfile } from "../shipVisualLayout";
import { loadShipProfile } from "./loadShipProfile";
import fac from "../data/ships/fac.json";
import destroyer from "../data/ships/destroyer.json";
import cruiser from "../data/ships/cruiser.json";
import { modelSpatialMetadata } from "./modelMetadata";

/** Fixed, validated catalog. Module initialization is the only validation/clone pass. */
export const SHIP_HULL_PROFILE_BY_CLASS: Readonly<Record<ShipClassId, ShipHullVisualProfile>> = Object.freeze({
  fac: loadShipProfile(fac, modelSpatialMetadata(fac.hullGltfId), "fac"),
  destroyer: loadShipProfile(destroyer, modelSpatialMetadata(destroyer.hullGltfId), "destroyer"),
  cruiser: loadShipProfile(cruiser, modelSpatialMetadata(cruiser.hullGltfId), "cruiser"),
});
