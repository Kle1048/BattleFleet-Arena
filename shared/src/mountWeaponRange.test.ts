import assert from "node:assert/strict";
import { AD_CIWS_RANGE, AD_PD_RANGE, AD_SAM_RANGE } from "./airDefense";
import { ARTILLERY_RANGE } from "./artillery";
import {
  weaponEngagementRangeWorldForMountVisualId,
  weaponEngagementRangeWorldForRotatingMountEntry,
} from "./mountWeaponRange";

assert.equal(weaponEngagementRangeWorldForMountVisualId("visual_artillery"), ARTILLERY_RANGE);
assert.equal(weaponEngagementRangeWorldForMountVisualId("visual_sam"), AD_SAM_RANGE);
assert.equal(weaponEngagementRangeWorldForMountVisualId("visual_pdms"), AD_PD_RANGE);
assert.equal(weaponEngagementRangeWorldForMountVisualId("visual_ciws"), AD_CIWS_RANGE);
assert.equal(weaponEngagementRangeWorldForMountVisualId("visual_unknown"), ARTILLERY_RANGE);
assert.equal(weaponEngagementRangeWorldForMountVisualId("  visual_pdms  "), AD_PD_RANGE);

const miniProfile = {
  mountSlots: [{ id: "main_fwd", defaultVisualId: "visual_artillery" }],
  defaultLoadout: { main_fwd: "visual_pdms" } as Record<string, string>,
};
assert.equal(
  weaponEngagementRangeWorldForRotatingMountEntry(miniProfile, {
    slotId: "main_fwd",
    visualId: "visual_artillery",
    engagementRangeWorld: ARTILLERY_RANGE,
  }),
  AD_PD_RANGE,
);

console.log("mountWeaponRange tests ok");
