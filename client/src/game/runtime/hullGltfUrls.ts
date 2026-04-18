const BASE = import.meta.env.BASE_URL;

const FALLBACK_HULL = `${BASE}assets/S143A.glb`;

/**
 * `hullGltfId` aus dem JSON-Profil → URL unter `client/public/`.
 * **Neue Rumpf-GLBs:** Datei nach `public/assets/ships/` legen und hier einen Eintrag
 * `deineId: \`${BASE}assets/ships/deine_datei.glb\`` hinzufügen — sonst erscheint die Id
 * weder im Schiffseditor-Dropdown noch beim Laden (Fallback: `S143A.glb`).
 *
 * Rümpfe: `npm run generate:placeholder-glb -w client` erzeugt einfache Boxen unter `assets/ships/`.
 * Profil: Spiel nutzt `shipProfileRuntime.resolveShipHullGltfUrlForClass` (gebündelt);
 * Workbench: `resolveShipHullGltfUrlForWorkbenchPreview`.
 */
export const HULL_GLTF_URL_BY_ID: Record<string, string> = {
  fac: `${BASE}assets/ships/hull_fac.glb`,
  destroyer: `${BASE}assets/ships/hull_destroyer.glb`,
  cruiser: `${BASE}assets/ships/hull_cruiser.glb`,
  /** z. B. für KI-/Varianten-Rumpf */
  facAI: `${BASE}assets/ships/hull_facAI.glb`,
  s143a: FALLBACK_HULL,
};

export function resolveShipHullGltfUrl(hullGltfId: string): string {
  return HULL_GLTF_URL_BY_ID[hullGltfId] ?? FALLBACK_HULL;
}
