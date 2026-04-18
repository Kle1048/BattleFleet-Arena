import {
  SHIP_CLASS_CRUISER,
  SHIP_CLASS_DESTROYER,
  SHIP_CLASS_FAC,
  getShipClassProfile,
  type ShipClassId,
  normalizeShipClassId,
} from "./shipClass";
import {
  type MountSlotDefinitionInput,
  type ShipHullVisualProfile,
  type ShipSocketTransform,
  resolveMountSlotsWithSocketRegistry,
} from "./shipVisualLayout";
import { ASWM_MAGIC_RELOAD_MS } from "./aswm";
import facJson from "./data/ships/fac.json";
import destroyerJson from "./data/ships/destroyer.json";
import cruiserJson from "./data/ships/cruiser.json";
import facMountSocketRegistry from "./data/ships/mountSockets/fac.json";
import destroyerMountSocketRegistry from "./data/ships/mountSockets/destroyer.json";
import cruiserMountSocketRegistry from "./data/ships/mountSockets/cruiser.json";

function asProfileWithMountInputs(
  raw: unknown,
): Omit<ShipHullVisualProfile, "mountSlots"> & { mountSlots: MountSlotDefinitionInput[] } {
  return raw as Omit<ShipHullVisualProfile, "mountSlots"> & { mountSlots: MountSlotDefinitionInput[] };
}

/** JSON-Profile pro Schiffsklasse — gleiche Faktoren wie zuvor `ShipClassProfile` + Movement. */
export const SHIP_HULL_PROFILE_BY_CLASS: Record<ShipClassId, ShipHullVisualProfile> = {
  [SHIP_CLASS_FAC]: (() => {
    const raw = asProfileWithMountInputs(facJson);
    return {
      ...raw,
      mountSlots: resolveMountSlotsWithSocketRegistry(
        raw.profileId,
        raw.mountSlots,
        facMountSocketRegistry as Partial<Record<string, ShipSocketTransform>>,
      ),
    };
  })(),
  [SHIP_CLASS_DESTROYER]: (() => {
    const raw = asProfileWithMountInputs(destroyerJson);
    return {
      ...raw,
      mountSlots: resolveMountSlotsWithSocketRegistry(
        raw.profileId,
        raw.mountSlots,
        destroyerMountSocketRegistry as Partial<Record<string, ShipSocketTransform>>,
      ),
    };
  })(),
  [SHIP_CLASS_CRUISER]: (() => {
    const raw = asProfileWithMountInputs(cruiserJson);
    return {
      ...raw,
      mountSlots: resolveMountSlotsWithSocketRegistry(
        raw.profileId,
        raw.mountSlots,
        cruiserMountSocketRegistry as Partial<Record<string, ShipSocketTransform>>,
      ),
    };
  })(),
};

export function getShipHullProfileByClass(shipClass: unknown): ShipHullVisualProfile | undefined {
  const id = normalizeShipClassId(shipClass);
  return SHIP_HULL_PROFILE_BY_CLASS[id];
}

/**
 * Gebündeltes Rumpfprofil für **Spiel & Server** (kein Client-Patch, keine Editor-Vorschau).
 * Semantisch identisch zu `getShipHullProfileByClass` — der Name macht die autoritative Quelle explizit.
 */
export function getAuthoritativeShipHullProfile(shipClass: unknown): ShipHullVisualProfile | undefined {
  return getShipHullProfileByClass(shipClass);
}

/**
 * Tieft kopieren der Basis und Überschreiben mit Patch (z. B. Client-localStorage-Overrides).
 * Arrays (`mountSlots`, `fixedSeaSkimmerLaunchers`) werden bei gesetztem Patch **ersetzt**, nicht zusammengeführt.
 */
/** ASuM-Runden pro Seite; ohne JSON: `aswmMaxPerOwner` gleichmäßig auf port/starboard. */
export function getAswmMagazineFromProfile(
  hull: ShipHullVisualProfile | undefined,
  shipClassId: ShipClassId,
): { port: number; starboard: number } {
  const m = hull?.aswmMagazine;
  if (m) {
    const port = Math.max(0, Math.floor(m.port ?? 0));
    const starboard = Math.max(0, Math.floor(m.starboard ?? 0));
    if (port > 0 || starboard > 0) return { port, starboard };
  }
  const n = Math.max(0, getShipClassProfile(shipClassId).aswmMaxPerOwner);
  const half = Math.floor(n / 2);
  return { port: half, starboard: n - half };
}

/** Magic-Reload-Dauer aus Rumpf-JSON; sonst globaler Default. */
export function getAswmMagicReloadMsFromProfile(hull: ShipHullVisualProfile | undefined): number {
  const v = hull?.aswmMagicReloadMs;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.round(v);
  return ASWM_MAGIC_RELOAD_MS;
}

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
    aswmMagazine: patch.aswmMagazine ?? base.aswmMagazine,
    aswmMagicReloadMs: patch.aswmMagicReloadMs ?? base.aswmMagicReloadMs,
    defaultLoadout:
      patch.defaultLoadout !== undefined
        ? { ...base.defaultLoadout, ...patch.defaultLoadout }
        : base.defaultLoadout,
    defaultRotatingMountFireSector:
      patch.defaultRotatingMountFireSector ?? base.defaultRotatingMountFireSector,
    collisionHitbox: patch.collisionHitbox ?? base.collisionHitbox,
    clientVisualTuningDefaults:
      patch.clientVisualTuningDefaults !== undefined
        ? { ...base.clientVisualTuningDefaults, ...patch.clientVisualTuningDefaults }
        : base.clientVisualTuningDefaults,
  };
}
