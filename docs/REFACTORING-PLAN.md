# Umbauplan — Review-Punkte 12, 13 und 14

Stand: 26.09.2026. **Alle nachfolgenden Schritte sind geplant, noch nicht durchgeführt.**

Verbindliche technische Leitplanken: [Zielarchitektur](./TARGET-ARCHITECTURE.md). Die Nummern beziehen sich auf das Code-Review, nicht auf die älteren MVP-Tasks im `Project_Plan.md`.

## 1. Reihenfolge und Umfang

| Schritt | Änderung / Lieferergebnis | Voraussetzung und besondere Abnahme |
| --- | --- | --- |
| 12.0 | Verhalten charakterisieren, Zeit-/Zufalls-Seams und Baselines sichern | Noch keine fachliche Extraktion; Fixture-Matrix unten abdecken |
| 12.1 | Reine Shared-Importpfade, interne Command-/Event-Typen und Importgrenzen-Test | Bestehende Root-Exports/Wire-Nachrichten bleiben kompatibel |
| 12.2 | Teilnehmer-Lifecycle/Indizes und danach Bot-Verwaltung aus `BattleRoom` lösen | Join/Leave/Bot/Reset-Invarianten; Client-Map bleibt im Transport |
| 12.3a | Match, Life und Progression schrittweise extrahieren | Tod/Respawn/Kill/Level/Magazin-Reset identisch; temporäre State-Sichten explizit |
| 12.3b | Bewegung/Kollision, danach Waffen/Geschosse/Abwehr extrahieren | Jede Gruppe einzeln; Tick- und Event-Reihenfolge unverändert |
| 12.4 | Autorität auf eigenen SimulationState umstellen, SchemaPublisher fertigstellen | Kein Schema-/Room-/I/O-Import im Kern; keine zwei Schreiber; Legacy entfernen |
| 12.5 | Client-Netzwerkadapter und Read Model von Presentern trennen | Wire-Vertrag stabil; Interpolations-History und Ereigniszuordnung gesichert |
| 12.6 | `frameRuntime` in Input/World/Cockpit/Audio-FX-Phasen zerlegen | Bestehende Cadence, Reihenfolge und Hotpath-Optimierungen bleiben |
| 12.7 | `main` auf App-/Session-Verdrahtung reduzieren, Shutdown vervollständigen | Join–Leave–Rejoin ohne Listener-/Ressourcenwachstum; lazy Debug bleibt lazy |
| 13.1 | Repository-Ports, Config-/MatchResult-Service und Fehlerverträge | Match-Ergebnis-DTO von Live-State getrennt; keine API-Erfolge bei Schreibfehlern |
| 13.2 | Serialisierte asynchrone JSON-Commits, persistente Deduplizierung, Migration | Race-/Fehler-/Recovery-Tests; vorhandene Daten bleiben erhalten |
| 13.3 | Queue-/Commit-Diagnostik, Flush/Shutdown, Backup-/Restore-Nachweis | Durability und Verlustfenster dokumentiert; Backendentscheidung festhalten |
| 14.1 | Pool/Emitter/Backend-Grenzen, Freilisten, aktive Indizes/Zähler | Bestehende FX-API/Budgets; Pool-Invarianten und Vorher-/Nachher-Messung |
| 14.2 | Nur bei nachgewiesenem Bedarf: gebatchtes/instanziertes Backend | Eigene Freigabe anhand Messung und visueller Vergleichsszenen |

Die Reihenfolge ist **12 → 13 → 14**, innerhalb von 12 zuerst Server, dann Client. 14.2 ist optional und kein Vorwand, das gesamte Render-System umzubauen. SQLite/PostgreSQL sind ebenfalls kein automatischer Bestandteil von Punkt 13.

Jede Tabellenzeile ist ein separat prüfbarer Änderungssatz; 12.3a/b werden bei Bedarf weiter aufgeteilt. Keine gleichzeitige Paketmigration, Balancingänderung oder neue Spielfunktion. Bereits extrahierte Module werden nicht nur wegen schönerer Pfade erneut verschoben.

## 2. Charakterisierung vor der Extraktion (12.0)

Bestehende Tests sind der Anfang, nicht allein der Beweis. Fixtures zeichnen relevante Zustände **und** Events mit Empfänger, Reihenfolge und Payload auf. Kontrollierte Zeit/Zufall müssen auch Join/Respawn/Feuern/Bot-IDs abdecken, nicht nur den Tick. Produktionsdefaults bleiben unverändert.

