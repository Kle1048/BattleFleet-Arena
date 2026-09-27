# Gebuendeltes Partikel-Rendering

Stand: 2026-09-27. Effekt-Culling, Partikellimit (960), Rezepte, Simulation und
Standardkamera (Top-down) bleiben unveraendert.

## Aufbau

`spriteParticleBackend.ts` verwaltet weiterhin Pool, Bewegung, Alter und Farbe.
Die visuellen Pool-Eintraege sind jetzt einfache CPU-Datensaetze statt einzelner
Three-Sprites mit eigenen Matrizen und Materialien. `particleBillboards.ts`
zeichnet alle sichtbaren Eintraege mit einer instanzierten Quad-Geometrie,
einem Material und einem Draw Call je Kamera-Pass.

Eine feste Float-Datentextur (3 x 960 RGBA-Texel, 46.080 Byte) enthaelt Position,
Groesse, Farbe, Deckkraft, Rotation und Stil. Die drei vorhandenen prozeduralen
Effekttexturen werden unveraendert geteilt. Pool, Upload-Puffer und Ressourcen
sind begrenzt; Dispose gibt die GPU-Ressourcen genau einmal frei.

Vor jedem Draw wird fuer dessen Kamera weit-nach-nah sortiert, bei gleichen
Tiefen stabil nach Erstellungsreihenfolge. Das gilt auch fuer den verschachtelten
Wasserreflexions-Pass. Die Datentextur wird bewusst in `onBeforeRender`
aktualisiert: Vertexattribute werden von Three bereits vorher hochgeladen und
koennten beim verschachtelten Rendern die Sortierung der falschen Kamera nutzen.
Das bisherige implizite Sprite-Frustum-Culling bleibt als gleicher Kugeltest
erhalten; das separate Effekt-Culling wird nicht veraendert.

## Transparenz und Grenzen

Premultipliziertes RGB mit ONE / ONE_MINUS_SRC_ALPHA verbindet normale und
additive Partikel in einem tiefensortierten Draw. Additive Partikel liefern
RGB-Beitrag, aber Alpha null. Der Spiel-Canvas ist opak und das Wasser liest
nur Reflexions-RGB. **Fuer transparente Export-Renderziele oder spaetere
Alpha-Compositing-Pipelines muss dieses Verfahren erneut geprueft werden:**
der resultierende Alpha-Kanal ist nicht identisch zum alten Sprite-Renderer.

Ringe und Lichtblitze ignorieren wie bisher die Szenentiefe. Ihr Clip-Z wird
ohne Tiefenschreiben an die Near-Ebene gelegt; die urspruenglichen Clip-Grenzen
werden separat erhalten, einschliesslich der schraegen Wasser-Reflexionsebene.
Die Billboards verwenden Weltpositionen und uniforme Skalierung wie die
bisherigen Partikel; transformierte Elternobjekte sind kein unterstuetzter Fall.

## Reproduzierbarer Vergleich

Im Dev-Server `/particle-benchmark.html` oeffnen oder
`npm run build:benchmark -w client` ausfuehren. Die eingefrorene alte Implementierung
unter `client/src/benchmark/reference/` dient ausschliesslich dem A/B-Vergleich.
Sie ist kein Runtime-Fallback und kein Bestandteil des normalen Produktionsbuilds.

Lokaler In-App-Browser, Dev-Build, feste Seeds, 960 Partikel, 640 x 480 Pixel,
Antialiasing aus, echtes Wasser inklusive Reflexion und ein opaker Testkoerper:

| Ansicht | Draw Calls alt / neu | Dreiecke alt / neu | Mittlerer RGB-Fehler / 255 | Max. Fehler / 255 |
| --- | ---: | ---: | ---: | ---: |
| Senkrecht von oben | 1.927 / 9 | 3.890 / 3.890 | 0,00665 | 2 |
| Flach schraeg | 1.927 / 9 | 3.890 / 3.890 | 0,14705 | 13 |
| Nahe Clipping-Ebene | 282 / 9 | 600 / 600 | 0,29204 | 13 |

Die Partikel allein benoetigen bei voll sichtbarer Population inklusive Reflexion
2 statt 1.920 Draw Calls. Die anderen sieben Draw Calls bleiben unveraendert.
Die Bilder sind nicht bitidentisch: bei starkem Overlap aus schraeger Sicht
ueberschreiten 1,29 % bzw. nahe der Clip-Ebene 2,15 % der RGB-Kanaele eine
Abweichung von 2/255. Der visuelle Seitenvergleich zeigte keine auffaelligen
Sortierungs-, Tiefen- oder Orientierungsfehler.

Zwei Top-down-Messungen, je 20 Warmup-Frames und 120 Samples, abwechselnde
Reihenfolge der Renderer:

| Lauf | CPU p50 alt / neu | CPU p95 alt / neu |
| --- | ---: | ---: |
| 1 | 32,1 / 1,2 ms | 36,6 / 1,9 ms |
| 2 | 34,5 / 1,3 ms | 53,4 / 1,9 ms |

Gemessen wird `renderer.render`, ohne Pixel-Readback. Das sind lokale
CPU-Aufrufzeiten inklusive eventueller Treiberwartezeit, **keine GPU-Timer und
keine FPS-Prognose fuer komplette Matches**. Fuellrate/Overdraw und Anzahl der
Dreiecke werden hierdurch nicht reduziert. Zielhardware und volle Matches
bleiben separat zu profilieren.

## Absicherung

- Die 900-Frame-Charakterisierung aller Rezepte inklusive Saettigung behaelt den
  bisherigen SHA-256-Fingerprint
  `457556e6a34a14f35a578c51b63484fe4b2f60cd0b6264015f3004bf47de616f`.
- Tests pruefen Kamerawechsel, Sortier-Ties, Frustum-Paritaet mit Three-Sprites,
  Stil-Flags, feste Upload-Puffer, leere Pools und mehrfache Ressourcenfreigabe.
- Vollstaendige Suite: 128 Testdateien; Typecheck sowie Produktions- und
  separater Diagnosebuild erfolgreich. Die bekannte Vite-Chunkgroessenwarnung
  (>500 kB) bleibt offen.
- Scoped Security-Review: keine kritischen oder mit hoher Sicherheit
  belegbaren Sicherheitsbefunde. Keine neuen Netzwerk-, Datei-, Auth- oder
  Admin-Grenzen im Produktivpfad; Diagnosedaten sind lokale synthetische Daten.
  Dies ersetzt kein Deployment-Audit des gesamten Projekts.
