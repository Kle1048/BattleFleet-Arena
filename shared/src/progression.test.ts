import assert from "node:assert/strict";
import {
  PROGRESSION_LEVEL_MIN_XP,
  PROGRESSION_MAX_LEVEL,
  PROGRESSION_XP_PER_KILL,
  progressionIncomingDamageFactor,
  progressionLevelFromTotalXp,
  progressionMaxHpForLevel,
  progressionXpToNextLevel,
} from "./progression";
import { ARTILLERY_PLAYER_MAX_HP } from "./artillery";

assert.equal(PROGRESSION_MAX_LEVEL, 10);
assert.equal(PROGRESSION_XP_PER_KILL, 100);
assert.equal(progressionLevelFromTotalXp(0), 1);
assert.equal(progressionLevelFromTotalXp(99), 1);
assert.equal(progressionLevelFromTotalXp(100), 2);
assert.equal(progressionLevelFromTotalXp(999999), 10);
assert.ok(progressionMaxHpForLevel(1) === ARTILLERY_PLAYER_MAX_HP);
assert.ok(progressionMaxHpForLevel(10) > progressionMaxHpForLevel(1));

const mid = progressionXpToNextLevel(3, PROGRESSION_LEVEL_MIN_XP[3]! + 50);
assert.ok(mid.need > 0 && mid.intoLevel >= 0);

const max = progressionXpToNextLevel(10, PROGRESSION_LEVEL_MIN_XP[10]!);
assert.equal(max.need, 0);

assert.ok(progressionIncomingDamageFactor(1) >= progressionIncomingDamageFactor(10));

console.log("progression tests ok");
