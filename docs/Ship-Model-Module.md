# Schiffsmodelle — Autoren- und Integrationsleitfaden (V2)

Verbindlicher Vertrag und Abnahmen: [Modellpipeline V2](MODEL-PIPELINE-V2.md).
Dieser Leitfaden ersetzt die alte Anleitung mit manuellen Socket-Registries, Normalisierung und Renderer-Offsets.

Materialstandard und aktuelle Blender-Quellen: [kleine, saubere Farbtexturen](CLEAN-MODEL-MATERIALS.md).
Rümpfe maximal 1024 px, Waffen maximal 256 px, eine Farbtextur pro Modell;
Normal-/Roughness-/AO-Maps und Weathering-Bakes sind nicht mehr Teil des Exports.

## Eine räumliche Quelle

Die 3D-Modelle enthalten alle Montage-, Richtungs-, Mündungs- und Kielwassermarker.
Der Export erzeugt kanonische GLBs und daraus `shared/src/content/generatedModelMetadata.json`.
Diese JSON-Datei ist ausschließlich ein erzeugtes Artefakt, kein Autorenformular.
Client und Server verwenden dieselben erzeugten Transformationen; der Renderer überschreibt sie nicht mit einem zweiten Socket-Leser.

`shared/src/content/modelCatalog.json` enthält nur Modellkennung, Dateipfad, Art und Yaw-Fähigkeit.
Profile unter `shared/src/data/ships/` enthalten Regeln: Slot-IDs, kompatible Waffenarten, Loadout,
Feuersektoren, Magazine, Bewegung und Gameplay-Hitboxen. Räumliche Overrides werden abgewiesen.

## Koordinaten und Ursprünge

Das exportierte GLB verwendet Meter, +Y oben und +Z als Bug/Waffenfront. +X ist die definierte Steuerbordachse.
Beim normalen Blender-glTF-Y-up-Export entspricht das Blender +Z oben und -Y vorne.
Entscheidend ist der geprüfte GLB-Vertrag, nicht die Beschriftung einer Autorenansicht.

Der Rumpfursprung liegt am Simulationsbezugspunkt auf der Wasserlinie (Y=0).
Jede Waffe hat ihren Montage-/Drehpunkt am lokalen Ursprung. Keine zusätzliche Zentrierung,
Bodenanhebung, Bounding-Box-Normierung oder inverse Waffen-Skalierung im Spiel.

Die Seekarte bildet Welt-X auf Render-X gespiegelt ab. Deshalb spiegelt der logische Schiffsknoten
auch die vollständige lokale X-Basis; das darf nicht durch modellabhängige Vorzeichen kompensiert werden.
Kosmetisches Rollen, Stampfen und Sinken liegen auf einem Kindknoten. Hitboxen und Feuersektoren bleiben logisch.

## Benannte Marker

| Im Modell | Bedeutung |
| --- | --- |
| `SOCKET_<slotId>` im Rumpf | Vollständige Montageposition und Grundorientierung eines Slots |
| `RAIL_<launcherId>` im Rumpf | Vollständige Montagepose einer festen SSM-Bank |
| `bf_wake` im Rumpf | Ursprung des Kielwassers |
| `bf_muzzle` in der Waffe | Tatsächlicher Abschuss-/Effektursprung; +Z zeigt nach vorn |
| `bf_yaw` in drehbarer Waffe | Identität am Modellursprung, enthält die drehbare Geometrie |

Marker sind Empty-Knoten, keine Meshes. Verschachtelte Elterntransformationen werden berücksichtigt;
Nullrotation ist gültig. Marker müssen nach Umrechnung starre Transformationen mit Einheitsskalierung
sein. Doppelte/fehlende IDs, Scherung, Spiegelung am Marker, ungültige Hierarchien und externe
Textur-/Buffer-Referenzen führen zum Fehler. Animationen/Skins sind im aktuellen statischen Vertrag nicht zugelassen.

Slot-/Rail-IDs müssen exakt zu den nicht-räumlichen Profilregeln passen. Jeder exportierte Socket bzw.
jede Rail braucht Regeln; ein unbelegter Mount besitzt keine Waffenfunktion. Die Grundstellung einer
drehbaren Waffe folgt der Socket-Pose und wird nicht aus ihrer Bug-/Heckposition erraten.

## Waffenfunktion und Modell trennen

Beispiel eines Loadout-Eintrags:

