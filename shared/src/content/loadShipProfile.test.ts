import assert from "node:assert/strict";
import { loadShipProfile } from "./loadShipProfile";
import { getAuthoritativeShipHullProfile, mergeShipHullVisualProfile } from "../shipProfiles";
import fac from "../data/ships/fac.json";
import { modelSpatialMetadata } from "./modelMetadata";
const metadata = structuredClone(modelSpatialMetadata("gepard"));
const sockets = metadata.sockets;

const profile = loadShipProfile(fac, metadata, "fac");
assert.deepEqual(profile, {
  ...fac,
  mountSlots: fac.mountSlots.map(slot => ({ ...slot, socket: sockets[slot.id as keyof typeof sockets] })),
  fixedSeaSkimmerLaunchers: fac.fixedSeaSkimmerLaunchers.map(rail => ({ ...rail, socket: metadata.rails[rail.id] })),
  modelEffects: metadata.effects,
}, "loading validates and resolves sockets without changing content values");
assert(Object.isFrozen(profile)); assert(Object.isFrozen(profile.mountSlots));
assert(Object.isFrozen(profile.mountSlots[0]!.socket.position));
assert.throws(() => { profile.mountSlots[0]!.socket.position.x = 999; }, TypeError);
assert.equal(profile.mountSlots[0]!.socket.position.x, sockets.main_fwd.position.x);
assert.notEqual(profile.mountSlots[0]!.socket, sockets.main_fwd, "catalog owns detached data");
assert(!Object.isFrozen(sockets.main_fwd), "loading does not freeze the source author's object");
assert.equal(getAuthoritativeShipHullProfile("fac"), getAuthoritativeShipHullProfile("fac"),
  "lookups return the same validated object; no clone or validation per tick");
const patched = mergeShipHullVisualProfile(profile, { movement: { accelMul: 9 } });
assert.equal(profile.movement!.accelMul, fac.movement.accelMul);
assert.equal(patched.movement!.accelMul, 9);
assert.deepEqual(patched.mountSlots, profile.mountSlots);

const invalid: [string, (p: Record<string, unknown>) => void][] = [
  ["shipClassId", p => { p.shipClassId = "cruiser"; }],
  ["profileId", p => { p.profileId = ""; }],
  ["hullGltfId", p => { p.hullGltfId = 123; }],
  ["hullVisualScale", p => { p.hullVisualScale = 0; }],
  ["aswmMagicReloadMs", p => { p.aswmMagicReloadMs = Infinity; }],
  ["movement.accelMul", p => { p.movement = { accelMul: NaN }; }],
  ["movement.turnRateMul", p => { p.movement = { turnRateMul: -1 }; }],
  ["collisionHitbox.halfExtents.x", p => { p.collisionHitbox = { center: { x: 0, y: 0, z: 0 }, halfExtents: { x: -1, y: 2, z: 3 } }; }],
  ["aswmMagazine.port", p => { p.aswmMagazine = { port: 1.5, starboard: 2 }; }],
  ["aswmMagazine.starboard", p => { p.aswmMagazine = { port: 1, starboard: -1 }; }],
  ["defaultLoadout.unknown", p => { p.defaultLoadout = { unknown: "visual_artillery" }; }],
  ["unknown weapon", p => { p.defaultLoadout = { main_fwd: { weaponId: "visual_artillery", modelId: "gepard_artillery" } }; }],
  ["unknown mount model", p => { p.defaultLoadout = { main_fwd: { weaponId: "artillery", modelId: "__proto__" } }; }],
  ["unknown mount model", p => { p.defaultLoadout = { main_fwd: { weaponId: "artillery", modelId: "gepard" } }; }],
  ["incompatible equipped weapon", p => { p.defaultLoadout = { main_fwd: { weaponId: "pdms", modelId: "gepard_pdms" } }; }],
  ["yaw-capable", p => { p.defaultLoadout = { main_fwd: { weaponId: "artillery", modelId: "gepard_exocet" } }; }],
  ["unknown hull model", p => { p.hullGltfId = "gepard_artillery"; }],
  ["mountSlots", p => { p.mountSlots = {}; }],
  ["duplicate ID", p => { p.mountSlots = [fac.mountSlots[0], fac.mountSlots[0]]; }],
  ["compatibleKinds", p => { p.mountSlots = [{ ...fac.mountSlots[0], compatibleKinds: ["invalid"] }]; }],
  ["fireSector", p => { p.mountSlots = [{ ...fac.mountSlots[0], fireSector: { kind: "unknown" } }]; }],
  ["fireSector", p => { p.mountSlots = [{ ...fac.mountSlots[0], fireSector: { kind: "union", sectors: [] } }]; }],
  ["half angle", p => { p.defaultRotatingMountFireSector = { kind: "symmetric", halfAngleRadFromBow: 4 }; }],
  ["side", p => { p.fixedSeaSkimmerLaunchers = [{ ...fac.fixedSeaSkimmerLaunchers[0], side: "left" }]; }],
  ["side", p => { p.fixedSeaSkimmerLaunchers = [{ ...fac.fixedSeaSkimmerLaunchers[0], side: ["port"] }]; }],
  ["side", p => { p.fixedSeaSkimmerLaunchers = [{ ...fac.fixedSeaSkimmerLaunchers[0], side: { toString: () => "port" } }]; }],
  ["spatial values", p => { p.fixedSeaSkimmerLaunchers = [{ ...fac.fixedSeaSkimmerLaunchers[0], socket: null }]; }],
  ["clientVisualTuningDefaults", p => { p.clientVisualTuningDefaults = { spriteScale: -1 }; }],
];
for (const [fragment, mutate] of invalid) {
  const draft: Record<string, unknown> = structuredClone(fac);
  mutate(draft);
  assert.throws(() => loadShipProfile(draft, metadata, "fac"), error =>
    error instanceof Error && error.message.includes(fragment), fragment);
}
assert.throws(() => loadShipProfile(fac, { ...metadata, sockets: {} }, "fac"), /missing model socket/);
assert.throws(() => loadShipProfile(fac, { ...metadata, sockets: { ...sockets, main_fwd: { position: { x: 0, y: 0, z: Infinity } } } }, "fac"), /sockets.main_fwd.position.z/);
const inline = structuredClone(fac) as Record<string, unknown>;
inline.mountSlots = fac.mountSlots.map(slot => ({ ...slot, socket: { position: { x: 7, y: 8, z: 9 } } }));
assert.throws(() => loadShipProfile(inline, metadata, "fac"), /spatial values/, "inline sockets must not replace the model");
const nested: Record<string, unknown> = structuredClone(fac);
const recursive: { kind: string; sectors: unknown[] } = { kind: "union", sectors: [] };
recursive.sectors.push(recursive);
nested.defaultRotatingMountFireSector = recursive;
assert.throws(() => loadShipProfile(nested, metadata, "fac"), /nesting exceeds/);
console.log("one-time ship content validation, socket references, immutable defaults and patch isolation ok");
