# Bots/Minen-Feature: Modul- und Funktionsdokumentation

Dieses Dokument beschreibt die aktuell geaenderten Module rund um Minen, Schiffs-Visuals, Runtime-Tuning und HUD.
Zielgruppe ist bewusst auch fachfremd: Was macht das Modul, welche Funktion ist wofuer da, und welche Daten fliessen wohin.

## Gesamtfluss in einem Satz

Der Client sendet Steuerdaten plus Debug-Offsets an den Server, der Server simuliert Schiffe/Waffen und repliziert den Zustand, und der Client rendert daraus Szene, Effekte, HUD und Debug-Panel.

## `shared/src/torpedo.ts`

### Zweck
Stellt zentrale Minen-Konstanten und Bewegungslogik bereit (historisch "torpedo", fachlich jetzt statische Mine).

### Funktionen
- `spawnTorpedoFromFireDirection(shipX, shipZ, _aimX, _aimZ, fallbackHeadingRad, spawnLocalZ)`:
  berechnet die Spawn-Position relativ zur Schiffsachse; Mine wird am Heck abgelegt.
- `stepTorpedoStraight(x, z, headingRad, _dt)`:
  liefert die naechste Pose; aktuell unveraendert (Mine bleibt stationaer).

### Wichtige Konstanten
- `TORPEDO_LIFETIME_MS`: Lebenszeit einer Mine.
- `TORPEDO_HIT_RADIUS`: Trigger-Radius fuer Ausloesung.
- `TORPEDO_MAX_PER_OWNER`: Maximal aktive Minen pro Spieler.

## `shared/src/progression.ts`

### Zweck
Balancing-Funktionen fuer Level, HP und Cooldowns.

### Relevante Funktion
- `progressionTorpedoCooldownMs(level)`:
  gibt den Minen-Cooldown in ms zurueck (hier auf mindestens 1000 ms begrenzt).

## `shared/src/progression.test.ts`

### Zweck
Sichert Progressionsregeln gegen unbeabsichtigte Aenderungen.

### Gepruefte Funktion
- `progressionTorpedoCooldownMs(level)`:
  Testet den erwarteten Grenzwert fuer niedrige und hohe Level.

## `shared/src/torpedo.test.ts`

### Zweck
Regressionstests fuer Spawn- und Bewegungsverhalten der Mine.

### Gepruefte Funktionen
- `spawnTorpedoFromFireDirection(...)`: Spawn hinter dem Schiff.
- `stepTorpedoStraight(...)`: keine Bewegung bei stationaerer Mine.

## `server/src/rooms/BattleRoom.ts`

### Zweck
Serverseitige Kernsimulation des Matches: Input verarbeiten, Waffen ausloesen, Treffer berechnen, Respawn/Timer verwalten, Zustand replizieren.

### Hilfsfunktionen
- `clampUnit(n)`: begrenzt Werte auf -1..1 (z. B. Rudder/Throttle Input).
- `clampRange(n, min, max)`: allgemeines Begrenzen fuer Debug-Offsets.
- `playerIndexInList(list, sessionId)`: sucht Spielerindex im replizierten Player-Array.

### Lebenszyklus / Matchverwaltung
- `updateMatchTimer(now)`: zaehlt Vorbereitungs-, Kampf- und Endphase herunter.
- `endMatch()`: beendet Kampfphase und friert Waffen ein.
- `resetMatchForNewRound(now)`: setzt Spielerzustand und Matchtimer fuer neue Runde.
- `processLifeTransitions(now)`: steuert Wechsel zwischen alive/spawn-protected/awaiting-respawn.
- `performRespawn(sessionId, now)`: positioniert Spieler neu und setzt Schutzfenster.

### Waffenfunktionen
- `tryPrimaryFire(client, row)`:
  prueft Cooldown/LifeState, berechnet Artillerie-Salve und broadcastet `artyFired`.
- `trySecondaryFire(client, row)`:
  feuert Rakete (ASuM), begrenzt aktive Raketen pro Besitzer.
- `tryTorpedoFire(client, row)`:
  legt Mine ab, begrenzt aktive Minen pro Besitzer, setzt Cooldown.

