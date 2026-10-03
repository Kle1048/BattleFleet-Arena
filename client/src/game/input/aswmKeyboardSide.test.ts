import assert from "node:assert/strict";
import { mergeAswmFireSide, pointerAswmFireSide } from "./aswmKeyboardSide";

assert.equal(
  mergeAswmFireSide({
    mobileActive: true,
    mobileSecondaryFire: true,
    mobileAswmSide: "starboard",
    keyQ: true,
    keyE: false,
  }),
  "starboard",
);

assert.equal(
  mergeAswmFireSide({
    mobileActive: false,
    mobileSecondaryFire: false,
    mobileAswmSide: undefined,
    keyQ: true,
    keyE: false,
  }),
  "port",
);

assert.equal(
  mergeAswmFireSide({
    mobileActive: false,
    mobileSecondaryFire: false,
    mobileAswmSide: undefined,
    keyQ: false,
    keyE: true,
  }),
  "starboard",
);

assert.equal(
  mergeAswmFireSide({
    mobileActive: false,
    mobileSecondaryFire: false,
    mobileAswmSide: undefined,
    keyQ: true,
    keyE: true,
  }),
  "port",
);

assert.equal(
  mergeAswmFireSide({
    mobileActive: false,
    mobileSecondaryFire: false,
    mobileAswmSide: undefined,
    keyQ: false,
    keyE: false,
  }),
  undefined,
);

console.log("aswmKeyboardSide tests ok");

for (const headingRad of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
  const self = { x: 40, z: -70, headingRad };
  assert.equal(pointerAswmFireSide(self, self.x + Math.cos(headingRad) * 50, self.z - Math.sin(headingRad) * 50), "starboard");
  assert.equal(pointerAswmFireSide(self, self.x - Math.cos(headingRad) * 50, self.z + Math.sin(headingRad) * 50), "port");
}
