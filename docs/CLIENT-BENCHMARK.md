# Reproduzierbare Client-Messszene

Stand: 27.09.2026. **Vergleiche für Frame-Aufteilung und Partikelpool abgeschlossen.** Dieses Dokument trennt CPU-Replay, statische GPU-Probe, visuelle Kontrolle und Asset-Startup. Zwei-Client-/Lifecycle-Nachweise stehen im Arbeitsprotokoll. Messgrenzen und schwankende Desktop-Leistung sind keine Framerate-Garantie.

## Start und Isolation

Im Repository-Root:

```sh
npm run build:benchmark -w client
```

Anschließend im Verzeichnis `client`:

```sh
npx vite preview --config vite.benchmark.config.ts --host 127.0.0.1 --port 5175
```

`http://127.0.0.1:5175/benchmark.html` öffnen. Die Vorschau nutzt nur bereits installierte Vite-Abhängigkeiten. Browser-Viewport auf **1280 × 720** stellen, weitere Spieltabs schließen und dann „Run 3 warm repetitions“ wählen. Render-Pixelverhältnis ist unabhängig vom Display fest auf 1 gesetzt. Während der Messung nicht Fenstergröße, Tab-Sichtbarkeit, Build oder Assets wechseln; keine parallelen Tests/Builds starten.

Das Diagnose-Build liegt in `client/dist-benchmark` und ist ignoriert. Es ist ein eigener Einstieg; der normale `npm run build` enthält weder `benchmark.html` noch den Replay-/Messcode. Kein Matchmaking, kein Spielerkonto, kein Server, keine Admin-API und keine Ergebnisübertragung. Es werden nur lokale Spielassets geladen. Die Umgebung bekommt explizite Defaults ohne Lesen ihrer gespeicherten Einstellungen; Profil-Editor-Patches werden durch eine rein seitenlokale Profilvorgabe umgangen. Die bestehende Schiffsvisualisierung liest beim Aufbau noch den Hitbox-Debugwert; für den Replay bleibt dieses Overlay ausdrücklich ausgeblendet. Keine Einstellungen werden gespeichert oder gelöscht. Die normalen HUD-Styles werden als Text aus dem vorhandenen HTML übernommen, dessen Skript wird nicht ausgeführt.

## Fixiertes Szenario

- Kennung `client-combat-v1`, Seed 42; keine zufällige Live-Bot-Szene.
- 16 Schiffe (FAC/Zerstörer/Kreuzer), 12 laufende Raketen, synthetische Zustandsänderungen alle drei Frames (20 Hz bei 60-Hz-Replay).
- Feste Kreisbewegungen/Aim, Radarwechsel, beschädigte Schiffe und genau ein Tod/Respawn pro Schiff. Keine nachgebaute Schadenssimulation: Dies sind ausdrücklich Präsentations-Testdaten.
- Vier Artillerieschüsse alle zwölf Frames, Einschlag nach 36 Frames; regelmäßige Raketen-Impacts, Chaff und Abwehr-Startrauch. Bestehende Waffen-/Partikel-Rezepte, Schiffsrenderer, Remote-Interpolation, Frame-Runtime, Cockpit und Wake werden tatsächlich aufgerufen.
- Dieselbe Folgekamera und GameScene mit Wasser, Reflexion, Himmel und Inseln. Hull-/Mount-/Insel-Ladestatus und Umgebung werden im Ergebnis protokolliert. Vergleichsläufe müssen dieselben Assets/Fallbacks verwenden.
- Pro Wiederholung 300 Warm-up-Frames, danach 1800 Messframes. Drei Wiederholungen; zwischen ihnen werden Replay-eigene Schiffe, Waffen, Partikel und Wakes entsorgt, die Szene und warmen Asset-Caches bleiben erhalten.
- Wiederholungs-Tests mit echten Three.js-Objekten sichern 1980 Input-Ausgaben, 700 HUD-Updates und 16 Todesübergänge in 2100 Frames. Headless-FX-/Ressourcen-Checkpoints sind in `replay.test.ts` festgehalten, nicht automatisch zu aktualisieren.

