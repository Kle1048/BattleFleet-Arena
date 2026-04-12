# BattleFleet Arena — Modul- und Feature-Inventar (Refactoring-Basis)

Stand: Codebase-Analyse (Monorepo `client`, `server`, `shared`).  
Zweck: Überblick über **alle relevanten Dateien/Module**, **Spielfeatures** mit Kurzbeschreibung, sowie **Hinweise zu Umfang, Komplexität und möglicher Nutzung** — als Ausgangspunkt für Struktur-Refactorings.

---

## 1. Projektstruktur (Workspaces)

| Workspace | Rolle |
|-----------|--------|
| **`shared`** | Autoritative Spielregeln, Colyseus-Schema (`PlayerState`, `BattleState`, …), reine Funktionen (Ballistik-Logik, Kollisionen, Progression). Wird von Server und Client importiert. |
| **`server`** | Colyseus-Server (`battle`-Raum), **eine** große Raumklasse `BattleRoom` mit Simulation (~20 Hz). |
| **`client`** | Vite + three.js: Szene, Rendering, HUD, Netzwerk-Events, lokale Bots (Input-Ersatz), Audio, Effekte. |

**Root:** `package.json` orchestriert `npm run dev` (parallel Server + Client) und Build-Reihenfolge shared → server → client.

---

## 2. Vollständiges Datei-Inventar (nach Bereich)

### 2.1 `server/src`

| Datei | Zeilen (ca.) | Kurzbeschreibung |
|-------|----------------|------------------|
| `index.ts` | ~39 | HTTP-Server, Express + CORS, Colyseus `Server`, Registrierung Raum `battle` → `BattleRoom`. |
| `rooms/BattleRoom.ts` | **~1450** | **Zentrale Server-Simulation:** Join/Leave, Input, Tick (`physicsStep`), Artillerie, ASuM, Minen, SAM/CIWS, Kollisionen, Match-Timer, Respawn, Score/XP. |

### 2.2 `shared/src` (Produktivcode, ohne Tests)

| Datei | Kurzbeschreibung |
|-------|------------------|
| `index.ts` | Re-Exports aller öffentlichen Module. |
| `schema.ts` | Colyseus-Schema: `PlayerState`, `MissileState`, `TorpedoState`, `BattleState` (Listen, Match-Phase). |
| `mapBounds.ts` | Quadratisches Einsatzgebiet (`AREA_OF_OPERATIONS_HALF_EXTENT`), OOB-Zerstörung nach Timeout. |
| `islands.ts` | Insel-Kreise (u. a. `DEFAULT_MAP_ISLANDS`), Punkt-in-Kreis / Kollisionshilfen. |
| `artillery.ts` | Primärwaffe: Salvo-Berechnung, Bogen/Spread, Splash, Cooldown-Konstanten, `classifyArtilleryImpactVisual`. |
| `playerLife.ts` | Lebensphasen (`alive`, `awaiting_respawn`, `spawn_protected`), Invarianten, wer Schaden nimmt / simuliert wird. |
| `respawn.ts` | `tryPickRespawnPosition` — Spawn-Punkte im AO, frei von Inseln, Mindestabstand zu anderen. |
| `aswm.ts` | Anti-Schiff-Lenkflugkörper: Start von Rails/Feuerrichtung, Homing/Suchkegel, Schrittfunktion, Konstanten. |
| `torpedo.ts` | **Semantisch „Mine“:** statisch, Heck-Ablegung, Näherungsradius, kein fahrendes Torpedo. |
| `airDefense.ts` | SAM/CIWS: Reichweiten, Layer-Wahl, Trefferwurf, Cooldown-Updates (reine Logik). |
| `match.ts` | Match-Dauer, Phasen (`running`/`ended`), Kill-Attribution-Regel (nur letzter Treffer). |
| `progression.ts` | XP/Level 1–10, Cooldown-/HP-/Movement-Skalierung, Naval-Rank-Labels (EN). |
| `shipClass.ts` | FAC / Zerstörer / Kreuzer — Profile (HP, Movement-Mul, ASuM-Limits, …), Zuordnung Level → Klasse. |
| `shipProfiles.ts` | JSON-Einbindung (`data/ships/*.json`), `getShipHullProfileByClass`, ASuM-Magazin/Merge-Hilfen. |
| `shipVisualLayout.ts` | Typen für Rumpf-Visual, Mounts, Launcher, **Kollisions-Hitbox** (OBB), `FixedSeaSkimmerLauncherSpec`. |
| `shipMovement.ts` | `DESTROYER_LIKE_MVP`, `stepMovement`, `smoothRudder`, `movementConfigForPlayer` (Klassen/Progression). |
| `shipHitboxCollision.ts` | Kreis vs. Schiff-Hitbox-Fußabdruck (Splash, Näherung). |
| `shipShipCollision.ts` | OBB-OBB (SAT), `resolveShipShipCollisions`, Insel-Overlap-Hilfen. |
| `shipRamDamage.ts` | Ram-Schaden bei Überlappung + Relativgeschwindigkeit, Kill-Zuordnung pro Paar. |
| `collisionContactQueries.ts` | Abfragen für Schiff-Insel-Überlappung (Profil-basiert). |
| `displayName.ts` | `sanitizePlayerDisplayName`, max. Länge Lobby-Namen. |

