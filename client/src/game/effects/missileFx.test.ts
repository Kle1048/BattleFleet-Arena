import assert from "node:assert/strict";
import * as THREE from "three";
import { createMissileFx } from "./missileFx";
import type { FxSystem } from "./fxSystem";

const scene = new THREE.Scene(), launches: number[][] = [];
const fx = createMissileFx(scene, { spawnMissileLaunchSmoke: (...args: number[]) => launches.push(args),
  spawnMissileTrailStreamTick() {} } as unknown as FxSystem);
const pose = { missileId: 2, x: 100, z: 200, headingRad: .3 };
fx.sync([pose]);
assert.equal(launches.length, 0, "late join / initial snapshot is not a launch event");
fx.sync([]);
const event = { missileId: 2, ownerId: "ship", launcherId: "starboard", fromX: 12, fromY: 9, fromZ: 14, headingRad: .3 };
fx.onFired(event); fx.sync([pose]);
assert.deepEqual(launches[0], [12, 14, .3, 9]);
assert.deepEqual(scene.children[0]!.getWorldPosition(new THREE.Vector3()).toArray(), [-12, 9 - 2.8, 14]);
assert.equal(scene.children[0]!.children[0]!.getWorldPosition(new THREE.Vector3()).y, 9);
fx.update(performance.now() + 500, 16);
assert.equal(scene.children[0]!.children[0]!.getWorldPosition(new THREE.Vector3()).y, 2.8);
fx.setMuzzleSeekResolver((owner, launcher) => {
  assert.equal(owner, "ship"); assert.equal(launcher, "starboard"); return { x: 32, y: 11, z: 34 };
});
fx.onFired({ ...event, missileId: 3 });
fx.sync([{ ...pose, missileId: 3 }]);
assert.deepEqual(launches[1], [32, 34, .3, 11], "exact rail resolver supplies cosmetic origin");
assert.equal(scene.children[0]!.children[0]!.getWorldPosition(new THREE.Vector3()).y, 11);
fx.dispose(); fx.dispose();
fx.onFired(event); fx.sync([pose]); fx.update(performance.now(), 16);
assert.equal(launches.length, 2, "late events after release are inert");
assert.equal(scene.children.length, 0);
console.log("ASuM launch events own smoke and model-origin takeoff; snapshots do not invent launches");
