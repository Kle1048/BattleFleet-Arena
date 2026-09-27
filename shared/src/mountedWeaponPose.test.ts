import assert from "node:assert/strict";
import { rotateModelVector, projectedTrainYaw, mountSlotMuzzleWorld } from "./mountedWeaponPose";
import { getAuthoritativeShipHullProfile } from "./shipProfiles";
import { pickHardkillMountForTarget } from "./airDefense";

const close = (a: number, b: number) => assert(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
// A noncommuting XYZ rotation protects the full convention, not just yaw-only assets.
const p = rotateModelVector({ x: 1, y: 2, z: 3 }, { x: Math.PI / 2, y: Math.PI / 2, z: 0 });
close(p.x, 3); close(p.y, 1); close(p.z, 2);
close(projectedTrainYaw(-1, 0, 0, 1, -1, 0)!, Math.PI / 2);
assert.equal(projectedTrainYaw(1, 0, 0, 0, 1, 0), null);
const base = getAuthoritativeShipHullProfile("fac")!;
const defense = base.mountSlots.find(slot => slot.id === "ciws_aft")!;
const hull = { ...base, mountSlots: [{ ...defense, id: "front", fireSector: { kind: "symmetric" as const,
  halfAngleRadFromBow: .5 } }, { ...defense, id: "back", fireSector: { kind: "symmetric" as const,
  halfAngleRadFromBow: .5, centerYawRadFromBow: Math.PI } }],
  defaultLoadout: { front: base.defaultLoadout!.ciws_aft!, back: base.defaultLoadout!.ciws_aft! } };
assert.equal(pickHardkillMountForTarget(hull, Math.PI, "pd", 0, 0, 0, 0, 100)?.id, "front");
assert.equal(pickHardkillMountForTarget(hull, Math.PI, "pd", 0, 0, 0, 0, -100)?.id, "back");
assert.equal(pickHardkillMountForTarget(hull, Math.PI, "pd", 0, 0, 0, 100, 0), null);
assert.equal(pickHardkillMountForTarget(hull, Math.PI, "sam", 0, 0, 0, 0, 0), null, "no phantom layer at zero distance");
assert.throws(() => mountSlotMuzzleWorld(base, "missing", 0, 0, 0), /Unoccupied/);
console.log("Shared XYZ model pose, reflected train solve and deterministic sector-eligible mount selection");
