# BattleFleet Arena â€” Entwickler-Log

Automatische Kurz-Dokumentation pro **Git-Commit** (Metadaten + Vorschlag fÃ¼r einen Post zu **Vibejam** / KI-generierte bzw. KI-unterstÃ¼tzte Spiele).

## Einmalig: Hook aktivieren

Im Repository-Root:

```bash
git config core.hooksPath scripts/git-hooks
```

Danach wird bei jedem Commit (auÃŸer **Merge-Commits**) unten ein neuer Block angehÃ¤ngt. Manuell nachziehen:

```bash
npm run devlog:append
```

---

<!-- Neue EintrÃ¤ge erscheinen unter dieser Linie -->

## 2026-04-11 â€” `ab3fab3`

- **Autor:** Klemens1048
- **Commit:** feat(audio): Spiel-SFX mit WAV-Assets und Server-Anbindung

**Details:**

- Client: soundCatalog, gameAudio mit Preload und Synth-Fallbacks, Netzwerk-Callbacks in main und networkRuntime (u. a. Kollisionen, Waffentreffer, ASuM Lock-on, Luftverteidigung).
- Server: BattleRoom sendet passende Colyseus-Messages an betroffene Clients.
- Shared: collisionContactQueries mit Tests; Dokumentation in docs/SOUND-MODULE.md.
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> âš“ feat(audio): Spiel-SFX mit WAV-Assets und Server-Anbindung â€” BattleFleet Arena nimmt Fahrt auf fÃ¼r #Vibejam: KI-unterstÃ¼tztes Naval-RTS. Wer baut noch mit am Jam? #gamedev #AIgames

---

## 2026-04-12 â€” Gameplay: ASuM-Magazine, Progression, Schiffsklassen; Visuals: Umwelt & Wasser

- **Autor:** Klemens1048
- **Commit:** Gameplay: ASuM-Magazine, Progression, Schiffsklassen; Visuals: Umwelt & Wasser

**Details:**

- - ASuM: Magazin port/starboard, Schussabstand 1s, Magic Reload pro Rumpf (20/30/40s), Toast aswmMagazineReloaded
- - Progression: Tod nur -1 Level; OffiziersrÃ¤nge EN im HUD/Scoreboard/Toast; Level 5â†’ZerstÃ¶rer, 7â†’Kreuzer (shipClassIdForProgressionLevel)
- - Lobby: nur Name, Server-FAC; Klassenwahl entfernt; shared shipMovement-Import fix
- - Schiffe: gleiches FAC-GLB fÃ¼r DD/CG mit hullVisualScale; Rumpf-Profile & Tests
- - Client: Environment (Sonne, Lighting, Foam), Reflection-Layers, Wake-Tuning, Wasser-Debug-Panel ersetzt
- - docs: Architektur, Visuals-Plan, Ship-Model, Dev-Log; scripts append-dev-log, post-commit hook
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> Shipped: Gameplay: ASuM-Magazine, Progression, Schiffsklassen; Visuals: Umwelt & Wasser ðŸš¢ Wir hacken an einem AI-collab Wettkampfspiel â€” #Vibejam #indiedev

---

## 2026-04-12 â€” Snapshot: 3D hull GLBs, class visuals, tuning & perf (bad FPS)

- **Autor:** Klemens1048
- **Commit:** Snapshot: 3D hull GLBs, class visuals, tuning & perf (bad FPS)

**Details:**

- Includes hull profile cache, visual dirty checks, progression ship classes, feature-module inventory doc. Branch label: 3D Modells implemented bad FPS.
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> âš“ Snapshot: 3D hull GLBs, class visuals, tuning & perf (bad FPS) â€” BattleFleet Arena nimmt Fahrt auf fÃ¼r #Vibejam: KI-unterstÃ¼tztes Naval-RTS. Wer baut noch mit am Jam? #gamedev #AIgames

---

## 2026-04-12 â€” `589a951`