### Projektilsimulation
- `stepMissiles(dt, now)`:
  bewegt Raketen, prueft Insel/OOB/Treffer, Luftabwehr und Impact-Events.
- `stepTorpedoes(dt, now)`:
  verwaltet Minen-Lebenszeit, Trigger auf Spieler, Schaden und Impact-Events.
- `resolveShellImpacts(now)`:
  verarbeitet fellige Artillerie-Einschlaege (Splash auf Spieler plus Minen-Entschaerfung im Radius).

### Utility fuer Listenbereinigung
- `removeMissileAt(index, missileId)` und `removeTorpedoAt(index, torpedoId)`:
  entfernen Projektil und zugehoerige Meta-Eintraege.

## `client/src/game/runtime/frameRuntime.ts`

### Zweck
Frame-fuer-Frame Laufzeitlogik: Netzwerkzustand -> Visuals/HUD/Kamera/FX + lokales Input-Senden.

### Funktionen
- `createFrameRuntimeState(initialHudLevel)`:
  initialisiert lokale Runtime-Merkzustande (z. B. letzte LifeStates fuer Events).
- `runFrameRuntimeStep(options)`:
  zentrale Tick-Funktion:
  1) reagiert auf LifeState-Uebergaenge (Toast/Audio),
  2) setzt Schiffs-Visuals (lokal direkt, remote interpoliert),
  3) sendet Input inkl. Debug-Spawn-Offsets an den Server,
  4) aktualisiert HUD/FX/Kamera-Shake.

### Fachliche Hinweise
- Minenanzahl fuer HUD wird clientseitig aus replizierter Torpedo-/Minenliste gezaehlt.
- `shipPivotLocalZ` korrigiert den Unterschied zwischen Simulationszentrum und sichtbarem Sprite-Pivot.

## `client/src/game/runtime/networkRuntime.ts`

### Zweck
Bindet Colyseus-Events an lokale Reaktionen (FX, Audio, Camera Shake, HUD-Hinweise).

### Funktion
- `registerNetworkHandlers(options)`:
  registriert alle relevanten Message-Handler (`artyImpact`, `aswmImpact`, `torpedoImpact`, ...).
  Neu: ruft `onMineImpactNearLocalPlayer(distance)` auf, wenn Minenimpact nahe am lokalen Schiff liegt.

## `client/src/game/runtime/waterDebugPanel.ts`

### Zweck
Ingame-Debug-UI fuer Wasser-Shader plus Schiffs-/Waffen-Offsets, inklusive LocalStorage-Persistenz.

### Funktionen
- `clamp(v, min, max)`: begrenzt Slider-Werte.
- `loadPersisted()` / `savePersisted(...)`: laden/speichern Wasser-Shader-Tuning.
- `loadPersistedShipTuning()` / `savePersistedShipTuning(...)`: laden/speichern Schiffs-Tuning.
- `createWaterDebugPanel(material)`:
  baut UI, bindet Slider-Events, setzt Persistenzwerte beim Start und bietet Global-Reset.

## `client/src/game/runtime/shipDebugTuning.ts`

### Zweck
Zentrale Runtime-Tuningwerte fuer Schiffsdarstellung und Waffen-Spawnposition.

### Funktionen
- `getShipDebugTuning()`:
  liefert den aktuellen (readonly) Tuning-Zustand.
- `applyShipDebugTuning(patch)`:
  merged partielle Updates, clamped jeden Wert in sichere Grenzen und speichert den neuen Zustand.

## `client/src/game/scene/shipVisual.ts`

### Zweck
Erzeugt und aktualisiert die sichtbare Schiffsdarstellung (Hull/Sprite, Turmrohr, Weapon-Arc, LifeState-Farben).

### Interne Funktionen
- `getSchnellbootTexture()`: lazy-load + cache fuer das Schiffssprite.
- `shipSpriteWorldWidthFromTexture(texture)`: berechnet Weltbreite anhand Bildseitenverhaeltnis.
- `createHullPrismGeometry(halfBeam)`: fallback-3D-Rumpfgeometrie.
- `hullAliveMaterial(isLocal)`: Materialfabrik fuer lebenden Rumpf.
- `getAimBarrelMaterial(vis)`: Zugriff auf Rohr-Material zur Laufzeitfarbsteuerung.

