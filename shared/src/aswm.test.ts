import assert from "node:assert/strict";
import { PlayerLifeState } from "./playerLife";
import {
  ASWM_ACQUIRE_HALF_ANGLE_RAD,
  ASWM_ACQUIRE_CONE_LENGTH,
  pickAswmAcquisitionTarget,
  pickAswmSideForFallbackFire,
  pickAswmSideForFallbackFireForced,
  pickFixedSeaSkimmerLauncher,
  pickFixedSeaSkimmerLauncherWithAmmo,
  pickFixedSeaSkimmerLauncherWithAmmoForForcedSide,
  shipLocalToWorldXZ,
  spawnAswmFromFixedLauncher,
  spawnAswmFromFireDirection,
  stepAswmMissile,
  isAswmMissileClosingOnWorldPoint,
} from "./aswm";
import type { FixedSeaSkimmerLauncherSpec } from "./shipVisualLayout";

{
  const t = pickAswmAcquisitionTarget(0, 0, 0, "a", [
    { id: "b", x: 0, z: 100, lifeState: PlayerLifeState.Alive },
  ]);
  assert.equal(t, "b");
}

{
  const t = pickAswmAcquisitionTarget(0, 0, 0, "a", [
    { id: "b", x: 300, z: 0, lifeState: PlayerLifeState.Alive },
  ]);
  assert.equal(t, null);
}

{
  const ang = 25 * (Math.PI / 180);
  const d = 180;
  const t = pickAswmAcquisitionTarget(0, 0, 0, "a", [
    {
      id: "b",
      x: Math.sin(ang) * d,
      z: Math.cos(ang) * d,
      lifeState: PlayerLifeState.Alive,
    },
  ]);
  assert.equal(t, "b");
}

{
  const ang = 40 * (Math.PI / 180);
  const d = 180;
  const t = pickAswmAcquisitionTarget(0, 0, 0, "a", [
    {
      id: "b",
      x: Math.sin(ang) * d,
      z: Math.cos(ang) * d,
      lifeState: PlayerLifeState.Alive,
    },
  ]);
  assert.equal(t, null);
}

{
  const t = pickAswmAcquisitionTarget(0, 0, 0, "a", [
    { id: "b", x: 0, z: ASWM_ACQUIRE_CONE_LENGTH + 10, lifeState: PlayerLifeState.Alive },
  ]);
  assert.equal(t, null);
}

assert.ok(ASWM_ACQUIRE_HALF_ANGLE_RAD > 0.5 && ASWM_ACQUIRE_HALF_ANGLE_RAD < 0.55);

{
  const p = spawnAswmFromFireDirection(0, 0, 0, 100, 0);
  assert.ok(p.z > 15 && Math.abs(p.x) < 1e-5);
}

{
  const p = spawnAswmFromFireDirection(0, 0, 100, 0, 0);
  assert.ok(p.x > 15 && Math.abs(p.z) < 1);
}

{
  let x = 0;
  let z = 0;
  let headingRad = 0;
  for (let i = 0; i < 5; i++) {
    const s = stepAswmMissile(x, z, headingRad, 0.1, 100, 0);
    x = s.x;
    z = s.z;
    headingRad = s.headingRad;
  }
  assert.ok(x > 1);
}

{
  const paired: FixedSeaSkimmerLauncherSpec[] = [
    {
      id: "p",
      side: "port",
      socket: { position: { x: -2, y: 0, z: 5 } },
      launchYawRadFromBow: -Math.PI / 4,
    },
    {
      id: "s",
      side: "starboard",
      socket: { position: { x: 2, y: 0, z: 5 } },
      launchYawRadFromBow: Math.PI / 4,
    },
  ];
  const h = 0;
  const pickP = pickFixedSeaSkimmerLauncher(paired, -50, 100, 0, 0, h);
  assert.equal(pickP?.side, "port");
  const pickS = pickFixedSeaSkimmerLauncher(paired, 50, 100, 0, 0, h);
  assert.equal(pickS?.side, "starboard");
}

{
  const paired: FixedSeaSkimmerLauncherSpec[] = [
    {
      id: "p",
      side: "port",
      socket: { position: { x: -2, y: 0, z: 5 } },
      launchYawRadFromBow: -Math.PI / 4,
    },
    {
      id: "s",
      side: "starboard",
      socket: { position: { x: 2, y: 0, z: 5 } },
      launchYawRadFromBow: Math.PI / 4,
    },
  ];
  const h = 0;
  const onlyPort = pickFixedSeaSkimmerLauncherWithAmmo(paired, 50, 100, 0, 0, h, 1, 0);
  assert.equal(onlyPort?.side, "port");
  const onlySb = pickFixedSeaSkimmerLauncherWithAmmo(paired, -50, 100, 0, 0, h, 0, 1);
  assert.equal(onlySb?.side, "starboard");
  const empty = pickFixedSeaSkimmerLauncherWithAmmo(paired, 50, 100, 0, 0, h, 0, 0);
  assert.equal(empty, null);
}

{
  const side = pickAswmSideForFallbackFire(50, 100, 0, 0, 0, 0, 1);
  assert.equal(side, "starboard");
  assert.equal(pickAswmSideForFallbackFire(50, 100, 0, 0, 0, 1, 0), "port");
  assert.equal(pickAswmSideForFallbackFire(50, 100, 0, 0, 0, 0, 0), null);
}

{
  assert.equal(pickAswmSideForFallbackFireForced(1, 0, "port"), "port");
  assert.equal(pickAswmSideForFallbackFireForced(0, 1, "port"), "starboard");
  assert.equal(pickAswmSideForFallbackFireForced(0, 0, "port"), null);
}

{
  const paired: FixedSeaSkimmerLauncherSpec[] = [
    { id: "p", side: "port", socket: { position: { x: -2, y: 0, z: 4 }, eulerRad: { x: 0, y: 0, z: 0 } } },
    { id: "s", side: "starboard", socket: { position: { x: 2, y: 0, z: 4 }, eulerRad: { x: 0, y: 0, z: 0 } } },
  ];
  const fp = pickFixedSeaSkimmerLauncherWithAmmoForForcedSide(paired, 1, 0, "port");
  assert.equal(fp?.side, "port");
  const fs = pickFixedSeaSkimmerLauncherWithAmmoForForcedSide(paired, 0, 1, "starboard");
  assert.equal(fs?.side, "starboard");
  assert.equal(pickFixedSeaSkimmerLauncherWithAmmoForForcedSide(paired, 0, 1, "port")?.side, "starboard");
}

{
  const w = shipLocalToWorldXZ(10, 20, 0, 0, 10);
  assert.ok(Math.abs(w.x - 10) < 1e-5 && Math.abs(w.z - 30) < 1e-5);
}

{
  const L: FixedSeaSkimmerLauncherSpec = {
    id: "t",
    side: "starboard",
    socket: { position: { x: 2, y: 0, z: 0 }, eulerRad: { x: 0, y: Math.PI / 4, z: 0 } },
  };
  const p = spawnAswmFromFixedLauncher(0, 0, 0, L);
  assert.ok(Math.abs(p.headingRad - Math.PI / 4) < 1e-5);
}

{
  assert.equal(isAswmMissileClosingOnWorldPoint(0, 0, 0, 0, 100), true);
  assert.equal(isAswmMissileClosingOnWorldPoint(0, 100, 0, 0, 0), false);
  assert.equal(isAswmMissileClosingOnWorldPoint(0, 0, 0, 0, 0), true);
}

console.log("aswm tests ok");
