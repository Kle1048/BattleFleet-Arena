const BASE = import.meta.env.BASE_URL;

const FALLBACK_HULL = `${BASE}assets/S143A.glb`;

/**
 * `hullGltfId` aus dem JSON-Profil → URL unter `client/public/`.
 * Rümpfe: `npm run generate:placeholder-glb -w client` erzeugt einfache Boxen unter `assets/ships/`.
 * Profil inkl. Overrides: `shipProfileRuntime.resolveShipHullGltfUrlForClass`.
 */
export const HULL_GLTF_URL_BY_ID: Record<string, string> = {
  fac: `${BASE}assets/ships/hull_fac.glb`,
  destroyer: `${BASE}assets/ships/hull_destroyer.glb`,
  cruiser: `${BASE}assets/ships/hull_cruiser.glb`,
  s143a: FALLBACK_HULL,
};

export function resolveShipHullGltfUrl(hullGltfId: string): string {
  return HULL_GLTF_URL_BY_ID[hullGltfId] ?? FALLBACK_HULL;
}
