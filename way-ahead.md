# BattleFleet Arena - Way Ahead

Stand: 1. Mai 2026

Ziel dieses Dokuments ist eine nüchterne, lange Bestandsaufnahme und ein konkreter Umbauplan: BattleFleet Arena soll von einem sehr guten Multiplayer-Prototypen zu einer langfristig tragfähigen, erweiterbaren Engine für einen 3D-Top-Down-Marineshooter wachsen. Der wichtigste Leitgedanke: Nicht alles neu schreiben. Die vorhandene Codebasis enthält bereits viele richtige Kerne. Die Arbeit besteht vor allem darin, harte Kopplungen zu lösen, Inhalte stärker als Daten zu behandeln und klare Erweiterungspunkte für Schiffe, Systeme, Karten, Modi, Audio, Visuals und Betrieb zu schaffen.

---

## 1. Kurzfazit

BattleFleet Arena ist heute kein Wegwerf-Prototyp mehr. Das Projekt hat bereits eine brauchbare technische Grundlage:

- Monorepo mit `client`, `server` und `shared`.
- Three.js-Client mit Wasser, Sky, Kamera, GLB-Schiffen, Mounts, VFX, Audio und HUD.
- Colyseus-Server mit autoritativer 20-Hz-Simulation.
- Gemeinsames `@battlefleet/shared`-Paket für Schema, Bewegung, Waffen, Trefferlogik, Schiffsdaten, Inseln, Progression, Bots und Kollisionshelfer.
- Erste echte Datenmuster für Schiffsrümpfe, Mount-Slots, Sound- und Asset-Kataloge.
- Gute Ansätze für Runtime-Module, Renderer-Lifecycle, Network/Event-Adapter, Material-/Asset-Manager und Performance-Guardrails.
- Deployment-Dokumentation für einen VPS-Betrieb.

Die größte Schwäche ist nicht die Rendering-Technik oder die Grundsimulation, sondern die aktuelle Mischform aus Engine, konkretem Spiel, Live-Protokoll, Content und Debug-Sonderlogik. Neue Schiffe, Systeme oder Karten sind möglich, aber noch nicht "einfach". Viele Änderungen berühren gleichzeitig:

- `shared`-Code und JSON.
- Colyseus-Schema.
- `BattleRoom`.
- Client-HUD.
- Client-FX.
- Audio.
- Lokalisierung.
- eventuell Deployment-/Admin-Konfiguration.

Der Umbau sollte daher nicht als Big Bang passieren. Sinnvoll ist eine Folge kleiner, produktiv nutzbarer Schnitte:

1. **Content-Datenmodell stabilisieren:** Schiffe, Waffen, Systeme, Karten, Modi und Assets bekommen Manifest-/Registry-Strukturen mit Validierung.
2. **Simulation entflechten:** `BattleRoom` wird dünner; ein headless `GameSimulation`-Kern übernimmt Tick, Regeln und Events.
3. **Presentation entflechten:** Client-Renderer konsumieren snapshots/events, nicht Colyseus-Objekte und Spielregeln direkt.
4. **Content-Pipeline bauen:** neue Schiffe/Karten/Systeme werden über JSON plus Assets plus Tests hinzugefügt.
5. **Produktionsreife herstellen:** Persistenz, CI, Backups, Observability, Admin, Staging, Accounts und spätere Monetarisierung vorbereiten.

---

## 2. Zielbild: Was "Engine" hier bedeuten sollte

"Engine" bedeutet in diesem Projekt nicht, eine allgemeine Unity-Alternative zu bauen. Gemeint ist eine projektspezifische Marine-Shooter-Engine mit wiederverwendbaren Bausteinen.

### 2.1 Engine-Ziele

Die Codebasis soll ermöglichen:

- neue Schiffsklassen hinzuzufügen, ohne Kernlogik umzubauen;
- Rumpfmodelle, Mounts, Waffen und Loadouts über Daten zu definieren;
- neue Systeme wie Sonar, Radar, ECM, Minen, Drohnen, Repair, Smoke, Boost oder Commander-Abilities modular einzubauen;
- Karten über Datenpakete zu definieren: AO, Inseln, Kollisionspolygone, Spawns, Zonen, Objectives, Licht, Wasser, Wetter, Ambient;
- Spielmodi wie Deathmatch, Sea Control, Convoy, PvE, Coop oder Training als Mode-Definitionen zu betreiben;
- Client-Visuals und Audio pro Content-ID zu binden, ohne Simulationscode mit Assetdetails zu belasten;
- einen lokalen Sandbox-/Bot-/Replay-Modus zu betreiben, der nicht zwingend an Colyseus hängt;
- Serverbetrieb, Admin und Balancing langfristig sicherer zu machen.

### 2.2 Was nicht das Ziel sein sollte

Folgendes wäre aktuell zu groß oder zu früh:

- ein komplett generischer 3D-Engine-Layer ohne Marine-Spezifik;
- vollständiges Modding durch beliebige externe Nutzer;
- horizontales MMO-Scaling;
- vollständiger Anti-Cheat-Apparat;
- komplexe Account-/Shop-/Payment-Systeme vor belastbarem Core-Loop;
- ein großer Rewrite von Client und Server.

Das Projekt sollte lieber eine starke vertikale Engine für "Top-down naval combat" werden als eine abstrakte Plattform ohne Spiel.

---

## 3. Aktuelle Architektur

### 3.1 Repository

Das Projekt ist als npm-Workspace organisiert:

- `client`: Vite, TypeScript, Three.js, Colyseus-Client, DOM-HUD, Audio.
- `server`: Node, Express, Colyseus, Admin-Endpunkte, Leaderboard, BattleRoom.
- `shared`: Colyseus-Schema, Simulationshelfer, Waffenlogik, Schiffsdaten, Bots, Kollision, Progression.
- `docs`: Architektur-, Deployment- und Feature-Dokumentation.

Diese Struktur ist grundsätzlich richtig. Das `shared`-Paket ist der zentrale Vorteil: Client und Server teilen wichtige mathematische und fachliche Regeln. Gleichzeitig ist `shared` derzeit sehr breit: Es enthält Daten, Domainlogik, Schema, Bot-KI, Karten, Waffen und Visual-Layout. Das ist für das aktuelle Projekt praktisch, wird aber mit wachsendem Content zum Engpass.

### 3.2 Client

Der Client ist ein Three.js-Spiel mit Colyseus-State als Quelle der Wahrheit. `client/src/main.ts` ist nicht mehr nur ein chaotisches God-File, aber weiterhin der große Orchestrator. Es verdrahtet:

- Renderer und Canvas.
- Szene, Kamera, Wasser, Sky, Licht und Inseln.
- Input und Fire-Control.
- Cockpit, MessageLog, DebugOverlay, MatchEnd-HUD.
- Bot-Controller und Bot-Debug.
- Audio.
- FX-Systeme.
- Asset-Preloads.
- Colyseus-Join und Room-Handler.
- Frame-Runtime.
- Runtime-Shutdown.

