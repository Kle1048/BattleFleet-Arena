import type {
  FixedSeaSkimmerLauncherSpec,
  MountSlotDefinition,
  ShipMountLoadout,
} from "./shipVisualLayout";

export class ShipProfileJsonParseError extends Error {
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = "ShipProfileJsonParseError";
    this.field = field;
  }
}

export function parseMountSlotsJson(text: string, field = "mountSlots"): MountSlotDefinition[] {
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
  return v as MountSlotDefinition[];
}

export function parseFixedSeaSkimmerLaunchersJson(
  text: string,
  field = "fixedSeaSkimmerLaunchers",
): FixedSeaSkimmerLauncherSpec[] {
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
  return v as FixedSeaSkimmerLauncherSpec[];
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
  return v as ShipMountLoadout;
}
