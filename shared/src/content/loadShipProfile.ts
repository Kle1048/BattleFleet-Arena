import type { ShipClassId } from "../shipClass";
import { isWeaponSystemId, weaponSystem, type MountedWeapon } from "../weaponSystems";
import models from "./modelCatalog.json";
import type { MountSlotDefinitionInput, FixedSeaSkimmerLauncherSpec,
  ShipHullVisualProfile, ShipSocketTransform } from "../shipVisualLayout";

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
function equipment(value: unknown, path: string): MountedWeapon {
  const e = object(value, path);
  if (!isWeaponSystemId(e.weaponId)) fail(path + ".weaponId", "unknown weapon system");
  text(e.modelId, path + ".modelId");
  const model = (models as Record<string, { kind: string }>)[e.modelId as string];
  if (!Object.hasOwn(models, e.modelId as string) || model?.kind !== "mount") fail(path + ".modelId", "unknown mount model");
  if (weaponSystem(e.weaponId).rotating && !(model as { yaw?: boolean }).yaw) fail(path + ".modelId", "weapon requires a yaw-capable model");
  return e as MountedWeapon;
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
export function loadShipProfile(raw: unknown, rawMetadata: unknown, expectedClass: ShipClassId): ShipHullVisualProfile {
  const path = "ships." + expectedClass;
  const p = object(raw, path);
  text(p.profileId, path + ".profileId"); text(p.hullGltfId, path + ".hullGltfId");
  if (!Object.hasOwn(models, p.hullGltfId as string) ||
      (models as Record<string, { kind: string }>)[p.hullGltfId as string]?.kind !== "hull") {
    fail(path + ".hullGltfId", "unknown hull model");
  }
  if (p.shipClassId !== expectedClass) fail(path + ".shipClassId", "does not match catalog class");
  if (p.labelDe !== undefined) text(p.labelDe, path + ".labelDe");
  optionalNumbers(p, ["aswmMagicReloadMs"], path, Number.MIN_VALUE);
  for (const name of ["hullVisualScale", "clientVisualTuningDefaults", "modelEffects"]) {
    if (p[name] !== undefined) fail(path + "." + name, "spatial values belong exclusively to the model");
  }
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
  if (p.defaultRotatingMountFireSector !== undefined) sector(p.defaultRotatingMountFireSector, path + ".defaultRotatingMountFireSector");
  const metadata = object(rawMetadata, path + ".modelMetadata");
  if (metadata.contractVersion !== 2 || typeof metadata.sourceSha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(metadata.sourceSha256)) fail(path + ".modelMetadata", "invalid generated metadata version/hash");
  const registry = object(metadata.sockets, path + ".sockets");
  const rails = object(metadata.rails, path + ".rails");
  const effects = object(metadata.effects, path + ".effects");
  for (const [id, transform] of Object.entries(registry)) socket(transform, path + ".sockets." + id);
  for (const [id, transform] of Object.entries(rails)) socket(transform, path + ".rails." + id);
  for (const [id, transform] of Object.entries(effects)) socket(transform, path + ".effects." + id);
  if (!Object.hasOwn(effects, "wake")) fail(path + ".effects", "missing wake marker");
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
    if (slot.socket !== undefined || slot.trainBaseYawRadFromBow !== undefined) fail(slotPath, "spatial values belong exclusively to the model");
    if (!Object.hasOwn(registry, id)) fail(slotPath + ".socket", "missing model socket");
    if (slot.defaultVisualId !== undefined || slot.defaultEquipment !== undefined) {
      fail(slotPath, "slot equipment defaults removed; use defaultLoadout");
    }
    if (slot.fireSector !== undefined) sector(slot.fireSector, slotPath + ".fireSector");
  });
  if (Object.keys(registry).some(id => !slotIds.has(id))) fail(path + ".mountSlots", "model socket has no slot rules");
  const railIds = new Set<string>();
  if (p.fixedSeaSkimmerLaunchers !== undefined) {
    array(p.fixedSeaSkimmerLaunchers, path + ".fixedSeaSkimmerLaunchers").forEach((rawLauncher, i) => {
      const launchPath = path + ".fixedSeaSkimmerLaunchers[" + i + "]";
      const launcher = object(rawLauncher, launchPath);
      const id = uniqueId(launcher.id, railIds, launchPath + ".id");
      if (launcher.side !== "port" && launcher.side !== "starboard" && launcher.side !== "centerline") {
        fail(launchPath + ".side", "unknown side");
      }
      if (launcher.socket !== undefined || launcher.launchYawRadFromBow !== undefined) fail(launchPath, "spatial values belong exclusively to the model");
      if (!Object.hasOwn(rails, id)) fail(launchPath, "missing model rail");
      if (launcher.visualId !== undefined) fail(launchPath, "visualId removed; use equipment");
      if (launcher.equipment !== undefined && equipment(launcher.equipment, launchPath + ".equipment").weaponId !== "ssm") {
        fail(launchPath + ".equipment", "fixed sea skimmer launcher requires ssm");
      }
    });
  }
  if (Object.keys(rails).some(id => !railIds.has(id))) fail(path + ".fixedSeaSkimmerLaunchers", "model rail has no launcher rules");
  if (p.aswmMagazine !== undefined) {
    const magazine = object(p.aswmMagazine, path + ".aswmMagazine");
    for (const side of ["port", "starboard"]) {
      number(magazine[side], path + ".aswmMagazine." + side, 0);
      if (!Number.isSafeInteger(magazine[side])) fail(path + ".aswmMagazine." + side, "expected safe integer");
    }
  }
  if (p.defaultLoadout !== undefined) {
    for (const [id, value] of Object.entries(object(p.defaultLoadout, path + ".defaultLoadout"))) {
      if (!slotIds.has(id)) fail(path + ".defaultLoadout." + id, "unknown mount slot");
      const e = equipment(value, path + ".defaultLoadout." + id);
      const slot = slots.find(s => (s as ObjectValue).id === id) as ObjectValue;
      if (!(slot.compatibleKinds as string[]).includes(weaponSystem(e.weaponId).kind)) {
        fail(path + ".defaultLoadout." + id, "incompatible equipped weapon");
      }
    }
  }

  // Cast only after checking the complete typed surface and cross-references above.
  const profile = p as unknown as Omit<ShipHullVisualProfile, "mountSlots"> & { mountSlots: MountSlotDefinitionInput[] };
  const result: ShipHullVisualProfile = {
    ...profile,
    mountSlots: profile.mountSlots.map(slot => ({ ...slot, socket: registry[slot.id] as ShipSocketTransform })),
    fixedSeaSkimmerLaunchers: (profile.fixedSeaSkimmerLaunchers ?? []).map(launcher => ({ ...launcher,
      socket: rails[launcher.id] as ShipSocketTransform })) as FixedSeaSkimmerLauncherSpec[],
    modelEffects: effects as Record<string, ShipSocketTransform>,
  };
  // Own the validated data; neither JSON imports nor callers may mutate authoritative defaults.
  return freezeTree(structuredClone(result));
}
