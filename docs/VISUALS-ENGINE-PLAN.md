# BattleFleet Arena - Visuals & Graphics Engine Plan

Stand: April 2026  
Ziel: Nach MVP-Deploy die Grafik systematisch ausbauen, ohne Stabilitaet und Wartbarkeit zu verlieren.

**Siehe auch:** [Ship-Model-Module.md](./Ship-Model-Module.md) — glTF-Rümpfe, Mount-GLBs, Koordinaten, Blender-Namenskonventionen.

---

## 0) Umsetzungsstatus (Update)

Stand heute auf Branch `feature/Visuals`:

- **Phase R1 (Orchestrierung aufbrechen): Abgeschlossen**
  - `main.ts` wurde von einem God-File zu einem klaren Orchestrator reduziert
  - Runtime-Module sind eingefuehrt (`sessionBootstrap`, `rendererLifecycle`, `runtimeErrors`, `networkRuntime`, `visualRuntime`, `hudRuntime`, `frameRuntime`, `stateAdapter`)
- **Phase R2 (Renderer-Interfaces): Weitgehend abgeschlossen**
  - gemeinsamer Contract `GameRenderer<TSync>` eingefuehrt
  - Projectile- und Ship-Renderer sind auf `sync/update/dispose` ausgerichtet
  - zentrale Shutdown-Pipeline mit `dispose()` ist vorhanden
- **Phase R3 (Event-/State-Adapter): Grundgeruest abgeschlossen**
  - `networkStateAdapter` und `matchEventAdapter` sind produktiv integriert
  - Parsing/Mapping ist aus Runtime-Hotpaths ausgelagert
- **Phase R4 (Asset-/Material-Library): In Umsetzung**
  - `materialLibrary.ts` ist produktiv in Scene/Ship/Projectile-Visuals integriert
  - `assetManager.ts` ist aktiv im Runtime-Lifecycle (`load`/`dispose`)
  - erstes echtes Asset wird ueber `assetCatalog` aus `client/public/assets` geladen (Wasser-Pattern)
- **Phase R5 (Performance-Haertung): In Umsetzung**
  - VFX-Pooling ist fuer Artillery/Missile/Torpedo produktiv
  - Frame-Zeit und FX-Statistiken laufen im Debug-Overlay
  - Guardrails aktiv: Max-Active-Limits mit soft-drop bei Impact-/Transient-Spitzen

Offen fuer die naechsten Iterationen:
- R4 (Restarbeiten: weitere Assets + Material-Standardisierung)
- R5 (Feintuning der Budgets/Schwellwerte + ggf. adaptive Limits)

---

## 1) Zielbild

Wir bauen die Grafik nicht als "mehr Effekte", sondern als wartbare Visual-Engine mit klaren Grenzen:

1. Rendering ist modular (Scene, Entities, VFX, PostFX, UI-Overlay)
2. `main.ts` orchestriert nur noch Bootstrap + Lifecycle
3. Spielzustand (Netcode) und Darstellung (Visuals) sind entkoppelt
4. Performance-Budgets sind definiert und messbar
5. Neue Effekte/Assets sind als Daten + Module integrierbar, ohne Kernlogik anzufassen

---

## 2) Themen-Hierarchie (Grafik umfassend)

Diese Hierarchie dient als Leitstruktur fuer Backlog, Sprints und Ownership:

## A. Art Direction & Visual Identity
### A1. Stilrahmen
- Top-down naval combat look
- Farbpalette (Wasser, UI, Team-/Statusfarben)
- Materialsprache (metallisch, cartoonig, realistisch-light)

### A2. Lesbarkeit im Gameplay
- Prioritaetsfarben fuer Gefahr/Treffer/Spawn-Schutz/OOB
- Kontrastregeln fuer Schiffe, Projektile und Inseln
- "Readability first" vor reinem Realismus

### A3. Konsistenz
- Einheitliche Farb-/Glow-/Opacity-Regeln ueber alle VFX
- Einheitliches Timing (Impact-, Warning-, Toast-Dauern)
- Einheitliche Layering-Regeln (`renderOrder`, `depthTest`)

## B. Asset Pipeline
### B1. Asset-Arten
- Ships (Klassen-spezifische Meshes)
- Environment (islands, water details, debris)
- FX sprites/textures (smoke, wake, spark, shock rings)
- UI visual assets (icons, badges)

