import assert from "node:assert/strict";
import {
  AD_CIWS_RANGE_SQ,
  AD_PD_RANGE_SQ,
  AD_SAM_RANGE_SQ,
  AD_SAM_PD_INTERCEPT_TRAVEL_MS_MAX,
  AD_SAM_PD_INTERCEPT_TRAVEL_MS_MIN,
  AD_SOFTKILL_COOLDOWN_MS,
  applyHardkillCooldownAfterRoll,
  computeSamPdInterceptTravelMs,
  isHardkillLayerInRange,
  pickHardkillEngagementLayer,
  rollHardkillHit,
  trySoftkillBreakLock,
} from "./airDefense";

{
  const layer = pickHardkillEngagementLayer({
    distSq: AD_SAM_RANGE_SQ * 0.99,
    nowMs: 10_000,
    samNextAtMs: 0,
    pdNextAtMs: 0,
    ciwsNextAtMs: 0,
    samAllowed: true,
    pdAllowed: true,
    ciwsAllowed: true,
  });
  assert.equal(layer, "sam");
  assert.equal(rollHardkillHit("sam", () => 0), true);
}

{
  const layer = pickHardkillEngagementLayer({
    distSq: AD_SAM_RANGE_SQ * 2,
    nowMs: 10_000,
    samNextAtMs: 0,
    pdNextAtMs: 0,
    ciwsNextAtMs: 0,
    samAllowed: true,
    pdAllowed: true,
    ciwsAllowed: true,
  });
  assert.equal(layer, null);
}

{
  const layer = pickHardkillEngagementLayer({
    distSq: 100,
    nowMs: 10_000,
    samNextAtMs: 0,
    pdNextAtMs: 0,
    ciwsNextAtMs: 0,
    samAllowed: true,
    pdAllowed: true,
    ciwsAllowed: true,
  });
  assert.equal(layer, "sam");
}

{
  /** SAM-Fehlschuss → danach PD im mittleren Ring. */
  const now = 10_000;
  let samNext = 0;
  let pdNext = 0;
  let ciwsNext = 0;
  const distSq = 2000;

  let layer = pickHardkillEngagementLayer({
    distSq,
    nowMs: now,
    samNextAtMs: samNext,
    pdNextAtMs: pdNext,
    ciwsNextAtMs: ciwsNext,
    samAllowed: true,
    pdAllowed: true,
    ciwsAllowed: true,
  });
  assert.equal(layer, "sam");
  assert.equal(rollHardkillHit("sam", () => 1), false);
  const cd1 = applyHardkillCooldownAfterRoll("sam", now, samNext, pdNext, ciwsNext);
  samNext = cd1.samNextAtMs;
  pdNext = cd1.pdNextAtMs;
  ciwsNext = cd1.ciwsNextAtMs;

  layer = pickHardkillEngagementLayer({
    distSq,
    nowMs: now,
    samNextAtMs: samNext,
    pdNextAtMs: pdNext,
    ciwsNextAtMs: ciwsNext,
    samAllowed: true,
    pdAllowed: true,
    ciwsAllowed: true,
  });
  assert.equal(layer, "pd");
  assert.equal(rollHardkillHit("pd", () => 0), true);
}

{
  const distSq = AD_CIWS_RANGE_SQ * 1.01;
  assert.ok(distSq <= AD_PD_RANGE_SQ);
  const layer = pickHardkillEngagementLayer({
    distSq,
    nowMs: 10_000,
    samNextAtMs: 0,
    pdNextAtMs: 0,
    ciwsNextAtMs: 0,
    samAllowed: true,
    pdAllowed: true,
    ciwsAllowed: true,
  });
  assert.equal(layer, "sam");
}

{
  /** Nur CIWS-Ring: ohne montiertes CIWS keine Schicht. */
  assert.equal(
    pickHardkillEngagementLayer({
      distSq: 50 * 50,
      nowMs: 10_000,
      samNextAtMs: 0,
      pdNextAtMs: 0,
      ciwsNextAtMs: 0,
      samAllowed: false,
      pdAllowed: false,
      ciwsAllowed: false,
    }),
    null,
  );
  assert.equal(
    pickHardkillEngagementLayer({
      distSq: 50 * 50,
      nowMs: 10_000,
      samNextAtMs: 0,
      pdNextAtMs: 0,
      ciwsNextAtMs: 0,
      samAllowed: false,
      pdAllowed: false,
      ciwsAllowed: true,
    }),
    "ciws",
  );
}

{
  assert.equal(isHardkillLayerInRange("sam", AD_SAM_RANGE_SQ), true);
  assert.equal(isHardkillLayerInRange("sam", AD_SAM_RANGE_SQ * 1.01), false);
  assert.equal(isHardkillLayerInRange("pd", AD_PD_RANGE_SQ), true);
  assert.equal(isHardkillLayerInRange("ciws", AD_CIWS_RANGE_SQ), true);
}

{
  const r = trySoftkillBreakLock({
    nowMs: 1000,
    defenderSoftkillLastUsedAtMs: 0,
    random01: () => 0.1,
  });
  assert.equal(r.attempted, true);
  assert.equal(r.brokeLock, true);
}

{
  const r2 = trySoftkillBreakLock({
    nowMs: 1000,
    defenderSoftkillLastUsedAtMs: 0,
    random01: () => 0.31,
  });
  assert.equal(r2.brokeLock, false);
}

{
  const r3 = trySoftkillBreakLock({
    nowMs: 1000,
    defenderSoftkillLastUsedAtMs: 1000,
    random01: () => 0,
  });
  assert.equal(r3.attempted, false);
}

{
  assert.equal(computeSamPdInterceptTravelMs(0), AD_SAM_PD_INTERCEPT_TRAVEL_MS_MIN);
  const mid = computeSamPdInterceptTravelMs(240);
  assert.ok(mid >= AD_SAM_PD_INTERCEPT_TRAVEL_MS_MIN && mid <= AD_SAM_PD_INTERCEPT_TRAVEL_MS_MAX);
  assert.equal(computeSamPdInterceptTravelMs(1e9), AD_SAM_PD_INTERCEPT_TRAVEL_MS_MAX);
}

console.log("airDefense tests ok");
