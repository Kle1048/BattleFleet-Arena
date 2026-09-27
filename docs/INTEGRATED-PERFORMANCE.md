# Integrierte Performance- und Stabilitätsmessung

Stand: 27.09.2026, aktueller Arbeitsstand nach Partikel-Instancing.
Keine Änderungen an Gameplay, Effekt-Culling oder Standardkamera.

## Messaufbau und Grenzen

Zwei getrennte Prüfungen statt vermischter Zeiten:

1. **Client:** Produktions-Diagnosebuild, echte Frame-Runtime, Schiffsmodelle,
   Partikel, HUD, Wake und Wasserreflexion, aber synthetische Gefechtsdaten.
2. **Live-Server:** tatsächlicher Produktionsserver mit WebSockets, Encoding,
   automatisierten Clients, echten Server-Bots, natürlichen Rundenenden und
   isolierter Persistenz. Kein Browser-Renderer in diesem Lauf.

Das ist somit **kein gleichzeitig vermessenes End-to-End-Browser-Match**.
Client-Replay-Wiederholungen sind ebenfalls keine serverseitigen Spielrunden.
Beide Prüfungen laufen nacheinander auf demselben Windows-Rechner, ohne parallele
Builds/Tests. Bestehende Spiel-/Admin-Tabs bleiben unberührt; der Spieltab steht
in der Namenseingabe. Keine Zielhardware-, Mobilgeräte- oder WAN-Latenzgarantie.

## Client: drei vollständige Replays

`npm run build:benchmark -w client`, anschließend lokaler Vite-Preview und
`/benchmark.html?islands=0`. Explizite Variante `client-combat-v1-open-water`;
der historische Benchmark mit Inseln bleibt ohne Parameter verfügbar.

Produktionsbundle `main-D8wnJ0LQ.js`, 1280×720, DPR 1, Standard-Folgekamera,
Standardumgebung inklusive 512er-Wasserreflexion, alle drei Rümpfe und elf
Waffenmodelle geladen. Keine Inselassets geladen. Seed 42, je 300 Warmup- und
1800 Messframes, bis zu 960 aktive Partikel.

| Messwert | Lauf 1 | Lauf 2 | Lauf 3 |
| --- | ---: | ---: | ---: |
| Frameabstand p50 / p95 (ms) | 17,6 / 18,1 | 17,6 / 18,1 | 17,6 / 18,1 |
| Frames >50 ms | 0 | 0 | 0 |
| Runtime-CPU p50 / p95 (ms) | 1,1 / 3,2 | 1,0 / 3,1 | 1,0 / 3,1 |
| FX-CPU p50 / p95 (ms) | 0,9 / 2,7 | 0,9 / 2,7 | 0,9 / 2,7 |
| Render-CPU p50 / p95 (ms) | 7,7 / 10,1 | 8,0 / 10,3 | 8,1 / 10,4 |
| Draw Calls p50 / p95 | 265 / 267 | 265 / 267 | 265 / 267 |
| Dreiecke p50 / p95 | 312.410 / 316.282 | 312.410 / 316.282 | 312.410 / 316.282 |

FX-CPU überlappt mit Runtime-CPU: nicht addieren. Render-CPU ist die Dauer des
Renderaufrufs einschließlich möglicher Treiberwartezeit, keine reine GPU-Zeit.
Das Rendering bleibt der größte gemessene Client-CPU-Block; die Messung trennt
noch nicht Schiffe, Schatten und Wasserreflexion innerhalb dieses Blocks.

Alle Wiederholungen: 660 Input-Ausgaben, 700 HUD-Updates, 16 Todesübergänge;
aktive Partikel p50/p95/max 954/959/960. Jeweils 59 Geometrien, 21 Texturen,
14 Programme und 693 Szeneobjekte in beiden Randstichproben. Nach Replay-Dispose
immer 18 Geometrien, 17 Texturen, 4 Programme und 10 Szeneobjekte (warme
Szene/Asset-Caches bleiben absichtlich erhalten).

Heap nach Dispose: 48,11 / 28,46 / 39,98 MB. Keine monotone Zunahme, aber ohne
kontrollierte GC kein präziser Leak-Nachweis. Keine Browserfehler oder
WebGL-Kontextverluste beobachtet. Startup 256,8 ms bei unkontrolliertem Cache;
keine Aussage über Kaltstart via Internet.

## Separate GPU-Proben

Eingefrorener Replay-Frame 360 mit echten Abwehreffekten, Standard-Folgekamera;
je 60 Warmup-Frames und 120 echte GPU-Timer-Queries. Nicht während des CPU-Replays.