| Szenario | Zu sichernde Invarianten |
| --- | --- |
| Mensch und Bot joinen/verlassen | IDs/Indizes konsistent; Bots ohne Client; Entfernen räumt eigene Geschosse/Kontakte auf |
| Rundenwechsel | Schema-Identität bestehender Spieler, Magazine, Cooldowns, Wracks und Zähler korrekt zurückgesetzt |
| Input zwischen zwei Ticks | Unmittelbare Feuerprüfung wie bisher; keine neue Tick-Queue oder zusätzliche Latenz |
| Tod und Respawn | Genau ein Tod/Kill, Schutz, Spawn-Auswahl, Wartezeit, OOB und Wrack-Lifecycle |
| Fortschritt | Passive XP/Kill-XP, Klassenwechsel, HP und Movement-Cache-Invalidierung |
| Kampf | Artillerie, ASuM, Magazin/Reload, Abwehr/Softkill und vorhandener Torpedo-/Minenpfad |
| Kollision | Insel, Schiff, Wrack; Kontaktwechsel; Schaden vor/nach Korrekturen wie bisher |
| Match-Ende und Admin-Neustart | Abschluss einmal; unterbrochene Runde nicht versehentlich zählen; Reset während laufender Session |
| Client | Input vs. HUD-Cadence, Remote-Interpolation, Radar, Tod/Respawn, Event-FX und Match-End-Anzeige |

Zahlenvergleiche mit fachlich begründeter Toleranz nur für Fließkommawerte; Reihenfolge, IDs, Phasen und Zähler exakt. Kein Update der erwarteten Werte, nur weil der neue Code andere Ergebnisse liefert. Entdeckte bestehende Bugs separat benennen und bewusst beheben, nicht im Extraktionsdiff verstecken.

## 3. Gates für jeden Änderungssatz

### Vorher

- Betroffene Verantwortung, Besitzer und erlaubte Imports aus der Zielarchitektur nennen.
- Bestehende Arbeitsänderungen sichern bzw. zuordnen; fremde Asset-/Feature-Arbeit nicht einbeziehen.
- Relevante Regressionen und repräsentative Messung auf dem aktuellen Stand ausführen; Fehler vor der Änderung getrennt dokumentieren.

### Nachher

- Zieltests, `npm test`, `npm run typecheck`, `npm run build` bestehen.
- Importgrenzen-Test prüft verbotene direkte und transitive Abhängigkeiten, sobald in 12.1 eingeführt. Temporäre Legacy-Ausnahmen einzeln benennen und spätestens 12.4 entfernen.
- Kein ungenutzter Altpfad, doppelter Algorithmus oder neuer Universal-Context; alte Aufrufer umgestellt und Adapteranzahl begrenzt.
- Beim Netzwerk-/Client-Umbau echter Zwei-Client-Smoke: Join, Bewegung, Feuer, Tod/Respawn, Match-Ende/Neustart, Leave/Rejoin, Debug an/aus. Browser-/Serverfehler prüfen.
- Bei Server-/Speichergrenzen Security-Regressionen erneut prüfen: Admin-Auth, HTTP/Matchmaking/WS-Origin, öffentliche Datenprojektion, Produktions-Debugschutz.
- Status im Abschlussprotokoll aktualisieren: Dateien/Verantwortung, Tests, Messungen, offene Risiken und nächste Stufe. Keine Fortschrittsmarkierung allein aufgrund neuer Ordner.

### Performance-Gate

Bestehenden Vergleich aus [CLIENT-SERVER-PERFORMANCE.md](./CLIENT-SERVER-PERFORMANCE.md) reproduzieren:

```sh
node --conditions=bfa-source --import tsx scripts/benchmark-ticks.mjs
```

Vorher/Nachher mit gleicher Hardware, Build-Art, Seed und Szenario, jeweils mindestens drei Durchläufe nach Warm-up. Median/p95 sowie Streuung dokumentieren. Wiederholte Verschlechterung von mehr als 10 % außerhalb der beobachteten Streuung stoppt die nächste Stufe bis zur Erklärung oder Korrektur; dies ist eine lokale Review-Leitplanke, kein universelles CI-Zeitlimit.

Der vorhandene synthetische Benchmark deckt weder echte Bot-/Netzwerklast noch den kompletten Geschoss-Lifecycle ab. Für 12.3/12.4 zusätzlich bewegte Spieler, Bots und längere Kämpfe messen. Physik-Selbstzeit ist nicht Event-Loop-Lag oder gesamte Serverlast. Die 20-Hz-Kadenz bietet 50 ms zwischen Ticks, aber nicht 50 ms frei verfügbares Physikbudget.