**Tests in `shared/src`:** `*.test.ts` zu artillery, torpedo, aswm, airDefense, islands, match, progression, shipClass, shipProfiles, collision, ram, displayName, etc. — dienen der Regel-Sicherung, nicht dem Laufzeit-Spiel.

### 2.3 `client/src` — Einstieg und Runtime

| Datei | Kurzbeschreibung |
|-------|------------------|
| `main.ts` | **~545 Zeilen** — Bootstrap: Szene, Lobby, Colyseus-Join, GLB-Preload, alle Subsysteme verdrahten, **Game-Loop** (FPS, Wake, Wasser, Render), globales `window.__BFA` Debug-API. |
| `vite-env.d.ts` | Vite-Typen (`import.meta.env`). |

### 2.4 `client/src/game/scene`

| Datei | Kurzbeschreibung |
|-------|------------------|
| `createGameScene.ts` | **~451 Zeilen** — Himmel (`Sky`), Wasser (`Water`), Schaum-Overlay, Beleuchtung, Fog, Kamera-Setup, Insel-Shader-Daten, Environment-Tuning. |
| `environmentSun.ts` | Sonnenrichtung / Winkel für Sky und Licht. |
| `lightingPresets.ts` | Named Presets (Farben, Fog). |
| `shipVisual.ts` | **~533 Zeilen** — Pro-Spieler-`Group`: GLB-Rumpf, Mounts, Rudder-Visual, Lebenszustand, Treffer-Rauch-Tuning, Profil-Merge (`getEffectiveHullProfile`). |
| `shipGltfHull.ts` | GLTF-Load/Caching für Rumpf-URLs. |
| `shipMountVisuals.ts` | Waffen-Mounts aus Profil/Default-Loadout. |
| `shipHitboxDebug.ts` | Optionale Hitbox-Drahtrahmen (gesteuert über `shipProfileRuntime`). |

### 2.5 `client/src/game/runtime`

