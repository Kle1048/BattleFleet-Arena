import { AD_CIWS_RANGE, AD_PD_RANGE, AD_SAM_RANGE } from "./airDefense";
import { ARTILLERY_RANGE } from "./artillery";

/**
 * Horizontale „Waffen-Reichweite“ (m) für den Feuerbogen-Overlay am Mount —
 * gleiche Zahlen wie Server (`artillery`, `airDefense`).
 *
 * **Luftverteidigung (Hardkill):** `pickHardkillEngagementLayer` prüft SAM → **PD** → **CIWS**
 * bei abnehmenden Distanzen; dazu passen die Ringgrößen **SAM (äußer) > PD > CIWS (innen)**.
 * - `visual_pdms` → {@link AD_PD_RANGE} (mittlerer Ring, 200 m)
 * - `visual_ciws` → {@link AD_CIWS_RANGE} (innerer Ring, 100 m)
 *
 * Slot-**Namen** wie `ciws_aft` sind nur IDs; maßgeblich ist das eingetragene **Visual** im Loadout
 * (`visual_pdms` vs. `visual_ciws`), nicht der Slot-Name.
 *
 * Unbekannte Visual-IDs: konservativ Artillerie-Reichweite.
 */
export function weaponEngagementRangeWorldForMountVisualId(visualId: string): number {
  const id = visualId.trim();
  switch (id) {
    case "visual_ciws":
      return AD_CIWS_RANGE;
    case "visual_sam":
      return AD_SAM_RANGE;
    case "visual_pdms":
      return AD_PD_RANGE;
    case "visual_artillery":
      return ARTILLERY_RANGE;
    default:
      return ARTILLERY_RANGE;
  }
}

/**
 * Reichweite für Mount-Overlay: mit `profile` immer Slot-Loadout / `defaultVisualId` —
 * damit Radius nicht von einem veralteten `entry.visualId` abhängt (Sektor kommt vom Slot).
 */
export function weaponEngagementRangeWorldForRotatingMountEntry(
  profile: { mountSlots: readonly { id: string; defaultVisualId?: string }[]; defaultLoadout?: Record<string, string> } | undefined,
  entry: { slotId: string; visualId: string; engagementRangeWorld?: number },
): number {
  if (profile?.mountSlots?.length) {
    const loadout = profile.defaultLoadout;
    const slot = profile.mountSlots.find((s) => s.id === entry.slotId);
    const vid = (loadout?.[entry.slotId] ?? slot?.defaultVisualId ?? entry.visualId).trim();
    return weaponEngagementRangeWorldForMountVisualId(vid);
  }
  if (typeof entry.engagementRangeWorld === "number" && Number.isFinite(entry.engagementRangeWorld)) {
    return entry.engagementRangeWorld;
  }
  return weaponEngagementRangeWorldForMountVisualId(entry.visualId);
}
