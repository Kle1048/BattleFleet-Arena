# Refactoring — Arbeits- und Abnahmeprotokoll

Stand: 27.09.2026. **Zielarchitektur für Punkte 12–14 umgesetzt und lokal abgenommen.** Mess- und Betriebsgrenzen bleiben ausdrücklich bestehen; kein Deployment oder Commit erfolgt.

Referenzen: [Zielarchitektur](./TARGET-ARCHITECTURE.md), [Umbauplan](./REFACTORING-PLAN.md).
Ausgangscommit: `df7ec1f`. Separate Blender-/F124-Änderungen und der vorhandene Dev-Log-Marker wurden nicht umgeschrieben. Die während der Abnahme hinzugekommenen Gepard/FAC-Inhalte wurden anschließend auf ausdrücklichen Nutzerwunsch separat geprüft und mit neuer Referenz abgesichert (siehe Abschluss).

Dieses Protokoll enthält bewusst historische Zwischenstände. Aussagen wie „noch offen“ in datierten Teilabschnitten gelten für deren damaligen Prüfstand. Abschnitt 3 und die abschließende Abnahme führen den Gesamtstatus.

## 1. Umgesetzt und lokal geprüft

### Verhaltenssicherung und externe Zeit/Zufall (12.0)

- `BattleRoom.characterization.test.ts` sichert unmittelbares Primär-/Sekundärfeuer vor dem Tick, Cooldowns, deaktivierten Minen-Input, Leave-Cleanup, Phasenreihenfolge einschließlich verschachtelter Gebietsabfrage, Kill-Zählung bei simultanen Einschlägen, Respawn/Schutz/Wrackablauf, Level/Klassenwechsel, Reload-Ereignis, Match-Abschluss und Admin-Neustart.
- Weitere Szenarien sichern OOB-Frist, Insel-Kontaktflanken, Ram-/Wrackschaden vor Korrektur, SAM-Flugzeit und Cooldown-Reservierung, Softkill und Reacquisition-Sperre. Die vorhandenen Reset-/Index-/HUD-/Asset-Tests bleiben erhalten.
- `SimulationEnvironment` isoliert Gameplay-Zeit und RNG. Der Room verwendet Produktionsdefaults aus `application/systemEnvironment`; Fixtures verwenden eigene Quellen statt globalem Monkey-Patching.
- Bot-Diagnoseuhren werden explizit vom Host übergeben. Produktions-Wallclock und monotone Log-Zeit bleiben getrennt; Entscheidungs-Cadence verwendet weiterhin das übergebene `now`.
- Ein vollständigerer 60-Sekunden-Kampf mit elf bewegten Human-Inputs und fünf echten Bot-Brains ergänzt den alten synthetischen Tick-Benchmark. Er hasht replizierte Checkpoints und alle Ereignisse inklusive Payload, Empfänger und Zeitpunkt. Referenz: `scripts/fixtures/combat-baseline.json`. Dieser Hash ist keine Erlaubnis, Ergebnisse nach einem Umbau automatisch neu zu erzeugen.

Noch nicht abgedeckt: vollständiger Browser-/Zwei-Client-Lifecycle, visuelle Referenzszenen und GPU-Messung. Diese Gates bleiben vor bzw. nach dem Client-Umbau erforderlich.

### Paketgrenzen (12.1)

- `@battlefleet/shared/rules` ist transportfrei; `/protocol` enthält Command-/Event-Verträge; `/protocol/schema` enthält Colyseus-Schema. Der Root-Einstieg bleibt kompatibel.
- ESM-Code-Splitting erhält die Identität gemeinsam exportierter Schema-Klassen. Source-Auflösung und Source-Identität werden automatisch getestet; Produktionsidentität wurde zusätzlich nach dem Build geprüft.
- `shared/src/architecture.test.ts` verfolgt direkte und transitive Imports, Re-Exports und statische dynamische Imports. Er verbietet Plattform-/Schemaimporte in portablen Graphen und Runtime-Importzyklen. Type-Referenzen werden hinsichtlich Layer-Grenzen geprüft, aber nicht als ausführbare Zyklen behandelt.
- Ein tatsächlich vorhandener Kreis Layout → Waffenreichweite → Luftabwehr → Layout wurde durch `airDefenseRanges.ts` aufgelöst; bestehende Exports und Werte bleiben erhalten.
- Broadcast-Payloads sind gegen `GameEventMap` typgeprüft. Die endgültigen Command-/Event-Transportadapter und alle gezielten Send-Pfade folgen mit der Simulationsextraktion; heute existiert bewusst noch Room-Kopplung.

### Teilnehmer und Bots (12.2)

- `ParticipantRegistry` besitzt beide Mitgliedschaftsindizes und ändert sie gemeinsam. Read-Views sind stabile Properties, keine Getter im Hotpath. Duplicate/Remove/Rejoin/Identität/Reihenfolge/Dispose werden getestet.
- `ParticipantState` enthält serverinterne Bewegung/Input-/Deadline-/Magazindaten ohne Schema-Import. Seit 12.4 sind auch die Spieler Plain-Data-`PlayerValues`; die Registry besitzt außerdem die stabile geordnete Teilnehmersicht.
- `BotSystem` besitzt Bot-IDs, Brains, Spawn-/Remove-Cadence und Input-Dispatch. Seine Ports sind auf Teilnehmeroperationen, Input und Uhren begrenzt; kein Room oder Universal-Context wird übergeben.
- Bot-Populationsregeln sind vom Env-Parser getrennt. Neue Systemtests sichern kein Spawn ohne Menschen, Cap, 450-/1600-ms-Cadence, IDs/Namen, echte Brain-Kommandos und Dispose.
- Join-Regeln und Bot-Perception-Projektion liegen seit 12.4 in der Simulation; Schema-Mitgliedschaft besitzt allein der Publisher. Client- und interne Persistenzschlüssel bleiben im Room-Adapter.

### Match, Leben und Fortschritt (12.3a)

- `MatchSystem` besitzt Deadline und einmaligen Übergang zum Match-Ende. Initiale Restzeit, Rundung, erzwungener Neustart und Reset des Abschluss-Latches sind headless getestet. Match-ID und asynchrone Ergebnisübergabe folgen mit Punkt 13; Speicherung und Ergebnisprojektion sind noch im Room.
- `ProgressionSystem` besitzt passive XP-Cadence, Kill-XP und schrittweise Level-/Klassenwechsel einschließlich HP-Anpassung und Magazininitialisierung. Live-Konfiguration kommt über kleine Getter-Ports und wird wie bisher einmal pro Reward-Pass gelesen.
- `LifeSystem` besitzt Schadensanwendung, genau einen Todesübergang, Kill-Zuordnung, Levelverlust, Regeneration, Schutzfrist, Respawn, Wrack-Erzeugung und Spieler-Reset einer neuen Runde. Artillerie, ASuM, Mine und Kollision verwenden dieselbe Schadensoperation; OOB verwendet den expliziten schutzumgehenden Zerstörungspfad.
- Bestehende Unterschiede sind dokumentiert und getestet: Der deaktivierte Minenpfad umgeht Spawn-Schutz; die zerstörte Klasse bleibt bis zur Wrack-Erzeugung erhalten; Respawn übernimmt den bisherigen Ruderinput und headingbezogenes Aim, Round Reset löscht den Input und setzt weltbezogenes Aim. Kein versteckter Balance-Fix.
- `magazine.ts` ersetzt die mehrfach benötigte Initialisierung/Leerung/Verbrauchslogik. Transportfreie `PlayerValues`/`WreckValues` und weitere skalare Protokolltypen tragen seit 12.4 auch den produktiven kanonischen Zustand.
- Vier neue headless Testdateien (einschließlich Movement unten) verwenden Plain-Data-Fixtures. Alte Room-Charakterisierungen bleiben zusätzlich bestehen; sie wurden nicht durch Tests einer bloßen Nachimplementierung ersetzt.

