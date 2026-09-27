import { AD_CIWS_RANGE, AD_PD_RANGE, AD_SAM_RANGE } from "./airDefenseRanges";
import { ARTILLERY_RANGE } from "./artillery";

export type WeaponSystemId = "artillery" | "ciws" | "sam" | "pdms" | "ssm" | "torpedo";
export type MountedWeapon = { weaponId: WeaponSystemId; modelId: string };
export type WeaponSystem = {
  kind: "artillery" | "ciws" | "sam_launcher" | "pdms" | "sam_fixed_rail" | "generic";
  rotating: boolean;
  airDefenseLayer: "sam" | "pd" | "ciws" | null;
  engagementRange: number;
};

/** Gameplay identity has no model names or hull-specific visual exceptions. */
export const WEAPON_SYSTEMS: Readonly<Record<WeaponSystemId, Readonly<WeaponSystem>>> = Object.freeze({
  artillery: Object.freeze({ kind: "artillery", rotating: true, airDefenseLayer: null, engagementRange: ARTILLERY_RANGE }),
  ciws: Object.freeze({ kind: "ciws", rotating: true, airDefenseLayer: "ciws", engagementRange: AD_CIWS_RANGE }),
  sam: Object.freeze({ kind: "sam_launcher", rotating: true, airDefenseLayer: "sam", engagementRange: AD_SAM_RANGE }),
  pdms: Object.freeze({ kind: "pdms", rotating: true, airDefenseLayer: "pd", engagementRange: AD_PD_RANGE }),
  ssm: Object.freeze({ kind: "sam_fixed_rail", rotating: false, airDefenseLayer: null, engagementRange: 0 }),
  torpedo: Object.freeze({ kind: "generic", rotating: false, airDefenseLayer: null, engagementRange: 0 }),
});

export function isWeaponSystemId(value: unknown): value is WeaponSystemId {
  return typeof value === "string" && Object.hasOwn(WEAPON_SYSTEMS, value);
}

export function weaponSystem(id: WeaponSystemId): Readonly<WeaponSystem> {
  if (!isWeaponSystemId(id)) throw new Error(`Unknown weapon system: ${id}`);
  return WEAPON_SYSTEMS[id];
}
