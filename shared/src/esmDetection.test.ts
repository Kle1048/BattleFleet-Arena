import assert from "node:assert/strict";
import {
  SHIP_CLASS_CRUISER,
  SHIP_CLASS_DESTROYER,
  SHIP_CLASS_FAC,
} from "./shipClass";
import { esmDetectionRangeMul, esmEmitterStrokeCss } from "./esmDetection";

assert.equal(esmDetectionRangeMul(SHIP_CLASS_FAC), 1);
assert.equal(esmDetectionRangeMul(SHIP_CLASS_DESTROYER), 1.5);
assert.equal(esmDetectionRangeMul(SHIP_CLASS_CRUISER), 2);
assert.ok(esmEmitterStrokeCss(SHIP_CLASS_FAC).startsWith("#"));
assert.notEqual(esmEmitterStrokeCss(SHIP_CLASS_FAC), esmEmitterStrokeCss(SHIP_CLASS_DESTROYER));

console.log("esmDetection tests ok");
