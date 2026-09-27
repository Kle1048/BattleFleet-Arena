# Einfache Flugkörper – Exocet MM38 / Sea Sparrow / RAM

Referenzbasierte, bewusst vereinfachte Grafikmodelle, keine technisch exakten
Rekonstruktionen. Nutzerbilder bestimmen Silhouette und Farbaufteilung.

- SSM: Exocet MM38, 476 Dreiecke, grauer Körper, helle Radomspitze, vier große
  Hauptflossen und vier kleinere Heckflossen.
- SAM: Sea Sparrow, 524 Dreiecke, heller Körper, dunkles Band, vier Haupt- und
  Heckflossen sowie einfache Längsverkleidungen.
- PD: RAM, 708 Dreiecke, schlanker heller Körper, dunkler gerundeter Suchkopf,
  zwei seitliche Antennen, kleine vordere Steuerflächen und Heckflossen.
- `ram.blend` / `ram_preview.png`: separate RAM-Quelle und Kontrollansicht;
  bestehende SAM-/SSM-Dateien wurden beim Ergänzen nicht neu exportiert.
- Ein Mesh, ein Vertex-Farbmaterial pro Modell; keine Bitmaptexturen erforderlich.
- `projectiles.blend`: eigenständige Szene mit Originalen und Präsentationskopien.
- `projectiles_preview.png`: gemeinsame Blender-Kontrollansicht, Exocet oben.
- Austauschdateien: `client/public/assets/projectiles/*.glb`.
- Interaktive Ansicht: `/projectile-preview.html` am Vite-Server.

## Integration

`scripts/blender/create_projectile_assets.py` generiert GLBs und kompakte
Mesh-JSONs aus denselben Blender-Dreiecken. `projectileVisual.ts` nutzt die
gebündelten JSONs synchron, sodass beim Start kein Download/Wartezustand entsteht.
Die GLBs sind Austauschdateien, keine zweite unabhängig modellierte Quelle.
Koordinaten: +Y oben, +Z Spitze, Ursprung im Rumpfzentrum. Längen sind nur
grafische Proportionen, keine Simulationseingaben.

Die bestehende kosmetische Vergrößerung bleibt: SSM 12, SAM/PD 22 Rendereinheiten.
Die ursprünglichen SAM-Tiefentest-/Overlayregeln bleiben ebenso erhalten wie
Startpunkt, Höhe, Flugbewegung, Lebensdauer, Rauch und Trefferlogik. Das vorhandene
gemeinsame SAM/PD-VFX wählt Sea Sparrow für SAM und RAM für PD. Keine
Änderung der Serverdaten, Waffenparameter oder Schiffmodelle.

Jeder Flugkörper besitzt eigene Geometry-/Material-Instanzen; die bestehenden
Disposal-Pfade bleiben gültig. Keine asynchronen Callbacks nach Effektende.

## Prüfung

- `projectileVisual.test.ts`: unter 1.000 Dreiecke, keine degenerierten Dreiecke,
  gültige Farben/Normalen, Spitze +Z, Darstellungsmaßstab, Besitz der Ressourcen,
  ein GLB-Mesh ohne Fremdszenen und übereinstimmende GLB-/Runtime-Dreieckszahlen.
- Vorhandene `missileFx.test.ts` und `airDefenseFx.test.ts`: Startursprung,
  Flugzeit, verspätete Ereignisse und wiederholtes Aufräumen; eigene SAM-/PD-
  Modellzuordnung und RAM auch im Live-Zielverfolgungspfad.
- Client-Typecheck und Produktionsbuild erfolgreich (bestehende Vite-Chunkgrößenwarnung).
- Blender-Kontrollansichten visuell geprüft; interaktive Vorschau zeigt alle drei Modelle.

Neu erzeugen: Skript in einer laufenden Blender-MCP-Sitzung im Objektmodus
ausführen. Es erstellt eine neue Szene und überschreibt nur die ausgewählten
abgeleiteten Flugkörperassets sowie die zugehörigen Vorschau-/Quelldateien.
Standard: alle drei Modelle. Mit `PROJECTILE_KINDS = ('pd',)` im Skript-Namespace
wird nur RAM exportiert und separat gespeichert (`ram-validation.json`).
