# Zielarchitektur — BattleFleet Arena

Stand: 26.09.2026. Status: **Planungsbaseline für Review-Punkte 12–14, noch nicht implementiert.**

Dieses Dokument legt Verantwortlichkeiten und Abhängigkeitsregeln für den Modulaufbruch fest. Die Umsetzung folgt dem [Refactoring-Plan](./REFACTORING-PLAN.md). Abweichungen werden vor der betreffenden Extraktion hier begründet; Dateinamen dürfen angepasst werden, fachliche Grenzen nicht stillschweigend.

Die langfristige [Vision](../way-ahead.md) bleibt erhalten. Hier wird daraus ein begrenzter nächster Ausbau abgeleitet: ein wartbares Spiel im bestehenden TypeScript-Monorepo, keine allgemeine Engine, kein Microservice-System und kein vollständiger Neubau.

## 1. Ausgangslage und Umfang

Am aktuellen Arbeitsstand überprüft, einschließlich noch nicht committeter Änderungen aus den bisherigen Review-Punkten:

| Bereich | Heute | Ziel nach dem Umbau |
| --- | --- | --- |
| Server | `BattleRoom` verbindet Netzwerk, Schema, Regeln, Bots, Tick und Match-Speicherung | Dünner Colyseus-Adapter, headless Simulation, getrennte Anwendung und Speicherung |
| Shared | Reine Regeln, Content und Colyseus-Schema über einen breiten Einstieg | Portable Regeln/Typen getrennt vom transportgebundenen Schema |
| Client | Runtime-Module vorhanden; `main` und `frameRuntime` koordinieren weiterhin viele Details | Composition Root, explizite Session, kleine Frame-Phasen und Presenter |
| Speicherung | Gecachte JSON-Dateien; synchrone Writes, Fehler werden geloggt statt weitergegeben | Asynchrone, geordnete und überprüfbare Commits hinter Repository-Schnittstellen |
| Effekte | Sprite-Pool, lineare Freiplatz-/Zähl-/Verdrängungssuchen | Getrennte Effektrezepte, Pool-Verwaltung und Render-Backend |

Bereits erreichte Verbesserungen bleiben erhalten: [Asset-Lifecycle](./CLIENT-ASSET-LIFECYCLE.md), [Client-/Server-Hotpaths](./CLIENT-SERVER-PERFORMANCE.md), Admin-Schutz, Tests und CI. Neue Inhalte, Balancing, Account-System, Colyseus-Major-Upgrade und Deployment sind nicht Teil von 12–14.

## 2. Architekturentscheidungen

1. **Serverautorität bleibt unverändert.** Treffer, Bewegung, Leben, Magazine, Fortschritt und Match-Ergebnisse entscheidet der Server. Der Client stellt dar und sendet Absichten.
2. **Zuerst Grenzen, dann Verzeichnisse.** Kein vollständiges Umsortieren im selben Schritt wie ein Logikumbau. Bestehende reine Helfer werden weiterverwendet.
3. **Simulation zunächst unter `server/src/simulation`.** Sie darf weder Colyseus noch Node-I/O kennen. Ein späterer Umzug nach `shared/sim` aus der Vision ist erst bei konkretem Wiederverwendungsbedarf sinnvoll; headless testbar ist sie schon vorher.
4. **Ein Schreiber pro Zustand.** Simulationszustand ist am Ende autoritativ; Colyseus-Schema ist eine Projektion. Kein bidirektionaler State-Abgleich und kein zweiter Regelkern im Client.
5. **Direkte, typisierte Aufrufe statt globalem Event-Bus.** Ereignisse melden Ergebnisse an Netzwerk/Darstellung/Speicherung. Fachliche Folgeaktionen innerhalb eines Ticks erfolgen synchron in definierter Reihenfolge.
6. **Keine neue Abstraktion ohne Grenze oder zweiten Bedarf.** Funktionen und kleine Factories genügen; kein DI-Container, ECS, Plugin-System oder generisches Repository-Framework.
7. **Extraktion ist keine Regeländerung.** Tick-Reihenfolge, Wire-Format, Koordinaten, Input-Timing, Grenzwerte und Zufallsaufruf-Reihenfolge bleiben zunächst bestehen.

## 3. Abhängigkeiten und Paketgrenzen