### Bewegung und Kollision (erster Teil 12.3b)

- `MovementSystem` besitzt Movement-Config-Cache, Kontaktgedächtnis und wiederverwendete Kollisionskandidaten. Phasen sind explizit: Bewegung/Terrain → Kandidaten → Ram-Schaden → Schiffskontakte → Positionskorrektur.
- Schaden wird synchron an LifeSystem übergeben; Kontaktzustellung ist ein schmaler Port. Wracks werden als geliehene Liste gelesen, ohne Weltkopie pro Tick.
- Tests sichern Kontakt vor Inselschaden, Ram-Schaden vor Trennung, Spawn-Schutz, deaktivierten Match-Schaden, laufende Kontakte, Remove/Dispose und Cache-Invalidierung. Die bestehende Schiffspaar-Flanke beim Round Reset bleibt absichtlich erhalten: bisherige Paare werden erst im nächsten Kollisionspass ersetzt.
- Waffen/Geschosse/Abwehr wurden im nachfolgenden Änderungssatz getrennt; OOB-Auswertung und abgeleitete HUD-/Pose-Werte gehören seit 12.4 zum headless Ablauf statt zum Room.

### Kampfmodule und kanonischer Simulationszustand (12.3b / 12.4)

- `ArtillerySystem` besitzt Salven, IDs, Cooldowns und verzögerte Einschläge. `MissileSystem` besitzt Raketen, Magazine, Bewegung und Entfernung; `MineSystem` bewahrt den deaktivierten Minenpfad. `AirDefenseSystem` besitzt Abwehrentscheidungen, Fristen und Softkill-Gedächtnis, entfernt aber selbst keine Rakete.
- Alle Broadcasts und gezielten Spielereignisse verwenden `GameEventSink`. Der Room ordnet Session-IDs seinen Verbindungen zu; Commands können weder Empfänger, HP noch Scores vorgeben. Eine kleine zusätzliche Korrektur ist explizit getestet: Leave bereinigt nun auch Abwehrvormerkungen der entfernten eigenen Raketen, statt diese zurückzulassen.
- `GameSimulation` ist der produktive headless Einstieg für Start, Join, Remove, Input, Step, Reset und Dispose. `SimulationState` enthält nur eigene Datenobjekte und geordnete Listen. `createParticipant` initialisiert die Domain-Daten; es gibt keine Schema-Konstruktion und keine Room-, Colyseus-, I/O- oder Env-Abhängigkeit im Kern.
- `SchemaPublisher` ist der einzige Schreiber replizierter Spielwerte. Er kopiert skalare Änderungen einseitig, hält vorhandene Schemaobjekte stabil und ersetzt sie bei Remove/Rejoin. Pro Publikation entstehen keine Welt-Snapshots oder Kopien sämtlicher Listen. Der kurzlebige `legacySchemaSequence`-Adapter ist bereits wieder entfernt.
- Publikation erfolgt nach synchronem Join, Input, Step, Debug-Klassenwechsel, Reset und Leave. Feuer bleibt zwischen Ticks unmittelbar; Events behalten ihre bisherige Reihenfolge und Empfänger. Die bisherigen Golden-Erwartungen wurden nicht geändert.
- Neue Tests prüfen jede skalare Projektion, Einseitigkeit, Objektidentität, Voll- **und Delta-Kodierung**, Listenentfernung, Reset und Rejoin. Adaptertests führen die echten registrierten Input-/Debug-/PlayAgain-Handler aus; Produktions-Debugschutz und die Abwehr gefälschter HP-/Score-/Session-Felder sind gesichert.
- Match-Ergebnisse werden als abgelöste Werte an den Host übergeben und überleben Reset ohne Mutation. Ihre Speicherung bleibt bis Punkt 13 synchron; Match-ID, Queue und ehrliche Commit-Semantik sind noch nicht umgesetzt.
- Die bestehenden Charakterisierungen greifen für Fixture-Manipulationen nun auf den kanonischen Zustand zu. Ergänzend testen Adapter-/Publisher-Tests die tatsächliche replizierte Ausgabe; der Kampfbenchmark hasht weiterhin `room.state.toJSON()`, nicht nur den Domain-State.

### Input- und Content-Grenzen

- `adapters/inputCommand.ts` normalisiert ausschließlich bekannte Spielabsichten. Endliche primitive Steuerwerte bleiben kompatibel; ungültige optionale Zahlen überschreiben das letzte Aim nicht. Objekt-Konvertierungen werden nicht ausgeführt, Infinity wird nicht mehr als Vollgas interpretiert. Fachliche Grenzen bleiben in der Simulation. Decoder- und echte Room-Handler-Tests prüfen diese bewusst begrenzte Härtung.
- `shared/content/shipCatalog.ts` lädt die vorhandenen drei Profile über `loadShipProfile`. IDs, Zahlen, Sockets, Sektoren, Mount-/Loadout-Referenzen und Magazine werden einmalig geprüft. Der Katalog besitzt tief eingefrorene Kopien; lokale Tuning-Patches verändern ihn nicht. Kein Validieren/Klonen pro Lookup oder Tick. Bestehende öffentliche Profilfunktionen und Werte bleiben kompatibel.
- Vollständige Verifikation dieser Zwischenstufe: 74 Testdateien (17 Client / 19 Server / 38 Shared), Typechecks und Build bestanden. Anschließende Client-Verifikation siehe unten.

### Client-Read-Model (erster Teil 12.5)

- `game/adapters/battleStateAdapter.ts` ist der einzige produktive Leser von `room.state`. Er projiziert einmal pro empfangenem State in eigene skalare Objekte, stabile geordnete Arrays und ID-Indizes. Kein Schemaobjekt und keine Schema-Collection gelangt mehr in Frame-, Schiffs-, Wrack- oder Event-Darstellung; keine Vollkopien pro Renderframe.
- `game/presentation/BattleReadModel.ts` beschreibt schreibgeschützte geliehene Sichten und explizit abmeldbare Zustands-/Mitgliedschaftsbenachrichtigungen. Der Adapter besitzt das Colyseus-Abonnement, `visualRuntime` sein eigenes Read-Model-Abonnement. Beide Dispose-Pfade sind idempotent und verhindern Wiederbelebung durch späte State-Callbacks.
- Spieler-/Raketenabfragen im Bootstrap verwenden die ID-Indizes. Die unbenutzten bisherigen `stateAdapter.ts` und `networkStateAdapter.ts` wurden entfernt. Gemeinsame, explizite skalare Feldlisten in `shared/protocol/valueFields.ts` sichern beide Projektionsrichtungen; Vollständigkeit wird beim Typecheck sowie durch Voll-/Delta-Tests geprüft.
- Entfernen und erneutes Hinzufügen derselben ID erzeugt neue Identität; ein vollständiger Snapshot mit neuer Collection ist dagegen kein neuer Join der bereits vorhandenen IDs. Reset erhält bestehende Objekte. Beide Fälle sind getrennt getestet.
- Die Interpolation kopiert weiterhin ihre eigenen historischen Posen. Unveränderte Posen/fremde Patches verschieben das Zeitfenster nicht. Neue Integrationstests sichern Join-Ankündigungen, Entfernen, Rejoin, Reset, lerp und Dispose mit dem tatsächlichen ShipRenderer.
- Zusätzliche Charakterisierung der bisherigen Event-Zuordnung vor deren Extraktion: lokale Feuer-Audios, einmalige Treffer-/Kontakt-/Reload-/Softkill-Ausgaben, Heartbeat und Leave. Die unterschiedliche Artillerie-/ASuM-Culling-Semantik bleibt bewusst erhalten; Todes-FX werden weiterhin vom State-Übergang gesteuert.

