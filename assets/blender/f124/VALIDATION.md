# Abnahme – F124 Revision 3

Geprüft am 26.09.2026 anhand der vom Benutzer bereitgestellten Mehransichtenzeichnung und der neu exportierten Dateien.

| Anforderung | Evidenz und Ergebnis |
| --- | --- |
| Zwei seitlich getrennte Schornsteine | Zwei separate Gehäuse mit 3,7 m Zwischenraum; Strahltests am geladenen Runtime-GLB finden niedrigeres Deck im Mittelgang, zwei erhöhte Ränder und zwei abgesenkte Abgasflächen. Keine gemeinsame Dachfläche. |
| Silhouette und Positionen | Vollständige Seitenüberlagerung in `reference-comparison.html` visuell geprüft. Zusätzlich bestehen alle 16 abgelesenen Längs-/Höhenkontrollpunkte in `reference-fit-validation.json`; maximale Abweichung dieser Punkte 1,55 Referenzpixel. |
| Draufsicht | Vollständige Draufüberlagerung visuell geprüft: getrennte Schornsteine, Brücken-/Hangargrundflächen, querliegendes 8×4-VLS, korrigierte Waffenpositionen, angeschrägte Heckecken und verkleinerte konzentrische Landemarkierung. |
| Low-Poly mit Texturen | 9.412 Dreiecke im zusammengesetzten Runtime-Schiff, acht Mesh-Batches. Eingebettete PNG-Bilder und UVs im GLB geprüft; Erscheinungsbild nach GLB-Reimport aus sechs Richtungen plus zwei abgeglichenen Ansichten geprüft. |
| BattleFleet-Assetarchitektur | `verify_f124.ts` prüft tatsächliche Hull-/Mount-Funktionen, 143 × 17,4 m, Wasserlinienkorrektur, Socket- und Rail-Transformationen, separate Waffen und Mündungsmarker. Erfolgreich. `npm run typecheck -w client` erfolgreich. |
| Separate bearbeitbare Blender-Datei | `saved-scene-validation.json`: genau eine gespeicherte F124-Szene der Revision 3, alle vier Quelltexturen gepackt. Aktive F124-Szene in Blender wieder ausgewählt. |
| Vorversionen erhalten | `assets/blender/f124_v1_backup/` und `assets/blender/f124_v2_backup/` enthalten vorherige Quelldateien, Generator und Runtime-GLBs. Vorherige Blender-Szenen wurden nicht gelöscht. |

## Grenzen der Abnahme

Die 500 × 328 Pixel große Zeichnung ist kein maßhaltiger Werftplan. Kleine Antennen, Relings, Unterwasserrumpfdetails und Oberflächen sind bewusst stilisiert. Die Kontrollpunktprüfung ist **keine** flächendeckende Pixelgenauigkeitsmessung; sie ersetzt die visuelle Kontur-/Grundrissprüfung nicht. Der Entwurf übernimmt weiterhin F221 statt der Kennung F219 auf der Zeichnung.

Geprüft ist das visuelle Asset einschließlich der vorhandenen BattleFleet-Lade- und Mount-Pipeline. Neue Gameplay-Waffenwerte, Serverprofile, Balancing und eine vollständige Match-Abnahme sind nicht Teil dieser Modellkorrektur und wurden nicht als erledigt ausgegeben.