Erlaubte Richtung: äußere Adapter → Anwendung/Simulation → portable Regeln und Typen. Der Bootstrap verdrahtet konkrete Implementierungen mit schmalen Schnittstellen.

| Modul | Darf verwenden | Darf nicht verwenden |
| --- | --- | --- |
| Shared-Regeln/Content | Eigene reine Typen, Mathematik, validierte Daten | Colyseus-Schema, DOM, Three.js, Dateisystem, Env, Server-/Client-Module |
| Shared-Protokoll | DTOs; nur der Schema-Unterbereich zusätzlich `@colyseus/schema` | Spielablauf, Speicherung, Secrets |
| Simulation | Shared-Regeln/Content, Simulationszustand, injizierte Zeit/Zufall | Room, Client, Schema/ArraySchema, HTTP, Dateisystem, globale Env-Zugriffe |
| Server-Anwendung | Simulations-API, Repository-Ports, Konfigurationswerte | Three.js/DOM; Speicherdetails in der Simulation |
| Server-Adapter | Colyseus/Express, Anwendung, Schema, DTO-Mapping | Eigene Schadens-, Lebens- oder Punkteberechnung |
| Client-Netzwerkadapter | Colyseus, Protokoll, lokale Read-Model-Typen | Renderer-, Audio- oder HUD-Implementierungen |
| Client-Presenter | Read Model, reine Anzeigehelfer, Ausgabe-Ports | Room/ArraySchema, Server-I/O, autoritative Zustandsänderungen |
| Renderer/Audio/HUD | Ihr Framework, konkrete Ressourcen, Präsentationsdaten | Direkte Netzwerkabonnements und Spielregelentscheidungen |

`shared` wird nicht zum Sammelordner für alles Wiederverwendbare. Ein clientinterner Helfer bleibt im Client. Der bisherige Root-Export bleibt während der Migration kompatibel; reine Importpfade und ein automatischer Importgrenzen-Test werden zuerst ergänzt. Die Simulation darf nicht indirekt über den Root-Barrel wieder Schema-Code importieren.

## 4. Zielstruktur und Zuständigkeiten

Die folgenden Pfade sind **geplant**, keine Behauptung über bereits vorhandene Dateien. Bestehende Module bleiben stehen, bis der jeweilige Schritt sie betrifft. Die Liste zeigt Grenzen, nicht die Pflicht, für jeden Eintrag sofort eine Datei anzulegen.

```text
shared/src/
  rules/                       # Bestehende reine Spielregeln, schrittweise gruppiert
  content/                     # Validierte Sicht auf bestehende JSON-Profile
  protocol/                    # Commands/Events/DTOs; schema separat
    schema.ts
server/src/
  index.ts                     # Prozessstart und Verdrahtung
  rooms/BattleRoom.ts           # Colyseus-Lifecycle, Transport, Tick-Trigger
  adapters/                    # Command-, Schema- und Event-Mapping
  application/                 # ConfigService, MatchResultService, Room-Verwaltung
  simulation/
    GameSimulation.ts          # Einstieg und explizite Phasenfolge
    SimulationState.ts         # Eigener, transportfreier Zustand
    ParticipantRegistry.ts     # Teilnehmer und abgeleitete Indizes
    systems/                   # Bots, Match, Life, Movement, Combat, Collision
  persistence/                 # Ports, WriteQueue, JSON-Adapter; später ggf. SQLite
  ops/                         # Bestehende Metriken und Betriebsdiagnostik
client/src/
  main.ts                      # Minimaler Einstieg
  game/app/                    # createGameApp, GameSession, Start/Stop/Dispose
  game/runtime/                # Frame-Scheduler, Cadence, Kamera, Lifecycle-Helfer
  game/adapters/               # Netzwerk → Read Model/Ereignisse, Input → Netzwerk
  game/presentation/           # World-, Cockpit-, Match-, Audio-/FX-Presenter
  game/renderers/              # Bestehende Schiffs-/Welt-Darstellung
  game/effects/                # Effektrezepte, ParticlePool, Sprite-Backend
  game/audio/                  # Bestehende Audio-Implementierungen
  game/hud/                    # DOM-Ansichten, keine Netzwerkkenntnis
```

### Server: fachliche Modulgrenzen

