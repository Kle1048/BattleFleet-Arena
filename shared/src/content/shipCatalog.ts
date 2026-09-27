import type { ShipClassId } from "../shipClass";
import type { ShipHullVisualProfile } from "../shipVisualLayout";
import { loadShipProfile } from "./loadShipProfile";
import fac from "../data/ships/fac.json";
import destroyer from "../data/ships/destroyer.json";
import cruiser from "../data/ships/cruiser.json";
import facSockets from "../data/ships/mountSockets/fac.json";
import destroyerSockets from "../data/ships/mountSockets/destroyer.json";
import cruiserSockets from "../data/ships/mountSockets/cruiser.json";

/** Fixed, validated catalog. Module initialization is the only validation/clone pass. */
export const SHIP_HULL_PROFILE_BY_CLASS: Readonly<Record<ShipClassId, ShipHullVisualProfile>> = Object.freeze({
  fac: loadShipProfile(fac, facSockets, "fac"),
  destroyer: loadShipProfile(destroyer, destroyerSockets, "destroyer"),
  cruiser: loadShipProfile(cruiser, cruiserSockets, "cruiser"),
});
