import {
  SHIP_CLASS_CRUISER,
  SHIP_CLASS_DESTROYER,
  SHIP_CLASS_FAC,
  type ShipClassId,
  normalizeShipClassId,
} from "./shipClass";
import type { ShipHullVisualProfile } from "./shipVisualLayout";
import facJson from "./data/ships/fac.json";
import destroyerJson from "./data/ships/destroyer.json";
import cruiserJson from "./data/ships/cruiser.json";

/** JSON-Profile pro Schiffsklasse — gleiche Faktoren wie zuvor `ShipClassProfile` + Movement. */
export const SHIP_HULL_PROFILE_BY_CLASS: Record<ShipClassId, ShipHullVisualProfile> = {
  [SHIP_CLASS_FAC]: facJson as ShipHullVisualProfile,
  [SHIP_CLASS_DESTROYER]: destroyerJson as ShipHullVisualProfile,
  [SHIP_CLASS_CRUISER]: cruiserJson as ShipHullVisualProfile,
};

export function getShipHullProfileByClass(shipClass: unknown): ShipHullVisualProfile | undefined {
  const id = normalizeShipClassId(shipClass);
  return SHIP_HULL_PROFILE_BY_CLASS[id];
}

/**
 * Tieft kopieren der Basis und Überschreiben mit Patch (z. B. Client-localStorage-Overrides).
 * Arrays (`mountSlots`, `fixedSeaSkimmerLaunchers`) werden bei gesetztem Patch **ersetzt**, nicht zusammengeführt.
 */
export function mergeShipHullVisualProfile(
  base: ShipHullVisualProfile,
  patch: Partial<ShipHullVisualProfile> | null | undefined,
): ShipHullVisualProfile {
  if (!patch) return base;
  const movement =
    patch.movement !== undefined
      ? { ...(base.movement ?? {}), ...patch.movement }
      : base.movement;
  return {
    ...base,
    ...patch,
    movement,
    mountSlots: patch.mountSlots ?? base.mountSlots,
    fixedSeaSkimmerLaunchers: patch.fixedSeaSkimmerLaunchers ?? base.fixedSeaSkimmerLaunchers,
    defaultLoadout:
      patch.defaultLoadout !== undefined
        ? { ...base.defaultLoadout, ...patch.defaultLoadout }
        : base.defaultLoadout,
    defaultRotatingMountFireSector:
      patch.defaultRotatingMountFireSector ?? base.defaultRotatingMountFireSector,
    collisionHitbox: patch.collisionHitbox ?? base.collisionHitbox,
  };
}
