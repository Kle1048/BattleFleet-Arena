import assert from "node:assert/strict";
import * as THREE from "three";
import { getAuthoritativeShipHullProfile, PlayerLifeState } from "@battlefleet/shared";
import { createShipRenderer } from "../renderers/ships/shipRenderer";
import { getEffectiveHullProfile, setHullProfilePatchForClass } from "../runtime/shipProfileRuntime";
import { applyShipVisualRuntimeTuning, createShipVisual, disposeShipVisual, setShipVisualLifeState } from "./shipVisual";

const oldStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
} });
const base = getAuthoritativeShipHullProfile("fac")!;
const template = new THREE.Group();
const texture = new THREE.Texture();
const material = new THREE.MeshStandardMaterial({ color: 0x123456, metalness: 0.8,
  roughness: 0.2, map: texture, transparent: true, opacity: 0.43, depthWrite: false,
  alphaTest: 0.12, emissive: 0x080402, emissiveIntensity: 0.23 });
template.add(new THREE.Mesh(new THREE.BoxGeometry(4, 6, 50), material));
const renderer = createShipRenderer(new THREE.Scene(), "match", { getHullGltfTemplate: () => template });
let draft: ReturnType<typeof createShipVisual> | undefined;
try {
  setHullProfilePatchForClass("fac", { movement: { accelMul: 0.5 } });
  renderer.ensureShip("match", "fac");
  const match = renderer.getVisuals().get("match")!;
  assert.equal(match.profile, base, "match creation must not consume editor patches");
  draft = createShipVisual({ isLocal: true, shipClassId: "fac", profile: getEffectiveHullProfile("fac"), hullGltfSource: template });
  assert.equal(draft.profile?.movement?.accelMul, 0.5, "workbench explicitly supplies its draft");
  const scale = match.hullModel!.scale.x;
  applyShipVisualRuntimeTuning(match);
  assert.equal(match.hullModel!.scale.x, scale, "runtime updates must not switch profile source");
  const rendered = match.hullGltfMaterials[0] as THREE.MeshStandardMaterial;
  for (const state of [PlayerLifeState.SpawnProtected, PlayerLifeState.AwaitingRespawn,
    PlayerLifeState.SpawnProtected]) {
    setShipVisualLifeState(match, state, true);
    setShipVisualLifeState(match, PlayerLifeState.Alive, true);
    for (const key of ["metalness", "roughness", "transparent", "opacity", "depthWrite", "alphaTest", "emissiveIntensity"] as const) {
      assert.equal(rendered[key], material[key], key);
    }
    assert(rendered.color.equals(material.color));
    assert(rendered.emissive.equals(material.emissive));
    assert.equal(rendered.map, texture);
  }
  assert.equal(material.metalness, 0.8, "template materials must never be mutated");
} finally {
  renderer.dispose();
  if (draft) disposeShipVisual(draft);
  setHullProfilePatchForClass("fac", null);
  if (oldStorage) Object.defineProperty(globalThis, "localStorage", oldStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
  (template.children[0] as THREE.Mesh).geometry.dispose(); material.dispose(); texture.dispose();
}
console.log("explicit match/editor profile ownership and exact authored material restoration ok");
