# Kleine, saubere Modellmaterialien

Aktiver Standard seit 27.09.2026 (Variante 1): pro Modell eine Farbtextur,
Rümpfe maximal 1024 × 1024, Waffen maximal 256 × 256. Keine Rost-/Salz-/
Schmutzschichten, kein gebackenes Oberflächenrauschen, keine Normal-, Roughness-
oder AO-Maps. Roughness 0,72 und Metallic 0,045 sind Materialkonstanten.
Fenster, Deckfarben, Lüftungsmarkierungen, Flaggen und Mesh-Beschriftung bleiben.
Das rotbraune Deck der Slava ist Anstrich, kein Rosteffekt.

## Quelle und Export

- Gemeinsame Grenzen: `shared/src/content/modelMaterialPolicy.json`.
- `scripts/blender/clean_ship_materials.py` definiert saubere native Shaderfarben
  mit den bestehenden 4×4-UV-Kachelbedeutungen und backt ausschließlich Base Color.
  Keine Filterung oder Übermalung der bisherigen Weathering-Bitmaps.
- Aktuelle gespeicherte Quellen: `assets/blender/clean/{gepard,spruance,slava}/clean-source.blend`.
  Sie enthalten saubere Materialien, gepackte Bilder, Marker und ausgeblendete
  Waffenvorlagen. Normaler Neuexport über `scripts/blender/publish_scene.py`.
- Die bisherigen `.blend`-Dateien und Weathering-Bilder bleiben als Referenz
  erhalten. Sie sind **nicht** die aktuelle Materialquelle; ein ungeänderter
  Weathering-Export wird vom neuen Budget-Gate abgewiesen.
- Bestehende Stage-Skripte rufen aus Kompatibilitätsgründen weiterhin
  `weather_gepard` auf; die Implementierung backt jetzt saubere Farbtexturen.
  Material-Neubakes immer mit frischer Geometrie/ursprünglichen Palette-UVs beginnen.

Kompletten Material-Neubau aus den drei vorhandenen Geometriegeneratoren:

```sh
blender --background --factory-startup --threads 4 --python scripts/blender/build_clean_ships.py
node --conditions=bfa-source --import tsx scripts/models/publishCleanModels.ts
```

Der erste Schritt schreibt ausschließlich neue Quellen/Vorstufen unter
`assets/blender/clean`, niemals die bisherige interaktive Blender-Szene.
Der zweite ist eine **Materialmigration**, kein allgemeiner Geometrie-Publisher:
Er prüft erst alle 14 Modelle gegen die momentan ausgelieferten Dateien.
Er fordert identische Dreiecke einschließlich Windungsrichtung (millimetergenau
quantisiert) sowie unveränderte Marker/Abmessungen innerhalb 0,00001.
Vor Austausch werden vorhandene GLBs unter `previous-runtime/` gesichert.
Bereits vorhandene Sicherungen werden nicht überschrieben. Vorstufen und diese
lokalen Sicherungen sind ignoriert, bleiben aber auf der Platte erhalten.
Bewusste Geometrieänderungen werden über den normalen kanonischen Export gemacht.

## Release-Gates

`models:export`, `models:build` und `models:check` prüfen Anzahl/Auflösung der
eingebetteten PNGs und verbieten zusätzliche PBR-Texturmaps. Da `models:check`
Teil von `npm test` und `npm run build` ist, ist das Budget auch in CI wirksam.
`modelMaterialBudget.test.ts` prüft alle realen Modelle plus zu große, leere,
zusätzliche und unerlaubte Maps. Die räumlichen Modelltests bleiben unverändert.

## Ergebnis des Materialumbaus

14 aktive GLBs: **44,91 MB → 2,13 MB**, ungefähr 95 % weniger Dateidaten.
Texturen des gesamten Katalogs: rechnerisch **944 MiB → 19,67 MiB** bei RGBA8
inklusive vollständiger Mipmaps. Nur die drei Rümpfe: **768 MiB → 16 MiB**.
Das sind Speicherabschätzungen, keine GPU-/FPS-Messungen; Texturen werden bereits
zwischen Instanzen geteilt. Inseln und archivierte Prototypmodelle sind unverändert.

`assets/blender/clean/publication-report.json` enthält Vorher-/Nachher-Dateigrößen
pro Modell. Vorschauen und gepackte Quellen liegen in den drei Modellunterordnern.
