import assert from "node:assert/strict";
import {
  TELEGRAPH_STOP_INDEX,
  TELEGRAPH_THROTTLE_STEPS,
  snapToNearestStep,
  valueToStepIndex,
} from "./telegraphSteps";

assert.equal(TELEGRAPH_THROTTLE_STEPS[TELEGRAPH_STOP_INDEX], 0);
assert.equal(TELEGRAPH_THROTTLE_STEPS.length, 7);

assert.equal(snapToNearestStep(0.02, TELEGRAPH_THROTTLE_STEPS), 0);
assert.equal(snapToNearestStep(0.28, TELEGRAPH_THROTTLE_STEPS), 1 / 3);
assert.equal(snapToNearestStep(-0.9, TELEGRAPH_THROTTLE_STEPS), -1);

assert.equal(valueToStepIndex(1, TELEGRAPH_THROTTLE_STEPS), 6);
assert.equal(valueToStepIndex(-2 / 3, TELEGRAPH_THROTTLE_STEPS), 1);

console.log("telegraphSteps tests ok");
