# Spruance-Klasse · USS Spruance DD-963

## Modellpipeline V2 – aktueller Integrationsstand

Die folgenden Modellierungs-/Renderberichte beschreiben die frühere Asset-Abnahme.
**Für Export und Spielanbindung gilt jetzt ausschließlich [Modellpipeline V2](../../../docs/MODEL-PIPELINE-V2.md).**
Die frühere Normierung auf 10.000, inverse Waffen-Skalierung, räumliche Profil-Overrides,
hull-spezifische `visual_*`-Aliases und manuell gepflegte Socket-Registries sind nicht mehr aktiv.

Das `destroyer`-Loadout trennt `weaponId` von `modelId`. Alle Montagepositionen,
Grundorientierungen und Effektmarker stammen aus den GLBs. Autorengröße 171,7 m →
Spielgröße 120 m wird nur beim Export umgerechnet; Renderer und Server verwenden Meter.
Der Generator veröffentlicht über `scripts/blender/canonical_publish.py` und erzeugt
danach gemeinsame Metadaten. Die alten Profil-/Socket-Entwürfe hier wurden entfernt;
historische Sicherungen unter `backup/` bleiben erhalten und sind keine Eingabe.

Aktuelle Assetprüfung: `node --conditions=bfa-source --import tsx scripts/blender/verify_spruance.ts`.
Richtung/Material/Isolation: `npm test`. Blender-Import/Mündungsabgleich:
`scripts/blender/test_canonical_pipeline.py`. `runtime-validation.json` beschreibt
nur seine tatsächlich ausgeführten Assetprüfungen; alte Render-/Bakeberichte gelten
nicht als V2-Neuabnahme. Die aktiven gespeicherten `.blend`-Szenen sind inzwischen
auf V2-Marker/Export-Tags migriert. Aus dem gespeicherten Bake-Checkpoint wurde ein
echter Neuexport mit `scripts/blender/publish_scene.py` geprüft (siehe V2-Nachweise).

Texturiertes Low-Poly-Außenmodell nach den vier Nutzerreferenzen. Eigenständige
Blender-Szene; Gepard und F124 bleiben erhalten. Die Fotos zeigen unterschiedliche
Ausrüstungsstände: Dieses Modell priorisiert das Luftbild mit VLS auf dem
Vorschiff, zwei Mk 45, zwei Phalanx, acht Harpoon-Behältern und achtern Mk 29.
Es ist eine visuelle Spielinterpretation, kein maßhaltiger Fertigungsplan.

## Überarbeitung 2

Brücke mit durchgehender Vorderwand und umlaufender Verglasung, kürzerer
Doppelhangar mit Seitengalerien, zwei gestufte Abgasaufbauten mit Ansauggittern,
asymmetrisch bestückte Dreibein-Gittermasten mit offenen Y-Rahen und gebogenen
Radarantennen. Rundere Mk-45-Schilde, lesbarere Kennung, Treppen und Bootsdavits.
Sonarverkleidung längs in den Rumpf eingebunden; dunklere Non-Slip-Decks und
gebackene Kontaktverschattung zusätzlich zur F124-Verwitterung.

Vorgängerdatei und veröffentlichte GLBs bleiben unter `backup/revision1/`.
Die Spielprofile, Sockets und Waffenlogik wurden in Revision 2 nicht geändert.
Die aktuelle Laufzeitprüfung und der erneute GLB-Import bestehen mit 9.588
Dreiecken. Die parallel in Arbeit befindliche Modellpipeline V2 ist nicht
Bestandteil dieser visuellen Überarbeitung; ihre Dateien bleiben unberührt.

## Ergebnis

- `spruance_dd963.blend`: vollständige Szene mit 15 gepackten PBR-Bildern.
- **9.588 Dreiecke inklusive aller sichtbaren Waffen**, sechs Mesh-Batches im Spiel.
- Rumpf inklusive statischer achterer Waffen: 7.858; aktives Mk 45: 246;
  Phalanx: 264; Mk 29: 372; zwei Vierfach-Harpoonstarter je 424.
- Zwei offene Gittermasten, zwei getrennte Abgasaufbauten, Brückenfenster,
  Doppelhangar, markiertes Flugdeck, VLS-Luken, Reling und Unterwassersilhouette.
- Ausgeblichenes Grau, Salzschleier, zwölf lokale Rostläufe; vorhandene
  F124-Quelltexturen unverändert wiederverwendet und in Blender gebacken.
- Je Base Color, Roughness und Tangent-Normalmap: Rumpf 4096², vier Waffen 1024².
  Keine zusätzlichen Rost-Decal-Flächen. Keine Nutzerfotos als Produkttextur.

## Historische Spielanbindung (V1) / weiterhin geltende Gameplay-Grenze