| Modul | Besitzt / verantwortet | Schnittstelle zu anderen Modulen |
| --- | --- | --- |
| ParticipantRegistry | Teilnehmer-Lifecycle und ID-Index | Join/Remove/Lookup; Bots sind Teilnehmer ohne Netzwerk-Client |
| BotSystem | Bot-Gedächtnis, Population, Entscheidungszeitpunkte | Liefert dieselben validierten Spielabsichten wie Menschen |
| MatchSystem | Phase, Rundengrenzen, Match-ID, Abschluss | Abschluss genau einmal, Reset als explizite Operation |
| LifeSystem | HP-Änderung, Tod, Schutz, Respawn, Wrack-Entstehung | Synchrones `applyDamage`/Lifecycle; keine zweite Todeslogik in Waffen |
| ProgressionSystem | XP, Level, Klassenwechsel | Aktualisiert abhängige HP-/Movement-/Magazinwerte definiert |
| Movement/Collision | Position, Kontakte, Korrektur, Ram-/Umweltschadensberechnung | Schaden an LifeSystem; Reihenfolge des bisherigen Ticks bleibt erhalten |
| Weapon/Projectile/Defense | Cooldowns, Magazine, Geschosse und Abwehrzustand | Verwenden Regeln, rufen LifeSystem und erzeugen Präsentationsereignisse |
| SchemaPublisher | Schema-Objekte, inkrementelle Wire-Projektion | Liest Simulation; darf sie nicht verändern |
| Room-Adapter | Verbindungen, `clientsById`, Nachrichtenzustellung | Verbindungs-ID wird serverseitig einem Teilnehmer zugeordnet |

Die Aufteilung ist kein Anlass für jedes Einzelfeature eine Klasse einzuführen. Eng gekoppelte Waffen-/Abwehrabläufe können zunächst in einem Combat-Modul bleiben. Ein Subsystem erhält nur seine benötigten Daten und Ports, niemals den gesamten `BattleRoom` oder einen gleich großen Universal-Context.

### Zustandsübergang ohne zwei Wahrheiten

Während der ersten Extraktionen bleibt das heutige Schema mit `SimEntry` die bestehende Zustandsbasis. Ein ausdrücklich temporärer Legacy-Adapter stellt schmale Sichten bereit; er wird nicht als fertiger headless Kern bezeichnet.

Erst nach Charakterisierung wird der autoritative Zustand zusammenhängend auf `SimulationState` umgestellt. Danach schreibt ausschließlich der Publisher in das Schema. Vergleiche zwischen Alt und Neu laufen in isolierten Testinstanzen, nicht als zwei produktive Schreiber. Round Reset erhält im Publisher bestehende Teilnehmer-Schemaobjekte; Remove/Rejoin ersetzt sie. Der Importgrenzen-Test muss am Ende ohne Legacy-Ausnahme bestehen.

### Tick- und Input-Vertrag

Zeit wird als `nowMs` (Millisekunden), Schrittweite als `dtSec` (Sekunden), Zufall als injizierte Funktion übergeben. Produktion behält zunächst dieselbe Zeitbasis; Tests verwenden kontrollierte Zeit und Seed. Eine Umstellung auf feste Substeps oder monotone Gameplay-Zeit ist eine separate Verhaltensänderung.

Der aktuelle Ablauf muss als Charakterisierungstest gesichert werden:

1. Einsatzgebietsgrenze lesen; Match-Timer, Bot-Population, Bot-Input, passive XP.
2. Artillerieeinschläge bzw. ausstehende Salven löschen; Lebensübergänge, Magazin-Reload, Wrackablauf.
3. Bewegung, Insel-/Wrackkontakt und Inselschaden, Inselkorrektur.
4. Kollisionskandidaten, Ram-/Wrackschaden, neue Schiffskontakte, Schiff-/Wrackkorrekturen.
5. Spielerwerte/Cooldowns aktualisieren, Regeneration und OOB-Lebensübergänge.
6. Raketen inklusive Abwehr, Torpedo-/Minenpfad, Abwehr-HUD-Werte.