Wichtig: Es gibt bereits gute Extraktionen, z. B. `sessionBootstrap`, `rendererLifecycle`, `runtimeErrors`, `networkRuntime`, `visualRuntime`, `hudRuntime`, `frameRuntime`, `stateAdapter`, `assetManager`, `materialLibrary`. Das Ziel muss daher nicht sein, `main.ts` "endlich aufzubrechen", sondern die nächste Stufe zu erreichen: `main.ts` sollte nur noch eine Game-Composition aus Daten und Modulen starten.

### 3.3 Szene und Rendering

`createGameScene.ts` ist ein starker Kern für die visuelle Identität:

- Seekarten-Koordinaten auf der XZ-Ebene.
- +Z als Norden, +X als Osten.
- Wasser und Sky.
- Follow-Camera.
- Licht-/Fog-Presets.
- AO-Grenze.
- Sea-Control-Linie.
- Inseln aus shared-Daten.
- Debug-Polygone.
- Culling-Helfer für Artillerie-FX.

Das ist bereits eine "World Scene". Für eine Engine fehlen vor allem:

- eine Map-Definition als Input statt importierter Defaults;
- eine Environment-Definition pro Map/Mode;
- eine klare `CoordinateFrame`-Abstraktion, damit `worldToRenderX` und verwandte Mappings nicht quer durch Module laufen;
- ein einheitlicher World-FX-Culling-Service statt Speziallogik nur für Artillerie.

### 3.4 Schiffe und Visuals

Schiffe sind heute eine Kombination aus:

- `shared/src/shipClass.ts`: feste Klassen FAC, Destroyer, Cruiser mit Basisstats.
- `shared/src/data/ships/*.json`: Rumpfprofile, MountSlots, GLB-IDs, Collision-Hitbox, ASuM-Magazin, Loadout.
- `shared/src/data/ships/mountSockets/*.json`: Mount-Socket-Registry.
- `shared/src/shipProfiles.ts`: Loader/Resolver für Profile.
- `client/src/game/runtime/shipProfileRuntime.ts`: clientseitige effektive Profile und lokale Editor-Patches.
- `client/src/game/scene/shipVisual.ts`: konkrete Visual-Gruppe.
- `client/src/game/scene/shipMountVisuals.ts`: Mount-GLBs, Muzzles, Train-Bindings.
- `client/src/game/renderers/ships/shipRenderer.ts`: Lifecycle für Schiff-Visuals.

Das ist einer der stärksten Bereiche der Codebasis. Es gibt bereits eine Datenpipeline für neue Schiffe. Trotzdem ist sie noch nicht vollständig enginefähig:

- `shipClass.ts` enthält Stats als TypeScript-Konstanten statt JSON/Manifest.
- `ShipClassId` ist eine harte Union aus drei Klassen.
- Server und Client erwarten implizit bekannte Klassen.
- Das Colyseus-Schema repliziert `shipClass` als string, aber Validierung und Content-Registry sind noch nicht zentral.
- Schiffssysteme sind teilweise aus dem Rumpfprofil ableitbar, teilweise über Codekonstanten in Waffenmodulen.
- `BattleRoom` importiert sehr viele Profil-, Waffen- und Progressionsfunktionen direkt.

Für "einfach neue Schiffe hinzufügen" braucht es eine saubere Content-Registry, nicht nur mehr JSON-Dateien.

### 3.5 Waffen und Systeme

Aktuell vorhandene Systeme:

- Primär-Artillerie.
- ASuM / Sea-Skimmer.
- Torpedo.
- SAM / PDMS / CIWS / Hardkill.
- Softkill/ECM-Ansätze.
- Radar/ESM.
- Sea Control.
- Respawn, Spawn-Schutz, OOB.
- Progression und Klassenwechsel.
- Bots.
- Wracks und Ram-/Kollisionsschaden.

Die Fachlogik liegt überwiegend in `shared`, die Orchestrierung im Serverraum. Das ist gut für deterministische Serverautorität, aber die Systemarchitektur ist noch nicht modular. Neue Systeme werden wahrscheinlich so entstehen:

1. shared-Datei hinzufügen;
2. BattleRoom-Importliste erweitern;
3. SimEntry erweitern;
4. PlayerState erweitern;
5. InputPayload erweitern;
6. HUD erweitern;
7. NetworkRuntime erweitern;
8. FX/Audio erweitern;
9. Tests ergänzen.

Dieser Weg ist machbar, aber skalierungsfeindlich. Eine Engine braucht eine explizite System-Schicht mit standardisierten Schnittstellen.

### 3.6 Server

Der Server ist ein dedizierter Node/Colyseus-Prozess:

- `index.ts` startet Express und Colyseus.
- `BattleRoom.ts` enthält den großen Match-Lebenszyklus.
- `adminConfig.ts` verwaltet Runtime-Config via JSON-Datei.
- `leaderboardStore.ts` verwaltet Leaderboard via JSON-Datei.
- `adminPanel.ts` stellt Admin-UI und APIs bereit.

`BattleRoom` ist der größte technische Engpass. Es ist nicht schlecht geschrieben, aber es ist zu viel auf einmal:

- Room-Lifecycle.
- Client-Joins und Leaves.
- Bot-Population.
- Input-Protokoll.
- Simulationszustand.
- Waffenfeuer.
- Projektilschritte.
- Trefferauflösung.
- Lebenszustände.
- Respawns.
- OOB.
- Matchphase.
- Leaderboard.
- Progression.
- Admin-Restarts.
- Netzwerk-Events.

Für langfristiges Wachstum sollte `BattleRoom` ein Adapter werden: Colyseus rein/raus, aber der eigentliche Match-Kern lebt in einer testbaren, headless Simulation.

### 3.7 Shared

`shared` ist aktuell der zentrale Fachkern. Es exportiert sehr viel:

- Bewegung.
- Schema.
- Kartenbounds.
- Inseln.
- Artillerie.
- ASuM.
- Torpedo.
- Air Defense.
- Match.
- Sea Control.
- Progression.
- ShipClass.
- DisplayName.
- ShipVisualLayout.
- MountWeaponRange.
- ShipProfiles.
- Collision.
- Bots.
- Wake/Wrecks.

Das ist produktiv, aber zu breit für klare Ownership. Langfristig sollte `shared` in gedankliche Subdomains getrennt werden:

- `shared/protocol`: Schema, Events, Netzwerktypen.
- `shared/sim`: reine Simulation und Regeln.
- `shared/content`: Content-Manifest, Registries, Validierung.
- `shared/math`: Geometrie, Kollisionsqueries, Koordinaten.
- `shared/bots`: KI.
- `shared/test-fixtures`: Fixtures für Simulation und Content.

Das muss nicht zwingend als neue npm-Packages passieren. Es kann zuerst eine Ordnerstruktur innerhalb von `shared/src` sein.

---

## 4. Hauptprobleme und Chancen

### 4.1 Harte Kopplung an `BattleRoom`