### B2. Pipeline
- Source of truth pro Asset (Datei, Owner, Version)
- Export-Konvention (Format, Scale, Pivot, Naming) — für **Schiffe** (Rumpf + Mount-GLBs, Achsen, Dateizuordnung) ausführlich: **[Ship-Model-Module.md](./Ship-Model-Module.md)**
- Build-Schritte (Compression, optional texture-atlas)

### B3. Runtime-Handling
- Zentraler AssetManager (load/cache/release)
- Lazy loading fuer nicht-kritische Assets
- Fallbacks bei fehlenden oder fehlerhaften Assets

## C. Rendering Core
### C1. Scene Composition
- World pass (water, terrain, ships, projectiles)
- VFX pass (transparente additive Effekte)
- Overlay pass (HUD/markers)

### C2. Camera & View
- Follow-Camera Regeln als eigenes Modul
- Zoom-/Safe-area-Strategie fuer verschiedene Displays
- Culling-Regeln einheitlich fuer alle Welt-VFX

### C3. Frame Pipeline
- Definierte Reihenfolge: update -> sync -> render
- Delta-Time-Handling + feste Budgets
- Debug-Hooks fuer Frame- und Draw-Metriken

## D. Entity Visuals
### D1. Ship Visuals
- Klassen-spezifische Silhouetten
- Life-state Visualization (alive/spawn-protected/wreck)
- Weapon guides, aim visuals, hit feedback

### D2. Projectile Visuals
- Artillery, missile, torpedo als separate Renderer
- Einheitlicher Lifecycle (spawn/update/despawn/dispose)
- Konsistente Impact-Semantik (`hit`, `water`, `island`, `oob`)

### D3. World Visuals
- Insel-Qualitaet (mesh/material detail)
- Wasser (shader oder animierte normal/emissive layers)
- AO-Grenze und taktische Markierungen

## E. Effects & Feedback
### E1. Combat Feedback
- Treffer-Leserlichkeit (impact, near-hit, critical cues)
- Directional cues fuer Gefahr
- Screen-space pulses nur gezielt und budgetiert

### E2. Atmospheric FX
- Wake/Foam bei Bewegung
- Rauch/Truemmer bei schweren Treffern
- Wetter-/Tageszeit (spaeter optional)

### E3. Audio-Visual Sync
- Ereignis-gebundene FX+Audio Trigger
- Vermeidung von doppelten Triggern
- Priorisierung bei Ereignis-Spitzen

## F. UI/HUD Visual Layer
### F1. Combat HUD
- Einheitlicher Visual-Style fuer Cockpit/Debug/Message HUD
- Prioritaetsmodell fuer Warnungen und Meldungen
- Accessibility (Kontrast, Lesbarkeit)

### F2. Match/Meta Screens
- Match-end Darstellung, Scores, Highlights
- Class picker polish
- Transitions statt abruptem Screen-Wechsel

### F3. Lokalisierung & Text-Regeln
- Alle UI-Texte zentral ueber String-Ressourcen
- Keine Hardcoded-Labels in UI-Komponenten
- Textlayout robust fuer laengere Strings

## G. Performance & Quality
### G1. Budgets
- Ziel FPS p95/p99
- Max aktive VFX Instanzen
- Draw-call und GC-Budget pro Frame

### G2. Memory & Lifetime
- Object pooling fuer kurzlebige FX
- Striktes `dispose()` fuer Geometrie/Materialien
- Leak-Checks bei langen Sessions

### G3. Test & Regression Safety
- Rendering smoke tests (spawn/despawn, state transitions)
- Deterministische Visual-State-Tests auf Modul-Ebene
- Performance baseline vor/nach groesseren Visual-Changes

---

## 3) Ist-Zustand im Code (Kurz-Audit)

Die Zielrichtung ist bereits deutlich umgesetzt: `main.ts` orchestriert, waehrend Runtime/Renderer/Adapter in eigene Module aufgeteilt sind.

### Positive Basis
- `createGameScene.ts`: klare Szene-/Kamera-Helfer, inklusive Culling-Helfer
- `shipVisual.ts`: kapselt Ship-Mesh + LifeState-Visualisierung
- `effects/*`: Renderer-Lifecycle ist vereinheitlicht (`sync/update/dispose`)
- `renderers/ships/shipRenderer.ts`: dedizierter Ship-Renderer ist vorhanden
- `runtime/networkStateAdapter.ts` + `runtime/matchEventAdapter.ts`: Adapter-Schicht ist aktiv

