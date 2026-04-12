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

/** Vermeidet pro Frame localStorage + JSON.parse (Hot Path: `getShipDebugTuningForVisualClass` × Spieler). */
let hullProfilePatchCache: HullProfilePatchMap | null = null;

/** Gemergte Profile pro Klasse — ungültig bei Patch-Änderung. */
const effectiveHullProfileByClass = new Map<ShipClassId, ShipHullVisualProfile>();

export function loadHullProfilePatch(): HullProfilePatchMap {
  if (hullProfilePatchCache !== null) return hullProfilePatchCache;
  try {
    const raw = localStorage.getItem(STORAGE_PATCH);
    hullProfilePatchCache = raw ? (JSON.parse(raw) as HullProfilePatchMap) : {};
    return hullProfilePatchCache;
  } catch {
    hullProfilePatchCache = {};
    return hullProfilePatchCache;
  }
}

export function saveHullProfilePatch(map: HullProfilePatchMap): void {
  localStorage.setItem(STORAGE_PATCH, JSON.stringify(map));
  hullProfilePatchCache = map;
  effectiveHullProfileByClass.clear();
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

/** Basis-JSON + optionaler Client-Patch (localStorage). Gecacht — bei Patch-Änderung siehe `saveHullProfilePatch`. */
export function getEffectiveHullProfile(shipClass: unknown): ShipHullVisualProfile | undefined {
  const base = getShipHullProfileByClass(shipClass);
  if (!base) return undefined;
  const id = normalizeShipClassId(shipClass);
  const hit = effectiveHullProfileByClass.get(id);
  if (hit) return hit;
  const patch = loadHullProfilePatch()[id];
  const merged = mergeShipHullVisualProfile(base, patch);
  effectiveHullProfileByClass.set(id, merged);
  return merged;
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
