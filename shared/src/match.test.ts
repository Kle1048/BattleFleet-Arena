import assert from "node:assert/strict";
import {
  MATCH_DURATION_SEC,
  SCORE_PER_KILL,
  isValidKillAttribution,
} from "./match";

assert.equal(MATCH_DURATION_SEC, 300);
assert.equal(SCORE_PER_KILL, 100);
assert.equal(isValidKillAttribution(undefined, "a"), false);
assert.equal(isValidKillAttribution("", "a"), false);
assert.equal(isValidKillAttribution("a", "a"), false);
assert.equal(isValidKillAttribution("b", "a"), true);

console.log("match tests ok");
