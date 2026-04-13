const BASE = import.meta.env.BASE_URL;

const FALLBACK_MOUNT = `${BASE}assets/systems/mount_ssm_canister.glb`;

/**
 * Slot-`defaultLoadout` / `defaultVisualId` → GLB unter `client/public/assets/systems/`.
 * Platzhalter: `npm run generate:placeholder-glb -w client` — Modelle 1:1 ersetzen.
 */
export const MOUNT_VISUAL_GLB_BY_ID: Record<string, string> = {
  visual_artillery: `${BASE}assets/systems/mount_artillery_turret.glb`,
  visual_ciws: `${BASE}assets/systems/mount_ciws_rotating.glb`,
  visual_sam: `${BASE}assets/systems/mount_sam_box.glb`,
  /** PDMS-Box — Hardkill-Schicht **PD** (mittlerer Ring), nicht SAM. */
  visual_pdms: `${BASE}assets/systems/mount_PDMS_box.glb`,
  visual_ssm: FALLBACK_MOUNT,
  visual_torpedo: `${BASE}assets/systems/mount_torpedo_launcher.glb`,
};

export function resolveMountGltfUrl(visualId: string): string {
  return MOUNT_VISUAL_GLB_BY_ID[visualId] ?? FALLBACK_MOUNT;
}

export function uniqueMountVisualUrls(): string[] {
  return [...new Set(Object.values(MOUNT_VISUAL_GLB_BY_ID))];
}
