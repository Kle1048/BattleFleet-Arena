# Gepard-Klasse / Typ 143A – P6122 „Puma"

## Modellpipeline V2 – aktueller Integrationsstand

Die folgenden Modellierungs-/Renderberichte beschreiben die frühere Asset-Abnahme.
**Für Export und Spielanbindung gilt jetzt ausschließlich [Modellpipeline V2](../../../docs/MODEL-PIPELINE-V2.md).**
Die frühere Normierung auf 10.000, inverse Waffen-Skalierung, räumliche Profil-Overrides,
hull-spezifische `visual_*`-Aliases und manuell gepflegte Socket-Registries sind nicht mehr aktiv.

Das `fac`-Loadout trennt `weaponId` von `modelId`. Alle Montagepositionen,
Grundorientierungen und Effektmarker stammen aus den GLBs. Autorengröße 57,6 m →
Spielgröße 60,016 m wird nur beim Export umgerechnet; Renderer und Server verwenden Meter.
Der Generator veröffentlicht über `scripts/blender/canonical_publish.py` und erzeugt
danach gemeinsame Metadaten. Die alten Profil-/Socket-Entwürfe hier wurden entfernt;
historische Sicherungen unter `backup/` bleiben erhalten und sind keine Eingabe.

Aktuelle Assetprüfung: `node --conditions=bfa-source --import tsx scripts/blender/verify_gepard.ts`.
Richtung/Material/Isolation: `npm test`. Blender-Import/Mündungsabgleich:
`scripts/blender/test_canonical_pipeline.py`. `runtime-validation.json` beschreibt
nur seine tatsächlich ausgeführten Assetprüfungen; alte Render-/Bakeberichte gelten
nicht als V2-Neuabnahme. Die aktiven gespeicherten `.blend`-Szenen sind inzwischen
auf V2-Marker/Export-Tags migriert. Aus dem gespeicherten Bake-Checkpoint wurde ein
echter Neuexport mit `scripts/blender/publish_scene.py` geprüft (siehe V2-Nachweise).

Texturiertes Low-Poly-Spielmodell nach den vier vom Nutzer bereitgestellten Referenzen. Seiten- und Draufsicht des Linienrisses wurden berücksichtigt, die Unterdeckanordnung ausdrücklich nicht. Drei Modellierungsdurchgänge korrigierten Rumpfunterseite, Turmhöhe, Radom, Mast-Ausleger und den schmalen achteren Deckshausübergang.

## Ergebnis

- `gepard_p6122.blend`: eigenständige Blender-Szene, vorherige F124-Szene bleibt geöffnet/erhalten.
- Komplettes Schiff inklusive Geschütz, RAM und vier Exocet-Containern: **8.398 Dreiecke**, fünf Mesh-Batches im zusammengesetzten GLB-Modell. Keine Unterdeckräume. Präsentationskamera, Wasser und Licht zählen nicht zum Schiff und werden nicht exportiert.
- Rumpf 5.390; Geschütz 388; RAM 748; zwei Exocet-Doppelstarter je 936 Dreiecke.
- Zwölf gepackte PBR-Texturen: Base Color, Roughness und Tangent-Normalmap pro Rumpf/Geschütz/RAM/Exocet-Modell. Rumpf 4096², Waffen je 1024². Keine Fotos in die Textur eingebrannt.
- Radom und Turm mit geglätteten Rundungen; klare, reduzierte Details für Spielentfernung. Kein maßhaltiger Fertigungsplan.
- Geschütz/RAM bleiben getrennte Waffenmodelle mit `bf_muzzle`; Rumpf enthält `SOCKET_main_fwd`, `SOCKET_ciws_aft` und beide `RAIL_…`-Marker.

## Verwitterung analog F124

40 % Mischung mit dem vorhandenen F124-Verwitterungsatlas, matte Oberflächenvariation, feine Mikrostruktur und dezenter Salzschleier über dem Wasserpass. Zwölf asymmetrisch platzierte Rostläufe unter Deckbeschlägen/Abläufen verwenden dasselbe vorhandene F124-Rostmotiv (55 % maximale Deckkraft). Die Quellbilder wurden unverändert wiederverwendet; das Ergebnis wurde in Blender auf individuelle, nicht überlappende UVs gebacken. Keine zusätzlichen Decal-Flächen, kein Polygonzuwachs.

Alle Effekte sind in den Runtime-GLBs eingebettet, nicht nur als Blender-Nodes vorhanden. `gepard_weathering_detail.png` zeigt die Nahansicht. Der vorherige saubere Stand liegt in `backup/pre-weathering/`. Der erste interaktive Backversuch war fehlgeschlagen; der korrigierte, in vier Etappen durchgeführte Backvorgang und die anschließenden Exportprüfungen sind erfolgreich abgeschlossen.

## Historische Spielanbindung (V1, nicht mehr aktiv)

Das vorhandene autoritative `fac`-Profil lädt jetzt `hullGltfId: gepard`. Der bisherige Editor-Alias `s143a` verweist ebenfalls auf das neue Modell. Die alten Dateien `S143A.glb` und `hull_fac.glb` wurden nicht überschrieben; das vorherige FAC-Profil und die Socket-Registry liegen in `backup/`.

Dateien unter `client/public/assets`:

- `ships/hull_gepard.glb`
- `systems/mount_gepard_artillery.glb`
- `systems/mount_gepard_pdms.glb`
- `systems/mount_gepard_exocet.glb`