`BattleRoom` ist der Ort, an dem neue Systeme derzeit landen. Dadurch wird jede neue Mechanik riskanter. Ein neues System kann leicht unerwartete Folgen für Respawn, Bots, HUD-Felder, Score oder Events haben.

Empfehlung: Einen `GameSimulation`-Kern einführen:

- Input: aktueller MatchState, Commands, dt, now.
- Output: neuer MatchState plus DomainEvents.
- Keine Colyseus-Abhängigkeit.
- Keine Express-/Admin-/Leaderboard-Abhängigkeit.
- Tests direkt gegen Simulation möglich.

`BattleRoom` wird dann:

- Clients verwalten.
- Commands in Simulation einspeisen.
- Simulationsergebnisse ins Colyseus-Schema kopieren.
- DomainEvents an Clients senden.
- Match-Ende an Leaderboard melden.

### 4.2 Harte Kopplung an Colyseus-Schema

Das Colyseus-Schema ist aktuell gleichzeitig:

- Netzwerkprotokoll.
- Client-Read-Model.
- Server-State-Spiegel.
- HUD-Datenquelle.

Das ist für MVPs normal. Für eine Engine sollte es getrennt werden:

- **Simulation State:** interne, normale TypeScript-Daten.
- **Replication State:** Colyseus-Schema, optimiert fürs Netzwerk.
- **Presentation Snapshot:** Client-freundliche, renderernahe Daten.

Diese Trennung macht neue Features weniger gefährlich. Nicht jedes interne Feld muss repliziert werden, und nicht jedes replizierte Feld gehört in die Simulation.

### 4.3 Content ist teilweise Daten, teilweise Code

Schiffsrumpfprofile sind schon JSON. Viele andere Dinge sind noch Code:

- Klassenliste und ShipClass-Union.
- Bot-Namen.
- Kartenlayout als TS-Konstanten.
- viele Waffen-/Balance-Konstanten.
- Environment-Presets als TS.
- Asset-URLs als TS.
- Match-/Mode-Regeln teils TS, teils AdminConfig.

Empfehlung: Nicht alle Konstanten blind in JSON schieben. Stattdessen Content-Arten sauber unterscheiden:

- **Design Content:** Schiffe, Systeme, Waffen, Karten, Modi, Assets, Audio, UI-Labels. Gehört in versionierte Daten mit Validierung.
- **Runtime Admin Config:** Matchdauer, minimale Spieler, Wartungsmodus, Live-Balance-Knöpfe. Gehört in AdminConfig oder später Remote Config.
- **Engine Invarianten:** Netzwerk-Tickrate, Basisalgorithmen, Sicherheitsgrenzen, Physikformeln. Dürfen Code bleiben.

### 4.4 Client-Frame-Runtime mischt Presentation und Game-Feel

`frameRuntime.ts` ist ein wichtiger Orchestrator, aber auch sehr voll. Es verbindet:

- lokale und remote Posen;
- ShipVisual-LifeState;
- HUD-Modell;
- Audio-Engine-Bed;
- dynamische Musik;
- Level-Up;
- OOB-Warnung;
- Sea-Control-Hinweise;
- Radar/ESM;
- AD-HUD;
- Missile/Torpedo-Sync;
- Kamera;
- Input-Dedup;
- Visual-Roll;
- Debug-Linien.

Das ist nicht falsch, aber für eine Engine sollte `frameRuntime` aufgeteilt werden:

- `PresentationWorldSync`: State -> EntityVisuals.
- `HudViewModelBuilder`: State -> HUD-Modell.
- `AudioDirector`: State/Events -> Audio.
- `GameFeelDirector`: Threats, Shake, Flash, Toasts.
- `InputCommandEncoder`: InputSample -> Netzwerkcommands.
- `CameraDirector`: Follow, culling, camera shake.

### 4.5 Asset- und Material-Pipeline ist im Aufbau

`assetCatalog.ts`, `assetManager.ts`, `materialLibrary.ts`, `soundCatalog.ts`, GLB-Resolver und Visual-Profile sind gute Grundlagen. Für eine Content-Engine fehlt:

- ein Manifest mit Asset-IDs, Typen, Pfaden, Versionen, optionalen Hashes;
- Validierung, dass jedes Content-Profil referenzierte Assets findet;
- Fallback-Regeln je Asset-Typ;
- Build-/CI-Check für fehlende Dateien;
- klare Konventionen für Scale, Pivot, Sockets, Muzzles, Collisions.

Das vorhandene `docs/VISUALS-ENGINE-PLAN.md` geht bereits in diese Richtung und sollte nicht ersetzt, sondern in den allgemeinen Engine-Plan integriert werden.

### 4.6 Persistenz und Betrieb sind MVP-tauglich, aber nicht produktionsstark

Leaderboard und Admin-Config liegen unter `server-data`. Das ist für einen einzelnen VPS okay. Für kommerziell relevanten Betrieb fehlen:

- `server-data/` in `.gitignore`.
- Backups.
- Migrationen.
- Healthcheck.
- strukturierte Logs.
- Rate-Limits.
- nicht-root systemd User.
- Staging/Production-Trennung.
- robustere Persistenz, z. B. SQLite/Postgres/Redis.
- Account-/Identity-Konzept.

Diese Punkte müssen nicht alle sofort kommen, aber sie sollten im Jahresplan auftauchen.

---

## 5. Zielarchitektur

### 5.1 Grobe Zielstruktur

Ein mögliches Zielbild:

```text
shared/src/
  content/
    manifest.ts
    contentRegistry.ts
    contentValidation.ts
    data/
      ships/
      weapons/
      systems/
      maps/
      modes/
      assets/
      audio/
  protocol/
    schema.ts
    commands.ts
    events.ts
    snapshots.ts
  sim/
    GameSimulation.ts
    MatchState.ts
    systems/
      movementSystem.ts
      weaponSystem.ts
      projectileSystem.ts
      airDefenseSystem.ts
      collisionSystem.ts
      respawnSystem.ts
      scoringSystem.ts
  math/
    coordinates.ts
    collision/
    rng.ts
  bots/
    ...

server/src/
  rooms/
    BattleRoom.ts
  adapters/
    colyseusStateAdapter.ts
    commandAdapter.ts
    eventBroadcastAdapter.ts
  persistence/
    leaderboardStore.ts
    adminConfig.ts
    matchHistoryStore.ts
  ops/
    health.ts
    metrics.ts

client/src/game/
  app/
    createBattlefleetApp.ts
    gameComposition.ts
  engine/
    loop/
    scene/
    camera/
    assets/
    audio/
    performance/
  presentation/
    worldPresenter.ts
    hudPresenter.ts
    audioDirector.ts
    gameFeelDirector.ts
  renderers/
    ships/
    projectiles/
    effects/
    world/
  adapters/
    colyseusClientAdapter.ts
    networkStateAdapter.ts
    matchEventAdapter.ts
  ui/
    ...
```