Die Event-Transport-Trennung ist inzwischen umgesetzt (nächster Abschnitt). Die vollständige Browser-Abnahme von 12.5 ist noch offen. Danach folgen Frame-Aufteilung und vollständige App-/Session-Lebensdauer (12.6/12.7). Der Cleanup-Nachweis einzelner Abonnements ist kein Beweis für alle Listener/Timer/Assets der Anwendung.

### Client-Event-Adapter und Feedback-Presenter (weiterer Teil 12.5)

- `game/adapters/roomEventAdapter.ts` besitzt einen Wildcard-Nachrichtenpfad, Ping/Heartbeat und Verbindungs-Callbacks. `matchEventDecoder.ts` normalisiert ausschließlich bekannte Präsentationsereignisse in eigene skalare Payloads. Transport kennt weder HUD noch Audio-/Three.js-Implementierungen. Der Importgrenzen-Test sichert auch diese Richtung.
- `game/presentation/matchEventPresenter.ts` entscheidet synchron über Culling, lokale/entfernte Effekte und Abwehrursprünge. `effects/airDefenseOutput.ts` setzt Renderaufträge um; Weltkoordinaten bleiben bis zu dieser Grenze unverändert. Match-Ende/Neustart und Todesübergänge bleiben statebasiert; keine zweite Todesexplosion durch Trefferereignisse.
- Die bisherigen Event-Charakterisierungen laufen jetzt durch den echten Colyseus-Nachrichtenverteiler, Decoder und Presenter. Artillerie-/ASuM-Culling-Unterschiede, lokale Feuer-Audios, Abwehr-Comms→Audio→FX, PD-Mündung, Tracking, Heartbeat und Leave sind gesichert. Die bisherigen `networkRuntime.ts` und `runtime/matchEventAdapter.ts` sind entfernt.
- `combatFeedbackPresenter.ts` besitzt Trefferwarnungs-Cooldowns, Chaff-/Abwehr-Audio, Kollisionsrückmeldung und die lokale/entfernte Todesrückmeldung. Diese Entscheidungen stehen nicht mehr in `main.ts`. Pure Tests sichern Zeit- und Distanzgrenzen, Reihenfolge und wiederholtes Dispose. Chaff-Geometrie bleibt an der Startpose; verzögertes Audio liest die aktuelle lokale Position ausdrücklich neu. Bei verschwundenem Spieler wird die letzte **eigene** abgetastete Position verwendet; nach Dispose bleibt Audio stumm. Keine geliehene Read-Model-Referenz wird vom Puff-Callback gelesen.
- Begrenzte Decoder-Härtung ist explizit getestet: NaN/Infinity und Objekt-Konvertierungshooks werden abgewiesen. Historische primitive Fallbacks (insbesondere numerische Abwehrfelder/Pong und fehlende Impact-Kinds) bleiben erhalten. Keine Änderung an produktiven Nachrichtennamen oder serverseitigen Kampfregeln.
- Ein zunächst fehlschlagender Test mit einem echten Colyseus-Room wies einen Cleanup-Fehler nach: `remove()` auf einem schon beim Leave entfernten State-Listener entfernt einen fremden Listener. `roomSignalScope.ts` löst dies für beide Adapter gemeinsam: Callbacks sofort deaktivieren, Abmeldung nach laufendem Dispatch, keine Abmeldung aus bereits geleerten Leave-Signalen. Tests sichern außerdem Dispose innerhalb eines State-/Error-/Leave-Callbacks, unveränderte Geschwister-Callbacks, Reattach und späte Zustände. Keine privaten Colyseus-Felder im produktiven Cleanup.
- Noch offen: vollständige App-/Session-Entsorgung einschließlich separater Abwehr-rAFs/Timer sowie die erneute visuelle Prüfung des letzten Feedback-/Cleanup-Standes. Die folgende Browserstörung wurde **vor** dessen produktiver Verdrahtung beobachtet; eine Ursache ist damit nicht bewiesen.

### Echter Zwei-Client-Smoke (27.09.2026, lokaler Entwicklungsstand)

- Isolierter Server auf `127.0.0.1:2577`, Client auf `127.0.0.1:5174`, separates temporäres Datenverzeichnis, dreiminütige Runden; keine Änderung an vorhandenen Serverdaten. Zwei echte In-App-Browser-Tabs, bestehender Client-Bot für längere Gefechte.
- Vor dem Read-Model-Umbau: beide Clients im selben Room `8zeSUCpvr`, Bewegung, Artillerie/ASuM, Abwehr, gegenseitige Zerstörung, Respawn, Aufstieg und Rundenende mit Scoreboard sichtbar.
- Nach dem Umbau: beide Clients im Room `Er163PqYq`, ein Client mit lazy Debug-Panels, einer ohne. Erneut laufender Kampf, Respawn-Countdown und anschließender Wiedereinstieg, Klassenaufstieg bis Kreuzer und Rundenende sichtbar. Ein zusätzlicher kurzlebiger WebSocket-Testclient löste den bestehenden `playAgain`-Reset aus; anschließend zeigte der Browser wieder FAC, zurückgesetzte Werte und laufenden Rundentimer. Dies war **kein Test des Admin-HTTP-Neustarts**.
- Alpha verließ per Seitennavigation die Verbindung und trat erneut derselben laufenden Runde bei. Bravo zeigte genau eine Ankündigung für `Model Alpha Rejoin`; Darstellung und HUD liefen weiter. Diese Prüfung nutzt den bestehenden Reload-Pfad, nicht den noch zu bauenden Session-Wechsel innerhalb derselben App-Instanz.
- Keine aufgezeichneten Browser-Errors oder Server-Ausnahmen. Bei geladenen GLBs erschienen drei Skalierungswarnungen zu `SOCKET_ciws_fwd`, `SOCKET_main_fwd`, `SOCKET_sam_aft` (Skalierung 1.417); separate Asset-Arbeit wurde nicht verändert. Test-Tabs und beide gestarteten Testprozesse anschließend geschlossen/beendet.
- Das ist ein funktionaler Smoke, **keine** reproduzierbare GPU-/Framezeit-/Heap- oder vollständige visuelle Abnahme. Weitere verbindliche Gates bleiben offen.

### Event-Presenter-Smoke und WebGL-Störung (27.09.2026)

- Neue isolierte lokale Instanz auf denselben Testports, frisches temporäres Datenverzeichnis, keine vorhandenen Serverdaten verändert. `Event Alpha` (Debug an) und `Event Bravo` (Debug aus) traten dem Room `8pxlP9D-9` bei. Bewegung/Gefecht, PDMS-/SAM-/CIWS-Meldungen, Softkill, Tod und Respawn waren sichtbar; am Rundenende zeigten beide Scoreboards Alpha mit vier und Bravo mit drei Kills.
- Ein kurzlebiger echter WebSocket-Testclient prüfte `ended / 0`, sendete `playAgain` und wartete auf den tatsächlichen State `running / 180`. Das HUD im Browser zeigte anschließend wieder FAC und einen laufenden Timer. Der erste Testclient-Versuch hatte einen Fehler im Testskript (Signal-Registrierung fälschlich als Unsubscribe verwendet); der korrigierte Versuch bestand. Kein Admin-HTTP-Neustarttest.
- **Keine bestandene visuelle Abnahme:** Beide Tabs meldeten um 00:54:32 MESZ nahezu gleichzeitig `WebGLRenderer: Context Lost`, danach kurz `Context Restored`, zahlreiche Shader-Validierungsfehler und einen weiteren Kontextverlust. HUD/Netzwerk liefen weiter, die Szene schließlich nicht. Das frühe fehlerfreie Kurzfenster belegt keinen fehlerfreien Gesamtlauf.
- Beim beabsichtigten Leave/Rejoin durch Seitennavigation konnte kein neuer WebGL-Kontext erstellt werden (`GL_VENDOR/GL_RENDERER = Disabled`, `BindToCurrentSequence failed`). Nach Schließen beider Testtabs scheiterte auch ein frischer Tab identisch. Der aktuelle Rejoin-/GPU-Nachweis fehlt daher. Ursache (Ressourcenlast, GPU-/Browserzustand oder Anwendung) noch nicht eingegrenzt; keine Browser-/GPU-Einstellungen geändert und keine fremden Prozesse beendet.
- Alle drei eigenen Testtabs und beide gestarteten Serverprozesse wurden anschließend geschlossen/beendet. Die Wiedereintrittsprüfung des früheren Read-Model-Smokes bleibt historische Evidenz, ersetzt aber nicht den noch ausstehenden Test des aktuellen Standes. Vor 12.6 sind WebGL-Wiederherstellung und eine reproduzierbare Client-Messszene erforderlich; die Live-Bot-Szene ist keine geeignete Performance-Baseline.