Wichtig: Menschlicher Input kann heute schon im Nachrichtenhandler Feuer auslösen, Bots im Tick. Punkt 12 verschiebt das **nicht** stillschweigend in eine Command-Queue am Tick-Anfang. Die Simulations-API braucht deshalb zunächst synchrone Operationen für `applyInput`, `join`, `remove`, `reset` und `step`. Der Adapter projiziert Änderungen und liefert Ereignisse an denselben beobachtbaren Operationsgrenzen wie bisher aus; die genaue Reihenfolge sichern Adaptertests.

Das Simulations-Read-Model darf synchron geliehene, schreibgeschützte Sichten liefern. Asynchrone Speicherung erhält dagegen eigene, unveränderliche Ergebnis-DTOs. Kein vollständiges Deep-Copy der Welt pro Tick, kein neues O(n²)-Lookup durch die Abstraktionen.

## 5. Protokoll, Ereignisse und Content

- Commands sind **Absichten**, keine vom Client vorgegebenen HP, Treffer, Scores oder Teilnehmeridentitäten. Der Adapter prüft Form, endliche Zahlen und zulässige Werte; fachliche Zulässigkeit prüft die Simulation.
- Schema ist der aktuelle replizierte Zustand. Ereignisse sind einmalige Meldungen wie Schuss/Kontakt/Explosion, kein zweiter Zustandsspeicher. Kritische Anzeigen müssen sich aus aktuellem Zustand wiederherstellen lassen.
- Interne typisierte Events werden auf bestehende Nachrichtennamen und Payloads abgebildet. Während Punkt 12 kein Wire-Break und kein vorausgesetztes gleichzeitiges Client-/Server-Update. Zukünftige Breaking Changes benötigen einen eigenen Kompatibilitäts-/Versionsplan.
- Ein Event wird pro Empfängerpfad genau einmal verarbeitet; Todeseffekte dürfen nicht zusätzlich unkoordiniert aus Event und State-Transition entstehen. Tests sichern die heutige Zuordnung und Nachrichtenreihenfolge.
- Content bekommt zuerst eine typisierte, validierte Fassade über bestehende Schiffsprofile. Validierung erfolgt beim Laden, nicht pro Tick. Kein dynamisches Content-Registry-/Mod-System in diesem Umbau.
- Client-Tuning verändert Darstellung, niemals autoritative Serverprofile. Koordinatenumrechnung bleibt an der Rendergrenze; keine zusätzliche Spiegelung in Presentern.

## 6. Client: Datenfluss, Taktung und Lebensdauer

`GameSession` besitzt Verbindung, Netzwerkabonnements, Read Model und sessionbezogene Presenter. `createGameApp` besitzt Renderer, Szene, Eingabe, Asset-Caches, Audio und den Frame-Scheduler. Die Verdrahtung erfolgt einmal an dieser Grenze.

Der Netzwerkadapter aktualisiert ein normalisiertes Read Model anhand von State-Änderungen. Die Umstellung darf weder historische Interpolationsdaten in lebende Schema-Referenzen verwandeln noch Vollkopien pro Renderframe erzeugen. Geliehene Referenzen gelten nur synchron; History und asynchrone Arbeit verwenden eigene Daten.

| Frame-Phase | Verantwortung | Beibehaltene Frequenz |
| --- | --- | --- |
| Input | Mensch/Bot lesen, bestehende Sendelogik/Heartbeat | Pro Frame, bestehende Deduplizierung bleibt |
| World-Presentation | Remote-Interpolation, lokale autoritative Pose, Visuals, Kamera | Pro Frame |
| Cockpit-Presentation | Cockpit-/Radar-Modell und DOM-Deltas | 50-ms-Cadence plus sofortige relevante Zustandswechsel |
| Audio/FX | Kontinuierliche Übergänge und Effektschritt | Pro Frame |
| Render | Wasser/Wake/Scene zeichnen | Pro Frame |
| Diagnostik | Debug-Ausgabe | Sichtbarkeitsabhängig, bestehende langsamere Cadence |

Phasenreihenfolge folgt zunächst der vorhandenen `frameRuntime`; die Tabelle ist keine Erlaubnis zum Umordnen. HUD-Views erhalten fertige Anzeigedaten und behalten Change-Keys/DOM-Writer. Debug-Panels bleiben lazy und werden nicht durch statische Importe wieder in den Einstieg gezogen.

Lebensdauervertrag:

