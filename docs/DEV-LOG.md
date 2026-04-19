# BattleFleet Arena — Entwickler-Log

Automatische Kurz-Dokumentation pro **Git-Commit** (Metadaten + Vorschlag für einen Post zu **Vibejam** / KI-generierte bzw. KI-unterstützte Spiele).

## Einmalig: Hook aktivieren

Im Repository-Root:

```bash
git config core.hooksPath scripts/git-hooks
```

Danach wird bei jedem Commit (außer **Merge-Commits**) unten ein neuer Block angehängt. Manuell nachziehen:

```bash
npm run devlog:append
```

---

<!-- Neue Einträge erscheinen unter dieser Linie -->

## 2026-04-11 — `ab3fab3`

- **Autor:** Klemens1048
- **Commit:** feat(audio): Spiel-SFX mit WAV-Assets und Server-Anbindung

**Details:**

- Client: soundCatalog, gameAudio mit Preload und Synth-Fallbacks, Netzwerk-Callbacks in main und networkRuntime (u. a. Kollisionen, Waffentreffer, ASuM Lock-on, Luftverteidigung).
- Server: BattleRoom sendet passende Colyseus-Messages an betroffene Clients.
- Shared: collisionContactQueries mit Tests; Dokumentation in docs/SOUND-MODULE.md.
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> ⚓ feat(audio): Spiel-SFX mit WAV-Assets und Server-Anbindung — BattleFleet Arena nimmt Fahrt auf für #Vibejam: KI-unterstütztes Naval-RTS. Wer baut noch mit am Jam? #gamedev #AIgames

---

## 2026-04-12 — Gameplay: ASuM-Magazine, Progression, Schiffsklassen; Visuals: Umwelt & Wasser

- **Autor:** Klemens1048
- **Commit:** Gameplay: ASuM-Magazine, Progression, Schiffsklassen; Visuals: Umwelt & Wasser

**Details:**

- - ASuM: Magazin port/starboard, Schussabstand 1s, Magic Reload pro Rumpf (20/30/40s), Toast aswmMagazineReloaded
- - Progression: Tod nur -1 Level; Offiziersränge EN im HUD/Scoreboard/Toast; Level 5→Zerstörer, 7→Kreuzer (shipClassIdForProgressionLevel)
- - Lobby: nur Name, Server-FAC; Klassenwahl entfernt; shared shipMovement-Import fix
- - Schiffe: gleiches FAC-GLB für DD/CG mit hullVisualScale; Rumpf-Profile & Tests
- - Client: Environment (Sonne, Lighting, Foam), Reflection-Layers, Wake-Tuning, Wasser-Debug-Panel ersetzt
- - docs: Architektur, Visuals-Plan, Ship-Model, Dev-Log; scripts append-dev-log, post-commit hook
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> Shipped: Gameplay: ASuM-Magazine, Progression, Schiffsklassen; Visuals: Umwelt & Wasser 🚢 Wir hacken an einem AI-collab Wettkampfspiel — #Vibejam #indiedev

---

## 2026-04-12 — Snapshot: 3D hull GLBs, class visuals, tuning & perf (bad FPS)

- **Autor:** Klemens1048
- **Commit:** Snapshot: 3D hull GLBs, class visuals, tuning & perf (bad FPS)

**Details:**

- Includes hull profile cache, visual dirty checks, progression ship classes, feature-module inventory doc. Branch label: 3D Modells implemented bad FPS.
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> ⚓ Snapshot: 3D hull GLBs, class visuals, tuning & perf (bad FPS) — BattleFleet Arena nimmt Fahrt auf für #Vibejam: KI-unterstütztes Naval-RTS. Wer baut noch mit am Jam? #gamedev #AIgames

---

## 2026-04-12 — `589a951`

- **Autor:** Klemens1048
- **Commit:** Client: Performance, Insel-GLBs, Karte, Kamera, ESM & visuelle Stabilität

**Details:**

- - Frame-Runtime: Spieler-Map, kein Pose-Alloc bei Raketen/Minen, wiederverwendete Sets, Tuning-Cache für Schiffsvisuals
- - Wakes nur lokaler Spieler; HUD-Radar-Diffs; Bot-Debug billiger wenn aus
- - Wasser/Schatten/Kamera-Shake gegen Flimmern; PCF-Soft, höhere Shadow-Map
- - Inseln: drei GLB-Modelle (Map-Details), Shallow-Zwillings-Rotation
- - Einsatzgebiet & Inseln ~2x (AREA_OF_OPERATIONS_HALF_EXTENT 1800)
- - Follow-Cam-Defaults: 35°, 200 m, Head-up, 0,2 s Gier-Verzögerung
- - ESM-Reichweite 2× Suchrad; RADAR_ESM_RANGE_WORLD
- - Tests: cockpitRadarKeys, radarHudMath ESM
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> Shipped: Client: Performance, Insel-GLBs, Karte, Kamera, ESM & visuelle Stabilität 🚢 Wir hacken an einem AI-collab Wettkampfspiel — #Vibejam #indiedev