Wichtig: Das ist ein Zielbild, keine Sofort-Umstrukturierung. Die ersten Schritte sollten nur die Grenzen schaffen, nicht alle Dateien verschieben.

### 5.2 Content Registry

Eine zentrale `ContentRegistry` sollte beim Build oder Serverstart erzeugt werden:

- `shipsById`
- `weaponsById`
- `systemsById`
- `mapsById`
- `modesById`
- `assetsById`
- `audioById`

Sie beantwortet Fragen wie:

- Welche Ship-IDs sind gültig?
- Welche Systeme hat dieses Schiff?
- Welche Mounts sind kompatibel?
- Welche Projektile und Effekte gehören zu welcher Waffe?
- Welche Karte ist für welchen Modus erlaubt?
- Welche Assets müssen vor Matchstart geladen sein?
- Welche Balance-Version läuft auf Server und Client?

Die Registry muss sowohl Client als auch Server bedienen, aber nicht alles muss auf beiden Seiten identisch verwendet werden. Der Server braucht Gameplay-Daten, der Client braucht Visual-/Audio-Daten.

### 5.3 Content Manifest

Ein Manifest könnte so aussehen:

```json
{
  "contentVersion": "2026.05.engine-foundation",
  "ships": ["ships/fac.json", "ships/destroyer.json", "ships/cruiser.json"],
  "weapons": ["weapons/artillery_76mm.json", "weapons/aswm_basic.json"],
  "systems": ["systems/sam_basic.json", "systems/ciws_basic.json", "systems/radar_basic.json"],
  "maps": ["maps/archipelago_alpha.json"],
  "modes": ["modes/sea_control.json", "modes/deathmatch.json"],
  "assets": ["assets/ships.json", "assets/fx.json", "assets/ui.json"],
  "audio": ["audio/sfx.json", "audio/music.json"]
}
```

Das Manifest ist die Grundlage für:

- Validierung.
- Versionsanzeige.
- Staging/Production-Vergleich.
- spätere Mod-/Season-Packs.
- reproduzierbare Builds.

### 5.4 Schema-Validierung

Da die Codebasis TypeScript nutzt, bieten sich mehrere Wege an:

- zuerst einfache eigene Validatoren in `shared/src/content/contentValidation.ts`;
- später Zod, Valibot, JSON Schema oder TypeBox.

Wichtig ist nicht das Tool, sondern die Regel: Ein neues Schiff darf nicht "halb gültig" sein. Der Build oder Serverstart muss fehlschlagen, wenn:

- eine referenzierte Waffe fehlt;
- ein Mount-Socket fehlt;
- ein GLB-Asset fehlt;
- eine Kollisionshitbox ungültig ist;
- eine Map keine Spawnpunkte hat;
- ein Modus auf eine nicht vorhandene Objective-Zone verweist;
- Client-Visuals und Server-Systeme widersprüchlich sind.

### 5.5 Simulation als headless Kern

Ein Ziel-Interface:

```ts
type GameSimulation = {
  tick(input: {
    nowMs: number;
    dtMs: number;
    commands: PlayerCommand[];
  }): SimulationTickResult;
  getState(): MatchState;
  reset(next: MatchSetup): void;
};

type SimulationTickResult = {
  state: MatchState;
  events: DomainEvent[];
};
```

Diese Simulation kennt keine DOM-APIs, kein Three.js, kein Express, kein Colyseus-Room-Objekt. Sie darf aber ContentRegistry, math helpers, RNG und Domain-Systeme nutzen.

### 5.6 Domain Events

Viele heutige Server-Events existieren schon, z. B. `artyFired`, `artyImpact`, `airDefenseFire`, `airDefenseIntercept`, `torpedoImpact`, `collisionContact`, `missileLockOn`. Sie sollten als echte DomainEvent-Typen definiert werden:

```ts
type DomainEvent =
  | { type: "weapon.fired"; weaponId: string; ownerId: string; origin: Vec2; target?: Vec2 }
  | { type: "projectile.impact"; projectileId: string; kind: "water" | "hit" | "island" | "oob"; position: Vec2 }
  | { type: "ship.destroyed"; victimId: string; killerId?: string; cause: string }
  | { type: "ship.respawned"; playerId: string; position: Vec2 }
  | { type: "airDefense.intercept"; defenderId: string; projectileId: string; layer: string };
```

Der Server kann daraus Colyseus messages machen. Der Client kann daraus FX, Audio, HUD und Screenshake ableiten. Tests können DomainEvents direkt prüfen.

### 5.7 Presentation Snapshot

Der Client sollte mittelfristig nicht überall aus Colyseus-Schema lesen. Sinnvoll ist eine Adapter-Schicht:

```ts
type PresentationSnapshot = {
  players: ShipPresentation[];
  projectiles: ProjectilePresentation[];
  wrecks: WreckPresentation[];
  match: MatchPresentation;
  local: LocalPlayerPresentation | null;
};
```

Dann konsumieren Renderer, HUD und Audio denselben Snapshot. Colyseus bleibt austauschbarer.

---

## 6. Externe Parametrisierung

### 6.1 Schiffe

Schiffe sollten vollständig datengetrieben werden:

- `id`
- Anzeigenamen pro Sprache
- Rolle: `fast_attack`, `destroyer`, `cruiser`, `carrier`, `submarine`, etc.
- Bewegung: Speed, Acceleration, TurnRate, Drift/Brake, Mass.
- HP/Armor/Sections.
- Collision-Hitbox.
- Visual: Hull GLB, Scale, Y-Offset, Wake-Profile.
- MountSlots.
- FixedLaunchers.
- DefaultLoadout.
- erlaubte Systeme.
- Sensoren.
- Audio-Profil.
- Bot-Verhalten-Gewichtung.
- Unlock/Progression/Cost.

Bestehende `shared/src/data/ships/*.json` sind der Startpunkt. `shipClass.ts` sollte langfristig keine feste Union mehr sein, sondern Profile aus der Registry lesen. Für TypeScript-Sicherheit kann es weiterhin bekannte Built-in IDs geben, aber die Simulation sollte nicht nur drei Klassen kennen.

### 6.2 Waffen

Waffen sollten als eigene Content-Typen modelliert werden:

- Artillery.
- Missile.
- Torpedo.
- Mine.
- Depth charge.
- Railgun/experimental.
- AA/PDMS/CIWS.

Ein Weapon-Profil braucht:

- `weaponId`
- `kind`
- Cooldown
- Range
- Damage
- Splash/Hit radius
- Projectile speed / flight curve
- Ammo/Magazine
- Fire sector requirements
- Compatible mount kinds
- Server-Fire-Handler
- Client-FX binding
- Audio binding
- HUD binding

Nicht jede Formel muss JSON sein. Die JSON kann eine `behaviorId` referenzieren, z. B. `artillery.ballistic_arc_v1` oder `missile.sea_skimmer_homing_v1`. Dadurch bleibt komplexe Logik testbarer Code, aber Werte und Kombinationen werden parametrisiert.