### Verbleibende Hauptthemen
1. **Asset-/Material-Zentralisierung fehlt noch (R4)**
   - Materialwerte sind noch verteilt in einzelnen Modulen
2. **Transient-FX-Lifetime ist noch nicht gepoolt (R5)**
   - mehrere Effekte nutzen weiterhin lokale `requestAnimationFrame`-Fades
3. **Performance-Telemetrie fehlt als Standard (R5)**
   - keine zentralen Budgets/Metriken fuer aktive FX und Frametimes

---

## 4) Ziel-Architektur fuer eine wartbare Grafik-Engine

Empfehlung: klare Engine-Schichten innerhalb `client/src/game`.

```
client/src/game/
  engine/
    bootstrap/
      createRenderer.ts
      createEngineContext.ts
    loop/
      gameLoop.ts
      frameScheduler.ts
    scene/
      worldScene.ts
      cameraController.ts
      lightingController.ts
    assets/
      assetManager.ts
      materialLibrary.ts
      textureRegistry.ts
    performance/
      frameMetrics.ts
      perfBudgets.ts
  renderers/
    ships/
      shipRenderer.ts
      shipVisualFactory.ts
    projectiles/
      artilleryRenderer.ts
      missileRenderer.ts
      torpedoRenderer.ts
    effects/
      impactFxRenderer.ts
      airDefenseFxRenderer.ts
      pooledFx.ts
  adapters/
    networkStateAdapter.ts
    matchEventAdapter.ts
  ui/
    hudOrchestrator.ts
```

### Schichtenmodell
- **Engine Core**: Renderer, Loop, Context, Kamera, Asset-/Material-Registry
- **Renderers**: Reine Darstellung je Domainthema (ships, projectiles, effects)
- **Adapters**: Uebersetzen Net-State/Events in Render-Commands
- **UI Layer**: HUD separat vom 3D-Rendering orchestrieren

### Design-Prinzipien
- Ein Modul, eine Verantwortung
- Keine Netzwerkkenntnis in Renderern
- Keine DOM/HUD-Logik in 3D-Renderern
- Jede visuelle Einheit hat `sync/update/dispose`

---

## 5) Konkrete Refaktorierung (ausgehend von aktuellem Code)

## Phase R1 - Orchestrierung aufbrechen (niedriges Risiko)

### R1.1 `main.ts` entlasten
- Extrahiere `bootstrapMultiplayerSession()`
- Extrahiere `registerRoomMessageHandlers()`
- Extrahiere `createRuntimeControllers()`
- Extrahiere `startFrameLoop()`

### R1.2 Verantwortlichkeiten trennen
- `game/runtime/visualRuntime.ts` -> haelt visuals, remoteInterp, fx-controller
- `game/runtime/networkRuntime.ts` -> room messages + state mapping
- `game/runtime/hudRuntime.ts` -> cockpit, debug, toasts, matchEnd

Ergebnis: `main.ts` wird Startpunkt statt God-file.

**Status:** Erledigt.

## Phase R2 - Renderer-Interfaces einfuehren

Definiere ein gemeinsames Interface:

```ts
export interface GameRenderer<TSync> {
  sync(data: TSync): void;
  update(nowMs: number, dtMs: number): void;
  dispose(): void;
}
```

Dann angleichen:
- `artilleryFx` -> `ArtilleryRenderer`
- `missileFx` -> `MissileRenderer`
- `torpedoFx` -> `TorpedoRenderer`
- `shipVisual`-Verwaltung -> `ShipRenderer`

**Status:** Erledigt (Contract produktiv, Renderer umgestellt, Shutdown via `dispose()` integriert).

## Phase R3 - Event- und State-Adapter

- `networkStateAdapter.ts`: mappt `room.state` in renderfreundliche Snapshots
- `matchEventAdapter.ts`: mappt `room.onMessage(...)` in typsichere Events
- Renderers konsumieren nur Adapter-Typen, nicht rohe Colyseus-Objekte

**Status:** Grundgeruest erledigt (Adapter eingefuehrt und in Runtime integriert).

## Phase R4 - Asset- und Material-Library

- `materialLibrary.ts`: zentrale Erstellung und Wiederverwendung haeufiger Materialien
- `assetManager.ts`: Laden/Cachen/Freigeben externer Assets
- Einfuehrung eines "named material palette"-Schemas statt verstreuter Hexcodes

## Phase R5 - Performance-Haertung

