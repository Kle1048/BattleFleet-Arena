import assert from "node:assert/strict";
import { mergeAswmFireSide } from "./aswmKeyboardSide";

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
