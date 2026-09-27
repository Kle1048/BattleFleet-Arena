import assert from "node:assert/strict";
import * as THREE from "three";
import { createArtilleryFx } from "./artilleryFx";
import type { FxSystem } from "./fxSystem";
import { getPrimaryArtilleryMuzzleSeekCoords } from "../scene/shipMountVisuals";
import { createShipVisual, disposeShipVisual } from "../scene/shipVisual";
import { getAuthoritativeShipHullProfile } from "@battlefleet/shared";

const base = getAuthoritativeShipHullProfile("fac")!;
const profile = { ...base, mountSlots: [base.mountSlots[0]!, { ...base.mountSlots[0]!, id: "second",
  socket: { position: { x: 8, y: 5, z: -20 } } }], defaultLoadout: {
  main_fwd: base.defaultLoadout!.main_fwd!, second: base.defaultLoadout!.main_fwd!,
}, fixedSeaSkimmerLaunchers: [] };
const template = new THREE.Group(), yaw = new THREE.Object3D(), muzzle = new THREE.Object3D();
yaw.name = "bf_yaw"; muzzle.name = "bf_muzzle"; muzzle.position.set(0, 2, 4); yaw.add(muzzle); template.add(yaw);
const vis = createShipVisual({ isLocal: false, shipClassId: "fac", profile, hullGltfSource: new THREE.Group(),
  getMountGltfTemplate: () => template });
const first = getPrimaryArtilleryMuzzleSeekCoords(vis, "main_fwd")!;
const second = getPrimaryArtilleryMuzzleSeekCoords(vis, "second")!;
assert.notDeepEqual(first, second);
assert.equal(getPrimaryArtilleryMuzzleSeekCoords(vis, "unknown"), null, "never substitute first same-type mount");
const flashes: number[][] = [];
const scene = new THREE.Scene();
const fx = createArtilleryFx(scene, { spawnArtilleryMuzzle: (...args: number[]) => flashes.push(args) } as unknown as FxSystem);
fx.setMuzzleSeekResolver((id, slot) => { assert.equal(id, "ship"); return getPrimaryArtilleryMuzzleSeekCoords(vis, slot); });
const message = { shellId: 1, ownerId: "ship", slotId: "second", fromX: 30, fromY: 9, fromZ: 40,
  toX: 150, toZ: 250, flightMs: 500 };
fx.onFired(message);
assert.deepEqual(scene.children[0]!.position.toArray(), [-second.x, second.y, second.z]);
assert.deepEqual([flashes[0]![0], flashes[0]![3], flashes[0]![1]], [second.x, second.y, second.z]);
fx.onFired({ ...message, shellId: 2, slotId: "unloaded" });
assert.deepEqual(scene.children[1]!.position.toArray(), [-30, 9, 40], "missing asset uses authoritative 3D muzzle");
fx.onImpact({ shellId: 1, x: 150, z: 250 }, { skipSplash: true });
assert.equal(scene.children.length, 1);
fx.dispose(); disposeShipVisual(vis);
assert.equal(scene.children.length, 0);
console.log("Multiple same-type mounts: exact slot, shared flash/shell origin, server fallback and disposal");
