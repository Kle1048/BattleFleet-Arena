import assert from "node:assert/strict";
import {
  AD_CIWS_RANGE_SQ,
  AD_SAM_RANGE_SQ,
  applyAirDefenseCooldownAfterRoll,
  isAirDefenseLayerInRange,
  pickAirDefenseEngagementLayer,
  rollAirDefenseHit,
} from "./airDefense";

{
  const layer = pickAirDefenseEngagementLayer({
    distSq: AD_SAM_RANGE_SQ * 0.99,
    nowMs: 10_000,
    samNextAtMs: 0,
    ciwsNextAtMs: 0,
  });
  assert.equal(layer, "sam");
  assert.equal(rollAirDefenseHit("sam", () => 0), true);
}

{
  const layer = pickAirDefenseEngagementLayer({
    distSq: AD_SAM_RANGE_SQ * 2,
    nowMs: 10_000,
    samNextAtMs: 0,
    ciwsNextAtMs: 0,
  });
  assert.equal(layer, null);
}

{
  const layer = pickAirDefenseEngagementLayer({
    distSq: 100,
    nowMs: 10_000,
    samNextAtMs: 0,
    ciwsNextAtMs: 0,
  });
  assert.equal(layer, "sam");
}

{
  /** SAM-Fehlschuss → Cooldown → danach CIWS-Angebot im überlappenden Ring. */
  const now = 10_000;
  let samNext = 0;
  let ciwsNext = 0;
  const distSq = 100;

  let layer = pickAirDefenseEngagementLayer({
    distSq,
    nowMs: now,
    samNextAtMs: samNext,
    ciwsNextAtMs: ciwsNext,
  });
  assert.equal(layer, "sam");
  assert.equal(rollAirDefenseHit("sam", () => 1), false);
  const cd1 = applyAirDefenseCooldownAfterRoll("sam", now, samNext, ciwsNext);
  samNext = cd1.samNextAtMs;
  ciwsNext = cd1.ciwsNextAtMs;

  layer = pickAirDefenseEngagementLayer({
    distSq,
    nowMs: now,
    samNextAtMs: samNext,
    ciwsNextAtMs: ciwsNext,
  });
  assert.equal(layer, "ciws");
  assert.equal(rollAirDefenseHit("ciws", () => 0), true);
}

{
  const distSq = AD_CIWS_RANGE_SQ * 1.01;
  assert.ok(distSq <= AD_SAM_RANGE_SQ);
  const layer = pickAirDefenseEngagementLayer({
    distSq,
    nowMs: 10_000,
    samNextAtMs: 0,
    ciwsNextAtMs: 0,
  });
  assert.equal(layer, "sam");
}

{
  assert.equal(isAirDefenseLayerInRange("sam", AD_SAM_RANGE_SQ), true);
  assert.equal(isAirDefenseLayerInRange("sam", AD_SAM_RANGE_SQ * 1.01), false);
  assert.equal(isAirDefenseLayerInRange("ciws", AD_CIWS_RANGE_SQ), true);
}

console.log("airDefense tests ok");