| Lauf | GPU p50 | GPU p95 | Maximum |
| --- | ---: | ---: | ---: |
| 1 | 5,212 ms | 6,501 ms | 6,975 ms |
| 2 | 5,202 ms | 6,734 ms | 7,392 ms |
| 3 | 5,347 ms | 6,687 ms | 7,722 ms |

Keine Disjoint-/Kontextfehler. Die statische Szene bildet nicht jeden
GPU-Lastzustand eines animierten Matches ab. Die historischen Messungen mit
anderen Assets/Inseln sind **kein kontrollierter Vorher-/Nachher-Vergleich**.

## Reproduzierbarer Live-Test

Nach `npm run build`: `node scripts/benchmark-live.mjs`.
Der Test startet ausschließlich seinen eigenen Produktionsserver auf einem
freien Loopback-Port mit temporärem Datenverzeichnis, deaktiviertem Admin-Zugang
und drei 60-Sekunden-Runden. Elf echte Colyseus-Verbindungen werden von der
vorhandenen Bot-Steuerung gefahren; fünf zusätzliche Bots laufen serverseitig.
Ein Client verlässt nach Runde 1 den Raum und tritt erneut bei. Runden werden
über `playAgain` neu gestartet, nicht durch Zurücksetzen interner Zustände.
Das temporäre Ergebnisverzeichnis bleibt als Nachweis erhalten.

Der IPC-Diagnosekanal liest bestehende Tickmetriken, Speicher, CPU-Auslastung,
Event-Loop-Histogramm und Persistenzstatus. Er ist kein HTTP-Endpunkt und wird
nicht ins Produkt eingebaut. Erzwungene GC erfolgt ausschließlich zwischen
Runden und nach dem Verlassen, niemals innerhalb gemessener Runden.

### Live-Ergebnis

Der Test hat alle drei Runden erfolgreich abgeschlossen (Exit-Code 0), einschließlich
echtem Austritt/Rejoin, zwei `playAgain`-Neustarts und abschließendem Shutdown.
In jeder Runde stimmten die finalen Spielerzustände aller elf Clients exakt überein.
Produktivschutz aktiv, Inseln aus; Klassenwechsel entstanden durch normalen
Spielfortschritt, nicht durch aktivierte Debug-Kommandos.

| Messwert | Ergebnis |
| --- | ---: |
| Gesendete Inputs | 29.792 |
| Empfangene State-Updates, Referenzclient | 2.918 |
| Loopback-Ping p50 / p95 / max | 0,726 / 3,502 / 6,075 ms |
| Patch-Abstand p50 / p95 / max | 62,559 / 65,951 / 99,210 ms |
| Höchster Tick-p95 der 5-Sekunden-Stichproben | 2,845 ms |
| Höchste erfasste Tick-Selbstzeit | 4,790 ms |
| Server-CPU, Mittel / höchstes Stichprobenintervall | 6,78 % / 19,20 % eines Kerns |
| Höchster Event-Loop-p95, Auflösung 10 ms | 18,661 ms |
| Unerwartete Verbindungsabbrüche / Clientfehler | 0 / 0 |

Die Tickwerte sind bestehende rollierende 200-Sample-Fenster, **keine globale
Perzentilberechnung über sämtliche Ticks**. Sie umfassen Simulation und
Schema-Publikation im Tick, nicht separate Input-Handler oder Encoding.
CPU-/Event-Loop-Werte erfassen zusätzlich diese übrige Serverarbeit.
Ein Event-Loop-Histogramm mit 10-ms-Auflösung misst beobachtete Timerabstände;
18 ms bedeutet nicht automatisch einen zusätzlichen 18-ms-Stall.

Echte Kampfaktivität am Referenzclient: 583 Artilleriestarts, 577 Einschläge,
175 ASuM-Starts, 76 ASuM-Impacts, 71 Abwehr-Feuerereignisse und 16 Intercepts.
Kein bloßer Idle-Verbindungstest. Unterschiedliche RNG-Verläufe sind zu erwarten;
dieser Test ersetzt keinen deterministischen Golden-Trace.

| Speicher/Persistenz | Runde 1 | Runde 2 | Runde 3 |
| --- | ---: | ---: | ---: |
| Heap nach GC (MB, dezimal) | 16,409 | 16,615 | 16,729 |
| RSS (MB) | 92,844 | 109,613 | 109,838 |
| Bestätigte Ergebnis-Commits, kumulativ | 1 | 2 | 3 |

Nach dem letzten Leave: **0 aktive Räume**, Heap nach GC 16,391 MB, keine
offenen/fehlgeschlagenen Ergebnisjobs, keine Storage-Retries. RSS bleibt bei
rund 110 MB: reservierter Prozessspeicher wird nicht zwingend sofort an das OS
zurückgegeben. Die kleine Heap-Zunahme innerhalb der Runden ist für sich kein
Leak-Nachweis; ein Langzeittest ist weiterhin erforderlich.
JSON-Commits dauerten 3,99 / 9,44 / 6,64 ms. Der bekannte fehlende Directory-Fsync
unter Windows bleibt bestehen, also keine neue Stromausfallgarantie.

