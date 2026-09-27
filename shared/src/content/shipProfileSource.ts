import type { FixedSeaSkimmerLauncherSpec, MountSlotDefinitionInput, ShipHullVisualProfile } from "../shipVisualLayout";

/** Authorable rules only. All spatial values are derived from the chosen model. */
export type ShipHullProfileSource = Omit<ShipHullVisualProfile, "mountSlots" | "fixedSeaSkimmerLaunchers" | "modelEffects"> & {
  mountSlots: MountSlotDefinitionInput[];
  fixedSeaSkimmerLaunchers?: Omit<FixedSeaSkimmerLauncherSpec, "socket">[];
};

export function shipProfileSource(profile: ShipHullVisualProfile): ShipHullProfileSource {
  return {
    profileId: profile.profileId, shipClassId: profile.shipClassId, hullGltfId: profile.hullGltfId,
    labelDe: profile.labelDe, collisionHitbox: profile.collisionHitbox, movement: profile.movement,
    defaultRotatingMountFireSector: profile.defaultRotatingMountFireSector,
    mountSlots: profile.mountSlots.map(({ id, compatibleKinds, fireSector }) => ({ id, compatibleKinds, fireSector })),
    fixedSeaSkimmerLaunchers: profile.fixedSeaSkimmerLaunchers?.map(({ id, side, equipment }) => ({ id, side, equipment })),
    aswmMagazine: profile.aswmMagazine, aswmMagicReloadMs: profile.aswmMagicReloadMs, defaultLoadout: profile.defaultLoadout,
  };
}