### Client-Messwerkzeug vor 12.6 (27.09.2026)

- Separater Diagnose-Einstieg `client/benchmark.html`, `src/benchmark` und eigener Vite-Build nach `dist-benchmark`; kein zusätzlicher normaler Spieleinstieg und kein Netzwerk-/Serverbedarf. Anleitung und exakter Messumfang: [CLIENT-BENCHMARK.md](./CLIENT-BENCHMARK.md).
- Feste 20-Hz-Präsentationsdaten, 60-Hz-Wiedergabe, Kamera/Viewport/Seed, echte Frame-/Schiffs-/Cockpit-/FX-/Wake-Module und drei Warm-up-/Messwiederholungen. Endliche Samples, p50/p95/lange Frames, CPU-/Draw-/Ressourcenreihen; GPU-Zeit und unkontrollierter Cold-Cache ausdrücklich nicht als gemessen ausgegeben.
- Zwei Headless-Wiederholungen mit echten Frame-/FX-Modulen sind identisch; feste Checkpoints sichern Partikelzahlen/Ressourcen und 1980 Inputs, 700 HUD-Updates, 16 Todesübergänge. FX-Rezepte erhalten eine optionale eigene RNG-/Uhr-Quelle, weil Three.js-UUID-Erzeugung sonst den globalen Seed unterschiedlich verbraucht. Produktionsdefaults und Effektrezepte/Poolregeln bleiben unverändert.
- `createGameScene` akzeptiert optionale explizite Umgebung und meldet zusätzlich `assetsReady`; der normale Einstieg wartet weiterhin nicht auf Assets. Hängende/abgebrochene Assets und unverändertes frühes Szenen-Startverhalten sind getestet.
- **Browser-Gate weiter offen:** Die separat gebaute Diagnose konnte im In-App-Browser nicht einmal einen leeren WebGL2-Kontext erstellen. Kein Match, Renderer, Asset oder FX war dabei gestartet. Damit ist der aktuelle WebGL-Zustand unabhängig von der komplexen Spielszene fehlerhaft; die ursprüngliche Ursache des Kontextverlusts bleibt unbewiesen. Eigener Testtab und Preview-Prozess beendet. Keine Browser-/GPU-Einstellungen oder fremden Prozesse verändert.
- Dieses Werkzeug ist Vorbereitung, keine Performance-Abnahme. Der Client-Frame-Umbau wurde noch nicht begonnen; vollständige Browser-Baseline, Cold-/Warm-/GPU-/Visualnachweis sowie Abwehr-rAF-Integration bleiben nötig.
- Verifikation: **84 Testdateien** (27 Client, 19 Server, 38 Shared), alle Workspace-Typechecks, normaler Produktionsbuild und separater Diagnosebuild bestanden. Normaler Build ohne `benchmark.html` und ohne Replay-/WebGL-Probe-Kennungen geprüft; `main` 193.06 kB, Renderer-Chunk 678.11 kB. Bekannte Größenwarnung bleibt. Security-inspector: keine neuen kritischen oder belastbaren hohen Befunde; Diagnose ohne neue Server-/Auth-/Secret-Grenze, Darstellung der Berichte per `textContent`, keine dauerhafte Speicherung von Nutzereinstellungen. Die über bestehende Renderer gelesene Hitbox-Präferenz ist im Replay explizit ausgeblendet, Profil-Patches werden seitenlokal umgangen.

## 2. Messprotokoll

Verifikation nach Teilnehmer-/Bot-Auslagerung: 64 Testdateien bestanden (17 Client, 10 Server, 37 Shared), alle Workspace-Typechecks und vollständiger Produktionsbuild bestanden. Die Schema-Identität wurde auch im gebauten Node-Paket erneut geprüft. `git diff --check` ohne Fehler. Die bekannte Renderer-Chunk-Warnung (ca. 674 kB) besteht weiter. Browser-Smoke und Deployment wurden in dieser Stufe nicht ausgeführt.

Alle Angaben lokale Windows-/Node-22-Messungen, keine Produktionskapazitätszusage. Nicht gleichzeitig mit Tests/Builds benchmarken; weitere Desktop-Prozesse können trotzdem stören.

| Kampfszenario (1000 Mess-Ticks nach 200 Warm-up-Ticks) | Median, drei Läufe (ms) | p95, drei Läufe (ms) |
| --- | --- | --- |
| Vor Teilnehmer-/Bot-Extraktion | 3.391 / 3.392 / 3.403 | 5.060 / 5.125 / 5.417 |
| Registry mit Getter-Zugriffen, verworfene Zwischenfassung | 4.113 / 3.983 / 3.949 | 6.899 / 6.296 / 9.890 |
| Registry mit stabilen Read-Views | 3.440 / 3.439 / 3.457 | 5.608 / 5.685 / 5.624 |
| Zusätzlich extrahiertes BotSystem | 3.425 / 3.498 / 3.478 | 5.581 / 6.164 / 5.476 |

Der Zustand-/Event-Hash ist in allen Läufen identisch: `e71a7ed372952020e2036ef731f8de84827e2336931ed3da71b28377669c4afd`.
Die letzte Reihe zeigt einen p95-Ausreißer über der 10-%-Leitplanke; keine wiederholte Überschreitung außerhalb der bisherigen Streuung. Das ist kein Performancegewinn. Bei weiteren Auslagerungen erneut vergleichen, insbesondere Publisher-/State-Kopierkosten.

Die anfänglichen drei Läufe des alten synthetischen Benchmarks waren stark verrauscht (64 Teilnehmer: p95 24.49 / 22.20 / 46.25 ms). Nicht als saubere Kapazitätsbaseline interpretieren. Der neue Kampfbench ergänzt ihn, ersetzt aber weder echte Netzwerk-/Encoding-Last noch Browser-/GPU-Profiling.

Erneute lokale Messreihe am 26.09.2026, unmittelbar um die Life-/Movement-Extraktionen, gleicher Seed und gleicher unveränderter Trace:

| Änderungssatz | Median, drei Läufe (ms) | p95, drei Läufe (ms) |
| --- | --- | --- |
| Match/Progression vorhanden, vor Life-Auslagerung | 1.866 / 2.180 / 2.063 | 2.527 / 3.276 / 3.246 |
| Zusätzlich LifeSystem | 1.981 / 1.915 / 1.843 | 3.126 / 2.822 / 2.828 |
| Zusätzlich MovementSystem | 1.819 / 1.731 / 1.754 | 2.560 / 2.390 / 2.364 |

Die niedrigeren absoluten Zeiten gegenüber der früheren Messreihe sind kein Nachweis eines Refactoring-Speedups: Desktop-/Lastbedingungen unterscheiden sich offensichtlich. Die unmittelbar benachbarten Vorher-/Nachher-Läufe zeigen keine wiederholte Verschlechterung über 10 % außerhalb der Streuung. Alle neun Läufe stimmen mit dem oben angegebenen Golden-Hash und sämtlichen Event-Zählern überein.