- **Autor:** Klemens1048
- **Commit:** Client: Performance, Insel-GLBs, Karte, Kamera, ESM & visuelle StabilitÃ¤t

**Details:**

- - Frame-Runtime: Spieler-Map, kein Pose-Alloc bei Raketen/Minen, wiederverwendete Sets, Tuning-Cache fÃ¼r Schiffsvisuals
- - Wakes nur lokaler Spieler; HUD-Radar-Diffs; Bot-Debug billiger wenn aus
- - Wasser/Schatten/Kamera-Shake gegen Flimmern; PCF-Soft, hÃ¶here Shadow-Map
- - Inseln: drei GLB-Modelle (Map-Details), Shallow-Zwillings-Rotation
- - Einsatzgebiet & Inseln ~2x (AREA_OF_OPERATIONS_HALF_EXTENT 1800)
- - Follow-Cam-Defaults: 35Â°, 200 m, Head-up, 0,2 s Gier-VerzÃ¶gerung
- - ESM-Reichweite 2Ã— Suchrad; RADAR_ESM_RANGE_WORLD
- - Tests: cockpitRadarKeys, radarHudMath ESM
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> Shipped: Client: Performance, Insel-GLBs, Karte, Kamera, ESM & visuelle StabilitÃ¤t ðŸš¢ Wir hacken an einem AI-collab Wettkampfspiel â€” #Vibejam #indiedev

---

## 2026-04-12 â€” `f4428f2`

- **Autor:** Klemens1048
- **Commit:** feat(client,hud,shared): ASuM HUD, Colyseus BattleState, air defense, ship layout fixes

**Details:**

- - Cockpit: BB/STB magazine grid, Comms/Debug docked to cockpit columns, HUD scale
- - Client: BattleState join schema, frame HUD fields, message log placeholder
- - Shared: PlayerState ASuM rounds, destroyer hull Y offset, artillery/airDefense updates
- - Server: BattleRoom sync for ASuM magazine; assorted client FX/runtime tweaks
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> Shipped: feat(client,hud,shared): ASuM HUD, Colyseus BattleState, air defense, ship layout fixes ðŸš¢ Wir hacken an einem AI-collab Wettkampfspiel â€” #Vibejam #indiedev

---

## 2026-04-12 â€” `7d84f9a`

- **Autor:** Klemens1048
- **Commit:** feat(client): ship workbench entry (editor.html) + Vite multi-page

**Details:**

- - Second page editor.html: orbit camera, water scene, class switcher, Schiffsprofil dialog
- - dev:editor / npm run dev:editor; build outputs dist/editor.html
- - editorShell.css mirrors ship-editor styles from index for profile overlay
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> Shipped: feat(client): ship workbench entry (editor.html) + Vite multi-page ðŸš¢ Wir hacken an einem AI-collab Wettkampfspiel â€” #Vibejam #indiedev

---

## 2026-04-13 â€” `2343f3c`

- **Autor:** Klemens1048
- **Commit:** feat(client,shared,server): workbench ship markers, air-defense targeting, profile JSON

**Details:**

- - Editor: workbenchShipMarkers, shell/CSS, mount GLBs (inkl. PDMS)
- - Shared: airDefenseMissileTargeting, shipProfileEditorJson, mountFireSector/shipVisualLayout tests
- - Client runtime/HUD: weapon schematic mini, mount URLs, ship visuals; BattleRoom sync
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> Update: feat(client,shared,server): workbench ship markers, air-defense targeting, profile JSON | Naval Arena WIP Â· #Vibejam Â· wenn Code & KI zusammenlaufen âš”ï¸ðŸŽ®

---

## 2026-04-14 â€” `a8dfbd3`

- **Autor:** Klemens1048
- **Commit:** client: Mobile-HUD, kollabierbare Panels und Comms-Log

**Details:**