Partikelrezepte besitzen für die Diagnose einen eigenen RNG und eine injizierte Uhr. Three.js-UUID-Erzeugung darf den Effekt-Seed nicht verschieben. Die übrigen bestehenden Zeitabfragen werden **nur während eines synchronen Replay-Schritts** über `fixtureClock` kontrolliert und in `finally` wiederhergestellt. Das ist ausschließlich Testcode, niemals ein globaler Override im Spiel. CPU-Zeitmessungen verwenden eine vorher gebundene echte Uhr.

## Messwerte und Interpretation

| Ausgabe | Bedeutung / Grenze |
| --- | --- |
| `intervalMs` | Tatsächlicher Abstand der Browser-rAF-Callbacks; p50, p95, Maximum und Anzahl >50 ms |
| `runtimeCpuMs` | Selbstzeit des Aufrufs der produktiven Frame-Runtime, einschließlich dort aufgerufener FX |
| `fxCpuMs` | Summe gemessener Ereignis-Rezepte, Geschoss-Sync/-Updates, Schadens-/Todes-FX und Partikel-Update; **überlappt** mit `runtimeCpuMs`, nicht addieren |
| `renderCpuMs` | CPU-Zeit des Renderaufrufs, einschließlich Reflexionsaufrufen; keine GPU-Zeit |
| `drawCalls`, `triangles` | Three.js-Zähler über den gesamten Renderaufruf; automatisches Zurücksetzen deaktiviert, einmal pro Frame explizit zurückgesetzt |
| `activeParticles`, `pooledParticles` | Bestehender Statistikvertrag: `pooled` bedeutet **inaktiv vorgehalten**, nicht Gesamtbestand. Angelegt = aktiv + pooled |
| `resources` | Einmal pro 60 Messframes: Geometrien, Texturen, Shaderprogramme, Szeneobjekte, optional Chromium-Heap-Wert |
| `afterReplayDispose` | Ressourcen nach Replay-Entsorgung, aber mit weiterhin warmer Szene/Asset-Caches; muss nicht null sein |
| `startupAssetLoadMs` | Renderer-/Szenenaufbau und Laden/Decodieren vor der ersten Wiederholung. Browser-Downloadcache nicht kontrolliert; **keine belastbare Cold-Download-Messung** |
| `gpuTimeMs` | Im animierten Replay weiterhin `null`; der getrennte `staticGpuProbe` misst ausschließlich die eingefrorene Vergleichsszene mit echten GPU-Timer-Queries |

Alle Sammelpuffer sind begrenzt. Berichte werden erst zwischen Wiederholungen ins DOM geschrieben; laufend entstehen keine JSON-Ausgaben pro Frame. Ressourcenabfragen/Instrumentierung verursachen dennoch Overhead. Verglichen werden identische Instrumentierung, Hardware, Browser, Build-Art, Viewport, Assets und Szene; mindestens drei Vorher-/Nachher-Läufe. Eine wiederholte Verschlechterung >10 % außerhalb der Streuung stoppt den Folgeschritt gemäß Umbauplan.

Ein Kontextverlust, Fehler, Tab-Verstecken oder Größenwechsel macht den Lauf ungültig. Ein abgebrochener Durchlauf wird nicht als vollständige Messung ausgegeben. Die Simulation schreitet je rAF um exakt 1/60 s voran, auch wenn der Browser langsamer rendert; gemeldete Frame-Abstände sind reale Zeit, die reproduzierte Effektfolge ist simulierte Zeit.

## Messgrenzen

- Netzwerk/Encoding, Eingabegeräte und tatsächliche Audioausgabe sind ausgeschlossen. Dafür bleibt der echte Zwei-Client-Test nötig.
- Die unabhängigen Luftabwehr-Animationen sind nicht Teil der animierten CPU-Messung. Die zusätzliche visuelle Vergleichsszene führt seit Punkt 14 den echten Abwehrpfad mit kontrollierter Uhr aus; Startrauch allein wäre kein Abwehr-Visualnachweis.
- Debug-Panels, Fire-Control-UI, Wracklisten und Main-Bootstrap-Kosten außerhalb der Frame-Runtime sind hier nicht vollständig erfasst. Der Frame-Vergleich ist keine Aussage über die komplette App- oder Serverkapazität.
- Headless-Canvas-Stubs testen Verhalten/Ressourcen, nicht Shader, Transparenz, Sortierung oder GPU. Die nachfolgenden Browser-Messreihen und Mehrwinkel-Prüfungen sind davon getrennte Nachweise.
- Minimalprobe am 27.09.2026: `canvas.getContext("webgl2")` lieferte `null`, bevor Renderer/Assets/Replay erstellt wurden. Das grenzt den **aktuellen** Fehler auf die verfügbare WebGL-Umgebung ein, erklärt aber nicht die ursprüngliche Ursache des vorangegangenen Kontextverlusts im Spiel.