Endstand dieser Stufe: **68 Testdateien bestanden** (17 Client, 14 Server, 37 Shared), alle Workspace-Typechecks und Produktionsbuild bestanden; Importgrenzen-Test ohne Ausnahmen, `git diff --check` ohne Fehler. Renderer-Chunk-Warnung unverändert. Security-inspector: keine neuen kritischen oder belastbaren hohen Befunde in den geänderten Grenzen; Auth-/Origin-Regressionen bestanden, neue Kernmodule ohne I/O/Env/Secrets. Keine Aussage über Live-Deployment-Sicherheit. Browser-/GPU-/Zwei-Client-Abnahme weiter offen.

Fortsetzung mit Kampfmodulen und SimulationState, unmittelbar benachbarte lokale Läufe:

| Änderungssatz | Median, drei Läufe (ms) | p95, drei Läufe (ms) |
| --- | --- | --- |
| Vor Kampfauslagerung, MovementSystem vorhanden | 1.674 / 1.702 / 1.729 | 2.343 / 2.362 / 2.337 |
| Kampfmodule, noch Schema als Zustandsbasis | 1.642 / 1.658 / 1.679 | 2.362 / 2.281 / 2.322 |
| Eigener SimulationState + Publisher | 1.068 / 1.074 / 1.079 | 1.375 / 1.442 / 1.429 |

Alle Läufe behalten den unveränderten Golden-Hash und sämtliche Ereigniszähler. Die gemessene Step-Zeit **einschließlich nachfolgendem Publisher** ist niedriger. Human-Input und dessen Publikation erfolgen außerhalb dieses Zeitfensters; die Tabelle ist deshalb kein Nachweis für die gesamte Serverlast oder Netzwerk-/Encoding-Kosten.

Der aktualisierte synthetische Benchmark verwendet jetzt ebenfalls injizierte Uhr/RNG und Plain-Data-Raketen. Drei Läufe: 16 Teilnehmer Median 0.836 / 0.797 / 0.804 ms, p95 1.572 / 1.492 / 1.548 ms; 64 Teilnehmer Median 7.304 / 6.683 / 6.682 ms, p95 15.185 / 7.617 / 7.928 ms. Die sichtbare p95-Streuung bleibt ein Grund, keine Produktionskapazität daraus abzuleiten.

Endstand der damaligen Server-Stufe: **72 Testdateien bestanden** (17 Client, 18 Server, 37 Shared), alle Typechecks und Produktionsbuild grün. Zusätzliche Delta-/PlayAgain-Assertions danach gezielt erneut bestanden. Importgrenzen ohne Legacy-Ausnahmen; `git diff --check` sauber. Der Security-inspector-Check der neuen Grenze findet keine neuen kritischen oder belastbaren hohen Befunde; Auth/Origin/Produktions-Debugschutz bleiben getestet. Renderer-Chunk-Warnung und damals noch fehlende Browser-/GPU-Abnahme unverändert.

Nach Input-/Content-Grenzen und Client-Read-Model: **77 Testdateien bestanden** (20 Client, 19 Server, 38 Shared), alle Workspace-Typechecks und der vollständige Produktionsbuild bestanden. `main` 191.13 kB, Renderer-Chunk 678.00 kB (bekannte >500-kB-Warnung). Security-inspector: keine neuen kritischen oder belastbaren hohen Befunde in den geprüften Projektions-/Input-/Content-Grenzen; Auth-, Origin- und Produktions-Debug-Regressionen bestanden. Kein Deployment-Nachweis.

Erneute Kampfbench-Reihe nach Beenden der Testbrowser/-prozesse: Median 1.116 / 1.149 / 1.134 ms, p95 1.559 / 1.550 / 1.489 ms. Wegen der höheren p95 gegenüber der älteren Reihe wurde die einzige Änderung im Publisher (gemeinsame statt lokale Feldlisten) direkt gegengeprüft. Ein erster blockweiser A/B-Vergleich war verrauscht (lokal p95 1.488 / 1.443 / 1.458, gemeinsam 1.574 / 1.781 / 1.850 ms). Anschließend **abwechselnde** Läufe unter gleichen Bedingungen:

| Publisher-Feldlisten | Median, drei Läufe (ms) | p95, drei Läufe (ms) |
| --- | --- | --- |
| Lokal, vorherige Variante | 1.103 / 1.099 / 1.140 | 1.464 / 1.431 / 1.663 |
| Gemeinsamer Protokollvertrag, aktuelle Variante | 1.080 / 1.094 / 1.110 | 1.492 / 1.464 / 1.557 |

Dieser unmittelbare Vergleich zeigt keine wiederholte Verschlechterung über 10 % außerhalb der Streuung durch die Feldlisten-Auslagerung. Er erklärt nicht jede Desktop-Lastschwankung und belegt keinen neuen Speedup. Alle 15 Läufe haben denselben unveränderten Golden-Hash und sämtliche bisherigen Ereigniszähler. Die aktuelle Variante wurde nach dem Vergleich wiederhergestellt. Diese Messung enthält **keinen** Client-Read-Model-/GPU-/Netzwerk-Overhead; dessen reproduzierbare Frame-/Ressourcenmessung bleibt Teil der Client-Gates.

Nach Event-/Feedback-Presenter und gemeinsamer sicherer Signal-Abmeldung: **82 Testdateien bestanden** (25 Client, 19 Server, 38 Shared), alle Workspace-Typechecks und vollständiger Produktionsbuild bestanden. `main` 193.02 kB (gzip 65.08), Renderer-Chunk unverändert 678.00 kB mit bekannter Größenwarnung; Debug bleibt ein separater lazy Chunk. Security-inspector: keine neuen kritischen oder belastbaren hohen Befunde in den geprüften Decoder-/Transport-/Presenter-Pfaden; keine neuen Secret-, DOM-HTML-, Filesystem- oder HTTP-Pfade dort. Auth-/Origin-/Debugschutz-Regressionen erneut grün. Das ist weder ein Deployment-Nachweis noch eine erfolgreiche visuelle/GPU-Abnahme; WebGL-Störung siehe oben.

## 3. Gesamtstatus — lokal abgenommen

| Pflichtbereich | Abschlussnachweis |
| --- | --- |
| 12.1–12.4 Shared/Server/Content | Portable Paketgrenzen, kanonischer Headless-State, kleine Systeme, stabiler Publisher; Voll-/Delta-/Identitäts-Tests, unveränderter Refactoring-Trace mit altem Content |
| 12.5 Read Model/Presenter | Ein State-Adapter, eigene Read-Model-Daten, transportfreie Presenter; Signal-Lifecycle und Event-Reihenfolge getestet |
| 12.6 Frame-Phasen | Charakterisierung unverändert; drei direkte Alt-/Neu-Läufe ohne wiederholte Regression außerhalb der Streuung |
| 12.7 App/Session | Composition Root, LIFO-Lifetimes und ein Scheduler; 21 echte Sessions plus Desktop-/Mobile-Headless-Cleanup |
| 13 Persistenz | Async FIFO, Revisionen, bestätigte Snapshots, persistente Idempotenz, begrenzte Retries/Queues; Fehler-, Migration-, Restore-, Shutdown-Tests und Live-Neustart |
| 14 Partikel | Rezepte/Pool/Backend getrennt; 15.000 Oracle-Operationen, unveränderter FX-Hash, CPU-Nutzen, Mehrwinkel-Visuals und stabile Dispose-Ressourcen |
| Security | Admin-/Origin-/Produktions-Debugschutz, öffentliche DTOs und neue Speicherpfade geprüft; keine neuen kritischen oder belastbaren hohen Befunde |
| Gesamtverifikation | 106 Testdateien, alle Typechecks, Produktions-/Diagnosebuild; finaler Zwei-Client-Smoke und neue freigegebene Content-Referenz |
| Betriebsgrenzen | Keine Deployment-Freigabe, kein Mehrprozess-JSON, keine Outbox, keine mobile Geräte-/Power-Loss-/Framerate-Garantie |

