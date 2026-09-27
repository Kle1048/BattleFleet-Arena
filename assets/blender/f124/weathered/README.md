# F124 – mehrere Monate auf See

`f124_hessen_animated_weathered.blend` ist eine eigenständige Kopie der animierten Szene mit sechs eingebetteten Texturen. Die saubere Szene `F124_Animation_Demo` und die bestehenden Runtime-GLBs bleiben unverändert.

## Gestaltung

- 40 % Mischung aus bisherigem UV-Atlas und neuem, ausgewaschenem Oberflächenatlas: fleckige Marinefarbe, dezente Salz- und Gebrauchsspuren.
- Feinere matte Oberflächenvariation und zurückhaltende Mikrostruktur über Blender-Materialnodes; leicht verblasstes Flugdeck bei unveränderten Markierungen.
- 16 asymmetrisch verteilte, der Rumpfkontur folgende Rost-Decals. Senkrechte Laufspuren unter Deckkanten und Beschlägen; keine flächige Durchrostung. Rostmaterial mit 55 % maximaler Deckkraft, verringerter Farbsättigung.
- Kennung, Fenster und Radar bleiben lesbar. Geometrie und Animation des Schiffs sind unverändert; die Decals sind zusätzliche separate Flächen.

Die zwei neuen Bitmap-Assets wurden mit dem eingebauten Imagegen-Werkzeug erzeugt, nicht über die API-/CLI-Ausweichlösung. Der vollständige finale Prompt-Satz steht in `generation-prompts.json`; Originalausgaben liegen unverändert unter `textures/`. Mischung, Deckkraft und Oberflächenwirkung werden nichtdestruktiv im Blender-Material eingestellt.

## Dateien

- `textures/f124_surface_weathered.png`: neuer 4×4-Farbatlas.
- `textures/f124_rust_runoff_rgba.png`: transparentes Rostlauf-Decal.
- `f124_weathered_hero.png`, `f124_weathered_detail.png`, `f124_rust_closeup.png`: kontrollierte Renderansichten.
- `weathering-validation.json`: 481 Frames / acht animierte Objekte ohne Transformationsabweichung zur sauberen Szene; Texturen eingebettet.

Die Blender-Nodes und zusätzlichen Decals sind noch nicht für die Spiel-Runtime gebacken/exportiert. Für eine spätere GLB-Auslieferung müssen insbesondere die gemischten Farben und Roughness-/Bump-Nodes in exportierbare PBR-Texturen gebacken werden.
