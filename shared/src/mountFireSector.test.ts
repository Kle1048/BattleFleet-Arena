import assert from "node:assert/strict";
import {
  aimDirectionYawFromBowRad,
  ARTILLERY_ARC_HALF_ANGLE_RAD,
  clampYawToMountSector,
  isYawWithinMountFireSector,
  tryComputeArtillerySalvo,
} from "./artillery";
import type { MountFireSector } from "./shipVisualLayout";

{
  const h = 0;
  const shipX = 0;
  const shipZ = 0;
  const yawFwd = aimDirectionYawFromBowRad(shipX, shipZ, h, 0, 100);
  assert.ok(yawFwd !== null && Math.abs(yawFwd) < 1e-6);
  const yawStbd = aimDirectionYawFromBowRad(shipX, shipZ, h, 100, 0);
  assert.ok(yawStbd !== null && Math.abs(yawStbd - Math.PI / 2) < 1e-5);
}

{
  const sector = { kind: "symmetric" as const, halfAngleRadFromBow: ARTILLERY_ARC_HALF_ANGLE_RAD };
  assert.equal(isYawWithinMountFireSector(0, sector), true);
  assert.equal(isYawWithinMountFireSector(Math.PI, sector), false);
}

{
  const aft: MountFireSector = {
    kind: "symmetric",
    halfAngleRadFromBow: ARTILLERY_ARC_HALF_ANGLE_RAD,
    centerYawRadFromBow: Math.PI,
  };
  assert.equal(isYawWithinMountFireSector(Math.PI, aft), true);
  assert.equal(isYawWithinMountFireSector(0, aft), false);
}

{
  const aft = {
    kind: "symmetric" as const,
    halfAngleRadFromBow: ARTILLERY_ARC_HALF_ANGLE_RAD,
    centerYawRadFromBow: Math.PI,
  };
  const salvo = tryComputeArtillerySalvo(0, 0, 0, 0, -200, () => 0.5, aft, 0, -10);
  assert.equal(salvo.ok, true);
}

{
  const fwd = {
    kind: "symmetric" as const,
    halfAngleRadFromBow: ARTILLERY_ARC_HALF_ANGLE_RAD,
    centerYawRadFromBow: 0,
  };
  const salvo = tryComputeArtillerySalvo(0, 0, 0, 0, -200, () => 0.5, fwd, 0, 10);
  assert.equal(salvo.ok, false);
}

{
  const sector = { kind: "symmetric" as const, halfAngleRadFromBow: ARTILLERY_ARC_HALF_ANGLE_RAD };
  const c = clampYawToMountSector(Math.PI * 0.9, sector);
  assert.ok(Math.abs(c) <= ARTILLERY_ARC_HALF_ANGLE_RAD + 1e-3);
}

console.log("mountFireSector tests ok");