Instancing und Datenbankwechsel bleiben bedarfsabhängig und sind kein offener Pflichtteil.
Kein neuer Commit, Push oder Deployment in diesem Umbau. Der frühere separat
angeforderte Push meldete `Everything up-to-date`; die aktuellen Änderungen liegen
weiterhin uncommittet im Arbeitsverzeichnis.

Die Abschnitte darunter enthalten Einzel- und historische Zwischenabnahmen. Die
abschließende Gesamt-Abnahme am Dokumentende löst die damaligen offenen Gates ab.

### Partikelverwaltung (14.1)

- `fxSystem` besitzt nur Effektrezepte und verzögerte Aufträge. `spriteParticleBackend` besitzt Texturen, unabhängige Sprite-Materialien und Kinematik. Der plattformfreie `ParticlePool` besitzt freie/aktive Slots und Verdrängung; `indexHeap` ist seine indexierte Datenstruktur. Keine alternative produktive Altimplementierung oder Umschaltflag.
- Min-Index-Freilisten erhalten exakt die bisherige Wahl des ersten freien Slots je Textur. Aktive Indizes vermeiden Updates inaktiver Slots; Zähler sind O(1). Die älteste aktive Instanz wird über einen indexierten Heap gefunden, bei Gleichstand gilt weiterhin die früheste Slot-Identität. Ein linearer Heap-Rebuild nach dem Update erhält auch bei gerundeten Alterswerten die exakte Vergleichsordnung. Das Budget bleibt 960 aktive Partikel; pro Textur höchstens 960 vorgehaltene Slots, zusammen höchstens 3840.
- Vor dem Umbau erfasster Charakterisierungs-Hash bleibt unverändert: `457556e6a34a14f35a578c51b63484fe4b2f60cd0b6264015f3004bf47de616f`. 900 Frames sichern gemischte Texturen, Überlast, große Zeitschritte, Identität, Position, Farbe/Alpha und Renderflags. Weitere 15.000 zufällige Pool-Operationen vergleichen jeden Zustand mit dem alten Suchverfahren. Unabhängige Materialien, Ablauf, Dispose und späte Aufrufe sind separat getestet.
- Headless-CPU-Replay mit drei Läufen je Variante: FX-p95 alt 1.277/1.163/1.416 ms, neu 0.822/0.788/0.610 ms. Derselbe Seed, dieselben Fallback-Assets und Verhaltenszähler; keine Browser-/GPU-/FPS-Aussage. Browser-Vergleiche, Ressourcen, visuelle Abwehr-/Rauch-/Explosionsszene aus drei Winkeln und getrennte GPU-Probe stehen in `CLIENT-BENCHMARK.md`.
- Instanziertes oder gebatchtes Rendering (14.2) wird nicht eingeführt: Der nachgewiesene Pool-CPU-Pfad ist verbessert, die Rendersemantik bewusst unverändert. Weiteres Batching wäre eine eigene Performance-Arbeit mit Sortierungs-/Transparenzrisiko, kein notwendiger Architekturabschluss.

### Asynchrone Persistenz (13)

- Fachliche Repository-Ports, ConfigService und MatchResultService trennen Simulation/HTTP vom JSON-Backend. Eine prozessweite FIFO je Datensatz serialisiert vollständiges Read-modify-write. Nur bestätigte Commits werden veröffentlicht. Dateizugriffe sind `fs.promises`, keine synchronen Writes in Promise-Verkleidung.
- MatchSystem besitzt eine vom Host erzeugte UUID pro Runde; Gameplay-RNG und Wire-Schema bleiben unverändert. Abgelöste Ergebnisse werden ohne Await im Tick eingereiht. Deduplizierung und Aggregat committen gemeinsam; Neustart, Reset und Retry sind getestet. Limits: 128 Jobs/Statusdatensätze, drei Match-Schreibversuche, 16-MiB-Dateigrenze ohne stilles Verwerfen alter IDs.
- Admin-PATCH/Leaderboard-Reset verlangen jetzt `expectedRevision`; 428/409/503 statt falschem Erfolg. Eingebaute UI aktualisiert, Auth vor Body-Parser unverändert. Öffentlich weiterhin nur explizite Leaderboard-Felder. Fehlercodes/Commitzeiten/Dateigröße/Queue/Pending–Committed–Failed sind nur im Admin-Status sichtbar.
- Migration sichert exakte Altbytes; versionierte Decoder verweigern kaputte/unbekannte Dateien. Unvollständige Temps werden nie automatisch übernommen. Getesteter Offline-Restore bewahrt das ersetzte Original. Tatsächlicher Vertrag und Rückweg: [PERSISTENCE.md](./PERSISTENCE.md). Pending-RAM ist keine dauerhafte Outbox; Directory-Sync auf dieser Windows-Umgebung nicht verfügbar, deshalb keine uneingeschränkte Stromausfallgarantie.
- 99 Testdateien, alle Typechecks und Build bestanden; danach zusätzlicher Shutdown-Test für Reihenfolge, Wiederholung und Fristen ergänzt. Testfehler bei Write/Sync/Rename/Read lassen publizierte Werte unverändert. Verzögerter Store lässt Event-Loop-Turns weiterlaufen. Revisionsrennen, Überlauf, Fehlerisolation, Retry, Neustart-Deduplizierung, Migration und realer Restore/Reload geprüft.
- Zwei echte Clients in Room `N2fVsoZpY`: Kampf/Abwehr/Tod/Respawn, gleiche Scoreboards (Alpha 0/80, Bravo 0/68), persistierter Gesamtscore 148. Beide Browser teilen wie bisher denselben lokalen Player-Token; deshalb eine aggregierte Zeile mit zwei Teilnehmerergebnissen. Alpha-Rejoin läuft als Session 2, Cleanup loggt 19 Geometrien/13 Texturen/6 Programme. Authentifizierter Config-Commit und Rundenneustart funktionieren, Leaderboard dabei unverändert. Nach Testprozess-Neustart Config-Revision 1 und Leaderboard-Revision 1 weiterhin vorhanden; Reset committe Revision 2 und öffentlich leere Liste. Keine Browserfehler; beide kehren bei Serverabbruch in die Lobby zurück. Testprozesse/-tabs beendet, nur temporäre Daten benutzt. Ctrl-C des Windows-Testwerkzeugs belegt keinen sauberen Signal-Flush; dessen geordneter Ablauf/Deadline ist separat headless getestet.
- Drei unveränderte Kampftrace-Läufe: Median 1.087/1.124/1.109 ms, p95 1.483/1.767/1.709 ms. Identischer Golden-Hash und alle Event-Zähler; innerhalb bereits beobachteter Desktop-Streuung, kein behaupteter Speedup. Dieser Kampf endet vor regulärem Rundenabschluss; tatsächliche Speicherlatenz wurde separat getestet. Im Live-Smoke: 261 Byte, JSON-Serialisierung 0.015 ms, Commit 8.14 ms; keine Produktionskapazitätszusage.

### App-/Session-Lifecycle (12.7)