Die folgenden Abschnitte protokollieren die Messreihen chronologisch. Historische offene Gates und Blocker beschreiben den jeweiligen Zwischenstand; den Gesamtstatus führt `REFACTORING-PROGRESS.md`.

## Baseline vor Frame-Aufteilung — 27.09.2026, abgeschlossen vor 04:55 UTC

In-App-Browser, Produktions-Diagnosebuild `main-B8KFdYzY.js`, 1280 × 720, DPR 1, Default-Umgebung. Alle drei Hull-, fünf Mount- und drei Insel-Assets geladen. Keine parallelen Tests/Builds oder Spieltabs. Drei Wiederholungen mit je 300 Warm-up- und 1800 Messframes:

| Messwert | Lauf 1 | Lauf 2 | Lauf 3 |
| --- | --- | --- | --- |
| Frameabstand p50 / p95 (ms) | 33.3 / 33.5 | 33.3 / 33.4 | 33.3 / 33.4 |
| Frames >50 ms | 13 | 13 | 7 |
| Runtime-CPU p50 / p95 (ms) | 0.5 / 0.9 | 0.5 / 0.9 | 0.5 / 0.9 |
| FX-CPU p50 / p95 (ms) | 0.5 / 1.8 | 0.5 / 1.8 | 0.5 / 1.8 |
| Render-CPU p50 / p95 (ms) | 24.4 / 29.8 | 24.4 / 28.4 | 24.5 / 28.6 |
| Draw Calls p50 / p95 | 2242 / 2265 | 2242 / 2265 | 2242 / 2265 |
| Dreiecke p50 / p95 | 196874 / 200740 | 196874 / 200740 | 196874 / 200740 |
| Heap nach Replay-Dispose (Bytes) | 48677930 | 45722946 | 43283738 |

In allen Wiederholungen: 1980 Inputs, 700 HUD-Updates, 16 Todesübergänge; aktive Partikel p50/p95/Maximum 954/959/960, inaktive vorgehaltene Partikel 622/630/638. Während der Messung 60 Geometrien, 18 Texturen und 16 Programme an beiden Randstichproben (Frame 300 und 2040). Nach jedem Replay-Dispose exakt 26 Szeneobjekte, 20 Geometrien, 15 Texturen und 6 Programme. Die warme Szene bleibt dabei absichtlich bestehen; das ist kein vollständiger App-Dispose-Nachweis. Heap-Schwankungen sind keine GC-bereinigte Leak-Messung.

Asset-Startup 360.8 ms bei unkontrolliertem Downloadcache; keine Cold-Start-Aussage. GPU-Zeit weiterhin nicht erhoben. Sichtprüfung zeigt Schiffe, Wasser, Waffen-/Schadenseffekte und Radar; kein vollständiger Mehrwinkel-Visualvergleich. Konsolenwarnungen betreffen die bereits bekannten GLB-Socket-Skalierungen (1.417); kein neuer Laufzeit-/WebGL-Fehler beobachtet. Der frühere WebGL-Blocker ist aktuell nicht reproduzierbar, seine ursprüngliche Ursache damit nicht geklärt.

### Erster Nachher-Versuch: nicht als Abnahme akzeptiert

Build `main-CHbnKDR3.js`, gleiche Fixture/Assets, In-App-Browser verborgen wie bei der ersten Baseline. Zwei vollständige Wiederholungen ergaben Frame p50/p95 jeweils 36/54 ms, Runtime-CPU 0.7/1.5 ms, FX-CPU 0.8/2.6 bzw. 0.8/2.7 ms und Render-CPU 36.0/48.4 bzw. 36.1/46.3 ms. 542 bzw. 532 Frames >50 ms. Draw Calls, Dreiecke, Effekt-/Verhaltenszähler und Ressourcen nach Dispose identisch zur Baseline. Beim Stop war die zweite Wiederholung bereits beendet; die dritte blieb unvollständig und wird nicht gewertet.

