# F124 Hessen — Low-Poly-Visualprototyp

Eigenständig modellierter Versuch nach den drei bereitgestellten Referenzbildern: F221, APAR-Vormast, SMART-L-Achtermast, Hangar und Flugdeck. Keine maßstabsgetreue technische Rekonstruktion und kein aktueller Ausrüstungsnachweis. Die Hauptabmessungen 143 × 17,4 m folgen der [Bundeswehr-Beschreibung der Sachsen-Klasse](https://www.bundeswehr.de/de/ausruestung-technik-bundeswehr/seesysteme-bundeswehr/sachsen-klasse-f124-fregatte); Details sind stilisiert.

## Dateien

- `f124_hessen.blend`: separate neue Szene, gepackte Texturen, zusammengebautes Schiff, separat ausgeblendete Waffen-Vorlagen und Vorschau-Beleuchtung.
- `f124_hero.png`, `f124_stern.png`, `f124_profile.png`: Bilder der erneut importierten **Runtime-GLBs**, nicht nur des Blender-Quellmodells.
- `f124.profile.json`: importierbares Workbench-Profil; `f124.mountSockets.json`: ergänzende Socket-Dokumentation.
- `mount_f124_*_metric.glb`: Waffen-Quellexporte in Metern.
- `textures/`: selbst erzeugte UV-Texturen für Lack, Rauheit, Flugdeck und Kennung; keine Fototexturen aus den Referenzen.
- Runtime-Dateien: `client/public/assets/ships/hull_f124.glb` und `client/public/assets/systems/mount_f124_{76mm,ram,harpoon}.glb`.

Der Rumpf hat 6.064 Dreiecke und drei Material-Batches. Mit 76-mm-Geschütz, zwei RAM-Werfern und zwei Harpoon-Modulen: **8.192 Dreiecke, acht Mesh-Batches**. Die PNG-Texturen sind in den GLBs eingebettet. Wasser, Kamera und Beleuchtung werden nicht als Spielgeometrie exportiert.

## In der Workbench ansehen

1. Im Repository `npm run dev:editor` starten.
2. Über den JSON-Import `assets/blender/f124/f124.profile.json` laden.
3. Das Profil nutzt die bestehende Klasse `destroyer` als Vorschau-Container und die neue Hull-ID `f124`.

Die URL-Register enthalten den Rumpf und die drei neuen Waffen-Visuals. Bestehende Standardprofile wurden nicht durch die F124 ersetzt. Dies ist ein **Visualprototyp**, keine neue serverseitige Schiffsklasse: Waffenwerte, Reichweiten, Luftabwehr-Klassifikation und Balancing der neuen Visual-IDs sind noch nicht integriert. Ein vollständiger In-Game-/Browser-Abnahmetest wurde nicht durchgeführt.

## Achsen, Maßstab und Mounts

glTF: +X Steuerbord, +Y oben, +Z Bug; Quelldaten in Metern, Ursprung an der Wasserlinie mittschiffs. Blender verwendet dazu `(x, -z, y)`. Die Quellgeometrie reicht bis −4,5 m unter die Wasserlinie; dieser Wert ist eine Modellierungsannahme.

Die vorhandene Hull-Pipeline normalisiert die Schiffslänge auf 10.000 interne Einheiten. Daher verwendet das Profil `hullVisualScale = 143 / 10000` und `gltfHullYOffset = -4.5 * 10000 / 143`. Die separaten Runtime-Waffen sind mit `10000 / 143` vorvergrößert, damit die bestehende inverse Anchor-Skalierung sie richtig einsetzt. Die metrischen Waffenexporte und Blender-Vorlagen bleiben unvergrößert. Kein allgemeiner Renderer-Umbau war dafür nötig.

`SOCKET_main_fwd`, `SOCKET_ram_fwd`, `SOCKET_ram_aft` und die beiden `RAIL_ssm_rail_*` sind im GLB eingebettet. Waffen enthalten jeweils `bf_muzzle`. Der achtere RAM-Socket ist neutral; seine Ausrichtung übernimmt `trainBaseYawRadFromBow`, damit keine doppelte Drehung entsteht.

## Prüfung und Reproduktion

- `scripts/blender/create_f124_textures.py`: deterministische Texturerzeugung mit Pillow/NumPy.
- `scripts/blender/create_f124_asset.py`: neue Szene erzeugen, exportieren und speichern, ausgeführt über `run_blender_mcp.py` mit der lokalen Blender-MCP-Python-Umgebung.
- `scripts/blender/verify_f124.ts`: GLB-Struktur, eingebettete PNGs, UVs, Maße, Socket-Abgleich sowie tatsächliche BattleFleet-Hull-/Mount-Funktionen prüfen. Aufruf: `npx tsx scripts/blender/verify_f124.ts`.
- `scripts/blender/reimport_f124_qa.py`: Exporte erneut in Blender importieren und aus drei Richtungen rendern.
- `export-validation.json` und `reimport-validation.json`: Prüfergebnisse. Zusätzlich wurde `npm run typecheck -w client` erfolgreich ausgeführt.

Die Generatoren sind für diesen lokalen Workspace konfiguriert. Vor einer Neuerzeugung eine eventuell bereits geöffnete F124-Arbeitsdatei sichern; die Generatoren legen zusätzliche Szenen an, statt vorhandene Szenen zu löschen.