| Datei | Kurzbeschreibung |
|-------|------------------|
| `frameRuntime.ts` | **~425 Zeilen** — Pro-Frame-Logik: Input senden, Kamera Follow + Cull, HUD-Daten (Cockpit, Radar/ESM), Fern-Interpolation, Audio-Hooks, Schiffs-Visual-Update, FX-Ticks, Zerstörung. |
| `visualRuntime.ts` | `createVisualRuntime`: `shipRenderer`, `onStateChange`, Interpolations-Buffer für Remote-Spieler. |
| `networkRuntime.ts` | **~262 Zeilen** — `registerNetworkHandlers`: `arty*`, `aswm*`, `torpedo*`, `airDefense*`, Ping, `collisionContact`, Fehler/Leave. |
| `matchEventAdapter.ts` | Parsing/Normalisierung Server-Events für FX. |
| `networkStateAdapter.ts` | Hilfen: Spieler finden, Listen für Raketen/Minen. |
| `stateAdapter.ts` | Typisierte Zugriffe auf `room.state` (`playerListOf`, `getPlayer`, Match-Timer, …). |
| `sessionBootstrap.ts` | Colyseus-Client-Erzeugung, URL aus Env, Timeout-Wrapper. |
| `rendererLifecycle.ts` | WebGL-Renderer, Resize, Pixel-Ratio. |
| `rendererContracts.ts` | Abstrakte Renderer-Schnittstelle (`GameRenderer`). |
| `materialLibrary.ts` | **~625 Zeilen** — Wasser-/Schaum-Shader, Wake-Upload ins Foam-Material, Farb-Tokens, Animation. |
| `renderCoords.ts` | Welt ↔ Render-X (Osten-Spiegelung). |
| `renderOverlayLayers.ts` | Layer-Masken (Reflexion), Kamera-Layers. |
| `followCameraTuning.ts` | Follow-Cam-Parameter, Persistenz localStorage. |
| `cameraCullRuntime.ts` | Distanz-Culling für teure Artillerie-VFX. |
| `cameraShakeRuntime.ts` | Screen-Shake. |
| `screenFlashRuntime.ts` | Vollbild-Flash bei Explosionen. |
| `hudRuntime.ts` | Kapselt Debug-Overlay + Match-End-HUD-Updates. |
| `runtimeShutdown.ts` | Zentrales `dispose` für Subsysteme. |
| `runtimeErrors.ts` | Globale Error-Handler → Debug-Overlay. |
| `assetManager.ts` / `assetCatalog.ts` | Textur/Asset-Hilfen (falls genutzt). |
| `hullGltfUrls.ts` / `mountGltfUrls.ts` | URL-Auflösung für Rumpf- und Mount-GLBs. |
| `shipProfileRuntime.ts` | **Client:** Merge Basis-JSON + localStorage-Patches, GLB-URL pro Klasse, Hitbox-Debug-Flag. |
| `shipDebugTuning.ts` | Feintuning (z. B. Wake-Spawn), Persistenz. |
| `wakeTrail.ts` / `wakeRuntimeTuning.ts` | Kielwasser-Polylinie + Sampling-Distanz. |
| `environmentTuning.ts` | Persistente Umgebungs-Parameter (Nebel, …). |
| `environmentDebugPanel.ts` | **Sehr groß** — UI-Panel: Wasser-Shader, Follow-Cam, Ship-Debug, Wake, Environment (Schieberegler, Presets). |

### 2.6 `client/src/game/hud`

| Datei | Kurzbeschreibung |
|-------|------------------|
| `cockpitHud.ts` | **~383 Zeilen** — Brücken-UI: Kurs, Speed, HP, Cooldowns, Minen-Zähler, Match-Zeit, Score, XP/Rang, **taktisches Radar**, ESM-Linien, Radar an/aus-Anzeige. |
| `radarHudMath.ts` | Reichweite, Blip-Normalisierung, ESM-Geometrie (+ Tests). |
| `gameMessageHud.ts` | Toasts (z. B. ASuM-Reload), OOB-/Spawn-Warnungen. |
| `matchEndHud.ts` | Scoreboard nach Match-Ende, „Play Again“ (sendet `playAgain`). |
| `debugOverlay.ts` | FPS, Ping, State-Sync-Zähler, Performance-Stats der FX-Subsysteme. |

### 2.7 `client/src/game/input`

| Datei | Kurzbeschreibung |
|-------|------------------|
| `keyboardMouse.ts` | WASD/Gas, Maus-Ziel auf Wasserebene, LMB/RMB/Mitte/Q, Radar-Taste — liefert `InputSample` für `frameRuntime`. |

### 2.8 `client/src/game/network`

| Datei | Kurzbeschreibung |
|-------|------------------|
| `remoteInterpolation.ts` | Puffer + verzögerte Pose für Remote-Schiffe (reduziert Ruckeln). |

### 2.9 `client/src/game/effects`