- `main` startet nur noch `createGameApp` und zeigt Startfehler. Die App besitzt Renderer, Szene, Caches, Audio, Input-Controller und genau einen Frame-Scheduler. `GameSession` besitzt Verbindung, Read Model und Netzwerkabonnements; `createSessionPresentation` verdrahtet die sessionbezogenen Ausgaben. `sessionFrame` enthält den äußeren Frame-Ablauf ohne Netzwerkkenntnis; die charakterisierte innere Phasenfolge bleibt gleich.
- LIFO-Lifetimes, idempotentes Dispose und Generation-/Abort-Prüfungen sichern Teilstartfehler, Join-Timeout, verspätete Raumverbindungen, HUD-Fetches, Dialoge und lazy Debug. Netzwerkabonnements werden vor Präsentationsressourcen entfernt. Eingaben werden zwischen Sessions neu gebunden und neutralisiert; 20 Desktop- und 20 Mobile-Zyklen prüfen Listener und DOM-Bestände.
- Abwehr-rAF/Timer/Geometrien und Screen-Pulse haben einen gemeinsamen Session-Besitzer; normale Effektzeiten bleiben erhalten. Sessionende stoppt auch verzögerte Audio-Fallbacks und laufende Stimmen, hält aber geladene Assets für den nächsten Join. Vollständiges App-Ende entsorgt Szene, Shadow- und Water-Reflection-Targets vor den gemeinsamen Caches. Unbenutzte `assetManager`-/`runtimeShutdown`-Altpfade entfernt.
- Echter Zwei-Client-Test in Room `sJttwa9L8`: Kampf, Abwehr, Tod/Respawn und identische Scoreboards (Bravo 9 Kills/1300, Alpha 2/560). Authentifizierter Admin-Neustart setzt beide HUDs zurück; ohne Token 401, unterbrochene Runde verändert das bestätigte Leaderboard nicht.
- Alpha tritt ohne Reload insgesamt 20-mal ein; Sessions 3–20 zeigen identisch 20 Geometrien, 16 Texturen, 10 Programme im ruhenden Rundenende. Pro Join genau eine Meldung bei Bravo, ein Canvas/ein HUD; Lobby ohne HUD. Serverabbruch entfernt auch die offene Einsatzbesprechung. Nach Serverneustart gelingt Session 21 mit warmen Assets, beide Clients spielen wieder. Keine Browser-Errors oder Kontextverluste; bekannte GLB-Socket-Warnungen unverändert. Testdaten lagen ausschließlich in einem separaten temporären Verzeichnis; eigene Tabs und Prozesse danach beendet.
- Das ist kein Nachweis für unbegrenzte Laufzeit, Heap-Konstanz, Audioqualität auf jedem Gerät oder GPU-Zeit. Mobile-Listener wurden headless geprüft, kein echter mobiler Browser. Vollständige App-Neukonstruktion nach permanentem Cache-Dispose ist nicht der Same-App-Session-Vertrag. Abschließende Gesamt-/Performance-/Visualprüfungen bleiben erforderlich.

### Historischer Blocker-Audit (bei letzter Fortsetzung nicht mehr reproduzierbar)

Der gleiche WebGL-Blocker wurde in drei aufeinanderfolgenden Fortsetzungen bestätigt: Kontextverlust im Zwei-Client-Test, anschließend erfolglose unabhängige Minimalprobe, zuletzt erneute Minimalprobe mit dem aktuellen separaten Produktions-Diagnosebuild. Auch zuletzt lieferte `canvas.getContext("webgl2")` keinen Kontext, bevor Szene oder Assets gestartet wurden. Die Browser-Inventur bietet ausschließlich den betroffenen In-App-Browser; kein zweiter verbundener Browser steht bereit. Eigener Diagnosetab und Preview-Prozess sind wieder geschlossen/beendet.

Die zwischenzeitlich mögliche unabhängige Vorbereitung (deterministischer Replay, Messsammler, Verhaltenstests, Build-Isolation und Dokumentation) ist vorhanden. Für das vorgeschriebene Vorher-Gate vor 12.6 fehlt nun ein funktionierender WebGL-Browser. Keine automatische App-/Browser-Neustartfunktion steht zur Verfügung; fremde Prozesse zu beenden, GPU-/Sicherheitseinstellungen zu ändern oder die verbindliche Reihenfolge 12 → 13 → 14 zu umgehen ist kein freigegebener Ersatz. Fortsetzung benötigt Wiederherstellung des Browsers oder Bereitstellung eines anderen verbundenen WebGL2-fähigen Browsers durch den Nutzer. Der volle Restumfang bleibt unverändert.

### Fortsetzung nach „weiter“: Browser-Erholung und Frame-Aufteilung (12.6)

- Die erneute unabhängige WebGL-Probe bestand. Drei unveränderte Baseline-Läufe ohne Kontextverlust und mit geladenen Hull-/Mount-/Insel-Assets wurden abgeschlossen; Werte und Einschränkungen stehen in [CLIENT-BENCHMARK.md](./CLIENT-BENCHMARK.md). Keine Behauptung zur Ursache oder dauerhaften Behebung des früheren GPU-Ausfalls.
- Aktueller Feedback-/Signal-Cleanup-Stand vor Frame-Extraktion: Zwei-Client-Smoke in Room `uJY5rB_uP`, `FrameAlpha` mit Debug und `FrameBravo` ohne. Kampf, Abwehr, Trefferfeedback, gegenseitige Zerstörung, Respawn und Aufstieg sichtbar. Beide Scoreboards identisch (Alpha 3 Kills/640, Bravo 3/588). Bestehender `playAgain`-Handler über kurzlebigen Testclient: `ended/0` → `running/180`, in beiden Browsern zurückgesetzte HUDs. Bravo per Reload erneut beigetreten; Alpha meldet `FrameBravoRejoin joined` genau einmal. Keine Browser-Errors oder Server-Ausnahmen; Renderer auch nach Rejoin intakt. Eigene Tabs/Server anschließend geschlossen. Noch kein Same-App-Session- oder Admin-HTTP-Neustart-Nachweis.
- `frameRuntime.characterization.test.ts` wurde vor der Extraktion ausgeführt: Reihenfolge von Warnungen/Audio/Pose/Input/HUD/FX, 1200-ms-Heartbeat, Aim-Deduplizierung, gehaltenes Feuer, analoger/Telegraf-Wire-Vertrag, Tod/Respawn und fehlende Visuals. Danach unverändert bestanden; auch die bestehenden Replay-Golden-Werte wurden nicht angepasst.
- `frameRuntime.ts` verdrahtet jetzt `frameFeedback`, `frameAudioFx`, `frameWorld`, `frameInput` und `frameCockpit`. `frameContracts` enthält geliehene Daten-/Ausgabeverträge; jede Phase erhält nur ihre benötigten Ports und State-Felder. Keine Übergabe des vollständigen Frame-Optionsobjekts an Submodule, keine Weltkopien oder zusätzliche Schleifen über alle Spieler.
- Die bestehende Verschachtelung bleibt ausdrücklich erhalten: lokale Kamera → Input → Cockpit innerhalb der Visual-Iteration; Remote-Visuals/-Rauch dürfen nicht beiläufig umgeordnet werden. HUD bleibt bei 50 ms plus bisherige dringende Zustandswechsel. Kommentare erklären diese Reihenfolge und Ownership statt nur die Syntax zu wiederholen.
- **85 Testdateien bestanden** (28 Client / 19 Server / 38 Shared), vollständiger Produktionsbuild und Benchmark-Build grün. Neue explizite Frame-Importgrenzen anschließend gezielt bestanden. `main` 194.70 kB (gzip 65.44), Renderer unverändert 678.11 kB; bekannte Größenwarnung. Kein neuer Auth-/I/O-/Secret-Pfad in den Frame-Modulen; bestehende Security-Regressionen grün. Kein Deployment-Nachweis.
- Erster Nachher-Performanceversuch überschreitet die Leitplanke deutlich, auch im unveränderten Renderpfad. Zwei vollständige Wiederholungen erhalten sämtliche Verhaltens-/Draw-/Ressourcenzähler; dritte Wiederholung abgebrochen. Das wird nicht als Performance-Abnahme gewertet. Direkter Alt-/Neu-Vergleich bei expliziter Browser-Sichtbarkeit läuft; 12.7 bleibt bis zur Erklärung/Korrektur zurückgestellt.
- Anschließender direkter Kontrollvergleich abgeschlossen: alter Code Runtime-p95 1.8/1.7/1.8 ms, neue Phasen 1.8/1.8/1.8 ms; Draw Calls und Ressourcenstände identisch. Keine wiederholte >10-%-Regression außerhalb der Streuung. Die erste Verschlechterung reproduziert sich auch mit dem unveränderten Alt-Bundle unter späteren Bedingungen; genaue Desktop-/Browserursache offen, kein Speedup-Versprechen. Vollständige Werte und Grenzen in `CLIENT-BENCHMARK.md`.
- Doppelte Cockpit-Felddefinition durch den reinen gemeinsamen `presentation/CockpitModel.ts` ersetzt; bestehende HUD-Typ-Exports bleiben kompatibel. Frame-Teilnehmersichten leiten ihre Typen schreibgeschützt vom Read Model ab statt sie erneut zu definieren. Nur Typauslagerung, identischer Benchmark-Bundle-Hash danach. Ergänzter Test für lokale/entfernte Visual-Reihenfolge wurde gegen alten **und** neuen Frame-Code erfolgreich ausgeführt.
- Nachher-Zwei-Client-Smoke in Room `dIeqyFtok`: `SplitAlpha` mit Debug, `SplitBravo` ohne. Bewegung, Feuer/Abwehr, Tod/Respawn und identisches Rundenende sichtbar (Alpha 0 Kills/220, Bravo 1/364). Echter authentifizierter HTTP-Aufruf `/api/admin/round/restart`: eine Runde auf `running/180` zurückgesetzt; ohne Token 401. Zusätzlich laufende Runde bei 150 Sekunden erneut per Admin unterbrochen: wieder 180 Sekunden, bestätigtes Leaderboard unverändert. Browser zeigen den Reset. `SplitBravoRejoin` nach Reload genau einmal angekündigt; keine Browser-Errors, Server-Ausnahmen oder Kontextverluste. Separates temporäres Datenverzeichnis und ausschließlich lokaler Testserver; keine Bestandsdaten geändert. Test-Tabs und -Prozesse anschließend geschlossen. Same-App-Rejoin bleibt 12.7.
- Letzter vollständiger Prüfstand nach Typvertrags-Bereinigung: erneut 85 Testdateien, alle Workspace-Typechecks und Produktionsbuild bestanden, unveränderte Bundle-Hashes/-Größen gegenüber der Frame-Aufteilung. Security-inspector: keine neuen kritischen oder belastbaren hohen Befunde in den geprüften Frame-/Output-Grenzen; keine neuen Env-/Secret-/I/O-/HTML-Injection-Pfade. Admin-/Origin-/Debugschutz-Regressionen bestanden. Kein Deployment-Nachweis.

