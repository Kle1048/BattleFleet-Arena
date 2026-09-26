# Client asset lifecycle

## Ownership

- Each ship/wreck owns its procedural hull, debug/weapon/range geometry and materials.
- GLB instances clone materials; geometry and textures belong to the shared GLB cache.
- `disposeShipVisual` frees instance resources once on class change, leave, wreck expiry
  and runtime shutdown. It does not dispose the shared template or sprite texture.
- Shutdown disposes visuals before the caches. Pending results cannot resurrect ships;
  a late parsed GLB is disposed instead of being inserted into the cache.

## Loading

- Lobby/room join do not wait for audio, ship GLBs, islands or water normals.
- Ships start with a sprite/prism, islands with procedural meshes, water with a flat
  normal. Background results replace placeholders without losing the current ship pose.
- Only ship classes in use and their configured mounts/launchers are requested.
- One GLB queue handles at most two fetch/parse jobs; audio has a separate two-job
  fetch/decode queue. Each active job has a 15-second timeout with AbortController.
  Parsing/decoding itself cannot be interrupted; late results are discarded/disposed.
- Failed assets remain failed for the session (no per-frame request storms). Reload to retry.
- Audio starts with engine + ambient A only. Other SFX/music tiers load on demand;
  missing/pending SFX use the existing synth immediately, never replaying stale events.
  A loaded engine loop replaces the temporary synth.
- Music is AAC/M4A; WAV masters live in `client/audio-source/`, outside the public build.
- GLBs are expected to be self-contained. External resources referenced inside a GLTF
  are handled by GLTFLoader and are not separately cancellable by the outer fetch signal.

## Verification

`npm test -w client` includes ownership, async replacement, cache concurrency,
deduplication, failure/timeout/shutdown and lazy audio/engine-upgrade regressions.
The browser smoke test checks a real join and loaded scene; it is not a long-running
GPU-memory or frame-time benchmark. Before shipping new music, also audition it on
target browsers/devices (including seamless loop transitions).
