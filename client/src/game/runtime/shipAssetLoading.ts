import type { ShipClassId } from "@battlefleet/shared";
import { getAuthoritativeHullProfile, resolveShipHullGltfUrlForClass } from "./shipProfileRuntime";
import { resolveMountGltfUrl } from "./mountGltfUrls";
import { loadShipHullGltfSource } from "../scene/shipGltfHull";

const pending = new Map<ShipClassId, Promise<void>>();
const settled = new Set<ShipClassId>();

/** Only classes present in the match, and only the mounts actually used by their profiles. */
export function loadShipAssets(shipClass: ShipClassId): Promise<void> | undefined {
  if (settled.has(shipClass)) return undefined;
  const hit = pending.get(shipClass);
  if (hit) return hit;
  const profile = getAuthoritativeHullProfile(shipClass);
  const urls = new Set([resolveShipHullGltfUrlForClass(shipClass)]);
  for (const slot of profile?.mountSlots ?? []) {
    const id = profile?.defaultLoadout?.[slot.id] ?? slot.defaultVisualId;
    if (id) urls.add(resolveMountGltfUrl(id));
  }
  for (const launcher of profile?.fixedSeaSkimmerLaunchers ?? []) {
    if (launcher.visualId) urls.add(resolveMountGltfUrl(launcher.visualId));
  }
  const promise = Promise.all([...urls].map(loadShipHullGltfSource)).then(() => {
    settled.add(shipClass);
    pending.delete(shipClass);
  });
  pending.set(shipClass, promise);
  return promise;
}