## 4. Abschließende Gesamt-Abnahme — 27.09.2026

- **106 Testdateien bestanden:** 44 Client, 23 Server, 39 Shared. Alle Workspace-Typechecks, vollständiger Produktionsbuild und separater Benchmark-Build erfolgreich. Importgraphen ohne Legacy-Ausnahmen; keine Runtime-Zyklen in den geschützten Graphen. Produktions-Schema-Identität über Root- und Schema-Export zusätzlich geprüft. `git diff --check` ohne Whitespace-Fehler.
- Production: main 204.12 kB (gzip 68.43), Renderer 679.31 kB (gzip 180.54), Debug separat lazy 25.11 kB. Die bekannte Renderer-Größenwarnung bleibt; kein Diagnose-Replay oder Admin-Token im normalen Spielbundle. Keine pauschale Bundle-/Ladezeitoptimierung behauptet.
- **Finaler Zwei-Client-Smoke:** Produktionsbuild `main-DudAmdbM.js`, Room `BSS7nfCxm`, FinalAlpha mit Debug und FinalBravo ohne. Beide geladenen Gepard-Clients zeigen Kampf/Abwehr, Treffer, Tod/Respawn, Aufstieg und identische Endtabellen: Togo 3/436, Alpha 1/200, Nelson 1/184, Yamamoto 0/84, Bravo 0/68, Nimitz 0/52. Persistiertes Human-Aggregat 268, wieder derselbe browserlokale Player-Token. Keine Browser-Errors, fehlenden Mounts oder Kontextverluste.
- Alpha-Continue → Lobby → FinalAlphaRejoin läuft ohne Reload als **Session 2**; Bravo zeigt genau eine Rejoin-Meldung. Cleanup nach Session 1: 13 Szenenwurzeln/21 Geometrien/18 Texturen/6 Programme. Authentifizierter Admin-Neustart setzt die Runde zurück, öffentliches Leaderboard unverändert; ohne Token 401. Danach erneuter Kampf/Respawn; Serverabbruch bringt beide zurück in die Lobby ohne HUD. Eigene Testtabs und Prozesse geschlossen. Nur isolierte temporäre Daten benutzt.
- **Partikel:** CPU-Nutzen und unveränderte Effektsemantik nachgewiesen. Alle Browser-Replay-Dispose-Stände gleich. Statische GPU-Probe tatsächlich ausgeführt, aber keine belastbare GPU-Speedup-Aussage. Renderzeiten schwanken erheblich; die direkte Kontrolle zeigt keine wiederholte >10-%-Regression außerhalb der beobachteten Streuung. Vollständige Werte, Bildvergleich und lokaler Cold-/Warm-Transfer stehen in `CLIENT-BENCHMARK.md`.
- Synthetischer Endstand mit integriertem neuen Content, je drei Läufe: 16 Teilnehmer/32 Raketen Median 0.994/0.842/0.851 ms, p95 1.896/1.680/1.830 ms; 64/128 Median 8.175/7.705/8.209 ms, p95 10.737/8.848/11.099 ms. Der Stressfall liegt innerhalb der bereits beobachteten breiten Streuung, ist kein unterstütztes 64-Spieler-Limit und keine Produktionskapazitätsgarantie.
- **Separate Inhaltsfreigabe:** Parallele Gepard/FAC-Socket-Änderungen ließen den Kampf-Golden zunächst korrekt fehlschlagen. Mit nur den beiden alten Content-Dateien im prozesslokalen Loader erfüllt der aktuelle Simulationscode exakt die alte Referenz (Median 1.142 ms, p95 1.667 ms). Arbeitsdateien dabei unverändert. Erst nach ausdrücklicher Nutzerfreigabe neue Inhalte technisch geprüft, alte Referenz archiviert, neue `454cc199…aa165b` dreifach reproduziert und in drei normalen Prüfläufen bestätigt. Details: [Content-Abnahme](./CONTENT-BASELINE-GEPARD.md). Spätere reine Rumpfskalierung-/Wake-Anpassungen bleiben vom Gameplay-Contenthash getrennt; der vollständige Kampftrace wird weiter geprüft.
- **Security-inspector:** keine neuen kritischen oder belastbaren hohen Befunde. Auth vor Admin-Parser, Namespace-Schutz, HTTP/Matchmaking/WS-Origin und Produktions-Debugschutz bleiben intakt. Public DTOs enthalten keine internen Player-Keys/Pfade; neue Storage-Fehlerantworten keine nativen Fehlermeldungen. Datenpfade nur aus Host-Konfiguration; Offline-Restore validiert und erhält den bisherigen Stand. Getestete Fehlerantworten 428/409/503, keine falschen Commit-Erfolge. Das ist keine Prüfung eines Live-Deployments.
- **Bewusste Restgrenzen:** Einzelprozess-JSON mit 16-MiB-Grenze und synchroner JSON-CPU-Arbeit; kein Crash-sicheres Pending-Journal. Directory-Fsync hier unter Windows nicht unterstützt. Signal-Drain/Fristen headless geprüft; hartes Ctrl-C des Testwerkzeugs ist kein Betriebssystem-Signalnachweis. Echte mobile Geräte, physischer Stromausfall, Audioqualität und unbegrenzte Laufzeit nicht nachgewiesen. Frühere WebGL-Störung derzeit nicht reproduzierbar, Ursache offen.

Damit sind die Pflichtteile 12, 13 und 14.1 abgeschlossen. Das optionale 14.2,
ein Datenbankwechsel, weitere Renderer-Optimierung und Deployment sind eigenständige
Folgearbeiten, keine verschwiegenen offenen Refactoring-Schritte.
