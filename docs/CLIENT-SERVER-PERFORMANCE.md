# Client and server hotpaths (review points 10 and 11)

Current update: input transport is now capped at 20 Hz, not render cadence.
See [network load limits](NETWORK-LOAD-LIMITS.md) for pacing, latching and server
admission budgets. The measurements below document the earlier optimization stage.

## Client

- Cockpit model/radar calculations run at most every 50 ms (nominal 20 Hz), not
  once per rendered frame. Life-state, ship-class, radar and match-end changes
  force an immediate refresh. Low or irregular frame rates do not trigger catch-up bursts.
- Input sending, interpolation, follow camera, audio fades and FX retain their
  frame cadence. The real frame regression checks 120 input/FX frames versus
  20 cockpit updates per simulated second, plus immediate state transitions.
- HUD text, styles, attributes and classes are written only on changes. Magazine
  nodes are rebuilt only when normalized capacity/remaining counts change.
  Radar groups retain their existing change keys and are cleared once when hidden.
- Per-runtime player indexes and air-defense reference arrays are reused. Targeting
  reads schema references synchronously; it does not retain historical snapshots.
  Wreck ID sets are double-buffered, roll cleanup consumes the visual map directly,
  and ground picking reuses THREE vectors.
- Ship visual tuning is cached by class and invalidated on `applyShipDebugTuning`.
  Authoritative class content remains static during a session.
- Environment/bot debug panels are dynamically imported only on demand:
  `window.__SCA.showDevHud(true)` or `?debug=1`. Bot debug renders at most 10 Hz
  and stops while the developer HUD is hidden. Persisted ship tuning still loads
  at startup independently of the optional panels. Server-side production checks
  on debug commands are unchanged; hiding UI is not authorization.
  The production build moves about 25 kB (7.4 kB gzip) into the optional debug
  chunk; the main entry shrank from approximately 211 to 189 kB before gzip.

## Server

- Participant and connected-client maps replace linear lookups. Only
  `joinNewParticipant`/`detachParticipant` and human `onJoin` own these indexes;
  bots have no client entry. Round reset mutates existing schema objects and
  therefore retains index identity; leaving/rejoining replaces it.
- Movement configs are cached per player and recomputed on class or level change.
  Base movement settings and authoritative hull content are static server content.
- Air-defense scratch maps, collision participant arrays and collision pair sets
  are reused. Tick-local ram damage is merged without copying a third map.
  Passive-XP/OOB settings are read once per relevant pass, preserving live admin changes.
- Player lookup inside pair checks is now O(1); the physical pair checks remain
  O(n²). This does not replace a spatial index or the later simulation decomposition.
- Each room records a bounded 200-sample window of physics self-times. The protected
  `/api/admin/status` exposes `rooms[].tickMs` with `samples`, `mean`, `p95`, `max`
  in milliseconds. Percentiles are calculated on request, not each simulation tick.
  They exclude network encoding, event-loop scheduling delay and browser rendering.

## Reproducible measurement

From the repository root:

```sh
node --conditions=bfa-source --import tsx scripts/benchmark-ticks.mjs
```

Local Windows / Node 22.17.0 measurements, 100 warm-up ticks + 400 samples:

| Synthetic load | Before median / p95 | After median / p95 |
| --- | --- | --- |
| 16 participants, 32 missiles | 1.92 / 3.20 ms | 1.53 / 2.64 ms |
| 64 participants, 128 missiles | 29.96 / 37.08 ms | 17.68 / 24.12 ms |

The benchmark fixes random seed and simulation time, uses an isolated temporary
data directory, and replenishes fresh missiles outside the measured step. Ships
have no movement input; there are no network clients or bot brains. Missile
replenishment exercises initial-flight/air-defense work, not the full lifetime of
every projectile. The 64-participant case is a synthetic stress case, not a new
supported player limit. These single-machine results show a trend, not a promised
FPS improvement or production capacity. Repeat on target hardware and follow up
with real multiplayer/bot workloads and browser frame-time/GPU profiling.

## Scope

Regression coverage includes participant/bot join/leave/reset, cache invalidation,
HUD cadence and urgent updates, unchanged DOM writes, radar hide/show, deferred UI
shutdown and storage migration. Particles (point 14), the large renderer bundle,
simulation architecture (point 12) and persistence (point 13) remain separate work.
The production-preview smoke test confirmed a real room join, a radar toggle and
optional debug-panel loading. The protected admin endpoint returned live bounded
tick metrics; this two-participant smoke test is not a capacity benchmark.

## Weapon launch stalls (30 September 2026)

An isolated browser probe (`fire-benchmark.html`, included only in
`build:benchmark`) reproduces six artillery shots and six SSM launches with
particles and audio disabled. It counts actual WebGL shader compilations/program
links and records launch, following-frame and removal timings at 1280x720, DPR 1.

Before the fix, every separated launch recreated geometry/materials; disposing
the last projectile released its shader programs. Subsequent launches compiled
four shaders and linked two programs again (main and water-reflection variants).
Measured render submission took 13.5–17.6 ms for repeated launches and roughly
98–104 ms on first use, even without particles or sound.

Artillery and SSM now retain one geometry/material pair each for the session,
removing only projectile objects on expiry. A real warmup draw beneath the session
loading backdrop prepares both weapons, including reflection/shadow paths, then
clears the probe pixels. Session disposal releases the retained resources once.
The same twelve-launch probe then recorded zero compile/link calls during firing,
0.3–0.7 ms render submission, and stable geometry/program counts across idle gaps.
These are isolated desktop-browser CPU timings, not GPU measurements or a claim
about all sources of frame drops in a live match. A 100-cycle regression test
covers shared ownership, impact/timeout/null cleanup and failed-warmup cleanup.

## Brighter hulls and muzzle illumination (local experiment)

The three lighting presets now use brighter hemisphere fill, including the lower
hemisphere, and modestly stronger sunlight. Exposure is unchanged. Sun direction
and its existing 1024-square shadow map remain dynamic; no new shadow pass is
introduced. The FX preview offers non-persisted sun-angle controls and separate
model/muzzle views.

Artillery muzzle flashes reuse the two permanently attached impact lights, with
an 85 ms quadratic fade, 55 m range, actual barrel height and 700 m visibility
cutoff. Active impacts have priority over muzzle flashes. No additional light or
shadow map is created on firing; unit tests cover priority, height and lifetime.

At 1280x720/DPR 1, the open-water static GPU probe measured 2.79 ms median before
this change and 3.73/3.63 ms afterwards (120 samples each, 60 warmup frames).
These sequential development-browser samples do not isolate causality or measure
active muzzle flashes; they do not establish zero overhead or live-match FPS.
Three warmed 16-ship combat replays then recorded median frame intervals of
17.7/17.5/17.5 ms, p95 18.3/18.2/18.2 ms, and no frames above 50 ms across 5,400
measured frames. Median draw count remained 266. This excludes network and audio.
