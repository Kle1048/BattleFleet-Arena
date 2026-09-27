const BASE = import.meta.env?.BASE_URL ?? "/";

const FALLBACK_MOUNT = `${BASE}assets/systems/mount_ssm_canister.glb`;

/**
 * Slot-`defaultLoadout` / `defaultVisualId` → GLB unter `client/public/assets/systems/`.
 * Platzhalter: `npm run generate:placeholder-glb -w client` — Modelle 1:1 ersetzen.
 */
export const MOUNT_VISUAL_GLB_BY_ID: Record<string, string> = {
  visual_spruance_mk45: `${BASE}assets/systems/mount_spruance_mk45.glb`,
  visual_spruance_phalanx: `${BASE}assets/systems/mount_spruance_phalanx.glb`,
  visual_spruance_seasparrow: `${BASE}assets/systems/mount_spruance_seasparrow.glb`,
  visual_spruance_harpoon: `${BASE}assets/systems/mount_spruance_harpoon.glb`,
  visual_gepard_artillery: `${BASE}assets/systems/mount_gepard_artillery.glb`,
  visual_gepard_pdms: `${BASE}assets/systems/mount_gepard_pdms.glb`,
  visual_gepard_exocet: `${BASE}assets/systems/mount_gepard_exocet.glb`,
  // F124 exports include the current renderer's inverse-hull-scale compensation.
  visual_f124_76mm: `${BASE}assets/systems/mount_f124_76mm.glb`,
  visual_f124_ram: `${BASE}assets/systems/mount_f124_ram.glb`,
  visual_f124_harpoon: `${BASE}assets/systems/mount_f124_harpoon.glb`,
  visual_artillery: `${BASE}assets/systems/mount_artillery_turret.glb`,
  visual_ciws: `${BASE}assets/systems/mount_ciws_rotating.glb`,
  visual_sam: `${BASE}assets/systems/mount_sam_box.glb`,
  /** PDMS-Box — Hardkill-Schicht **PD** (mittlerer Ring), nicht SAM. */
  visual_pdms: `${BASE}assets/systems/mount_PDMS_box.glb`,
  visual_ssm: FALLBACK_MOUNT,
  visual_torpedo: `${BASE}assets/systems/mount_torpedo_launcher.glb`,
};

/** Hull-specific models preserve semantic weapon IDs, ranges and defense layers. */
export function resolveMountModelVisualId(visualId: string, hullGltfId: string): string {
  if (hullGltfId === "spruance" || hullGltfId === "destroyer") {
    const models: Record<string, string> = {
      visual_artillery: "visual_spruance_mk45",
      visual_ciws: "visual_spruance_phalanx",
      visual_sam: "visual_spruance_seasparrow",
      visual_ssm: "visual_spruance_harpoon",
    };
    return models[visualId] ?? visualId;
  }
  if (hullGltfId !== "gepard" && hullGltfId !== "s143a") return visualId;
  const models: Record<string, string> = {
    visual_artillery: "visual_gepard_artillery",
    visual_pdms: "visual_gepard_pdms",
    visual_ssm: "visual_gepard_exocet",
  };
  return models[visualId] ?? visualId;
}

export function resolveMountGltfUrl(visualId: string): string {
  return MOUNT_VISUAL_GLB_BY_ID[visualId] ?? FALLBACK_MOUNT;
}

export function uniqueMountVisualUrls(): string[] {
  return [...new Set(Object.values(MOUNT_VISUAL_GLB_BY_ID))];
}