### Exportierte Funktionen
- `applyShipVisualRuntimeTuning(vis)`:
  uebernimmt Runtime-Tuning in das konkrete Ship-Objekt (Sprite-Skalierung, Aim-Origin, Arc-Visibility; kein Turmring mehr).
- `setShipVisualLifeState(vis, lifeState, isLocal)`:
  setzt Farben/Opacity/Guide je nach Alive, SpawnProtected oder AwaitingRespawn.
- `createShipVisual(options)`:
  erzeugt ein neues Schiff-Visual inkl. optionalem Sprite und lokalem Weapon-Arc.

## `client/src/game/scene/createGameScene.ts`

### Zweck
Erstellt Szene, Kamera, Wasser, Inseln und Hilfsfunktionen fuer Follow-Camera.

### Relevante Funktionen
- `cameraPivotXZ(shipX, shipZ, headingRad)`:
  berechnet Blickdrehpunkt vor/hinter dem Schiff, jetzt ueber `cameraPivotLocalZ` tunebar.
- `updateFollowCamera(camera, shipX, shipZ, shipHeading, dtSec)`:
  folgt dem Schiff weich, nutzt ebenfalls den tunebaren Pivot-Offset.
- `createGameScene()`:
  initialisiert die komplette Spielszene.

## `client/src/game/effects/torpedoFx.ts`

### Zweck
Visualisierung fuer replizierte Minenobjekte und deren Impacts.

### Funktionen
- `createTorpedoFx(scene, fx)`:
  verwaltet interne Objektliste:
  - `sync(torpedoes)`: erstellt/aktualisiert/entfernt Minen-Visuals anhand Netz-Posen.
  - `flashImpact(x, z, kind)`: triggert Partikel bei Einschlag/Entschaerfung.
  - `dispose()`: gibt Geometrien/Materialien frei.

## `client/src/game/effects/fxSystem.ts`

### Zweck
Zentrales Partikelsystem fuer Waffen-Einschlaege und visuelle Rueckmeldungen.

### Relevante Funktion
- `spawnWeaponImpact(weapon, preset, x, z)`:
  erzeugt je nach Waffentyp/Preset unterschiedliche Flash-/Rauch-/Additiv-Partikel.
  Fuer Minen wurden Skalierung und Partikelanzahl sichtbar erhoeht.

## `client/src/game/hud/cockpitHud.ts`

### Zweck
HUD fuer Fahr-/Kampfstatus des lokalen Spielers.

### Funktion
- `createCockpitHud()`:
  erstellt und aktualisiert DOM-basiertes Cockpit.
  Neu: Minenanzeige (`mineCount`/`mineMaxCount`) mit `MAX`-Status falls Limit erreicht.

## `client/src/game/runtime/materialLibrary.ts`

### Zweck
Materialfabrik und Shadersteuerung (insbesondere Wasser).

### Relevante Funktionen
- `createWaterMaterial()`:
  erzeugt Wasser-Shader mit Default-Uniforms aus `DEFAULT_WATER_SHADER_TUNING`.
- `readWaterShaderTuning(material)`:
  liest aktuelle Uniformwerte in ein serialisierbares Tuning-Objekt.
- `applyWaterShaderTuning(material, patch)`:
  schreibt partielle Werte zurueck in Shader-Uniforms.
- `updateWaterShipWakes(...)`:
  uebertraegt Wake-Daten in den Shader.

## `client/src/game/runtime/assetCatalog.ts`

### Zweck
Zentrale Registry fuer Asset-Keys und URLs.

### Inhalt
- Neu: `shipSchnellboot256` als referenzierter Schiffs-Sprite-Assetpfad.

## `client/src/main.ts`

### Zweck
Bootstrap und Orchestrierung des Clients (Renderer, Netzwerk, Runtime-Loops).

### Relevante Stellen
- Registrierung von `onMineImpactNearLocalPlayer` fuer Kamera-Shake nach Distanz.
- Wake-Emission liest den lokalen Z-Offset jetzt aus `shipDebugTuning` statt statischem Wert.
