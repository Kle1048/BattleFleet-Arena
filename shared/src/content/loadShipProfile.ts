import type { ShipClassId } from "../shipClass";
import { resolveMountSlotsWithSocketRegistry, type MountSlotDefinitionInput,
  type ShipHullVisualProfile, type ShipSocketTransform } from "../shipVisualLayout";

type ObjectValue = Record<string, unknown>;
function fail(path: string, reason: string): never {
  throw new Error("Invalid ship content at " + path + ": " + reason);
}
function object(value: unknown, path: string): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "expected object");
  return value as ObjectValue;
}
function text(value: unknown, path: string): void {
  if (typeof value !== "string" || value.trim().length === 0) fail(path, "expected nonempty string");
}
function number(value: unknown, path: string, minimum = -Infinity): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    fail(path, "expected finite number >= " + minimum);
  }
}
function optionalNumbers(value: ObjectValue, names: readonly string[], path: string, minimum = -Infinity): void {
  for (const name of names) if (value[name] !== undefined) number(value[name], path + "." + name, minimum);
}
function vector(value: unknown, path: string, minimum = -Infinity): void {
  const v = object(value, path);
  for (const axis of ["x", "y", "z"]) number(v[axis], path + "." + axis, minimum);
}
function socket(value: unknown, path: string): void {
  const v = object(value, path);
  vector(v.position, path + ".position");
  if (v.eulerRad !== undefined) vector(v.eulerRad, path + ".eulerRad");
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "expected array");
  return value;
}
function sector(value: unknown, path: string, depth = 0): void {
  if (depth > 16) fail(path, "sector nesting exceeds 16 levels");
  const s = object(value, path);
  switch (s.kind) {
    case "symmetric":
      number(s.halfAngleRadFromBow, path + ".halfAngleRadFromBow", 0);
      if ((s.halfAngleRadFromBow as number) > Math.PI) fail(path, "half angle exceeds PI");
      optionalNumbers(s, ["centerYawRadFromBow"], path);
      return;
    case "asymmetric":
      number(s.minYawRadFromBow, path + ".minYawRadFromBow");
      number(s.maxYawRadFromBow, path + ".maxYawRadFromBow");
      // Signed ranges can wrap across the stern: min > max is not itself invalid.
      return;
    case "union": {
      const parts = array(s.sectors, path + ".sectors");
      if (parts.length === 0) fail(path, "union needs a sector");
      parts.forEach((part, i) => sector(part, path + ".sectors[" + i + "]", depth + 1));
      return;
    }
    default: fail(path, "unknown sector kind");
  }
}
function uniqueId(value: unknown, ids: Set<string>, path: string): string {
  text(value, path);
  const id = value as string;
  if (ids.has(id)) fail(path, "duplicate ID " + id);
  ids.add(id);
  return id;
}
function freezeTree<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Validate bundled authoring data once, before exposing it to rules or rendering.
 * This is not a client-patch importer: authoritative defaults and local preview patches stay separate.
 */
