# Punkt 7 — Kielwasser-Pufferoptimierung

Umgesetzt am 27.09.2026, getrennt von der Modellpipeline V2 (Punkte 1–6).
Der Ursprung bleibt der erzeugte Modellmarker `bf_wake`. Shader, Sampling-Abstand
(2,15 m), maximale Spurpunkte (96), Geschwindigkeitsgrenze, Breite, Taper und LOD-Regeln bleiben gleich.

## Änderungen

- Positionen/UVs/Index werden einmal pro Spur angelegt: Kapazität 192 Vertices / 570 Indizes.
- Positionen und UVs verwenden `DynamicDrawUsage`; nur der belegte Präfix wird aktualisiert.
- Positionen ändern sich nur bei neuem Spurpunkt oder geänderter Breite. UVs und Breitenfaktoren
  ändern sich nur bei geänderter Punktzahl; die Indextopologie bleibt unverändert.
- Ein begrenzter Ringpuffer ersetzt `push`/`shift`; Punktobjekte und Tangenten-Scratch werden wiederverwendet.
- Stoppen/Ausblenden setzt Sichtbarkeit und Draw-Range zurück, ohne neue leere GPU-Puffer.
- Kein separater `computeBoundingSphere`-Durchlauf. Die Mitte für Three.js-Transparenzsortierung
  wird beim Schreiben der aktiven Vertices erhalten; der konservative Radius folgt direkt aus ihren Grenzen.
  Frustum-Culling bleibt wie zuvor deaktiviert.
- Entfernte Spieler oder fehlende Visuals räumen ihre Spur auf. Materialbesitz bleibt beim System;
  wiederholtes Disposal und späte Updates sind wirkungslos.

## Nachweis

`client/src/game/scene/shipWakeRibbon.test.ts` vergleicht über 1.800 Frames gegen eine unabhängige
Kopie der bisherigen Geometrieformel: identische Float32-Positionen, UVs, Indizes und Sortiermitten.
Enthalten sind Kurven, mehrfacher Ringumlauf, alle Klassenbreiten und Rücksetzen der Spur.
Dabei entstehen 585 Positions-Updateanforderungen, ohne Austausch eines Attributs/Arrays oder
Index-Updates. Unveränderte Frames animieren weiterhin den Shader, ohne Geometrie-Uploadanforderung.
Separate Fälle prüfen Breitenänderung ohne Bewegung, die exakte Sampling-Grenze, eine degenerierte
Umkehr, LOD, fehlende Marker, Stillstand/Rückwärtsfahrt, Respawn und Ressourcenfreigabe.

Die Zählung belegt vermiedene Geometriearbeit/Uploadanforderungen, keinen gemessenen FPS-Gewinn.
Ein GPU-Zeitvergleich wurde für diesen Schritt nicht durchgeführt.

Abschluss: 117 Testdateien (53 Client, 24 Server, 40 Shared), Typprüfung und Produktionsbuild
bestanden. Die bestehende Warnung zum großen Renderer-Chunk bleibt unverändert.
Security-Inspector: keine kritischen oder belastbaren hohen Befunde in diesem Schritt;
Änderungen sind auf begrenzte Renderpuffer, mathematische Helfer und Tests beschränkt.
Keine neuen Netzwerk-, Datei-, Authentifizierungs- oder Importgrenzen.