---

## 2026-04-12 — `f4428f2`

- **Autor:** Klemens1048
- **Commit:** feat(client,hud,shared): ASuM HUD, Colyseus BattleState, air defense, ship layout fixes

**Details:**

- - Cockpit: BB/STB magazine grid, Comms/Debug docked to cockpit columns, HUD scale
- - Client: BattleState join schema, frame HUD fields, message log placeholder
- - Shared: PlayerState ASuM rounds, destroyer hull Y offset, artillery/airDefense updates
- - Server: BattleRoom sync for ASuM magazine; assorted client FX/runtime tweaks
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> Shipped: feat(client,hud,shared): ASuM HUD, Colyseus BattleState, air defense, ship layout fixes 🚢 Wir hacken an einem AI-collab Wettkampfspiel — #Vibejam #indiedev

---

## 2026-04-12 — `7d84f9a`

- **Autor:** Klemens1048
- **Commit:** feat(client): ship workbench entry (editor.html) + Vite multi-page

**Details:**

- - Second page editor.html: orbit camera, water scene, class switcher, Schiffsprofil dialog
- - dev:editor / npm run dev:editor; build outputs dist/editor.html
- - editorShell.css mirrors ship-editor styles from index for profile overlay
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> Shipped: feat(client): ship workbench entry (editor.html) + Vite multi-page 🚢 Wir hacken an einem AI-collab Wettkampfspiel — #Vibejam #indiedev

---

## 2026-04-13 — `2343f3c`

- **Autor:** Klemens1048
- **Commit:** feat(client,shared,server): workbench ship markers, air-defense targeting, profile JSON

**Details:**

- - Editor: workbenchShipMarkers, shell/CSS, mount GLBs (inkl. PDMS)
- - Shared: airDefenseMissileTargeting, shipProfileEditorJson, mountFireSector/shipVisualLayout tests
- - Client runtime/HUD: weapon schematic mini, mount URLs, ship visuals; BattleRoom sync
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> Update: feat(client,shared,server): workbench ship markers, air-defense targeting, profile JSON | Naval Arena WIP · #Vibejam · wenn Code & KI zusammenlaufen ⚔️🎮

---

## 2026-04-14 — `a8dfbd3`

- **Autor:** Klemens1048
- **Commit:** client: Mobile-HUD, kollabierbare Panels und Comms-Log

**Details:**

- - NippleJS-Joystick plus Touch-Button-Grid; Merge mit Tastatur/Maus-Input.
- - Brücke/OPZ/Debug-Overlay per Toggle verkleinerbar (Kurs bzw. HP bzw. FPS/Ping); Zustand in localStorage.
- - Comms-Room: transparentes Panel, Scroll-Log, Toast-Spiegelung, Leeren; Verbindungszeile nach Join.
- - Bot-Debug per Button; Environment- und Bot-Panel im gemeinsamen bottom-debug-dock.
- - nipplejs-Dependency; messageLog ersetzt Placeholder.
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> Shipped: client: Mobile-HUD, kollabierbare Panels und Comms-Log 🚢 Wir hacken an einem AI-collab Wettkampfspiel — #Vibejam #indiedev

---

## 2026-04-18 — `48afbc6`

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

> ⚓ feat: ship wake ribbons, mounts/sockets, editor & gameplay polish — BattleFleet Arena nimmt Fahrt auf für #Vibejam: KI-unterstütztes Naval-RTS. Wer baut noch mit am Jam? #gamedev #AIgames

---

## 2026-04-19 — `32a4d26`

- **Autor:** Klemens1048
- **Commit:** chore: spielbarer MVP-Prototyp — Feature-Bündel vor Optimierungsphase

**Details:**

- - Gameplay: Sea Control, ESM/AD-FX, Respawn/Wreck (Klasse bis Respawn), Match/Score
- - Client: HUD/Radar, Schiff/Roll/Wake, Bots, Editor-Workbench; Hull-GLBs
- - Shared: seaControl, esmDetection, aswmShipAim, Tests; Ship-Daten & Schema
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> Shipped: chore: spielbarer MVP-Prototyp — Feature-Bündel vor Optimierungsphase 🚢 Wir hacken an einem AI-collab Wettkampfspiel — #Vibejam #indiedev