| Datei | Kurzbeschreibung |
|-------|------------------|
| `fxSystem.ts` | **Sehr groß** — Partikel/Sprites (Explosionen, Rauch, generische Effekte), Pooling. |
| `artilleryFx.ts` | Flugbahn/Splash Primärfeuer. |
| `missileFx.ts` | ASuM-Impacts/Spuren. |
| `torpedoFx.ts` | Minen-Impacts. |
| `airDefenseFx.ts` | SAM/CIWS visuell + Screen-Pulse. |

### 2.10 `client/src/game/audio`

| Datei | Kurzbeschreibung |
|-------|------------------|
| `gameAudio.ts` | Web-Audio: Unlock, Sounds für Waffen, Treffer, AD, Kollisionen, Explosionen. |
| `soundCatalog.ts` | Zuordnung Pfade/Keys zu Samples. |

### 2.11 `client/src/game/ui`

| Datei | Kurzbeschreibung |
|-------|------------------|
| `classPicker.ts` | Pre-Match-Overlay: optionaler Name; **Schiffsklasse aktuell fest FAC** (Hinweis im UI). |
| `shipProfileEditor.ts` | Dialog: JSON/Hitbox/Movement bearbeiten, Export/Import — **`openShipProfileEditor` ist derzeit nirgends importiert** (toter Einstieg ohne Hotkey/Link). |

### 2.12 `client/src/game/bot` (lokaler „KI“-Spieler)

| Datei | Kurzbeschreibung |
|-------|------------------|
| `botController.ts` | OODA-Schleife: `observeWorld` → `orient` → `decisionEngine` → `planAction`; ersetzt menschliches Input wenn aktiv (`?bot=1` oder Taste **B**). |
| `perceptionSystem.ts` | Snapshot aus `playerList` + Raketen + Minen. |
| `orientationSystem.ts` | Taktischer Kontext (Ziel, Gefahr). |
| `decisionEngine.ts` | Intent-Auswahl (klein). |
| `actionPlanner.ts` | Intent → konkrete Steuer-/Feuerbefehle. |
| `memoryStore.ts` | Kurzzeitgedächtnis (Ziel, …). |
| `decisionLog.ts` | Ringpuffer Log für Debug-Panel. |
| `botDebugPanel.ts` | HTML-Panel für Bot-Zustand/Logs. |
| `types.ts` | Typen Bot-Weltmodell. |
| `*.test.ts` | Tests für Planner/Engine. |

### 2.13 `client/src/game/renderers`

| Datei | Kurzbeschreibung |
|-------|------------------|
| `ships/shipRenderer.ts` | Map sessionId → `createShipVisual`, onAdd/onRemove Lifecycle. |

### 2.14 Sonstiges (Skripte)

| Pfad | Kurzbeschreibung |
|------|------------------|
| `client/scripts/generatePlaceholderGlb.mjs` | Hilfsskript für Platzhalter-GLBs (Build/Pipeline). |

---

## 3. Spielfeatures (funktional gruppiert)

Jedes Feature: **was es tut** und **wo es primär lebt**.

### 3.1 Netzwerk & Session

| Feature | Beschreibung | Module |
|---------|--------------|--------|
| **Colyseus-Raum `battle`** | Eine Battle-Instanz pro Match; State-Replication. | `server/index.ts`, `schema.ts` |
| **Join-Optionen** | `shipClass` + `displayName` beim Join. | `BattleRoom.onJoin`, `classPicker.ts`, `displayName.ts` |
| **Input-Kanal** | `input`-Messages: Gas, Ruder, Aim, Feuerflags, Radar, Debug-Spawn-Offsets. | `BattleRoom`, `keyboardMouse.ts`, `frameRuntime.ts` |
| **Ping/Pong** | Latenz-Messung. | `BattleRoom` (`ping`/`pong`), `networkRuntime.ts` |
| **Match-Ende / neue Runde** | `matchEnded` Broadcast; Client zeigt HUD; `playAgain` / `matchRestarted`. | `BattleRoom`, `matchEndHud.ts` |

### 3.2 Bewegung & Welt