Damit ist die 10-%-Leitplanke deutlich überschritten, auch im unveränderten Renderpfad. Ursache noch nicht nachgewiesen: nicht pauschal dem Refactoring oder dem Browser zuschreiben. Vor 12.7 wird ein erneuter direkter Vergleich durchgeführt, nun mit sichtbar geöffnetem Browser und explizitem 1280×720-Viewport. Dafür wurde nur zum Bauen die gesicherte Vorher-Fassung von `frameRuntime` eingesetzt und sofort wieder der aktuelle Arbeitsstand hergestellt; das Alt-Build hat wieder exakt den Hash `main-B8KFdYzY.js`. Kein produktiver zweiter Algorithmus bleibt zurück.

### Direkter Kontrollvergleich mit sichtbarem Browser — 27.09.2026

Gleicher Produktionsbuild-Typ, Fixture, Assets, Umgebung, DPR 1 und expliziter Viewport 1280×720. Erst drei Läufe des exakt reproduzierten alten Bundles `main-B8KFdYzY.js`, danach drei der Aufteilung `main-CHbnKDR3.js`. Zwischen den Reihen eigener Tab geschlossen und Vergleichsbuild erstellt; während der Messungen keine parallelen Spieltabs, Builds oder Tests. Browser-Sichtbarkeit in beiden Reihen gleich. Temporärer Viewport anschließend zurückgesetzt.

| Variante / Lauf | Frame p50 / p95 ms | Runtime p50 / p95 ms | FX p50 / p95 ms | Render-CPU p50 / p95 ms | Frames >50 ms |
| --- | --- | --- | --- | --- | --- |
| Alt 1 | 52.5 / 54.1 | 0.8 / 1.8 | 0.9 / 3.0 | 40.9 / 48.6 | 905 |
| Alt 2 | 53.0 / 54.1 | 0.8 / 1.7 | 1.1 / 2.9 | 41.4 / 50.1 | 947 |
| Alt 3 | 53.4 / 55.0 | 0.8 / 1.8 | 1.1 / 3.4 | 44.3 / 53.1 | 1157 |
| Neu 1 | 36.1 / 54.1 | 0.8 / 1.8 | 1.0 / 2.9 | 40.4 / 47.2 | 824 |
| Neu 2 | 36.1 / 54.1 | 0.8 / 1.8 | 1.0 / 3.1 | 41.0 / 47.8 | 876 |
| Neu 3 | 52.7 / 54.1 | 0.8 / 1.8 | 1.1 / 3.2 | 41.1 / 48.2 | 921 |

Alle sechs Läufe: 1800 Messframes, dieselben 1980 Inputs/700 HUD-Updates/16 Todesübergänge sowie exakt gleiche Draw-/Dreiecks-/Partikelquantile wie die erste Baseline. Randstichproben erneut 60 Geometrien/18 Texturen/16 Programme; nach jedem Replay-Dispose 26 Szeneobjekte/20 Geometrien/15 Texturen/6 Programme. Heap nach Dispose alt 68692950/58567899/67163354 Bytes, neu 57934490/68574591/65703025 Bytes; schwankend, keine GC-bereinigte Leak-Garantie. Keine Browser-Errors oder WebGL-Kontextverluste in beiden Reihen. Cache-unbestimmter Asset-Startup alt 329.4 ms, neu 329.6 ms.

**Ergebnis für 12.6:** keine wiederholte Verschlechterung über 10 % außerhalb der beobachteten Streuung im direkten Vergleich. Der alte Code wird unter den späteren Bedingungen selbst deutlich langsamer als in der ersten Reihe; die frühere Differenz ist daher kein belastbarer Nachweis einer Refactoring-Regression. Die genaue Ursache der geänderten Desktop-/Browserleistung bleibt unbekannt. Auch die niedrigeren neuen Frame-Mediane sind wegen der Streuung und diskreten Frameabstände kein Speedup-Versprechen. Das lokale Performance-Gate für die Frame-Extraktion ist bestanden; die übrigen Gates wurden anschließend separat bearbeitet (Arbeitsprotokoll und Punkt 14 unten).

## Partikel-Pool — Punkt 14, 27.09.2026

