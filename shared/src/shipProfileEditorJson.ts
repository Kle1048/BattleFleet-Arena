import type {
  FixedSeaSkimmerLauncherSpec,
  MountSlotDefinitionInput,
  ShipMountLoadout,
} from "./shipVisualLayout";
import { isWeaponSystemId } from "./weaponSystems";
import { modelDefinition } from "./content/models";

export class ShipProfileJsonParseError extends Error {
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = "ShipProfileJsonParseError";
    this.field = field;
  }
}

export function parseMountSlotsJson(text: string, field = "mountSlots"): MountSlotDefinitionInput[] {
  const t = text.trim();
  if (!t) return [];
  let v: unknown;
  try {
    v = JSON.parse(t);
  } catch {
    throw new ShipProfileJsonParseError(`Ungültiges JSON (${field})`, field);
  }
  if (!Array.isArray(v)) {
    throw new ShipProfileJsonParseError(`${field} muss ein JSON-Array sein`, field);
  }
  return v as MountSlotDefinitionInput[];
}

export function parseFixedSeaSkimmerLaunchersJson(
  text: string,
  field = "fixedSeaSkimmerLaunchers",
): Omit<FixedSeaSkimmerLauncherSpec, "socket">[] {
  const t = text.trim();
  if (!t) return [];
  let v: unknown;
  try {
    v = JSON.parse(t);
  } catch {
    throw new ShipProfileJsonParseError(`Ungültiges JSON (${field})`, field);
  }
  if (!Array.isArray(v)) {
    throw new ShipProfileJsonParseError(`${field} muss ein JSON-Array sein`, field);
  }
  return v as Omit<FixedSeaSkimmerLauncherSpec, "socket">[];
}

export function parseDefaultLoadoutJson(text: string, field = "defaultLoadout"): ShipMountLoadout {
  const t = text.trim();
  if (!t) return {};
  let v: unknown;
  try {
    v = JSON.parse(t);
  } catch {
    throw new ShipProfileJsonParseError(`Ungültiges JSON (${field})`, field);
  }
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new ShipProfileJsonParseError(`${field} muss ein JSON-Objekt sein`, field);
  }
  for (const [slotId, entry] of Object.entries(v)) {
    if (!/^[a-z][a-z0-9_]*$/.test(slotId) || ["constructor", "prototype"].includes(slotId) ||
        !entry || typeof entry !== "object" || Array.isArray(entry) ||
        !isWeaponSystemId(entry.weaponId) || typeof entry.modelId !== "string") {
      throw new ShipProfileJsonParseError(`${field}.${slotId}: erwartet { weaponId, modelId }`, field);
    }
    try { modelDefinition(entry.modelId, "mount"); }
    catch { throw new ShipProfileJsonParseError(`${field}.${slotId}: unbekanntes Mount-Modell`, field); }
  }
  return v as ShipMountLoadout;
}