- - NippleJS-Joystick plus Touch-Button-Grid; Merge mit Tastatur/Maus-Input.
- - BrÃ¼cke/OPZ/Debug-Overlay per Toggle verkleinerbar (Kurs bzw. HP bzw. FPS/Ping); Zustand in localStorage.
- - Comms-Room: transparentes Panel, Scroll-Log, Toast-Spiegelung, Leeren; Verbindungszeile nach Join.
- - Bot-Debug per Button; Environment- und Bot-Panel im gemeinsamen bottom-debug-dock.
- - nipplejs-Dependency; messageLog ersetzt Placeholder.
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> Shipped: client: Mobile-HUD, kollabierbare Panels und Comms-Log ðŸš¢ Wir hacken an einem AI-collab Wettkampfspiel â€” #Vibejam #indiedev

---

## 2026-04-18 â€” `48afbc6`

- **Autor:** Klemens1048
- **Commit:** feat: ship wake ribbons, mounts/sockets, editor & gameplay polish

**Details:**

- - Replace legacy wake trail with shader-based ribbon (all ships, LOD, stern at SHIP_STERN_Z)
- - Shared: wakeRibbonMath, wakeLod, mount ranges, primary artillery engagement, mount socket JSON
- - Client: fire control channel, weapon sector overlay, GLB socket helpers, hull updates
- - Server/shared: ship profiles, hitbox, air defense, torpedo tweaks; test runner script
- - Docs: DEV-LOG, Ship-Model-Module; remove obsolete wakeTrail/wakeRuntimeTuning
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> âš“ feat: ship wake ribbons, mounts/sockets, editor & gameplay polish â€” BattleFleet Arena nimmt Fahrt auf fÃ¼r #Vibejam: KI-unterstÃ¼tztes Naval-RTS. Wer baut noch mit am Jam? #gamedev #AIgames

---

## 2026-04-19 â€” `32a4d26`

- **Autor:** Klemens1048
- **Commit:** chore: spielbarer MVP-Prototyp â€” Feature-BÃ¼ndel vor Optimierungsphase

**Details:**

- - Gameplay: Sea Control, ESM/AD-FX, Respawn/Wreck (Klasse bis Respawn), Match/Score
- - Client: HUD/Radar, Schiff/Roll/Wake, Bots, Editor-Workbench; Hull-GLBs
- - Shared: seaControl, esmDetection, aswmShipAim, Tests; Ship-Daten & Schema
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> Shipped: chore: spielbarer MVP-Prototyp â€” Feature-BÃ¼ndel vor Optimierungsphase ðŸš¢ Wir hacken an einem AI-collab Wettkampfspiel â€” #Vibejam #indiedev

---

## 2026-04-20

- **Author:** Klemens1048
- **Commit:** feat: mobiles Steuer- und Kampf-UX, Wrecks, Locale und Server-Erweiterungen

**Details:**

- Client: machinery telegraph with discrete steps, mobile softkeys (no nipplejs), fixed-screen aim reticle and primary fire along viewport ray each frame, mobile browser guards, shared crosshair SVG, English locale module, mission briefing, frame/HUD runtime, wreck visuals and debug, docs and sounds.
- Shared/Server: wrecks, ram and shipâ€“ship collision, schema and ASuM updates, BattleRoom extensions; dependency cleanup.
- Made-with: Cursor

### Suggested post (Twitter / X, #Vibejam)

> Shipped: feat: mobiles Steuer- und Kampf-UX, Wrecks, Locale und Server-Erweiterungen ðŸš¢ AI-assisted competitive game â€” #Vibejam #indiedev

---

## 2026-04-21

- **Author:** Klemens1048
- **Commit:** Island polygon collision, editor, and HUD/input fixes

**Details:**

- - Drive island collision from shared convex polygons with optional JSON overrides (mapIslandPolygonOverrides) merged in islandPolygonGeometry.
- - Add mapIslands layout source, islandPolygonEditor Vite page, GLB convex footprint helper, and convexHull2d for mesh hull export.
- - BattleRoom: polygon overlaps, circle-vs-polygon for missiles/torpedoes, island scrape damage on first overlap edge.
- - Client: island collision debug toggle, bot avoidance on polygons, frameRuntime bot fix (telegraph wire only when useTelegraphWire === true).
- - Cockpit bridge drops speed/course readouts (course remains on radar); remove temporary SOG strip from telegraph.
- - Update artillery, respawn, collision queries, and tests for polygon APIs.
- Made-with: Cursor

