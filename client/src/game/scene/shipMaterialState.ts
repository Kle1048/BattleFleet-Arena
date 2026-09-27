import type { Material } from "three";

// Snapshots are never rendered and do not own GPU resources. Textures remain borrowed
// from the asset cache. Weak keys let both the instance and snapshot expire together.
const authored = new WeakMap<Material, Material>();

/** Capture before the first life-state override; restore every authored property. */
export function restoreAuthoredMaterial(material: Material): void {
  let original = authored.get(material);
  if (!original) {
    original = material.clone();
    authored.set(material, original);
  }
  material.copy(original);
  // These transitions may change shader flags (e.g. transparency/alpha test).
  // Caller only invokes this at a state transition, not for every frame.
  material.needsUpdate = true;
}
