# Slava / bestehendes Kreuzer-Asset

Referenzbasierte Neuinterpretation der sechs Nutzerbilder. Das echte Foto wird
bei Detailkonflikten gegenüber dem modifizierten NavalArt-Entwurf priorisiert.
Keine Behauptung eines exakt datierten historischen Ausrüstungsstands.

## Ergebnis

- `slava.blend` und `slava_source.blend`: eigenständige Szene, 15 gepackte PBR-Bilder,
  separate versteckte Waffenvorlagen und markierte Export-Collections.
- 9.852 Dreiecke im zusammengesetzten Spielmodell: Rumpf 8.756, AK-130 276,
  aktive AK-630 160, Osa 164, zwei aktive Doppelbehälter zu je 248.
- Insgesamt 16 große geneigte Raketenbehälter, sechs sichtbare AK-630,
  Doppelgeschütz, acht runde VLS-Luken, gestufter Vorder-/Achtermast,
  offenes Suchradargitter, Doppelabgasblock, achterer Radardom und Flugdeck.
- F124-basierte gebackene Verwitterung, rotbraune Decksbeschichtung,
  lokale Rostläufe, Rauheit und Normalmaps. Rumpf 4096², Waffen 1024².
- Keine Kennnummer: Klassenmodell aus gemischten Referenzständen; keine
  unbeabsichtigt spiegelverkehrte Beschriftung in der reflektierten Spielbasis.

## Spielvertrag

Die fünf bisherigen Katalogidentitäten `cruiser`, `cruiser_artillery`,
`cruiser_ciws`, `cruiser_sam`, `cruiser_ssm` und ihre Dateipfade bleiben bestehen.
Das Kreuzerprofil einschließlich Bewaffnung, Sektoren, Magazinen, Bewegung und
Kollisionskörper ist unverändert. Es bleiben drei aktive Drehsysteme und zwei
feste Raketenbänke. Die zusätzlichen fünf AK-630 sowie zwölf Raketenbehälter,
VLS-Luken und der hintere Radardirektor sind dekorativ. Die vorhandene SAM-Rolle
wird durch einen kleinen Osa-artigen Starter dargestellt, nicht durch ein
schießendes Radar. Keine zusätzlichen Abwehrkanäle.

Montagepunkte/Mündungen wurden an die neue Geometrie angepasst. Die festen
Raketenbänke behalten ±10° Grundrichtung. Die bisherigen Spielabmessungen werden
in Längsrichtung beibehalten: 169,946 Spielmeter. 186 Autoreneinheiten sind eine
Modellierungsreferenz; `bfa_metres_per_unit = 169.946 / 186` wird einmalig beim
Export eingerechnet, niemals im Renderer. Wasserlinie und Ursprung bleiben Y=0.
Das Kielwasser sitzt am neuen symmetrischen Heck, Z=-84,973 Spielmeter.

V2-Pipeline: `SOCKET_*`, `RAIL_*`, `bf_muzzle`, `bf_wake`; der kanonische
Exporter erzeugt die Waffen-Yaw-Pivots und anschließend gemeinsame Metadaten.
Keine handgepflegte zweite Socket-Quelle. Frühere GLBs, Profil und Metadaten
liegen unter `backup/`; andere Schiffe wurden nicht neu veröffentlicht.

## Prüfung / Wiederholung

`create_slava_asset.py` im Blender-MCP ausführen und den Namespace als
`bpy.app.driver_namespace['slava_build']` speichern. `slava_stage.py` mit
`SLAVA_STAGE` = `artillery`, `ciws`, `sam`, `ssm`, `hull`, `publish` aufrufen.
`render_slava.py` liefert vier Ansichten. `finalize_slava.py` speichert die
Blender-Datei und importiert alte/neue Spiel-GLBs für den Vergleich erneut.

- `verify_slava.ts`: eingebettete PNGs, UVs, Metadaten-/GLB-Hashes, Dreieckslimit.
- `modelRuntime.contract.test.ts`: reale Modelle aller Klassen, fünf Kurse und
  Zielrichtungen, Deckneigung, Feuersektoren, Grundstellungen und Mündungen.
- `npm run models:check`: generierte Metadaten für alle 14 Modelle konsistent.
- `saved-scene-validation.json`: 15 gepackte Bilder, 9.852 Dreiecke beim Rückimport.
- `reference-comparison.html`: Referenzen, orthografische Ansichten, Vorher/Nachher.
- Spiel-Renderer: `/spruance-render.html?ship=cruiser` am laufenden Vite-Server.
- `slava-game-engine.png`: visuell geprüfte 1920×1080-Aufnahme im Spiel-Renderer.
- Client-Typecheck erfolgreich; Profil bytegleich zur Sicherung, Metadaten aller
  anderen Modelle unverändert.

Die PNGs sind Kontrollansichten, keine pixelgenaue historische Vermessung.
Nutzerreferenzen wurden nicht als Produkttexturen eingebrannt. Kein vollständiges
Mehrspieler-Match gehört zu dieser Assetprüfung.