### Suggested post (Twitter / X, #Vibejam)

> Shipped: Island polygon collision, editor, and HUD/input fixes ðŸš¢ AI-assisted competitive game â€” #Vibejam #indiedev

---
---

## 2026-04-22

- **Author:** Klemens1048
- **Commit:** chore(vercel): set outputDirectory to client/dist and monorepo build

**Details:**

- Made-with: Cursor

### Suggested post (Twitter / X, #Vibejam)

> ⚓ chore(vercel): set outputDirectory to client/dist and monorepo build — BattleFleet Arena, naval RTS for #Vibejam. Who else is shipping? #gamedev #AIgames

---

## 2026-04-22

- **Author:** Klemens1048
- **Commit:** feat: server bots + shared bot module, client/runtime updates

**Details:**

- Made-with: Cursor

### Suggested post (Twitter / X, #Vibejam)

> Shipped: feat: server bots + shared bot module, client/runtime updates 🚢 AI-assisted competitive game — #Vibejam #indiedev

---

## 2026-04-22

- **Author:** Klemens1048
- **Commit:** feat: server bots + shared bot module, client/runtime updates

**Details:**

- Made-with: Cursor

### Suggested post (Twitter / X, #Vibejam)

> ⚓ feat: server bots + shared bot module, client/runtime updates — BattleFleet Arena, naval RTS for #Vibejam. Who else is shipping? #gamedev #AIgames

---

## 2026-04-22

- **Author:** Klemens1048
- **Commit:** chore(docs): dev-log hook follow-up

**Details:**

- Made-with: Cursor

### Suggested post (Twitter / X, #Vibejam)

> ⚓ chore(docs): dev-log hook follow-up — BattleFleet Arena, naval RTS for #Vibejam. Who else is shipping? #gamedev #AIgames

---

## 2026-04-22

- **Author:** Klemens1048
- **Commit:** feat: Vibe Jam portal flow, radar markers, black-hole visuals

**Details:**

- - Add client portal rings, hub/return redirects, session ref capture, briefing skip for portal entry.
- - Show portal positions on cockpit radar (rim clamp); portal marker styles and HUD wiring.
- - Shared sanitizePortalReturnRef and hub URL; tests for sanitizer and radar keys.
- - Black-hole style portal meshes; .env.example and Vite env types for production deploy.
- - Cap server bot fill tests at MAX_SERVER_BOTS (5).
- Made-with: Cursor

### Suggested post (Twitter / X, #Vibejam)

> Update: feat: Vibe Jam portal flow, radar markers, black-hole visuals | Naval arena WIP · #Vibejam · code + play ⚔️🎮

---

## 2026-04-23

- **Author:** Klemens1048
- **Commit:** feat: improve AD pacing, UI copy, and server bootstrap flow

**Details:**

- Adjust air-defense timing to prevent simultaneous SAM launches, localize remaining fire-control text in the client, and add server startup/bootstrap updates including leaderboard wiring.
- Made-with: Cursor

### Suggested post (Twitter / X, #Vibejam)

> Shipped: feat: improve AD pacing, UI copy, and server bootstrap flow 🚢 AI-assisted competitive game — #Vibejam #indiedev

---

## 2026-04-23

- **Author:** Klemens1048
- **Commit:** feat: improve AD pacing, UI copy, and server bootstrap flow

**Details:**

- Adjust air-defense timing to prevent simultaneous SAM launches, localize remaining fire-control text in the client, and add server startup/bootstrap updates including leaderboard wiring.
- Made-with: Cursor

### Suggested post (Twitter / X, #Vibejam)

> Update: feat: improve AD pacing, UI copy, and server bootstrap flow | Naval arena WIP · #Vibejam · code + play ⚔️🎮

