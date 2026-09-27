import assert from "node:assert/strict";
import type { ShipClassId } from "@battlefleet/shared";
import {
  getAuthoritativeHullProfile, getEffectiveHullProfile, loadHullProfilePatch,
  saveHullProfilePatch, setHullProfilePatchForClass, setHullProfileWorkbenchLivePreview,
  clearAllHullProfileWorkbenchLivePreviews,
} from "./shipProfileRuntime";

const key = "battlefleet_ship_profile_patch_v2";
const storage = new Map<string, string>([[key, JSON.stringify({
  fac: { modelEffects: { wake: { position: { x: 900, y: 0, z: 0 } } } },
  destroyer: { labelDe: "Draft destroyer" },
  cruiser: [],
  unknown: { labelDe: "Not a class" },
})]]);
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalWarn = console.warn;
let warnings = 0;
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, value: string) => storage.set(k, value),
} });
console.warn = () => { warnings++; };
try {
  const authoritative = getAuthoritativeHullProfile("fac")!;
  const originalStored = storage.get(key);
  const patches = loadHullProfilePatch();
  assert.equal(warnings, 3);
  assert.deepEqual(Object.keys(patches), ["destroyer"]);
  assert.equal(storage.get(key), originalStored, "invalid drafts remain recoverable");
  assert.equal(getEffectiveHullProfile("fac"), authoritative);
  assert.equal(getEffectiveHullProfile("destroyer")!.labelDe, "Draft destroyer");
  assert.notEqual(getAuthoritativeHullProfile("destroyer")!.labelDe, "Draft destroyer");
  patches.destroyer!.labelDe = "external mutation";
  assert.equal(loadHullProfilePatch().destroyer!.labelDe, "Draft destroyer");

  const valid = { fac: { labelDe: "FAC draft" } };
  saveHullProfilePatch(valid);
  valid.fac.labelDe = "mutated caller input";
  assert.equal(getEffectiveHullProfile("fac")!.labelDe, "FAC draft");
  const saved = storage.get(key);
  for (const invalid of [
    { fac: { hullVisualScale: 10 } },
    { fac: { mountSlots: [{ id: "main_fwd", compatibleKinds: ["artillery"], socket: {} }] } },
    { fac: { shipClassId: "destroyer" } },
    { fac: { hullGltfId: "constructor" } },
    { fac: null }, { unknown: {} }, [],
  ]) {
    assert.throws(() => saveHullProfilePatch(invalid as never));
    assert.equal(storage.get(key), saved, "failed validation must not write");
  }
  assert.throws(() => setHullProfilePatchForClass("unknown" as ShipClassId, {}));
  setHullProfileWorkbenchLivePreview("fac", { ...authoritative, labelDe: "Live draft" });
  assert.equal(getEffectiveHullProfile("fac")!.labelDe, "Live draft");
  assert.equal(getAuthoritativeHullProfile("fac"), authoritative);
  clearAllHullProfileWorkbenchLivePreviews();
  assert.equal(getEffectiveHullProfile("fac")!.labelDe, "FAC draft");
  setHullProfilePatchForClass("fac", null);
  assert.equal(getEffectiveHullProfile("fac"), authoritative);
  assert.equal(JSON.parse(storage.get(key)!).fac, undefined);
} finally {
  console.warn = originalWarn;
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
}
console.log("workbench storage validation, immutable cache and match isolation ok");
