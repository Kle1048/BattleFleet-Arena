import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { getAuthoritativeShipHullProfile, MODEL_CATALOG, shipLocalToWorldXZ, modelSpatialMetadata,
  clampYawToMountSector, isYawWithinMountFireSector, launcherYawRadFromBow, mountSlotMuzzleWorld, spawnAswmFromFixedLauncher } from "@battlefleet/shared";
import { decodeGlb, encodeGlb } from "../../../../scripts/models/glb";
import { createShipVisual, disposeShipVisual, updateArtilleryTrainRotationsFromAim } from "./shipVisual";

async function load(modelId: string): Promise<THREE.Group> {
  const model = MODEL_CATALOG[modelId]!;
  const { document, bin } = decodeGlb(readFileSync(new URL(`../../../public/assets/${model.file}`, import.meta.url)));
  // Real geometry and hierarchy; skip only browser image decoding in this CPU-only test.
  const materials = document.materials as Record<string, unknown>[] | undefined;
  for (const material of materials ?? []) {
    for (const key of Object.keys(material)) if (key.endsWith("Texture")) delete material[key];
    const pbr = material.pbrMetallicRoughness as Record<string, unknown> | undefined;
    if (pbr) for (const key of Object.keys(pbr)) if (key.endsWith("Texture")) delete pbr[key];
  }
  delete document.images; delete document.textures; delete document.samplers;
  const bytes = encodeGlb(document, bin);
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, "")).scene;
}

async function main(): Promise<void> {
  const templates = new Map<string, THREE.Group>();
  for (const id of Object.keys(MODEL_CATALOG)) templates.set(id, await load(id));
  for (const shipClassId of ["fac", "destroyer", "cruiser"] as const) {
    const profile = getAuthoritativeShipHullProfile(shipClassId)!;
    const vis = createShipVisual({ isLocal: true, shipClassId, profile,
      hullGltfSource: templates.get(profile.hullGltfId), getMountGltfTemplate: id => templates.get(id) ?? null });
    assert.equal(vis.rotatingMountTrains.length, profile.mountSlots.length);
    assert.deepEqual(vis.hullModel!.scale.toArray(), [1, 1, 1]);
    assert.deepEqual(vis.group.scale.toArray(), [-1, 1, 1]);
    assert.equal(vis.weaponGuideGroup!.parent, vis.group, "sectors are logical, not rolled geometry");
    const shipX = 231, shipZ = -173;
    for (const heading of [0, .7, Math.PI / 2, Math.PI, -2.1]) {
      vis.group.position.set(-shipX, 0, shipZ); vis.group.rotation.y = -heading;
      vis.modelMotion.rotation.set(0, 0, 0); vis.group.updateWorldMatrix(true, true);
      for (const slot of profile.mountSlots) {
        const rendered = vis.hullModel!.getObjectByName(`mount_${slot.id}`)!.getWorldPosition(new THREE.Vector3());
        const logical = shipLocalToWorldXZ(shipX, shipZ, heading, slot.socket.position.x, slot.socket.position.z);
        assert(Math.hypot(-rendered.x - logical.x, rendered.z - logical.z) < 1e-8, `${shipClassId}/${slot.id}: client/server position`);
        assert(Math.abs(rendered.y - slot.socket.position.y) < 1e-8);
      }
      for (const rail of profile.fixedSeaSkimmerLaunchers!) {
        const anchor = vis.hullModel!.getObjectByName(`ssm_${rail.id}`)!;
        const front = new THREE.Vector3(0, 0, 1).transformDirection(anchor.matrixWorld);
        const actualYaw = Math.atan2(-front.x, front.z);
        const expectedYaw = heading + launcherYawRadFromBow(rail);
        assert(Math.cos(actualYaw - expectedYaw) > 1 - 1e-10, `${shipClassId}/${rail.id}: rail direction`);
        const muzzle = anchor.getObjectByName("bf_muzzle")!.getWorldPosition(new THREE.Vector3());
        const launch = spawnAswmFromFixedLauncher(shipX, shipZ, heading, rail);
        assert(muzzle.distanceTo(new THREE.Vector3(-launch.x, launch.y, launch.z)) < 1e-8,
          `${shipClassId}/${rail.id}: server missile spawn equals actual GLB muzzle`);
      }
      for (const tilt of [0, .13]) for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2, .6]) {
        vis.modelMotion.rotation.set(tilt * .4, 0, tilt, "YXZ");
        const target = { x: shipX + Math.sin(heading + angle) * 800, z: shipZ + Math.cos(heading + angle) * 800 };
        updateArtilleryTrainRotationsFromAim(vis, target.x, target.z, {
          layeredDefenseActive: true, missileSim: target, shipSimX: shipX, shipSimZ: shipZ, shipHeadingRad: heading,
        });
        vis.group.updateWorldMatrix(true, true);
        for (const binding of vis.rotatingMountTrains) {
          const origin = binding.anchor.getWorldPosition(new THREE.Vector3());
          const front = new THREE.Vector3(0, 0, 1).transformDirection(binding.train.matrixWorld);
          const actual = Math.atan2(-front.x, front.z);
          const sector = binding.weaponGuide.sector;
          const expected = isYawWithinMountFireSector(angle, sector)
            ? Math.atan2(target.x + origin.x, target.z - origin.z)
            : heading + clampYawToMountSector(angle, sector);
          const onTie = !isYawWithinMountFireSector(angle, sector) &&
            [angle - 1e-10, angle + 1e-10].some(a => Math.cos(actual - heading - clampYawToMountSector(a, sector)) > 1 - 1e-10);
          assert(Math.cos(actual - expected) > 1 - 1e-10 || onTie,
            `${shipClassId}/${binding.slotId} heading=${heading} angle=${angle} tilt=${tilt}, actual=${actual}, expected=${expected}`);
          const authoredMuzzle = modelSpatialMetadata(binding.weaponGuide.modelId).effects.muzzle!.position;
          const expectedMuzzle = binding.train.localToWorld(new THREE.Vector3(authoredMuzzle.x, authoredMuzzle.y, authoredMuzzle.z));
          const actualMuzzle = binding.muzzleRef!.getWorldPosition(new THREE.Vector3());
          assert(actualMuzzle.distanceTo(expectedMuzzle) < 1e-8, "generated muzzle equals actual GLB point");
          if (tilt === 0 && isYawWithinMountFireSector(angle, sector)) {
            const logical = mountSlotMuzzleWorld(profile, binding.slotId, shipX, shipZ, heading, target);
            assert(actualMuzzle.distanceTo(new THREE.Vector3(-logical.x, logical.y, logical.z)) < 1e-8,
              `${shipClassId}/${binding.slotId}: shared/server muzzle equals independently trained GLB`);
          }
        }
      }
      updateArtilleryTrainRotationsFromAim(vis, 0, 0);
      for (const binding of vis.rotatingMountTrains.filter(b => b.isAirDefense)) assert.equal(binding.train.rotation.y, 0, "rest follows model socket");
    }
    disposeShipVisual(vis);
  }
  // Asymmetric local +X/-X references catch the old local-geometry reflection error.
  const reference = getAuthoritativeShipHullProfile("destroyer")!;
  assert(reference.mountSlots.some(s => Math.abs(s.socket.position.x) > 1));
  console.log("Real metric model runtime: all classes, five headings/targets, deck tilt, sectors, rest, rails, server/client points and muzzles agree");
}
void main();