- Pools fuer kurzlebige Impact-Meshes und Ringe
- Einheitlicher transient-FX-updater statt vieler lokaler rAF-Schleifen
- Metriken: frame time, active fx count, dispose count, optional draw calls

---

## 6) Priorisiertes Visuals-Backlog (12 Arbeitspakete)

1. `main.ts` in Runtime-Controller splitten  
2. Einheitliches Renderer-Interface einfuehren  
3. `ShipRenderer` als zentrale Ship-Visual-Verwaltung erstellen  
4. Artillery/Missile/Torpedo-Renderer auf gemeinsames Lifecycle-Modell bringen  
5. Event-Adapter fuer `arty*`, `aswm*`, `torpedo*`, `airDefense*` bauen  
6. Material-Library und Farbtoken einfuehren  
7. AssetManager-Grundgeruest implementieren  
8. VFX pooling fuer Impact-Ringe/Bursts einbauen  
9. Kamera-/Cull-Strategie in dediziertes Modul verschieben  
10. HUD-Orchestrator von 3D-Loop entkoppeln  
11. FrameMetrics + Perf-Budgets integrieren  
12. Visual Regression Smoke-Tests und Perf-Baseline in CI aufnehmen

---

## 7) Teststrategie fuer Grafik-Refactoring

Auch ohne Pixel-perfect Snapshot-Tests lassen sich wartbare Sicherheitsnetze bauen:

### Modul-Tests (deterministisch)
- `networkStateAdapter`: Mapping-Validierung bei unvollstaendigem state
- `matchEventAdapter`: Event-Parsing + Fallback-Verhalten
- `cameraController`: erwartete Pivot-/Frustum-Berechnung
- `frameScheduler`: Reihenfolge update/render und Delta-Berechnung

### Laufzeit-Smoke-Tests
- Join -> Entity Spawn -> Leave -> sauberes Dispose
- Respawn/LifeState-Wechsel -> korrekte Visual-Umschaltung
- Treffer-Spitzenlast -> keine unkontrollierte VFX-Zunahme

### Performance-Checks
- 10 Minuten Session ohne kontinuierliches Memory-Wachstum
- Frame time p95/p99 unter Zielwert auf Referenzhardware
- Stable active-FX-count bei dauerhaften Gefechten

---

## 8) Delivery-Plan (4 Sprints Vorschlag)

## Sprint 1 - Fundament
- R1 + erster Teil R2 (Interfaces + Runtime-Split)
- DoD: `main.ts` stark reduziert, keine Verhaltensaenderung

## Sprint 2 - Renderer-Kern
- R2 komplett + R3 (Ship/Projectile/Events)
- DoD: alle Projektile laufen ueber einheitliche Renderer-Schnittstellen

## Sprint 3 - Assets + Performance
- R4 + R5 (Material-Library, AssetManager, Pools, Metrics)
- DoD: messbar geringere Allokationsspitzen in Gefechten

## Sprint 4 - Visual Polish
- Art Direction pass, FX tuning, HUD-Konsistenz
- DoD: visuelle Konsistenz + Gameplay-Lesbarkeit signifikant verbessert

---

## 9) Risiken und Gegenmassnahmen

1. **Regressionsrisiko im Live-Gameplay**  
   Gegenmassnahme: strikt in kleinen Schritten refaktorisieren + smoke tests pro Paket

2. **Scope creep bei "Polish"**  
   Gegenmassnahme: zuerst Engine-Struktur, dann Effekte/Assets

3. **Performance-Verschlechterung durch neue Effekte**  
   Gegenmassnahme: Budgets und Telemetrie zuerst etablieren

4. **Inkonsistente visuelle Sprache**  
   Gegenmassnahme: Farb-/Material-Tokens und klare Style-Guidelines

---

## 10) Sofortiger naechster Schritt auf `feature/Visuals`

Empfehlung ab jetzt (nach produktivem R4/R5-Grundgeruest):

1. R4 finalisieren: 1-2 weitere echte Assets (z. B. HUD/Environment) ueber `assetCatalog` integrieren  
2. R5 haerten: Guardrail-Schwellen als zentralen Budget-Block zusammenziehen (pro Effektklasse konfigurierbar)  
3. Performance-Check: Lastszenario mit hoher Impact-Rate fahren und p95/p99 Frame-Time gegenueberstellen  
4. Ergebnis dokumentieren: Zielwerte + gemessene FX-Maxima als Referenz fuer weitere Visual-Iterationen

So bleibt die Grafik-Pipeline wartbar und unter Last kontrollierbar.