### 6.3 Systeme

Schiffssysteme sollten eine eigene Ebene bekommen:

- Radar.
- ESM.
- Sonar.
- ECM/Softkill.
- Hardkill-Layer.
- Repair.
- Smoke.
- Boost.
- Fire control computer.
- Damage control.
- Mine laying.
- UAV/drone.
- Commander ability.

Ein Systemprofil könnte enthalten:

- `systemId`
- `kind`
- passiv/aktiv/auto
- input command
- cooldown
- resource/ammo/charge
- required sensors
- interaction with projectiles
- HUD state
- audio/fx cues
- bot usage policy

Die heutige Luftabwehr ist ein guter Kandidat für die erste Extraktion, weil sie schon mehrere Layer, Cooldowns und HUD-Felder besitzt.

### 6.4 Karten

Karten sollten nicht mehr aus `DEFAULT_MAP_ISLANDS` und `DEFAULT_MAP_ISLAND_POLYGONS` fest importiert werden. Eine Map-Definition sollte enthalten:

- `mapId`
- Name und Beschreibung
- World bounds
- Default AO oder dynamische AO-Regel
- Inseln/Terrain mit Kollisionspolygonen
- Spawns und Spawn-Regeln
- Objective-Zonen
- Sea-Control-Zonen
- Portale oder Spezialobjekte
- Environment: Licht, Wasser, Nebel, Tageszeit
- Bot-Navigation/Waypoints
- Asset-Preload-Liste
- Performance-Budget-Hinweise

Bestehende Inselpolygone können als `archipelago_alpha` migriert werden. Wichtig ist: Server lädt die Karte für Kollision und Spawns, Client lädt dieselbe Karte für Darstellung.

### 6.5 Modi

Spielmodi sollten von Karten getrennt werden:

- Deathmatch.
- Team Deathmatch.
- Sea Control.
- King of the Hill.
- Convoy Attack.
- Escort.
- PvE Waves.
- Training/Sandbox.

Ein Mode-Profil definiert:

- Scoring-Regeln.
- Matchdauer.
- Respawn-Regeln.
- Teams/Factions.
- erlaubte Schiffsklassen.
- Bot-Füllung.
- Objectives.
- Win Conditions.
- Leaderboard-Kategorie.

Das aktuelle Spiel ist ungefähr eine Mischung aus Free-for-all, Score, Progression und Sea-Control. Das sollte als erster expliziter Mode beschrieben werden.

### 6.6 Assets

Assets brauchen IDs statt verstreuter Pfade:

- Hull GLBs.
- Mount GLBs.
- Insel-/World-GLBs.
- Texturen.
- Sprite Sheets.
- UI Icons.
- Sound Files.
- Music Loops.

`assetCatalog.ts` und `soundCatalog.ts` sind gute Vorbilder. Ziel ist ein gemeinsames Manifest mit Type und URL:

```json
{
  "id": "hull.destroyer.default",
  "type": "gltf",
  "url": "assets/ships/destroyer.glb",
  "fallback": "hull.placeholder.destroyer",
  "tags": ["ship", "destroyer"]
}
```

### 6.7 Lokalisierung

Der Client hat bereits `locale/en.ts` und `t()`. Für kommerzielle Perspektive sollte jeder user-facing Text über Ressourcen laufen. Das betrifft besonders:

- HUD.
- Fehler.
- Admin-nahe Meldungen, soweit sichtbar.
- Match-End.
- Class Picker.
- Tutorial/Briefing.
- Content-Namen.

Content-Dateien sollten Label-Keys statt nur deutscher Labels enthalten. Beispiel:

```json
{
  "id": "destroyer",
  "labelKey": "ship.destroyer.name",
  "descriptionKey": "ship.destroyer.description"
}
```

---

## 7. Vereinfachungsplan

### 7.1 Nicht zu früh abstrahieren

Der wichtigste Vereinfachungsgrundsatz: Nur dort abstrahieren, wo die Codebasis bereits Schmerzen zeigt. Diese Stellen sind klar:

- `BattleRoom`.
- `frameRuntime`.
- Content-Definitionen.
- Schema/State/Presentation-Vermischung.
- Asset-/Audio-Kataloge.
- Karten-Defaults.

Nicht nötig ist aktuell:

- eine eigene ECS-Engine;
- ein Plugin-System mit dynamischen Imports;
- komplette Trennung in viele npm-Packages;
- generisches Modding mit Sandbox;
- großer UI-Framework-Wechsel.

### 7.2 Erste Vereinfachung: Built-in Content Registry

Bevor externe Dateien dynamisch geladen werden, sollte es eine Built-in Registry geben. Das kann intern weiter statisch importieren, aber die restliche Codebasis spricht nur noch mit der Registry.

Kurzfristig:

- `getShipHullProfileByClass` bleibt.
- Neue `contentRegistry.ts` bietet `getShip(id)`, `listShips()`, `getMap(id)`, `getWeapon(id)`.
- `shipClass.ts` wird schrittweise zum Adapter.

Vorteil: Wenig Risiko, aber klarer Einstiegspunkt für spätere externe Content-Packs.

### 7.3 Zweite Vereinfachung: BattleRoom-Extraktion entlang Tick

Nicht nach Dateigröße refaktorieren, sondern entlang der Tick-Pipeline:

1. Input sammeln.
2. Commands normalisieren.
3. Movement anwenden.
4. Collision anwenden.
5. Weapon fire anwenden.
6. Projectiles simulieren.
7. Damage/Life/Respawn anwenden.
8. Score/Progression anwenden.
9. Events sammeln.
10. Schema synchronisieren.

Jeder Schritt kann ein eigenes Modul mit Tests werden. `BattleRoom` ruft nur noch die Pipeline.

### 7.4 Dritte Vereinfachung: Client Presentation Directors

`frameRuntime` sollte in Directors zerlegt werden:

- `shipPresentationDirector`
- `projectilePresentationDirector`
- `hudPresentationDirector`
- `audioDirector`
- `cameraDirector`
- `gameFeelDirector`
- `inputCommandDirector`

Das macht Features wie "neues System mit HUD und Audio" leichter, weil nicht mehr eine riesige Funktion angepasst werden muss.

### 7.5 Vierte Vereinfachung: Eventnamen und Commands typisieren

Viele Netzwerkereignisse sind strings. Sie sollten in `shared/protocol/events.ts` und `commands.ts` gesammelt werden. Dadurch werden Client und Server weniger fehleranfällig.

Beispiele:

- `CommandType.Input`
- `CommandType.Ping`
- `EventType.ArtilleryFired`
- `EventType.ProjectileImpact`
- `EventType.AirDefenseFire`
- `EventType.MatchEnded`

Danach können Adapter weiterhin Colyseus-Strings senden, aber die Codebasis hängt nicht mehr an frei getippten Strings.

---

## 8. Konkreter Umbauplan

### Phase 0: Sicherheitsnetz und Hygiene

Ziel: Bevor Architektur größer angefasst wird, muss der Ist-Zustand besser abgesichert werden.