- Jeder Listener, Timer, rAF, Netzwerk-Callback und jede Ressource hat genau einen Besitzer und einen Unsubscribe-/Dispose-Pfad.
- Shutdown stoppt zuerst neue Arbeit/Eingabe, löst Abonnements und Verbindung, entsorgt dann Presenter und Ressourcen in umgekehrter Abhängigkeitsreihenfolge. Wiederholtes Dispose ist unschädlich.
- Späte Asset-/Netzwerk-Ergebnisse dürfen eine beendete Session nicht wiederbeleben; Abort-/Generation-Checks bleiben erhalten.
- Asset-Caches besitzen gemeinsam genutzte Geometrien/Texturen; Instanzen nur ihre eigenen Materialien/Overlays. Details stehen im Asset-Lifecycle-Dokument.
- Ein Start–Join–Leave–erneuter Join darf keine doppelten Listener oder wachsende Ressourcenbestände erzeugen. Das ist ein neues Abnahmekriterium, keine Behauptung über den heutigen vollständigen Cleanup.

## 7. Persistenz — Punkt 13

Die Simulation erzeugt ein Match-Ergebnis, kennt aber kein Repository. `MatchResultService` übernimmt dieses als eigenes DTO. `ConfigService` trennt validierte, veröffentlichte Konfiguration von einem noch nicht bestätigten Schreibwunsch.

Geplante fachliche Ports:

| Port | Vertragskern |
| --- | --- |
| ConfigRepository | `load`, `save` mit Revision; Promise erfüllt erst nach vereinbartem Commit |
| LeaderboardRepository | `recordMatch(matchId, results)`, `top`, `reset`; atomar, Match-ID-Deduplizierung persistent |
| StorageLifecycle | `flush`/`close`; begrenzte Shutdown-Frist und sichtbare Fehler |

**Erster Backend-Schritt: geordnete asynchrone JSON-Speicherung**, passend zum bestehenden Einzelprozessbetrieb. `fs.promises` statt synchroner I/O; eine prozessweite Queue pro Datenbestand, nicht pro Room. Read-modify-write inklusive Reset wird serialisiert. Ein Leaderboard-Commit enthält Ergebnis-Deduplizierung und Aggregat gemeinsam. Einzigartige temporäre Datei im gleichen Verzeichnis, validierte Versionen und getestete Recovery verhindern unbemerkte Übernahme halber Dateien.

Eine Promise um `writeFileSync` macht I/O nicht asynchron. Große JSON-Serialisierung kann weiterhin den Event-Loop blockieren; Größe und Dauer messen. Ein Rename allein ist keine Garantie gegen Stromausfall: Flush-/Sync-Verhalten und unterstützte Plattformen müssen im Implementierungsschritt geprüft und die tatsächliche Durability dokumentiert werden.

Weitere verbindliche Semantik:

- Konfigurationsänderungen werden innerhalb der Queue auf der letzten bestätigten Revision aufgebaut. Erst erfolgreicher Commit veröffentlicht die neue Konfiguration und erlaubt HTTP-Erfolg. Fehler lassen die vorherige Konfiguration gültig.
- Admin-Reset wartet auf Commit. Bei Fehlern keine irreführende Erfolgsmeldung. Öffentliche Leaderboards zeigen bestätigte Daten; Simulation wartet nicht auf Speicher-I/O.
- Für Match-Ergebnisse gibt es Pending/Committed/Failed, begrenzte Queue, begrenzte Wiederholungen und sichtbare Diagnostik. Queue-Überlauf ist ein gemeldeter Fehler, kein stiller Drop. Das DTO darf nach Round Reset nicht mutieren.
- Deduplizierungsschlüssel ist eine serverseitige, neustartübergreifend eindeutige Match-ID, nicht Room-ID oder Client-Token. Die Aufbewahrung der Deduplizierung ist explizit; nicht unbegrenzt im RAM sammeln.
- Pending im RAM bedeutet bei Prozessabsturz weiterhin ein Verlustrisiko. Verlustfreiheit vor Commit benötigt ein dauerhaftes Journal/Outbox und ist **nicht** durch eine WriteQueue allein erreicht.
- Backups, Import vorhandener JSON-Daten, Schema-Versionen, beschädigte Dateien und Restore-Test gehören zur Abnahme. Fehlerhaftes Bestandsmaterial nicht still durch leere Daten überschreiben.