Client vor/nach 12.6/14 mit derselben reproduzierbaren Kampfszene und Kamera prüfen: Framezeit p50/p95, lange Frames, FX-CPU-Zeit, Draw Calls, Ressourcen/Heap-Verlauf und nach Möglichkeit GPU-Zeit. Warm-Asset- und Kaltstartmessung getrennt. Kein FPS-/GPU-Versprechen aus dem Serverbenchmark ableiten.

## 4. Besondere Abnahme für Speicherung

- Parallel eintreffende Config-Patches, Match-Ergebnisse und Reset haben eine dokumentierte Reihenfolge; kein verlorenes Update.
- Wiederholtes `recordMatch` mit derselben Match-ID zählt auch nach Neustart nicht doppelt. Unterschiedliche Rooms kollidieren nicht.
- Simulierter Schreib-/Rename-/Lesefehler, beschädigte Datei, unbekannte Dateiversion und unvollständige temporäre Datei führen zu sichtbarem Fehler bzw. definierter Recovery; kein stiller Datenverlust.
- HTTP wartet bei bestätigungspflichtigen Änderungen auf Commit. Timeout bedeutet nicht automatisch „nicht gespeichert“; Wiederholungen müssen revisions-/idempotenzsicher sein.
- Die Simulation wartet nicht auf I/O. Ein absichtlich langsamer Store verzögert nicht den Tick; Queue-Limit, Retry und Shutdown-Frist werden getestet.
- Bestehende Daten werden vor Formatmigration gesichert; Migration ist versioniert und an Kopien getestet. Restore auf vorherigen Stand praktisch nachweisen.
- Der Umgang mit noch ausstehenden Match-Ergebnissen beim Leaderboard-Reset ist vor Implementierung festzulegen: empfohlene Semantik ist Reihenfolge in derselben Queue; später eingereihte Ergebnisse zählen wieder. Eine andere Admin-Erwartung wäre eine eigene Entscheidung.

## 5. Besondere Abnahme für Partikel

- `active + free` entspricht dem angelegten Poolbestand; Zähler stimmen nach Spawn, Ablauf, Verdrängung und Dispose.
- Gemischte Texturtypen, Vollauslastung, gleich alte Partikel und lang laufende Szenen testen. Retention bleibt begrenzt.
- Freiliste und Aktiv-Zähler verbessern den CPU-Pfad, ohne Farben/Alpha verschiedener Partikel zu koppeln.
- Identische Effekt-Sequenz für Explosion, Rauch, Wake-nahe Effekte und Abwehr aus mehreren Kamerawinkeln vergleichen. Transparenz-/Sortierfehler sind Regressionen, auch wenn Draw Calls sinken.
- 14.2 nur durchführen, wenn nach 14.1 verbleibende Renderkosten den zusätzlichen Backend-Aufwand rechtfertigen. Andernfalls Punkt 14 mit Messnachweis nach 14.1 abschließen.

## 6. Rückweg und Abschluss

Code-Extraktionen bleiben einzeln rücknehmbar, ohne laufende Datenformate oder Wire-Verträge zu ändern. Während der Vorbereitung dürfen Kompatibilitätsadapter bestehen; kein dauerhafter zweiter Feature-Pfad hinter Flags. Persistenzmigrationen brauchen einen eigenen Backup-/Restore-Rückweg, weil ein Code-Revert Datenänderungen nicht rückgängig macht.

**Punkt 12 fertig:** Room und Bootstrap verdrahten statt Regeln/Präsentationsdetails zu enthalten; Simulation ist headless testbar; Presenter kennen kein Colyseus; Legacy-Ausnahmen weg; Lifecycle und Performance-Gates bestanden.

**Punkt 13 fertig:** geordnete nichtblockierende I/O, ehrliche Erfolgs-/Fehlerantworten, persistente Idempotenz, begrenzte Queue, Recovery/Restore getestet und tatsächliche Durability dokumentiert. Ein bestimmtes Datenbankprodukt ist kein Fertigstellungskriterium.

**Punkt 14 fertig:** Pool-Scans reduziert, Lebensdauer-/Speicherinvarianten getestet, visuelle Qualität erhalten und Nutzen gemessen; komplexeres Backend nur bei Bedarf.

**Nächster konkreter Arbeitsschritt: 12.0.** Zuerst fehlende Charakterisierungstests und die aktuelle Messbaseline ergänzen, dann 12.1/12.2 beginnen. Mit dieser Dokumentation werden noch keine Laufzeitmodule geändert.