Gleicher In-App-Browser, Hintergrundfenster, 1280×720, DPR 1, Seed 42 und vollständig geladene Assets. Keine parallelen Test-/Build-Prozesse während der Messungen. Die erste Nachher-Reihe war im Renderpfad langsamer; deshalb nicht allein als Abnahme verwendet. Für den unmittelbaren Kontrollvergleich wurde ausschließlich `fxSystem` vorübergehend zum Bauen auf die gesicherte Vorher-Fassung zurückgesetzt und unmittelbar wiederhergestellt. Kein alter produktiver Pfad bleibt im Repository.

| Reihe / Lauf | Frame p50/p95 ms | Runtime p50/p95 ms | FX p50/p95 ms | Render-CPU p50/p95 ms | Frames >50 ms |
| --- | --- | --- | --- | --- | --- |
| Baseline alt 1 | 33.3/33.5 | 0.5/1.0 | 0.4/1.7 | 25.6/29.5 | 19 |
| Baseline alt 2 | 33.3/33.4 | 0.5/0.9 | 0.5/1.7 | 25.8/29.3 | 0 |
| Baseline alt 3 | 33.3/33.4 | 0.5/0.9 | 0.5/1.8 | 26.0/29.5 | 1 |
| Erster Versuch neu 1 | 33.4/50.1 | 0.5/1.3 | 0.7/1.7 | 34.7/42.2 | 210 |
| Erster Versuch neu 2 | 33.4/50.1 | 0.5/1.3 | 0.8/1.8 | 36.3/46.6 | 304 |
| Erster Versuch neu 3 | 33.4/50.1 | 0.5/1.2 | 0.8/1.7 | 36.5/44.6 | 260 |
| Kontrolle alt 1 | 33.3/50.0 | 0.6/1.5 | 0.8/2.3 | 28.1/36.3 | 48 |
| Kontrolle alt 2 | 33.3/50.0 | 0.6/1.4 | 0.9/2.6 | 29.2/36.8 | 58 |
| Kontrolle alt 3 | 33.3/50.0 | 0.6/1.5 | 0.9/2.5 | 29.1/36.8 | 73 |
| Kontrolle neu 1 | 33.3/33.5 | 0.3/0.8 | 0.5/1.2 | 26.1/31.0 | 13 |
| Kontrolle neu 2 | 33.3/33.5 | 0.3/0.8 | 0.5/1.2 | 26.5/31.8 | 14 |
| Kontrolle neu 3 | 33.5/66.5 | 0.5/1.3 | 0.8/1.8 | 37.4/50.7 | 335 |

Bundle-Referenzen: erste Baseline `main-BskbHCIl.js`, erster Nachher-Versuch `main-CXqB6khH.js`, alte Kontrolle `main-CGAzG0om.js`. Ergänzte Diagnosefelder/Buttons verändern den Messcode der drei CPU-Replays nicht; die statische Szene wird dabei nicht aufgebaut.

Neue Kontrolle: `main-BzDRBwQw.js`, mit getrennter GPU-Probe (während der Replay-Messungen inaktiv). Zwei Wiederholungen liegen wieder nahe der ursprünglichen Render-Baseline, die dritte steigt innerhalb desselben Builds stark an. FX-p95 bleibt in allen drei neuen Kontrollläufen unter der unmittelbar vorherigen alten Kontrolle. Keine wiederholte >10-%-Verschlechterung außerhalb der beobachteten Streuung nachgewiesen; lokales Pool-Performance-Gate bestanden. Die Ursache der erheblichen Desktop-/Browser-Renderstreuung ist nicht bewiesen. Keine pauschale FPS-Verbesserung oder stabile Framerate zugesagt.

Auch die letzte Kontrolle behält sämtliche Zähler und Dispose-Ressourcen; Heap danach 42.01/74.58/26.16 MB. Das unterschiedliche Heap-Niveau folgt keiner monotonen Kurve und wird nicht als präziser Speichergewinn interpretiert.

In diesen Reihen bleiben Verhalten, Draw Calls, Dreiecke und Partikelquantile exakt gleich: 1980 Inputs/700 HUD-Updates/16 Todesübergänge, Draw p50/p95/max 2242/2265/2272, Dreiecke 196874/200740/200964, aktive Partikel 954/959/960, inaktive 622/630/638. Randstichproben 60 Geometrien/18 Texturen/16 Programme, nach Dispose immer 26 Szeneobjekte/20 Geometrien/15 Texturen/6 Programme. Heap nach Dispose: Baseline 46.35/51.97/54.93 MB, erster neuer Lauf 56.79/37.10/59.52 MB, alte Kontrolle 63.56/46.11/81.97 MB. Keine GC-bereinigte Heap-Konstanz behauptet.