Das bestehende `destroyer`-Profil verwendet nun `hullGltfId: spruance`.
Auch der bisherige Renderer-Alias `destroyer` lädt das neue Modell. Die alte
`hull_destroyer.glb` bleibt unverändert; Ausgangsprofil/Sockets zusätzlich in
`backup/`. Die Semantik `visual_artillery`, `visual_ciws`, `visual_sam` und
`visual_ssm` bleibt erhalten; nur deren hull-spezifische sichtbare Modelle ändern
sich. Andere Schiffsklassen und alternative Loadouts behalten ihre Modelle.

Aktiv bleiben die bestehenden drei Slots: vorderes Mk 45, vordere Phalanx,
achteres Sea Sparrow sowie zwei bestehende feste Harpoon-Bänke. **Achteres
Mk 45 und achtere Phalanx sind bewusst nur sichtbare Modellteile**, ohne neue
Schuss-/Abwehrlogik. VLS-Luken sind ebenfalls dekorativ. Es wurden keine Slots,
Feuersektoren, Magazine, Nachladezeiten, Bewegung oder Kollisionsbox erweitert.
Optionale `OPTIONAL_main_aft`/`OPTIONAL_ciws_aft`-Marker dienen späterer Arbeit.

Modellkoordinaten: Meter, +Z Bug, +Y oben. Länge 171,7 m, nominelle Breite 16,8 m
(16,82 m inklusive kleiner Ablaufkanten). Im Spiel bleibt die vorherige Größe:
10.000 normalisierte Einheiten × `hullVisualScale 0.012` × Klassenfaktor 1 =
120 Spieleinheiten. Unterkante Sonardom -8,8 m; Offset -512,5218404193362 hebt die
automatische Bodenanhebung auf. Wake-Delta 0 passt zum Hitbox-/Modellheck -60.
Waffen-GLBs kompensieren die inverse Hull-Skalierung und bei Standardtürmen den
zusätzlichen Faktor 100. Metrische Waffen-Exporte liegen separat hier.

Runtime-Dateien:

- `client/public/assets/ships/hull_spruance.glb`
- `client/public/assets/systems/mount_spruance_mk45.glb`
- `client/public/assets/systems/mount_spruance_phalanx.glb`
- `client/public/assets/systems/mount_spruance_seasparrow.glb`
- `client/public/assets/systems/mount_spruance_harpoon.glb`

Shared wurde neu gebaut. Laufende Server müssen neu gestartet werden, damit
sie das geänderte Profil übernehmen; den Spiel-Client anschließend neu laden.
Kein vollständiges Multiplayer-Match wurde für diese Assetprüfung gestartet.

## Prüfung und Vorschau

- `runtime-validation.json`: tatsächlicher Three.js-Spiel-Loader samt Waffenmontage,
  Größen/Positionen, neutrale Richtungen, drei aktive Türme, zwei Abwehrrollen,
  Mündungen, eingebettete PBR-Texturen, Budget und unveränderte Spielregeln.
- `roundtrip-validation.json` und `spruance_glb_roundtrip.png`: veröffentlichte GLBs
  wieder in Blender importiert und visuell kontrolliert.
- `saved-scene-validation.json`: eine gespeicherte Szene, 9.588 Dreiecke,
  15 gepackte Bilder. `weathering-validation.json`: etappenweises Texturbacken.
- 39 Shared-Testdateien, Client-/Shared-Typecheck und Waffenmodell-Resolver bestanden.
- `spruance_hero.png`, `spruance_side.png`, `spruance_top.png`, `spruance_detail.png`.
- `reference-comparison.html`: Bilder und ungefähr ausgerichtete Überlagerung;
  keine pixelgenaue Silhouette-Messung behauptet.

## Quellen / Reproduktion

Formreferenzen: Nutzerdateien `Top Picture.jpg`, `963spruance_01.jpg`,
`A_port_bow_view_of_the_destroyer_USS_SPRUANCE_…jpeg` und `Blueprint.jpg`.
Die im Bilddateinamen enthaltene Bezeichnung DDG-963 wird nicht als offizielle
Kennung übernommen. Maße und Kennung DD-963 sind mit der
[US Navy / Naval History and Heritage Command](https://www.history.navy.mil/research/histories/ship-histories/danfs/s/spruance.html)
abgeglichen (563 ft 4 in Länge, 55 ft Breite; metrisch gerundet). Keine Behauptung,
dass die bereitgestellten Referenzfotos frei lizenzierte Produktassets sind.

Generator `scripts/blender/create_spruance_asset.py` in einem Namespace ausführen
und als `bpy.app.driver_namespace['spruance_build']` behalten. Anschließend
`spruance_stage.py` mit `SPRUANCE_STAGE` nacheinander `mk45`, `phalanx`,
`seasparrow`, `harpoon`, `hull`, `publish`. Render mit `render_spruance.py`,
GLB-Reimport mit `reimport_spruance_qa.py`, Endspeicherung mit
`finalize_spruance.py`. Runtimeprüfung:
`node --conditions=bfa-source --import tsx scripts/blender/verify_spruance.ts`.
Der Generator veröffentlicht kanonische Modelle und erzeugte Metadaten; nicht-räumliche Spielregeln bleiben separat.