Die spielrelevanten IDs bleiben `visual_artillery`, `visual_pdms` und `visual_ssm`. Nur die Auswahl der sichtbaren Modelle ist hull-spezifisch. Deshalb bleiben RAM-PD-Abwehr, Feuersektoren, Magazine, Bewegung und Kollisionsbox unverändert. Die Sockelpositionen wurden passend zum Modell korrigiert; +Z ist jetzt konsistent Bug. Nichtstandardmäßige Workbench-Loadouts verwenden weiterhin ihre allgemeinen Waffenmodelle.

Der Renderer normiert Rümpfe auf 10.000 Einheiten. Der bisherige FAC-Wert `hullVisualScale=0.00968` bleibt erhalten: Zusammen mit dem zusätzlichen Klassenfaktor `hullScale=0.62` ergibt das weiterhin 60,016 Spieleinheiten Länge. Die Kollisionsbox bleibt 60 Einheiten lang. Die Blender-Quelldatei ist dagegen metrisch 57,6 m lang. Y-Offset -338,5416667 kompensiert die Vorbereitung der Kielunterkante bei -1,95 m. `wakeSpawnLocalZ=-18.4` ist ein Delta zum lokalen Hitbox-Heck und setzt den Ursprung nach Anwendung des Klassenfaktors an das gerenderte Heck (-30,008). Waffenexporte kompensieren zusätzlich die bestehende inverse Mount-Skalierung und den Faktor 100 für Standard-Geschütz/PDMS. Metrische Waffen-GLBs liegen separat in diesem Verzeichnis.

Shared wurde neu gebaut. Bereits laufende Server müssen neu gestartet werden, um ein zuvor geladenes Profil zu ersetzen. Ein Browser-Neuladen lädt den neuen Client-Stand. Ein vollständiger Multiplayer-Match wurde hier nicht gestartet.

## Prüfung

- Draufsicht-Korrektur: vollerer Bug mit zusätzlichen Rumpfstationen bei unveränderter Deckshöhenkurve; rechteckige, überstehende Brücken-Dachplatte entfernt. Die geschlossene, abgeschrägte Oberseite des Brückenhauses bleibt erhalten. Vorheriger Stand in `backup/topview-v1/`; geometrische Prüfung in `topview-revision-validation.json`.
- `runtime-validation.json`: echte Three.js-Spielvorbereitung und Waffenmontage, Maße, Texturen, UVs, Socket-Positionen, neutrale Waffenorientierung, Rollen und Dreiecksbudget.
- `weathering-export-validation.json`: Dreiecksflächen aller vier GLBs gegen den gesicherten sauberen Stand verglichen; Geometrie unverändert. Je drei PBR-Bilder eingebettet und korrekt angeschlossen.
- `weathering-validation.json`: Backauflösungen, zwölf Rostbereiche und unveränderte Dreieckszahlen. `saved-scene-validation.json`: zwölf gepackte Texturen und 8.398 Dreiecke in der eigenständigen gespeicherten Szene.
- `roundtrip-validation.json` / `gepard_glb_roundtrip.png`: exportierte Runtime-GLBs in Blender wieder eingelesen und gerendert.
- 38 Shared-Testdateien bestanden; Client- und Shared-Typecheck bestanden; Waffenmodell-Resolver und Ship-Renderer-Test bestanden.
- `reference-comparison.html`: transparente Renderansichten über dem ungefähren, an Länge/Position ausgerichteten Linienriss. Keine behauptete pixelgenaue Übereinstimmung und keine automatische Silhouette-IoU-Messung.

## Quellen / Reproduktion

Form und Anordnung: Nutzerdateien `Albatros_class_fast_attack_craft.gif` (enthält gezeichneten RAM/P6121 trotz Dateiname), `P6122.jpg`, `Schnellboot_Gepard-Klasse_Typ_143_A.jpg`, `Hafengeburtstag_2015_P_6122.jpg`. Für P6122-Identität und Details wurden die Fotos priorisiert. Referenzbilder sind Arbeitsreferenzen und keine als frei lizenziert behaupteten Produkttexturen.

Hauptmaße 57,6 × 7,8 m wurden zusätzlich mit dem [Förderverein Museums-Schnellboot](https://www.foerderverein-museums-schnellboot.de/s-boote/bundes-dt-marine/bootsklassen/klasse143.htm) abgeglichen (gemeinsamer Rumpf der Klassen 143/143A). Keine aktuellen Flotten-/Dienstzeitangaben übernommen.

Erstellung: `scripts/blender/create_gepard_asset.py` via `run_blender_mcp.py`. Render: `render_gepard.py`. Exportprüfung: `node --conditions=bfa-source --import tsx scripts/blender/verify_gepard.ts`. Der Generator veröffentlicht kanonische Modelle und erzeugte Metadaten; nicht-räumliche Spielregeln bleiben separat.

Texturierte Verwitterungsvariante: `create_gepard_weathered.py`. Für den geprüften etappenweisen MCP-Ablauf `gepard_weathering_stage.py` jeweils mit `WEATHER_STAGE` = `init`, `artillery`, `pdms`, `exocet`, `hull`, `finalize` ausführen. Jede Etappe schreibt einen Checkpoint; die Runtime-Exporte werden erst nach allen vier erfolgreichen Material-Backvorgängen ersetzt. Danach `render_gepard.py`, `render_gepard_weathering_detail.py`, `reimport_gepard_qa.py` und `finalize_gepard_scene.py`; zusätzlich `node scripts/blender/verify_gepard_weathering.mjs`.