Vollständige Rohwerte: [integrated-live-result.json](integrated-live-result.json).
Testdaten liegen ausschließlich im dort genannten temporären Verzeichnis;
der bestehende Spielserver und seine Daten wurden nicht verändert.

### Kontrolltest zur abweichenden Update-Kadenz

Ein separater Node-Prozess ohne Spiel, Sockets oder Simulation wurde nach dem
Live-Test mit `setInterval(..., 50)` und 200 Samples vermessen:

- Timer-Abstand p50 **62,616 ms**, p95 **65,221 ms**, max **66,198 ms**.
- Event-Loop-p95 bei 10-ms-Probe: **16,597 ms**.

Damit reproduziert bereits der unbelastete Timer nahezu dieselbe langsamere
Kadenz wie das Live-Match. Das spricht für Scheduling/Timer-Verhalten dieser
lokalen Umgebung, nicht für eine durch 16 Teilnehmer überlastete Simulation.
Die genaue OS-/Host-Ursache wurde nicht ermittelt. Keine globalen Timer- oder
Energiespareinstellungen geändert. Vor einer Gameplay-Timer-Änderung auf der
tatsächlichen Server-Zielplattform erneut prüfen.

## Priorisierung nach der Messung

1. **Kein akuter Partikel- oder Einzelraum-Simulationsengpass nachgewiesen.**
   Kein Anlass, jetzt auf Verdacht Effekt-Culling, Kamera oder Kollisionslogik umzubauen.
2. **Nächster Leistungsnachweis:** geplante Mehrraumlast und längerer Lauf auf
   Zielhardware, einschließlich deren Timer-Kadenz. Vier erlaubte Räume sind
   weiterhin keine belegte Kapazitätszusage.
3. **Falls weitere Client-Optimierung nötig wird:** Render-CPU-Block nach
   Schiffen/Schatten/Reflexion aufteilen; zusätzlich hohe Auflösung/DPR messen.
   DPR 2 erzeugt viermal so viele Hauptbild-Pixel wie dieser DPR-1-Test.
4. **Testinfrastruktur:** veraltete Kampf-Referenz kontrolliert auf neue
   Modell-Metadaten migrieren. Siehe Befund unten.

Noch nicht belegt: gleichzeitig gerendertes Live-Browser-Match mit diesen elf
Verbindungen, längerer Soak, mehrere Räume, WAN/Paketverlust, Zielhardware,
Mobilgeräte und Crash-/Stromausfallfestigkeit. Keine Produktionsfreigabe daraus ableiten.

## Verifikation und Sicherheitsumfang

Produktions-Diagnosebuild inklusive Typecheck erfolgreich; drei vollständige
Browser-Replays, drei GPU-Proben, Live-Test mit Assertions und sauberem Shutdown
sowie unabhängiger Timer-Kontrolltest ausgeführt. Kein kompletter neuer
128-Dateien-Testlauf in diesem Messschritt, keine Gameplay-Codeänderung.
Die bekannte Vite-Chunkgrößenwarnung bleibt bestehen.

Security-inspector: keine kritischen oder mit hoher Sicherheit belegbaren
Sicherheitsbefunde im neuen Diagnoseumfang. Geprüft: Loopback-Bindung, getrennte
Daten, produktive Auth-/Origin-Konfiguration, IPC statt zusätzlicher öffentlicher
Diagnoserouten, keine Secrets im Bericht und keine Diagnoselogik im Spielbundle.
Die Browserprüfung nach Computer-Use-Skill ergänzt die Messwerte um Sicht- und
Konsolenprüfung. Kein Deployment-/Infrastruktur-Audit.

## Veraltete Referenz festgestellt

**Inzwischen behoben:** siehe [kontrollierte Migration](COMBAT-BASELINE-CANONICAL.md).
Der folgende Absatz dokumentiert den Befund vor dieser separaten Behebung.

`scripts/benchmark-combat.mjs` erwartet weiterhin
`shared/src/data/ships/mountSockets/fac.json`. Diese Datei wurde beim
Modellumbau entfernt. Seine alte Content-/Trace-Referenz ist für den aktuellen
Stand daher nicht ausführbar. Sie wurde hier weder überschrieben noch als
bestandener Test gewertet. Die Aktualisierung braucht eine ausdrücklich
geprüfte Referenz auf die neue Modell-Metadatenquelle, keinen stillen Golden-Reset.
