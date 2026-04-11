import {
  SHIP_CLASS_CRUISER,
  SHIP_CLASS_DESTROYER,
  SHIP_CLASS_FAC,
  getShipHullProfileByClass,
  mergeShipHullVisualProfile,
  normalizeShipClassId,
  type ShipClassId,
  type ShipHullVisualProfile,
} from "@battlefleet/shared";
import { resolveShipHullGltfUrl } from "./hullGltfUrls";

const STORAGE_PATCH = "battlefleet_ship_profile_patch_v1";
const STORAGE_HITBOX = "battlefleet_show_ship_hitbox";

export type HullProfilePatchMap = Partial<Record<ShipClassId, Partial<ShipHullVisualProfile>>>;

export function loadHullProfilePatch(): HullProfilePatchMap {
  try {
    const raw = localStorage.getItem(STORAGE_PATCH);
    if (!raw) return {};
    return JSON.parse(raw) as HullProfilePatchMap;
  } catch {
    return {};
  }
}

export function saveHullProfilePatch(map: HullProfilePatchMap): void {
  localStorage.setItem(STORAGE_PATCH, JSON.stringify(map));
}

export function setHullProfilePatchForClass(
  shipClass: ShipClassId,
  patch: Partial<ShipHullVisualProfile> | null,
): void {
  const all = { ...loadHullProfilePatch() };
  if (patch === null || Object.keys(patch).length === 0) {
    delete all[shipClass];
  } else {
    all[shipClass] = patch;
  }
  saveHullProfilePatch(all);
}

/** Basis-JSON + optionaler Client-Patch (localStorage). */
export function getEffectiveHullProfile(shipClass: unknown): ShipHullVisualProfile | undefined {
  const base = getShipHullProfileByClass(shipClass);
  if (!base) return undefined;
  const id = normalizeShipClassId(shipClass);
  const patch = loadHullProfilePatch()[id];
  return mergeShipHullVisualProfile(base, patch);
}

export function resolveShipHullGltfUrlForClass(shipClass: ShipClassId): string {
  const p = getEffectiveHullProfile(shipClass);
  const id = p?.hullGltfId ?? "s143a";
  return resolveShipHullGltfUrl(id);
}

export function uniqueHullGltfUrlsForAllClasses(): string[] {
  const urls = [
    resolveShipHullGltfUrlForClass(SHIP_CLASS_FAC),
    resolveShipHullGltfUrlForClass(SHIP_CLASS_DESTROYER),
    resolveShipHullGltfUrlForClass(SHIP_CLASS_CRUISER),
  ];
  return [...new Set(urls)];
}

/** Hitbox-Drahtrahmen: default an, `"0"` = aus. */
export function isShipHitboxDebugVisible(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(STORAGE_HITBOX) !== "0";
}

export function setShipHitboxDebugVisible(visible: boolean): void {
  localStorage.setItem(STORAGE_HITBOX, visible ? "1" : "0");
}