| Feature | Beschreibung | Module |
|---------|--------------|--------|
| **Autoritative Schiffsphysik** | XZ-Bewegung, Gas, Ruder mit Glättung, Klassen-/Progression-Skalierung. | `shipMovement.ts`, `BattleRoom.physicsStep` |
| **Einsatzgebiet (AO)** | Quadratische Karte; Verlassen startet Countdown zur Zerstörung. | `mapBounds.ts`, `BattleRoom` |
| **Inseln** | Statische Kreise; Blockierung + Waffen-Interaktion. | `islands.ts`, `collisionContactQueries.ts` |
| **Schiff–Insel-Kollision** | Auflösung / Kanten-SFX (`collisionContact`). | `resolveShipIslandCollisions`, `BattleRoom` |
| **Schiff–Schiff-Kollision** | OBB-Push-apart + **Ram-Schaden** bei Relativgeschwindigkeit. | `shipShipCollision.ts`, `shipRamDamage.ts`, `BattleRoom` |

### 3.3 Kampf: Primär (Artillerie)

| Feature | Beschreibung | Module |
|---------|--------------|--------|
| **Salvo-Planung** | Kein Ballistik-Mesh: geplanter Einschlag nach Flugzeit, Bogen/Spread. | `artillery.ts`, `tryPrimaryFire` |
| **Splash-Schaden** | Kreis-Einschlag vs. Hitboxen; kein Selbstschaden durch Splash-Logik auf Gegner. | `BattleRoom.resolveShellImpacts` |
| **Sekundär-Effekt** | Artillerie kann **Minen im Splash entschärfen**. | `BattleRoom.resolveShellImpacts` |
| **Client-VFX** | `artyFired` / `artyImpact`, optional Culling. | `artilleryFx.ts`, `networkRuntime.ts`, `cameraCullRuntime.ts` |

### 3.4 Kampf: ASuM (Sekundär)

| Feature | Beschreibung | Module |
|---------|--------------|--------|
| **Magazin port/starboard** | Runden pro Seite; Rails mit Munition; Magic Reload. | `aswm.ts`, `shipProfiles.ts`, `BattleRoom` |
| **Lenkflugkörper-Simulation** | Homing mit Suchkegel, Insel/OOB, Treffer auf Hitbox. | `stepAswmMissile`, `BattleRoom.stepMissiles` |
| **Zielerfassung** | `missileLockOn` an Besitzer. | `BattleRoom`, Audio in `main.ts` |
| **Client-VFX** | `aswmFired`, `aswmImpact`. | `missileFx.ts` |

### 3.5 Kampf: „Torpedo“ = Minen

| Feature | Beschreibung | Module |
|---------|--------------|--------|
| **Heck-Minen** | Statische Objekte, Trigger-Radius, hoher Schaden (~90 % maxHp). | `torpedo.ts` (Kommentar „Mine“), `BattleRoom.stepTorpedoes` |
| **Client-VFX** | `torpedoFired` / `torpedoImpact`. | `torpedoFx.ts` |

### 3.6 Luftverteidigung (SAM / CIWS)

| Feature | Beschreibung | Module |
|---------|--------------|--------|
| **Zweistufige Abwehr** | Nur gegen **eingehende ASuM**; Tick-verzögertes Feuer dann Wurf. | `airDefense.ts`, `BattleRoom.stepMissiles` (großer Block) |
| **Replikation als Messages** | `airDefenseFire`, `airDefenseIntercept` (kein separates Schema für jedes Geschoss). | Server broadcast, `networkRuntime.ts`, `airDefenseFx.ts` |

### 3.7 Spieler-Leben, Respawn, Schutzphasen

| Feature | Beschreibung | Module |
|---------|--------------|--------|
| **Lebensphasen** | alive / awaiting_respawn / spawn_protected. | `playerLife.ts`, `schema.ts` |
| **Respawn-Position** | Zufall im AO mit Constraints; Fallback Ring. | `respawn.ts`, `BattleRoom.performRespawn` |
| **Kill-Attribution** | Score/Kill nur bei gültigem Killer; OOB ohne Killer. | `match.ts`, `BattleRoom.enterAwaitingRespawn` |