Arbeitspakete:

- `server-data/` in `.gitignore` aufnehmen.
- CI erweitern: root build, shared tests, server tests, client typecheck/build.
- Smoke-Szenario dokumentieren: lokaler Server, zwei Clients, Bot-Fill, Schießen, Respawn, Match-End.
- Bestehende Docs konsolidieren: `ARCHITECTURE.md`, `VISUALS-ENGINE-PLAN.md`, dieses Dokument.
- Tests für Content-Validierung vorbereiten.
- Keine Feature-Änderungen während großer Extraktionen.

Ergebnis:

- Refactoring kann in kleinen PRs passieren.
- Fehler bei Schema/Content fallen früher auf.

### Phase 1: Content Registry Foundation

Ziel: Eine zentrale Registry einführen, ohne Verhalten zu ändern.

Arbeitspakete:

- `shared/src/content/contentRegistry.ts` anlegen.
- Bestehende Schiffsprofile dort registrieren.
- `listShipProfiles()`, `getShipProfile(id)`, `requireShipProfile(id)` einführen.
- `ShipClassId` zunächst kompatibel lassen, aber intern über Registry normalisieren.
- Validierung für bestehende ship JSONs:
  - required fields;
  - mount slot IDs eindeutig;
  - defaultLoadout referenziert existierende Slots;
  - sockets und visual IDs plausibel;
  - collisionHitbox gültig.
- Tests für alle eingebauten Schiffsprofile.

Ergebnis:

- Neue Schiffe haben einen klaren Weg.
- Bestehender Code kann schrittweise von Direktimporten auf Registry wechseln.

### Phase 2: Maps als Datenpakete

Ziel: Die aktuelle Karte als `archipelago_alpha` in eine Map-Definition überführen.

Arbeitspakete:

- `shared/src/content/data/maps/archipelago_alpha.json`.
- Map-Typen: bounds, islands, polygons, AO, sea-control, spawns.
- `mapRegistry.ts`.
- Server: BattleRoom nutzt `currentMap` statt `DEFAULT_MAP_ISLAND_POLYGONS`.
- Client: `createGameScene({ map })` statt shared Defaults.
- Tests:
  - Map bounds valide;
  - Inselpolygone vorhanden;
  - Spawnpunkte nicht in Inseln;
  - Sea-Control-Zone innerhalb Map.

Ergebnis:

- Neue Karten werden Datenarbeit statt Codeänderung.
- Der erste große Engine-Hebel ist sichtbar.

### Phase 3: Protocol Types und Domain Events

Ziel: Netzwerkstrings und Ereignisformen zentralisieren.

Arbeitspakete:

- `shared/src/protocol/commands.ts`.
- `shared/src/protocol/events.ts`.
- Bestehende `matchEventAdapter`-Parser auf diese Typen ausrichten.
- Server-Broadcasts über kleine Event-Factorys schicken.
- Tests für Event-Parsing und Fallbacks.

Ergebnis:

- Neue Systeme bekommen standardisierte Events.
- Client-FX/Audio/HUD können Events verlässlicher konsumieren.

### Phase 4: GameSimulation extrahieren

Ziel: Simulation aus `BattleRoom` herauslösen.

Arbeitspakete:

- `shared/src/sim/MatchState.ts`.
- `shared/src/sim/GameSimulation.ts`.
- Zuerst nur Movement + OOB + LifeState auslagern.
- Danach Waffen/Projectiles schrittweise auslagern.
- BattleRoom bleibt Adapter und Schema-Sync.
- Tests für Tick-Reihenfolge und zentrale Invarianten:
  - tote Spieler bewegen sich nicht;
  - Spawn-Schutz verhindert definierte Schadensarten;
  - OOB führt in Respawn-Pfad;
  - Projektil-Lifetime endet korrekt.

Ergebnis:

- Headless Simulation wird testbar.
- Singleplayer/Sandbox/Replay wird möglich.

### Phase 5: Weapon/System Registry

Ziel: Waffen und Systeme modularisieren.

Arbeitspakete:

- Weapon-Profile für Artillery, ASuM, Torpedo.
- System-Profile für Radar, SAM, PDMS, CIWS, ECM.
- Behavior-IDs einführen, z. B. `projectile.ballistic_v1`, `missile.homing_cone_v1`.
- Server-Systeme lesen Profile statt globaler Konstanten.
- Client-HUD liest Weapon/System-Presentation statt hardcoded Cooldown-Felder.
- Tests für jedes Systemprofil.

Ergebnis:

- Neue Systeme können als Profil + Behavior + UI-Binding entstehen.
- Der Weg für Loadouts wird klar.

### Phase 6: Client Presentation Rework

Ziel: `frameRuntime` in Directors zerlegen.

Arbeitspakete:

- `buildPresentationSnapshot(room, localSessionId)`.
- `ShipPresentationDirector`.
- `HudPresentationDirector`.
- `AudioDirector`.
- `GameFeelDirector`.
- `CameraDirector`.
- `InputCommandDirector`.
- Renderer bekommen snapshots/events.
- Tests für ViewModel-Building und Input-Dedup.

Ergebnis:

- Neue Content-Daten müssen nicht mehr überall im Client verteilt eingebaut werden.
- HUD/Audio/FX werden erweiterbarer.

### Phase 7: Asset/Audio Manifest

Ziel: Assets und Sounds werden über manifestierte IDs verwaltet.

Arbeitspakete:

- `assets.manifest.json`.
- `audio.manifest.json`.
- Asset-Validierung im Build.
- `AssetManager` kann GLTF, Texture, AudioBuffer verwalten oder koordinieren.
- Fallback-Strategien pro Asset-Typ.
- Preload-Listen aus Map/Ship/Mode ableiten.

Ergebnis:

- Neue Schiffe und Karten können ihre Assets deklarieren.
- Fehlende Assets werden vor Release sichtbar.

### Phase 8: Ops und Production Hardening

Ziel: Ein stabiler kleiner Live-Betrieb.

Arbeitspakete:

- Health endpoint.
- Server build/test in CI.
- Deploy-Script oder Dockerfile.
- Non-root systemd User in Doku.
- Backups für `BFA_DATA_DIR`.
- Leaderboard/Config auf SQLite oder Postgres migrieren, wenn Nutzung wächst.
- Rate-Limit für öffentliche APIs.
- strukturierte Logs.
- Staging-Umgebung.

Ergebnis:

- Das Projekt wird nicht nur entwickelbar, sondern betreibbar.

---

## 9. Tests und Qualität

Für den Engine-Umbau sind Tests kein Bonus, sondern der Hebel, der kleine Schritte möglich macht.

### 9.1 Content-Tests

Immer testen:

- jedes Schiffprofil;
- jede Map;
- jedes Weapon/System-Profil;
- Asset-Referenzen;
- Localisation-Keys;
- Loadout-Kompatibilität;
- Spawn-/Collision-Invarianten.

### 9.2 Simulation-Tests

