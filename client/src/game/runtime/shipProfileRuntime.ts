import {
  SHIP_CLASS_CRUISER,
  SHIP_CLASS_DESTROYER,
  SHIP_CLASS_FAC,
  getAuthoritativeShipHullProfile,
  mergeShipHullVisualProfile,
  normalizeShipClassId,
  type ShipClassId,
  type ShipHullVisualProfile,
} from "@battlefleet/shared";
import { resolveShipHullGltfUrl } from "./hullGltfUrls";

const STORAGE_PATCH = "battlefleet_ship_profile_patch_v1";
const STORAGE_HITBOX = "battlefleet_show_ship_hitbox";
const STORAGE_WRECK_COLLISION = "battlefleet_show_wreck_collision";

export type HullProfilePatchMap = Partial<Record<ShipClassId, Partial<ShipHullVisualProfile>>>;

/** Vermeidet pro Frame localStorage + JSON.parse (Hot Path: `getEffectiveHullProfile` im Editor). */
let hullProfilePatchCache: HullProfilePatchMap | null = null;

/** Gemergte Profile pro Klasse — nur für `getEffectiveHullProfile` (Editor/Vorschau). */
const effectiveHullProfileByClass = new Map<ShipClassId, ShipHullVisualProfile>();

/**
 * Nur Workbench / Editor: volles Profil aus dem Formular, ohne Speichern in localStorage.
 * Überschreibt `getEffectiveHullProfile` bis `setHullProfileWorkbenchLivePreview(…, null)` oder Seitenende.
 */
const workbenchLivePreviewByClass = new Map<ShipClassId, ShipHullVisualProfile>();

/**
 * **Multiplayer / Spiel:** `getAuthoritativeShipHullProfile` — kein localStorage, keine Workbench-Vorschau.
 */
export function getAuthoritativeHullProfile(shipClass: unknown): ShipHullVisualProfile | undefined {
  return getAuthoritativeShipHullProfile(shipClass);
}

export function setHullProfileWorkbenchLivePreview(
  shipClass: ShipClassId,
  profile: ShipHullVisualProfile | null,
): void {
  const id = normalizeShipClassId(shipClass);
  if (profile === null) {
    workbenchLivePreviewByClass.delete(id);
  } else {
    workbenchLivePreviewByClass.set(id, profile);
  }
  effectiveHullProfileByClass.delete(id);
}

export function clearAllHullProfileWorkbenchLivePreviews(): void {
  workbenchLivePreviewByClass.clear();
  effectiveHullProfileByClass.clear();
}

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

/**
 * Entwurf nur für **Profil-Editor** (localStorage). Wirkt **nicht** im laufenden Spiel —
 * dort gilt ausschließlich `getAuthoritativeHullProfile`.
 */
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

/**
 * **Nur Editor / Workbench / Profil-Panel:** Basis-JSON + localStorage-Entwurf + Live-Vorschau.
 * Nicht für Match-Rendering oder Gameplay-Hilfen verwenden — siehe `getAuthoritativeHullProfile`.
 */
export function getEffectiveHullProfile(shipClass: unknown): ShipHullVisualProfile | undefined {
  const base = getAuthoritativeShipHullProfile(shipClass);
  if (!base) return undefined;
  const id = normalizeShipClassId(shipClass);
  const live = workbenchLivePreviewByClass.get(id);
  if (live !== undefined) {
    return live;
  }
  const hit = effectiveHullProfileByClass.get(id);
  if (hit) return hit;
  const patch = loadHullProfilePatch()[id];
  const merged = mergeShipHullVisualProfile(base, patch);
  effectiveHullProfileByClass.set(id, merged);
  return merged;
}

/** Spiel & Server: Rumpf-URL aus gebündeltem Profil (ohne Client-Patch). */
export function resolveShipHullGltfUrlForClass(shipClass: ShipClassId): string {
  const p = getAuthoritativeHullProfile(shipClass);
  const id = p?.hullGltfId ?? "s143a";
  return resolveShipHullGltfUrl(id);
}

/** Workbench: `hullGltfId` inkl. Editor-Patch/Vorschau. */
export function resolveShipHullGltfUrlForWorkbenchPreview(shipClass: ShipClassId): string {
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

/** Hitbox-Drahtrahmen: nur bei explizitem `"1"` an (Standard: aus). */
export function isShipHitboxDebugVisible(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(STORAGE_HITBOX) === "1";
}

export function setShipHitboxDebugVisible(visible: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_HITBOX, visible ? "1" : "0");
  } catch {
    /* Quota / private mode */
  }
}

/** Wrack-Hitbox-Drahtmodell (gleiche OBB wie Schiff–Schiff). */
export function isWreckCollisionDebugVisible(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(STORAGE_WRECK_COLLISION) === "1";
}

export function setWreckCollisionDebugVisible(visible: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_WRECK_COLLISION, visible ? "1" : "0");
  } catch {
    /* Quota / private mode */
  }
}