### Isolierter CPU-Nachweis

`node --conditions=bfa-source --import tsx scripts/benchmark-client-cpu.mjs` verwendet denselben produktiven Replay, aber ausdrücklich prozedurale Fallbacks ohne Browser/GPU. Drei Läufe des neuen Pools, danach drei der gesicherten alten Variante, ohne parallel geöffnete Spieltabs:

| Variante | FX p50 (ms), drei Läufe | FX p95 (ms), drei Läufe |
| --- | --- | --- |
| Alt | 0.224 / 0.210 / 0.241 | 1.277 / 1.163 / 1.416 |
| Neu | 0.199 / 0.185 / 0.164 | 0.822 / 0.788 / 0.610 |

Der Pool-CPU-Pfad ist in diesem Szenario messbar günstiger. Das ist kein FPS- oder GPU-Versprechen und keine Aussage über Mobilgeräte.

### Visuelle und GPU-Diagnose

„Visual: follow / port / overhead“ friert Replay-Frame 360 ein und ergänzt den echten Abwehrpfad (SAM/PD/CIWS/Treffer) mit eigener kontrollierter Uhr. Alt/Neu aus allen drei Winkeln im Browser geprüft: keine sichtbare Änderung an Rauch, Explosion, Abwehr, Transparenz oder Sortierung. Die Bilder sind nicht byteidentisch; keine behauptete Pixelgleichheit. Unabhängig davon sichert der unveränderte 900-Frame-Charakterisierungs-Hash Partikelidentität, Transform, Materialwerte und Renderflags.

„Measure static GPU frame“ misst ausschließlich die eingefrorene Folgekameraszene über `EXT_disjoint_timer_query_webgl2`, 60 Warm-up- plus 120 Messframes. Queries laufen niemals während der CPU-Replays. Fehlende Extension, Disjoint, Kontextverlust, Abbruch oder Deadline werden ausdrücklich angezeigt statt als Nullzeit gewertet; Queries und rAF werden entsorgt. Diese Probe ist keine GPU-Messung des gesamten animierten Gefechts.

GPU-p50/p95: alter Pool 15.88/19.21 ms (eine Probe); neuer Pool 16.16/28.12, 15.39/18.03, 15.28/18.41 ms (drei Proben). Der erste neue p95-Ausreißer wiederholt sich nicht. Zu wenig alte Wiederholungen für eine belastbare GPU-Speedup-Aussage; der Nachweis ist tatsächliche GPU-Messbarkeit und kein behaupteter GPU-Gewinn. Weitere Alt-Proben wurden nach parallel geänderten Gepard-Assets verworfen, weil sie nicht mehr dasselbe Bild messen. Die oben abgeschlossenen CPU-Reihen verwendeten weiterhin ihre unveränderten geladenen Bundles/Assets.

### Kalt-/Warm-Asset-Startup am integrierten Gepard-Stand

Separater frischer Origin `127.0.0.1:5186`, Build `main-D0TifKCd.js`: Kaltstart 373.7 ms, 16,947,453 Byte Asset-Transfer über 14 Ressourcen. Nach Reload mit HTTP-Cache: 394.0 ms und nur 4,200 Byte Transfer (je 300 Byte Revalidierung, keine Asset-Bodies). Alle Hull-/Mount-/Insel-Assets in beiden Fällen geladen. Drei Hulls, jetzt sieben Mount-Assets und drei Inseln plus Wassertextur; die Diagnose berücksichtigt die hullspezifische Modellzuordnung.

„Kalt“ bedeutet hier nachgewiesenen vollständigen HTTP-Transfer auf einem vorher unbenutzten lokalen Origin, nicht kalten OS-Dateicache, langsames Internet oder frisches Endgerät. Szenenaufbau/Decodierung bleiben auch beim Reload erforderlich, daher kein versprochener Warmstart-Speedup. Das ist eine getrennte Startup-Stichprobe mit inzwischen geändertem Content, kein Partikel-Vorher-/Nachhervergleich. Die später parallel angepasste rein visuelle Rumpfskalierung/Wake-Position ist damit nicht zeitlich neu vermessen.