Testen:

- Movement bei verschiedenen Klassen.
- OOB.
- Respawn.
- Spawn-Schutz.
- Trefferauflösung.
- Projektil-Lifetime.
- AirDefense-Layer-Auswahl.
- Softkill.
- Sea-Control-Scoring.
- Progression.
- Bot-Kommandos.

### 9.3 Protocol-Tests

Testen:

- Command-Parsing.
- Event-Parsing.
- Fallback bei unbekannten Feldern.
- Schema-Sync für wichtige Felder.
- Backwards/forwards compatibility, falls Live-Client und Server kurzzeitig nicht exakt gleich sind.

### 9.4 Client-Tests

Testen:

- HUD ViewModels.
- Radar-Math.
- Input-Dedup und Command-Encoding.
- Event -> FX/Audio trigger mapping.
- Renderer-Lifecycle: spawn, update, dispose.
- Performance-Guardrails für FX-Spitzen.

### 9.5 Manuelle Smoke-Tests

Vor jedem größeren Merge:

- `npm run build`.
- Server + Client starten.
- zwei Browser-Tabs.
- Schiff wählen.
- Artillerie, ASuM, Torpedo, Air Defense.
- Inselkollision.
- OOB/Respawn.
- Match-End/Leaderboard.
- 5-10 Minuten Laufzeit auf Memory-/FPS-Auffälligkeiten.

---

## 10. Produkt- und Commercial-Roadmap

### 10.1 Produktkern

Der kommerzielle Kern sollte nicht "mehr Features" sein, sondern eine klar erkennbare, wiederholbare Spielschleife:

1. Schiff wählen.
2. In kurzer Runde taktisch kämpfen.
3. Treffer, Risiko, Sensoren und Position lesen.
4. Score/XP/Unlock erhalten.
5. Neues Schiff/System ausprobieren.
6. Bessere Entscheidungen treffen.

Das Spiel braucht dafür:

- klare Rollen;
- gute Lesbarkeit;
- kurze Time-to-Fun;
- starkes Feedback;
- sinnvolle Progression;
- faire Runden;
- stabile Performance;
- Bot-Qualität für leere Lobbys;
- ein verlässliches Onboarding.

### 10.2 Spielerfantasie

BattleFleet Arena kann sich positionieren als:

- schneller taktischer Top-down-Naval-Shooter;
- Arcade-Realismus statt Hardcore-Simulation;
- Schiffe mit glaubwürdigen Systemen, aber schneller Bedienbarkeit;
- "readable naval combat";
- kurze Online-Gefechte mit Bots als Füllung;
- langfristig Klassen, Loadouts, Karten und Seasons.

### 10.3 Content-Säulen

Sinnvolle Säulen:

- **Ships:** kleine FACs, Destroyer, Cruiser, später Frigate, Corvette, Carrier-lite, Submarine-lite.
- **Systems:** Radar, ESM, ECM, SAM, CIWS, Torpedo, Mines, Smoke, Repair.
- **Maps:** Archipelago, Open Sea, Fjord, Convoy Lane, Storm Front, Harbor.
- **Modes:** Sea Control, Deathmatch, Convoy, Coop Waves, Training.
- **Progression:** Schiffsklassen, Loadout-Slots, kosmetische Varianten, Ränge.

### 10.4 Monetarisierung erst spät

Kommerziell relevant heißt nicht sofort Monetarisierung. Zuerst muss das Spiel Spaß, Retention und Betrieb beweisen. Später mögliche, eher faire Ansätze:

- kosmetische Schiffsskins;
- alternative visuellen Mounts;
- Flaggen/Emblems;
- Battle Pass mit Cosmetics;
- Supporter Pack;
- private/custom rooms;
- keine Pay-to-win-Systemwerte.

---

## 11. Entwicklungsplan für 12 Monate

### Quartal 1: Engine-Fundament und Content-Pipeline

Ziel: Neue Schiffe und Karten sollen strukturell einfach werden.

Monat 1:

- `server-data/` ignorieren und Ops-Hygiene fixen.
- CI für Build/Tests erweitern.
- ContentRegistry für Schiffe einführen.
- Validierung für bestehende Schiffprofile.
- Dokumentierte Anleitung: "Neues Schiff hinzufügen".
- Erste Testabdeckung für Content-Invarianten.

Monat 2:

- Map-Definition `archipelago_alpha`.
- `createGameScene` und Server-Kollision auf Map-Registry vorbereiten.
- Spawnpunkte und Sea-Control-Zonen datengetrieben machen.
- Zweite Testkarte als minimaler Dev-/Test-Map-Prototyp.
- Content-Manifest v1.

Monat 3:

- Protocol-Types für Commands/Events.
- Event-Adapter vereinheitlichen.
- BattleRoom-Tick-Pipeline sichtbar strukturieren.
- Erste GameSimulation-Extraktion: Movement/OOB/LifeState.
- Smoke-Test-Script oder dokumentierte Checkliste.

Meilenstein Ende Q1:

- Man kann ein neues Schiff und eine neue Karte datengetrieben anlegen.
- Der Server nutzt Map-Daten statt festem Default.
- Erste Simulationsteile sind unabhängig testbar.

### Quartal 2: Systeme, Loadouts und spielerische Tiefe

Ziel: Die Engine kann neue Waffen/Systeme tragen.

Monat 4:

- WeaponRegistry für Artillery, ASuM, Torpedo.
- SystemRegistry für Radar, SAM/PDMS/CIWS/ECM.
- Behavior-IDs einführen.
- Server liest erste Werte aus Profilen.
- Tests für Waffenprofile und Systemprofile.

Monat 5:

- Loadout-Modell pro Schiff.
- Class Picker zeigt datengetriebene Schiffswerte.
- HUD zeigt Systeme aus Profilen.
- Bot kann Loadouts/Systeme rudimentär verstehen.
- Neues testbares System implementieren, z. B. Smoke oder Repair.

Monat 6:

- `frameRuntime` in Directors aufteilen.
- PresentationSnapshot einführen.
- AudioDirector und GameFeelDirector extrahieren.
- Asset-/Audio-Manifest v1.
- Performance-Baseline dokumentieren.

Meilenstein Ende Q2:

- Ein neues System kann mit Profil, Simulation, HUD, FX und Audio in einem klaren Pfad entstehen.
- Client Presentation ist weniger an Colyseus-Schema gekoppelt.
- Das Spiel hat mindestens ein neues System oder eine neue spielerische Rolle.

### Quartal 3: Produktisierung, Content und Live-Betrieb

Ziel: Aus dem Engine-Fundament wird ein spielbarer, testbarer Produktkandidat.

Monat 7:

- Zwei bis drei neue Schiffe oder Varianten.
- Eine neue Karte.
- Sea-Control-Modus explizit als Mode-Profil.
- Training/Sandbox-Modus mit Bots.
- Onboarding-/Mission-Briefing verbessern.

Monat 8:

