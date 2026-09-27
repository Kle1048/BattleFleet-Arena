# Gepard/FAC — separate Inhaltsabnahme

Stand: 27.09.2026. Während der Refactoring-Abnahme wurden parallel Gepard-Assets,
Modellzuordnung und FAC-Sockets geändert. Der Nutzer hat ausdrücklich freigegeben:
„Neue Inhalte prüfen und neue Referenz festlegen“. Diese Änderung ist deshalb
separat von der verhaltensgleichen Architektur-Extraktion dokumentiert.

## Geprüfte Wirkung

- Der Rumpf verwendet `hull_gepard.glb`. Hull-spezifische Mount-Modelle werden sowohl
  beim Vorladen als auch beim Anbau aufgelöst. Semantische Waffen-IDs bleiben
  `visual_artillery`, `visual_pdms` und `visual_ssm`; Reichweiten und Abwehrtypen
  werden nicht aus den neuen Modell-Dateinamen abgeleitet.
- Die Artillerieposition wird schiffslokal von Z=-19.3 auf Z=17.25 verschoben,
  der hintere Abwehrsocket von Z=19.3 auf Z=-23.35. Lokal +Z ist Bug.
- Beide SSM-Rails liegen nun auf X=0 bei Z=-18.2 bzw. -10.6 statt X=±2.4/Z=-9.
  Port/Starboard-Zuordnung und Abstrahlwinkel ±π/4 bleiben erhalten. Diese Positionen
  beeinflussen serverseitige Projektilursprünge; sie sind **nicht nur Darstellung**.
- Bewegung, Kollisionsbox, Waffen-IDs, Magazine 2+2 und Reload 20 s bleiben erhalten.
  Rumpfskalierung, Y-Offset und Wake-Ursprung sind separate visuelle Einstellungen.
- `gepardContent.test.ts` sichert die freigegebenen Ursprünge und Transformationen
  in vier Schiffsausrichtungen. Der zusätzliche Modellzuordnungs-Test prüft,
  dass andere Rümpfe und semantische Abwehrrollen unverändert bleiben.
- Produktions-Zwei-Client-Smoke mit geladenen Modellen: Bewegung, Feuer, Abwehr,
  Treffer, Tod/Respawn, gemeinsame Endtabelle, Admin-Neustart und Same-App-Rejoin.
  Keine fehlenden Mount-Templates, Browser-Errors oder Kontextverluste beobachtet.

Dies ist eine technische Integrationsprüfung, keine marinehistorische Vermessung
oder neue Balance-Freigabe für andere Werte.

## Warum eine neue Kampf-Referenz zulässig ist

Der reguläre Kampfbenchmark schlug nach den Inhaltsänderungen mit anderen Events
fehl. Ein prozesslokaler Node-Loader lieferte ausschließlich `fac.json` und
`mountSockets/fac.json` aus Commit `df7ec1f`, ohne Arbeitsdateien zu überschreiben.
Mit dem **aktuellen** Simulationscode entstand damit wieder exakt die alte Referenz:

`e71a7ed372952020e2036ef731f8de84827e2336931ed3da71b28377669c4afd`

Das grenzt die Abweichung auf den Content ab. Die alte Datei bleibt unverändert als
`scripts/fixtures/combat-baseline.pre-gepard.json` erhalten. Erst nach diesem
Nachweis, den Inhaltsprüfungen und der Nutzerfreigabe wurde die aktive Referenz
bewusst geändert, nicht automatisch beim Testfehlschlag.

Neue Referenz, in drei Kandidatenläufen identisch und danach in drei normalen
prüfenden Läufen bestätigt:

`454cc199cde58ca012ee8d2432049496ff36c2e4106734eb98a9d5cf97aa165b`

945 Artillerieschüsse, 193 SSM-Schüsse, 926 Artillerie-Impacts, 96 SSM-Impacts,
26 Softkill-Ergebnisse, 31 Lock-Warnungen, 25 Abwehrfeuer, 10 Intercepts,
8 Kollisionskontakte und 16 Reload-Ereignisse. Prüfende Läufe: Median
1.155/1.221/1.231 ms, p95 1.793/1.799/1.788 ms. Content und Ereignislast haben sich
geändert; kein direkter Speedup-Vergleich zur alten Szene.

Die aktive Fixture enthält zusätzlich SHA-256-Werte des normalisierten
simulationsrelevanten FAC-Contents. Nur Label, Modell-ID, Rumpfskalierung und
clientseitige Visual-Tuning-Werte sind von diesem Headless-Contenthash ausgenommen;
alle übrigen Felder und die Socket-Datei bleiben enthalten. Der vollständige
State-/Event-Trace wird unabhängig davon stets geprüft.

`benchmark-combat.mjs --candidate` gibt ausdrücklich einen **ungeprüften Kandidaten**
aus und überschreibt keine Datei. Der Standardaufruf prüft weiterhin Hash und alle
Event-Zähler streng. Künftige Abweichungen erneut untersuchen, nicht routinemäßig
mit einem neuen Erwartungswert beseitigen.
