# Kampf-Referenz: kanonische Modelle

Die veraltete Referenz ist seit 27.09.2026 kontrolliert auf den aktuellen
Modellvertrag migriert. Aufruf: `npm run benchmark:combat`.

## Was geändert wurde

- Der Benchmark liest keine entfernten `mountSockets/*.json` mehr.
- Version 2 prüft FAC, Zerstörer und Kreuzer, den Modellkatalog und alle generierten
  räumlichen Metadaten (Sockets, Rails, Mündungen, Drehpunkte, weitere Marker).
- Nur Anzeigelabels und binäre `sourceSha256`-Werte werden ausgeschlossen.
  Modell-IDs bleiben enthalten, da sie räumliche Gameplay-Daten auswählen.
  Reine Textur-Reexports ändern den Gameplay-Fingerprint nicht; `models:check`
  prüft davor trotzdem, dass die generierten Metadaten zu den gelieferten GLBs passen.
- Unbekannte/neue Datenfelder bleiben im Hash. JSON-Schlüsselreihenfolge wird
  normalisiert; Array-Reihenfolge bleibt signifikant.
- Szenario-Einstellungen sind explizit: Seed 42, 11 bewegte Testspieler und
  5 echte Server-Bots, 60 simulierte Sekunden, 300-Sekunden-Rundendauer,
  AO-Halbausdehnung 4000, Inseln aus. Keine Übernahme lokaler Admin-Daten.
- Die isolierte Storage-Queue wird vor dem Entfernen eigener temporärer Dateien
  geschlossen. Keine Live-Daten oder Einstellungen werden verändert.

Die bisherige Referenz `454cc199…aa165b` bleibt unverändert als
`scripts/fixtures/combat-baseline.pre-canonical.json` erhalten. Auch die noch
ältere Vor-Gepard-Referenz bleibt bestehen. **Keine Behauptung unveränderter
Gameplay-Semantik gegenüber dem alten Modell-/Koordinatenvertrag.**

## Abnahme

Die bereits implementierten neuen Modell-/Mündungsregeln wurden mit
`modelRuntime.contract.test.ts`, `ModelMuzzleEvents.test.ts` und
`gepardContent.test.ts` geprüft. Damit werden Server-/Client-Weltpositionen,
mehrere Schiffsausrichtungen, Turmführung und Projektilursprünge gegen die
gelieferten Modelle kontrolliert, bevor die neue Referenz akzeptiert wird.

Drei Kandidatenläufe liefern identische Content-Fingerprints, Ereigniszähler
und den vollständigen State-/Event-Trace:

`c22be30914ff0046c23de94aaf143bf09e63dc1d407ab3bf617d472eb63a7ce7`

936 Artilleriestarts, 922 Einschläge, 188 ASuM-Starts, 89 ASuM-Impacts,
25 Softkill-Ergebnisse, 29 Lock-Warnungen, 34 Abwehrfeuer, 7 Intercepts,
4 Kollisionskontakte und 16 Nachladeereignisse.

Die Kandidaten lagen bei Median 0,971 / 0,969 / 1,011 ms und p95
1,479 / 1,507 / 1,588 ms. Wegen geänderter Inhalte/Umgebung kein Performance-A/B
gegen die frühere Referenz. Reguläre Läufe prüfen Content, Ereignisse und Trace
weiter streng; `--candidate` überschreibt weiterhin keine Dateien.

Nach der Übernahme bestanden drei reguläre Prüfläufe mit identischem Trace und
identischen Ereignissen/Fingerprints. Mediane 0,964 / 0,793 / 0,790 ms, p95
1,572 / 1,114 / 1,089 ms. Die Laufzeitstreuung ist keine Gameplay-Änderung und
wird nicht als Optimierungsnachweis gewertet.

`combat-content.test.mjs` sichert Mutationen aller Schiffsklassen, Modellrollen,
räumlicher Marker und neuer Felder ab und prüft gezielt die beiden erlaubten
visuellen Ausnahmen. Renderer-Optimierungen dürfen diese neue Kampf-Referenz
nicht verändern.