- Persistenz verbessern: SQLite oder sauberere Datei-Migration mit Backups.
- Health endpoint und strukturierte Logs.
- Staging-Deployment.
- AdminConfig klar zwischen Live-Tuning und Design-Content trennen.
- Leaderboard-Kategorien pro Mode vorbereiten.

Monat 9:

- Closed Playtest vorbereiten.
- Telemetrie light: Matches, Dauer, Kills, Abbrüche, Schiffsnutzung, Performance.
- Balance-Pass anhand Daten.
- Bot-Verhalten verbessern.
- Match-End-Screen und Progression klarer machen.

Meilenstein Ende Q3:

- Das Projekt ist bereit für regelmäßige externe Tests.
- Es gibt mehrere Schiffe, mindestens zwei Karten, mindestens einen klaren Mode und bessere Betriebsgrundlagen.

### Quartal 4: Polishing, Retention und kommerzielle Vorbereitung

Ziel: Aus dem Projekt wird ein ernsthafter Public/Steam-Demo-Kandidat oder ein belastbarer Web-Live-Test.

Monat 10:

- Visual identity pass: Wasser, Inseln, Schiffe, FX, HUD.
- Audio pass: Mix, Prioritäten, Feedback.
- Accessibility: Kontrast, Textgrößen, Input.
- Performance p95/p99 optimieren.
- Replay/debug capture prüfen.

Monat 11:

- Progression/Unlocks v1.
- Account-/Identity-Entscheidung: anonym, optional login, Steam später.
- Anti-abuse: Rate limits, basic server validation, admin tooling.
- Matchmaking/Rooms verbessern.
- Public demo scope definieren.

Monat 12:

- Release Candidate für Demo/Playtest.
- Bug bash.
- Balance freeze für Demo.
- Marketing-Material: Trailer/GIFs, Screenshots, Roadmap.
- Store-/Landingpage-Entscheidung.
- Post-launch Plan: Seasons, Content Drops, Feedback Loop.

Meilenstein Ende Q4:

- BattleFleet Arena hat eine tragfähige technische Engine und eine erkennbare Produktform.
- Das Projekt kann entweder als öffentliche Demo, Early Access-Prototyp oder stabiler Web-Playtest weitergehen.

---

## 12. Priorisierte Backlog-Liste

### Sehr hoch

- `server-data/` ignorieren.
- ContentRegistry für Schiffe.
- Validierung bestehender Schiffprofile.
- MapRegistry und `archipelago_alpha`.
- BattleRoom-Tick-Pipeline strukturieren.
- Protocol Events/Commands typisieren.
- CI für Server/Shared/Client.

### Hoch

- GameSimulation-Kern.
- Weapon/System Registry.
- PresentationSnapshot.
- Directors aus `frameRuntime`.
- Asset/Audio Manifest.
- Health endpoint und strukturierte Logs.
- Staging-Setup.

### Mittel

- SQLite/Postgres-Persistenz.
- neues Schiff.
- neue Karte.
- neues System.
- Training/Sandbox.
- Bot-Verbesserung.
- Telemetrie light.

### Später

- Account-System.
- kosmetische Progression.
- Store/Steam.
- Season/Content-Packs.
- Replay-System.
- umfangreiche Anti-Cheat-Maßnahmen.
- horizontale Skalierung.

---

## 13. Risiken

### Risiko: Zu viel Architektur, zu wenig Spiel

Gegenmaßnahme: Jeder Architektur-Schnitt muss ein sichtbares Ergebnis ermöglichen, z. B. neues Schiff, neue Karte, neues System oder bessere Tests.

### Risiko: Content-Daten werden zu flexibel

Gegenmaßnahme: Nicht beliebige Scripting-Freiheit einbauen. Behavior-IDs und validierte Parameter reichen lange aus.

### Risiko: BattleRoom-Refactor bricht Live-Gameplay

Gegenmaßnahme: Tick-Pipeline schrittweise extrahieren, Tests für jede Invariante, keine gleichzeitigen Balance-Änderungen.

### Risiko: Client und Server laufen mit verschiedenen Content-Versionen

Gegenmaßnahme: Content-Version im Manifest und im Server-Handshake prüfen. Client zeigt klare Fehlermeldung bei mismatch.

### Risiko: Produktionsbetrieb wird zu spät ernst genommen

Gegenmaßnahme: kleine Ops-Hygiene sofort, große Persistenz erst bei Bedarf.

### Risiko: Scope creep durch kommerzielle Ideen

Gegenmaßnahme: Erst Core-Loop, Content-Pipeline, Playtests. Monetarisierung erst nach Spaß- und Retention-Signalen.

---

## 14. Sofortige nächste Schritte

Die nächsten 10 konkreten Schritte sollten sein:

1. `server-data/` in `.gitignore` aufnehmen und sicherstellen, dass Runtime-Dateien nicht versehentlich committed werden.
2. CI/Script prüfen: `npm run build`, `npm run test -w shared`, Server-Tests ergänzen.
3. `shared/src/content/` anlegen.
4. ContentRegistry v1 nur für bestehende Schiffprofile bauen.
5. Content-Validierung für `fac`, `destroyer`, `cruiser`.
6. Eine kurze Datei `docs/ADDING-SHIP.md` schreiben.
7. MapRegistry v1 planen und aktuelle Insel-/Mapdaten nach `archipelago_alpha` migrieren.
8. `BattleRoom`-Tick grob in private Methoden oder Module nach Pipeline-Schritten sortieren.
9. Protocol Event/Command-Konstanten einführen.
10. Nach jedem Schritt Build und Smoke-Test durchführen.

---

## 15. Erfolgskriterien

Der Engine-Umbau ist erfolgreich, wenn folgende Aussagen wahr werden:

- Ein neues Schiff braucht überwiegend JSON/Assets und nur bei neuer Mechanik Code.
- Eine neue Karte braucht keine Änderungen in `BattleRoom` oder `createGameScene`.
- Ein neues System hat einen definierten Pfad: Profil, Simulation, Event, Presentation, HUD, FX, Audio, Tests.
- `BattleRoom` ist nicht mehr der Ort, an dem jede Regel lebt.
- Der Client kann State in PresentationSnapshots übersetzen und Renderer/HUD/Audio getrennt aktualisieren.
- Content wird beim Build oder Serverstart validiert.
- Serverbetrieb ist reproduzierbar, beobachtbar und abgesichert.
- Das Spiel bleibt während des Umbaus spielbar.

---

## 16. Schlussgedanke

BattleFleet Arena muss jetzt nicht "größer" werden, sondern klarer. Die vorhandene Basis ist gut genug, um darauf aufzubauen. Der nächste professionelle Schritt ist, Content und Engine voneinander zu trennen, ohne den konkreten Spielkern zu verlieren. Wenn dieser Umbau diszipliniert in kleinen, testbaren Schritten passiert, kann aus dem aktuellen Projekt tatsächlich eine tragfähige Grundlage für ein langfristiges und potenziell kommerziell relevantes Marineshooter-Spiel werden.
