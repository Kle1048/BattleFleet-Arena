import assert from "node:assert/strict";
import { SHIP_CLASS_CRUISER, SHIP_CLASS_DESTROYER, SHIP_CLASS_FAC } from "./shipClass";
import {
  BOT_ASWM_MAX_BORE_YAW_ERR_RAD,
  aswmSteeringYawErrRad,
  minFixedSeaSkimmerLauncherYawErrorRad,
} from "./aswmShipAim";

{
  // FAC rails ±45°: Ziel 45° Steuerbord vom Bug → Fehler ~0
  const h = 0;
  const d = 200;
  const ang = Math.PI / 4;
  const tx = Math.sin(ang) * d;
  const tz = Math.cos(ang) * d;
  const err = minFixedSeaSkimmerLauncherYawErrorRad(SHIP_CLASS_FAC, 0, 0, h, tx, tz);
  assert.ok(err !== null && err < 0.02);
}

{
  // DD rails ±90°: Ziel quer (90°)
  const h = 0;
  const d = 200;
  const ang = Math.PI / 2;
  const tx = Math.sin(ang) * d;
  const tz = Math.cos(ang) * d;
  const err = minFixedSeaSkimmerLauncherYawErrorRad(SHIP_CLASS_DESTROYER, 0, 0, h, tx, tz);
  assert.ok(err !== null && err < 0.02);
}

{
  // CG rails ±10°: Ziel ~10° vom Bug
  const h = 0;
  const d = 200;
  const ang = (10 * Math.PI) / 180;
  const tx = Math.sin(ang) * d;
  const tz = Math.cos(ang) * d;
  const err = minFixedSeaSkimmerLauncherYawErrorRad(SHIP_CLASS_CRUISER, 0, 0, h, tx, tz);
  assert.ok(err !== null && err < 0.02);
}

{
  // Ziel direkt vor Bug bei DD (0°) — Rails nur ±90° → großer Fehler
  const err = minFixedSeaSkimmerLauncherYawErrorRad(SHIP_CLASS_DESTROYER, 0, 0, 0, 0, 250);
  assert.ok(err !== null && err > BOT_ASWM_MAX_BORE_YAW_ERR_RAD * 0.9);
}

{
  // DD: Ziel rechts (world +X), Heading 0 → beste Rail ±90°: gewünschte Heading 0, Rudder-Fehler ~0
  const e = aswmSteeringYawErrRad(SHIP_CLASS_DESTROYER, 0, 0, 0, 200, 0);
  assert.ok(Math.abs(e) < 0.02);
}

console.log("aswmShipAim tests ok");