**SQLite ist die nächste Option, keine vorab installierte Pflicht.** Entscheidung vor einem Backendwechsel anhand Datenmenge, Write-Latenz, Transaktionen und Betriebsbedarf dokumentieren. Ein synchroner Treiber im Tick-/HTTP-Prozess wäre keine Lösung für Event-Loop-Blockierung; ggf. Worker oder passende asynchrone Anbindung. Mehrere Serverprozesse/Hosts sind mit der ersten JSON-Lösung nicht freigegeben. PostgreSQL erst bei entsprechendem Betriebsbedarf.

## 8. Partikel — Punkt 14

Die öffentliche FX-API und Effektrezepte bleiben zunächst gleich. Intern werden drei Aufgaben getrennt: Effektbeschreibung/Emitter, Partikellebensdauer/Pool und Three.js-Darstellung.

1. Freie Indizes pro Texturtyp und laufender Aktiv-Zähler ersetzen Freiplatz- und Zählschleifen. Aktive Indizes erlauben Updates ohne inaktive Poolbereiche zu durchlaufen.
2. Expiry, Verdrängung und Dispose verwenden denselben Release-Pfad. Der bisherige Grenzwert bleibt; keine doppelte Freigabe, negative Zähler oder unbegrenzte Retention je Texturtyp.
3. Die bisherige „ältester aktiver Partikel“-Policy einschließlich Gleichstand muss erhalten oder als gesonderte visuelle Änderung begründet werden. Eine optimierte Altersstruktur braucht Tests für unterschiedlich alte Spawns; eine beliebige Freiliste ersetzt diese Policy nicht.
4. Sprite-Backend zuerst beibehalten. Erst Messungen von CPU-Framezeit, Draw Calls, GPU-Zeit und Speicher rechtfertigen Instancing/Batches. Transparenz, Sortierung, Blending, Culling und unabhängige Farben/Alpha sind Abnahmekriterien.

Keine neue Qualitätsreduktion als versteckter Performance-Fix. Ein späteres Budget-/LOD-System benötigt eine eigene Produktentscheidung.

## 9. Sicherheits- und Betriebsgrenzen

- Admin-Guard bleibt vor Admin-Body-Parsing und auf dem gesamten `/api/admin`-Namespace. Fehlendes Token deaktiviert Zugriff; localhost/Proxy-Header sind keine Anmeldung.
- Origin-Prüfung bleibt an HTTP-, Colyseus-Matchmaking- und WebSocket-Grenzen. CORS/Origin-Prüfung ersetzt keine Spieler-Authentifizierung.
- Server-Tokens, interne Spieler-Schlüssel und Speicherpfade gelangen weder ins Client-Bundle noch in öffentliche DTOs. Das öffentliche Leaderboard behält seine explizite Feldprojektion.
- Clientseitige Debug-Sichtbarkeit ist keine Berechtigung; serverseitige Produktionsprüfung bleibt bestehen.
- `playerToken` ist heute ein clientgewählter Wiedererkennungsschlüssel, kein nachgewiesenes Konto. Punkt 13 macht ihn nicht zu einer sicheren Identität.
- Datenpfade kommen ausschließlich aus Serverkonfiguration, nicht aus Commands. Schreibrechte/Backups und Live-Admin-Konfiguration bleiben Deployment-Aufgaben; dieses Dokument bestätigt keine VPS-Absicherung.

## 10. Definition of Done und Entscheidungsdisziplin

Für jede Extraktion gelten die Gates im [Refactoring-Plan](./REFACTORING-PLAN.md). Am Ende gibt es keine produktive Legacy-Delegation, keine Regelkopie in Alt-/Neumodul, keinen zyklischen Import und keinen I/O-Aufruf in der Simulation. Modulgröße ist ein Warnsignal, aber keine starre Zeilenzahlvorgabe: Ziel ist eine klar benennbare Verantwortung mit schmalen Verträgen.

Änderungen an Tick-Timing, Protokoll, Speicherdurabilität, Backend oder Partikelbild werden als eigene Entscheidung mit Anlass, Alternative, Auswirkung, Test und Rückweg ergänzt. Die langfristige Vision allein ist keine Freigabe für zusätzliche Features während des Refactorings.
