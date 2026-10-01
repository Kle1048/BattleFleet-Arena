import assert from "node:assert/strict";
import { POLICY_FEATURES, POLICY_ACTIONS, DecisionTreeStrategy } from "@battlefleet/shared/rules";
import { TrainingArena, TRAINING_SPEC } from "./TrainingArena.js";

const a = new TrainingArena(), b = new TrainingArena();
try {
  assert.throws(() => a.step(0), /reset/);
  assert.throws(() => a.reset(-1), /uint32/);
  const first = a.reset(73);
  assert.deepEqual(first, b.reset(73));
  assert.notDeepEqual(first.observation, b.reset(74).observation);
  b.reset(73);
  assert.throws(() => a.step(NaN), /Invalid action/);
  assert.throws(() => a.step(POLICY_ACTIONS.length), /Invalid action/);
  let ended = false;
  for (let i = 0; i < 1200; i++) {
    const left = a.step(i % POLICY_ACTIONS.length), right = b.step(i % POLICY_ACTIONS.length);
    assert.deepEqual(left, right, "same seed and action history reproduce combat exactly");
    assert.equal(left.observation.length, POLICY_FEATURES.length);
    assert(left.observation.every(v => Number.isFinite(v) && v >= -1 && v <= 1));
    assert(Number.isFinite(left.reward));
    if (left.terminated || left.truncated) {
      assert.notEqual(left.terminated, left.truncated);
      assert.notEqual(left.info.outcome, "running");
      assert.throws(() => a.step(0), /reset/);
      ended = true;
      break;
    }
  }
  assert(ended, "duel must end by the configured time limit");
  assert.deepEqual(a.reset(73), first, "reset clears all prior battle and controller state");
  const duration = TRAINING_SPEC.episodeSeconds;
  try {
    TRAINING_SPEC.episodeSeconds = 0.15;
    a.reset(73);
    const cutoff = a.step(5);
    assert.equal(cutoff.terminated, false, "time limit is not a death");
    assert.equal(cutoff.truncated, true, "time limits must bootstrap in PPO");
    assert.equal(cutoff.info.outcome, "draw");
  } finally { TRAINING_SPEC.episodeSeconds = duration; }
} finally { a.close(); b.close(); }
console.log("Training arena seed replay, isolation, terminal boundary and observation bounds passed");

const longRound = new TrainingArena(undefined, "cautious");
try {
  longRound.reset(123);
  let completed = false;
  let sawDeath = false;
  for (let i = 0; i < 5000; i++) {
    const result = longRound.step(8);
    assert.equal(result.terminated, false, "balanced training continues through deaths and respawns");
    if (result.info.deaths > 0) sawDeath = true;
    if (result.truncated) {
      assert.equal(result.info.seconds, 600, "ten-minute training round ends exactly at its boundary");
      assert(result.info.selfScore > 0, "real survival/Sea Control score is enabled in training");
      assert(sawDeath, "fixture exercises at least one death and continuation");
      assert(result.info.aliveSeconds < 600, "respawn wait does not earn survival time");
      completed = true;
      break;
    }
  }
  assert(completed);
} finally { longRound.close(); }
console.log("Long training round, actual game points, death continuation and respawn accounting passed");

assert.throws(() => new TrainingArena(undefined, "cautious", undefined, 0), /Evaluation duration/);
assert.throws(() => new TrainingArena(undefined, "cautious", undefined, 300.5), /Evaluation duration/);
let opponentDecisions = 0;
const tournament = new TrainingArena(undefined, "objective", {
  profile: "aggressive", decide: () => { opponentDecisions++; return "SEEK_SEA_CONTROL"; },
}, 300);
try {
  assert.equal(tournament.specification.episodeSeconds, 300);
  tournament.reset(81);
  let result = tournament.step(8);
  while (!result.terminated && !result.truncated) result = tournament.step(8);
  assert.equal(result.info.seconds, 300);
  assert(opponentDecisions > 100, "tournament executes the supplied opponent policy");
} finally { tournament.close(); }
console.log("Tournament opponent injection, live round length and duration validation passed");

// Identical opponents must leave combat unchanged; only the explicit competitive
// reward adds the opponent's actual score delta, including score gained on kills.
const normalReward = new TrainingArena(undefined, "cautious", undefined, 300);
const competitiveReward = new TrainingArena(undefined, "cautious", new DecisionTreeStrategy(), 300);
try {
  assert.deepEqual(normalReward.reset(91), competitiveReward.reset(91));
  let previousOpponentScore = 0;
  for (let i = 0; i < 3000; i++) {
    const normal = normalReward.step(0), competitive = competitiveReward.step(0);
    assert.deepEqual(normal.observation, competitive.observation);
    assert.deepEqual(normal.info, competitive.info);
    const delta = normal.info.opponentScore - previousOpponentScore;
    assert(Math.abs(competitive.reward - (normal.reward - delta * 0.015)) < 1e-8);
    previousOpponentScore = normal.info.opponentScore;
    if (normal.truncated) break;
  }
  assert(previousOpponentScore > 0);
} finally { normalReward.close(); competitiveReward.close(); }
console.log("Competitive reward uses real opponent score without changing game mechanics");