### 3.8 Progression & Schiffsklassen

| Feature | Beschreibung | Module |
|---------|--------------|--------|
| **XP & Level (1–10)** | Kills erhöhen XP/Level; Tod senkt Level um 1. | `progression.ts`, `BattleRoom` |
| **Klassen FAC / DD / CG** | Stats + visuelle Skalierung; **Progression wechselt Klasse** nach Level. | `shipClass.ts`, `shipProfiles.ts` (+ JSON), `BattleRoom.syncShipClassAndHpAfterLevelUp` |
| **Lobby** | Start immer FAC laut UI; echte Klasse kommt aus Progression/Server. | `classPicker.ts` |

### 3.9 Aufklärung (Radar / ESM)

| Feature | Beschreibung | Module |
|---------|--------------|--------|
| **Suchrad** | Repliziertes Flag `radarActive`; steuert Sichtbarkeit für **ESM** bei Gegnern. | `schema.ts`, Input, `frameRuntime` (Cockpit: Blips + ESM-Linien) |

### 3.10 Match-Metrik

| Feature | Beschreibung | Module |
|---------|--------------|--------|
| **Timer FFA** | 720 s (Konstante in `match.ts`), danach `ended`. | `BattleRoom.updateMatchTimer`, HUD |
| **Scoreboard** | Punkte/Kills; kein Assist. | `match.ts`, Cockpit + Match-End-HUD |

### 3.11 Präsentation (Client)

| Feature | Beschreibung | Module |
|---------|--------------|--------|
| **3D-Szene** | Wasser, Himmel, Inseln, Schiffe als GLB + Mounts. | `createGameScene.ts`, `shipVisual.ts`, `materialLibrary.ts` |
| **Follow-Kamera** | Hinter Schiff, Tuning persistierbar. | `frameRuntime.ts`, `followCameraTuning.ts` |
| **Kielwasser** | Foam-Shader mit Trail-Samples. | `wakeTrail.ts`, `main.ts` Loop, `materialLibrary.ts` |
| **Interpolation** | Remote-Schiffe weicher. | `remoteInterpolation.ts` |
| **Audio** | Alle wichtigen Ereignisse. | `gameAudio.ts`, `soundCatalog.ts` |
| **Screen-FX** | Shake, Flash, Partikel. | `cameraShakeRuntime.ts`, `screenFlashRuntime.ts`, `fxSystem.ts` |
| **Debug** | Overlay FPS/Ping; `__BFA` API; Environment-Debug-Panel. | `debugOverlay.ts`, `main.ts`, `environmentDebugPanel.ts` |

### 3.12 Lokaler Bot

| Feature | Beschreibung | Module |
|---------|--------------|--------|
| **Automatisches Spielen** | Ersetzt User-Input solange aktiv — reiner **Client-Side**-Bot (kein Server-Bot). | `botController.ts` + Submodule, `main.ts` (`?bot=1`, **B**) |

---

## 4. Codeumfang, Komplexität, Refactoring-Hinweise

### 4.1 Sehr große oder „schwere“ Module