```json
{ "main_fwd": { "weaponId": "artillery", "modelId": "gepard_artillery" } }
```

`weaponId` bestimmt Reichweite, Waffenart und Abwehrschicht; `modelId` bestimmt Geometrie und Mündung.
Keine `visual_*`-Aliases und keine hull-spezifische Umschreibung. Ein Modellwechsel ändert nicht
implizit die Waffenregeln. Drehbare Waffensysteme benötigen ein Modell mit `yaw: true`.

Feuersektoren sind relativ zum Schiffbug definiert, nicht relativ zur Modell-Grundstellung.
Symmetrische Sektoren verwenden eine explizite Mitte (Standard 0), asymmetrische Intervalle können
über das Heck laufen; Unions kombinieren mehrere Intervalle. Workbench, Overlay und Simulation
verwenden dieselbe Semantik.

## Neues Modell veröffentlichen

1. Modell und Marker mit den oben genannten Ursprüngen/Achsen erstellen; Meshes dürfen eigene
   Hierarchien haben. Texturen in das GLB einbetten.
2. Modell im Katalog registrieren. Slots/Rails sowie das gewünschte Loadout im Klassenprofil definieren.
   Keine Positionen oder Rotationen in das Profil übertragen.
3. Einzel-GLB exportieren:
   `npm run models:export -- <modelId> <source.glb> <Meter-pro-Autoreneinheit>`.
   Für neue metrische Modelle ist der Faktor 1. Bereits kanonische GLBs nicht nochmals skalieren.
4. `npm run models:build`, danach `npm run models:check`, `npm test`,
   `npm run typecheck` und `npm run build`.
5. Workbench unter `/editor.html` und ein lokales Match prüfen:
   Seiten/Grundstellung, Zielrichtungen, Mündungen, Materialien und Kielwasser.

Für den direkten Blender-Workflow erhalten Szene und Collections Export-Tags:

- Szene: `bfa_marker_contract = 2`, `bfa_metres_per_unit = 1` für neue metrische Quellen.
- Direkte Export-Collections: `bfa_model_id = <Katalog-ID>`. Mehrere Collections derselben ID werden zusammen exportiert.
- Präsentations-/zusammengesetzte Preview-Collections bleiben ohne Export-Tag.
- `scripts/blender/publish_scene.py` auf der gewünschten Szene ausführen.
  Es veröffentlicht über denselben kanonischen Export und baut die Metadaten neu.

Die Bake-Checkpoints von Gepard und Spruance enthalten die separaten Waffenvorlagen.
Präsentationsdateien enthalten dagegen den Rumpf und zusammengebaute Vorschauen.
Historische Backups und der F124-Prototyp sind keine aktiven V2-Eingaben.
Einmalige Migrationsskripte gehören nicht in den normalen Autorenablauf.

## Runtime und Prüfung

- Spiel und Server laden das autoritative Profil. Die Workbench übergibt einen expliziten Entwurf;
  localStorage verändert das Match nicht.
- Materialien werden pro Instanz geklont; Geometrie und Texturen bleiben geteilt.
  Nach Spawn-Schutz/Zerstörung werden die Autorenmaterialwerte wiederhergestellt.
- Feuerereignisse identifizieren Slot/Rail und die serverseitige Mündung einschließlich Höhe.
  Der Client verwendet exakt diesen Mount und berücksichtigt nur seine kosmetische Bewegung.
- Der Server braucht weder Three.js noch einen GLB-Parser.
- `models:check` vergleicht Marker und SHA-256 gegen alle katalogisierten GLBs und läuft bei Test/Build.
- `modelRuntime.contract.test.ts` lädt reale GLBs und prüft alle aktiven Klassen bei mehreren Kursen,
  Zielrichtungen und Deckneigungen. Weitere Tests decken Materialrückkehr, Editor-Isolation,
  Exportfehler und konkrete serverseitige Feuerereignisse ab.
- `scripts/blender/test_canonical_pipeline.py` prüft den Blender-Reimport und Mündungsabgleich.

Aktuell bleiben die freigegebenen Spielgrößen (Gepard 60,016 m, Spruance 120 m, Kreuzer 169,946 m)
sowie Gameplay-Hitboxen erhalten. Die Einheitenumrechnung findet einmal beim Export statt.
Ein Wechsel zu realen Schiffslängen ist eine separate Gameplay-/Inhaltsentscheidung.