export function loadShipProfile(raw: unknown, rawSockets: unknown, expectedClass: ShipClassId): ShipHullVisualProfile {
  const path = "ships." + expectedClass;
  const p = object(raw, path);
  text(p.profileId, path + ".profileId"); text(p.hullGltfId, path + ".hullGltfId");
  if (p.shipClassId !== expectedClass) fail(path + ".shipClassId", "does not match catalog class");
  if (p.labelDe !== undefined) text(p.labelDe, path + ".labelDe");
  optionalNumbers(p, ["hullVisualScale", "aswmMagicReloadMs"], path, Number.MIN_VALUE);
  if (p.collisionHitbox !== undefined) {
    const hitbox = object(p.collisionHitbox, path + ".collisionHitbox");
    vector(hitbox.center, path + ".collisionHitbox.center");
    vector(hitbox.halfExtents, path + ".collisionHitbox.halfExtents", 0);
  }
  if (p.movement !== undefined) {
    optionalNumbers(object(p.movement, path + ".movement"),
      ["movementSpeedMul", "turnRateMul", "accelMul", "rudderResponsivenessMul", "minSpeedForFullTurnMul", "dragWhenNeutralMul"],
      path + ".movement", 0);
  }
  if (p.clientVisualTuningDefaults !== undefined) {
    const tuning = object(p.clientVisualTuningDefaults, path + ".clientVisualTuningDefaults");
    optionalNumbers(tuning, ["spriteScale"], path + ".clientVisualTuningDefaults", Number.MIN_VALUE);
    optionalNumbers(tuning, ["gltfHullYOffset", "gltfHullOffsetX", "gltfHullOffsetZ", "shipPivotLocalZ", "wakeSpawnLocalZ"],
      path + ".clientVisualTuningDefaults");
  }
  if (p.defaultRotatingMountFireSector !== undefined) sector(p.defaultRotatingMountFireSector, path + ".defaultRotatingMountFireSector");
  const registry = object(rawSockets, path + ".sockets");
  for (const [id, transform] of Object.entries(registry)) socket(transform, path + ".sockets." + id);
  const slots = array(p.mountSlots, path + ".mountSlots");
  const slotIds = new Set<string>();
  const kinds = new Set(["artillery", "ciws", "sam_launcher", "sam_fixed_rail", "pdms", "generic"]);
  slots.forEach((rawSlot, i) => {
    const slotPath = path + ".mountSlots[" + i + "]";
    const slot = object(rawSlot, slotPath);
    const id = uniqueId(slot.id, slotIds, slotPath + ".id");
    const compatible = array(slot.compatibleKinds, slotPath + ".compatibleKinds");
    if (compatible.length === 0 || compatible.some(kind => typeof kind !== "string" || !kinds.has(kind))) {
      fail(slotPath + ".compatibleKinds", "expected known mount kinds");
    }
    if (slot.socket !== undefined) socket(slot.socket, slotPath + ".socket");
    else if (!Object.hasOwn(registry, id)) fail(slotPath + ".socket", "missing inline or registry socket");
    if (slot.defaultVisualId !== undefined) text(slot.defaultVisualId, slotPath + ".defaultVisualId");
    optionalNumbers(slot, ["trainBaseYawRadFromBow"], slotPath);
    if (slot.fireSector !== undefined) sector(slot.fireSector, slotPath + ".fireSector");
  });
  if (p.fixedSeaSkimmerLaunchers !== undefined) {
    const ids = new Set<string>();
    array(p.fixedSeaSkimmerLaunchers, path + ".fixedSeaSkimmerLaunchers").forEach((rawLauncher, i) => {
      const launchPath = path + ".fixedSeaSkimmerLaunchers[" + i + "]";
      const launcher = object(rawLauncher, launchPath);
      uniqueId(launcher.id, ids, launchPath + ".id");
      if (launcher.side !== "port" && launcher.side !== "starboard" && launcher.side !== "centerline") {
        fail(launchPath + ".side", "unknown side");
      }
      socket(launcher.socket, launchPath + ".socket");
      optionalNumbers(launcher, ["launchYawRadFromBow"], launchPath);
      if (launcher.visualId !== undefined) text(launcher.visualId, launchPath + ".visualId");
    });
  }
  if (p.aswmMagazine !== undefined) {
    const magazine = object(p.aswmMagazine, path + ".aswmMagazine");
    for (const side of ["port", "starboard"]) {
      number(magazine[side], path + ".aswmMagazine." + side, 0);
      if (!Number.isSafeInteger(magazine[side])) fail(path + ".aswmMagazine." + side, "expected safe integer");
    }
  }
  if (p.defaultLoadout !== undefined) {
    for (const [id, visual] of Object.entries(object(p.defaultLoadout, path + ".defaultLoadout"))) {
      if (!slotIds.has(id)) fail(path + ".defaultLoadout." + id, "unknown mount slot");
      text(visual, path + ".defaultLoadout." + id);
    }
  }

  // Cast only after checking the complete typed surface and cross-references above.
  const profile = p as unknown as Omit<ShipHullVisualProfile, "mountSlots"> & { mountSlots: MountSlotDefinitionInput[] };
  const result: ShipHullVisualProfile = {
    ...profile,
    mountSlots: resolveMountSlotsWithSocketRegistry(profile.profileId, profile.mountSlots,
      registry as Record<string, ShipSocketTransform>),
  };
  // Own the validated data; neither JSON imports nor callers may mutate authoritative defaults.
  return freezeTree(structuredClone(result));
}