| Modul | Größenordnung | Anmerkung |
|-------|----------------|-----------|
| **`BattleRoom.ts`** | **~1450 Zeilen** | **Single Point of Truth** für fast alles Serverseitige: Input, Bewegung, alle Waffensysteme, AD, Kollisionen, Match, Respawn. **Höchste Refactoring-Priorität** zum Splitten (z. B. Waffen-Subsysteme, Life-Cycle, Kollisionen). |
| **`main.ts`** | **~545 Zeilen** | Orchestrierung + kompletter Render-Loop; viele Verantwortlichkeiten in einer Datei. |
| **`materialLibrary.ts`** | **~625 Zeilen** | Shader/Wasser/Schaum/Wake — rendering-nah, schwer zu splitten ohne visuelle Regression. |
| **`fxSystem.ts`** | **~800+ Zeilen** | Partikel-Pools, viele Presets — groß aber thematisch kohärent. |
| **`environmentDebugPanel.ts`** | **~800+ Zeilen** | Reines **Dev-/Tuning-UI**; produktive Spiellogik nicht, aber Wartungslast. |
| **`createGameScene.ts`** | **~451 Zeilen** | Szene-Aufbau + Environment — mittel, könnte in „Lighting“, „Water“, „Islands“ zerlegt werden. |
| **`frameRuntime.ts`** | **~425 Zeilen** | Zentrale Client-Spielschleifen-Logik (HUD+Kamera+Audio+Sync). |
| **`cockpitHud.ts`** | **~383 Zeilen** | Viel DOM/SVG — UI-Modul, erwartungsgemäß lang. |
| **`shared/aswm.ts`** | **~300 Zeilen** | Regeln + Geometrie — akzeptabel für Domain-Logik. |
| **`shared/artillery.ts`** | **~258 Zeilen** | Ebenfalls Domain-kern. |

### 4.2 Hohe fachliche Komplexität (nicht nur Zeilen)

- **SAM/CIWS in `BattleRoom.stepMissiles`:** Zwei-Takt-Modell (Feuer-Message → nächster Tick Wurf) plus Pending-Map — **schwer zu lesen**, eng mit ASuM-Simulation verkoppelt.
- **Progression × Schiffsklasse × JSON-Hülle:** Änderungen an Stats erfordern oft Abgleich `shipClass` ↔ `shipProfiles`/JSON ↔ `BattleRoom`-Sim (`SimEntry`).
- **Gleiche Konzeptnamen, andere Realität:** `TorpedoState` / `torpedoList` = **Minen**; Kommentare und Docs sollten beim Refactor konsolidiert werden, um Fehlannahmen zu vermeiden.

### 4.3 Möglicherweise wenig oder speziell genutzt

| Thema | Einschätzung |
|-------|----------------|
| **`shipProfileEditor.ts`** | Vollständiger Editor existiert, aber **kein Import** von `openShipProfileEditor` im restlichen Client — **derzeit praktisch ungenutzt** (toter Codepfad), solange kein UI-Hook gesetzt wird. |
| **Bot** | Nur wenn Spieler `?bot=1` oder **B** drückt — für normale Nutzer optional; Codepfad ist aber vollständig. |
| **`assetManager` / Teile von `assetCatalog`** | Je nach Historie: prüfen, ob noch alle Pfade aus `main`/Szene genutzt werden (kleinere Aufräum-Kandidaten). |
| **Tests unter `shared`** | Werden beim Refactor wichtig, damit Extraktion aus `BattleRoom` sicher bleibt. |

### 4.4 Klare Stärken der aktuellen Architektur (beim Refactor erhalten)

- **Shared-Logik** für Waffen/Kollisionen/Progression — Server und Client-Konstanten bleiben synchron.
- **Colyseus-Schema** klar getrennt; Messages für ephemere Events (`artyFired`, …).
- **Client-Subsysteme** (`networkRuntime`, `visualRuntime`, `frameRuntime`) sind bereits benannt und grenzen Verantwortung grob ab — `BattleRoom` ist das größte Gegenstück ohne ähnliche Struktur.

---

## 5. Vorschlag für Refactoring-Reihenfolge (nur Planung)

1. **`BattleRoom` in Domänen-Services splitten** (Bewegung, Waffen, AD, Kollisionen, Match) — gleiche öffentliche API nach außen.
2. **`main.ts` entlasten** — Game-Loop und Wake/Wasser in dedizierte Runner-Module.
3. **Naming-Klarheit** „Torpedo“ → „Mine“ (Schema-Felder nur mit Migrations-/Compat-Überlegung).
4. **Ship Profile Editor** entweder verdrahten (Debug-Taste, URL-Param) oder als eigenes Tool auslagern.
5. **`environmentDebugPanel`** optional aus Production-Bundles streichen (tree-shaking / env-Flag), falls Bundle-Größe oder Klarheit wichtig werden.

---

*Ende des Inventars — keine Code-Änderungen vorgenommen.*
