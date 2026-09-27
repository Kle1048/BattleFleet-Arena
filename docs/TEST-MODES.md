# Inseln und Third-Person-Kamera

## Karte ohne Inseln

Unter `http://127.0.0.1:2567/admin` mit dem vorhandenen Admin-Token anmelden.
In **Runtime Config** den Schalter **Islands + collisions** deaktivieren und speichern.
Anschließend **Restart round** auslösen oder einen neuen Raum erstellen.
Aktive Runden behalten bis zum Neustart ihre bisherige Karte. Standard ist **aus**.
Zum Wiedereinschalten denselben Schalter aktivieren, speichern und die Runde neu starten.

`islandsEnabled` wird serverseitig gespeichert, beim Rundenstart übernommen und über
`BattleState` an alle Clients repliziert. Der Client kann die Physik nicht umschalten.
Deaktiviert werden Inselmodelle und Kollisions-Overlays, Inselkontakte/-schäden,
Inselblockaden für Raketen/Torpedos, Land-Einschlageffekte, Spawn-Ausschlussflächen
und die Inselausweichlogik der Bots. Schiff-/Wrackkollisionen und Kartengrenzen bleiben aktiv.
Torpedos bleiben unabhängig davon hinter ihrem bestehenden Feature-Schalter.

Bestehende Konfigurationsdateien ohne das Feld werden mit `false` eingelesen.
Ein ausdrücklich gespeichertes `true` bleibt als Admin-Entscheidung erhalten.
Es gibt keinen neuen ungeschützten Debug-/Admin-Endpunkt.

### Laden und Ressourcen

Lobby, Schiff-Workbench und Runden ohne Inseln laden keine Insel-GLBs und erzeugen
keine Insel- oder Kollisions-Overlay-Geometrien. Erst ein explizites `true` im
Rundenzustand aktiviert den Aufbau; bis die Modelle geladen sind, erscheinen
einfache Ersatzmodelle. Das gemeinsame Limit von zwei parallelen GLB-Ladevorgängen
bleibt erhalten. Der feste Rendering-Benchmark aktiviert Inseln explizit, damit
sein bisheriger Arbeitsumfang vergleichbar bleibt.

Einmal aktivierte Inseln bleiben bis zum Schließen der App zwischengespeichert;
Deaktivieren blendet sie samt Debug-Overlay aus, erneutes Aktivieren lädt sie nicht
noch einmal. Bereits gestartete Downloads werden dabei zu Ende geführt. Beim
Sessionende werden Inseln auch in der Lobby ausgeblendet. Instanzen besitzen nur
ihre Materialkopien; gemeinsame Geometrien und Texturen gehören dem App-Cache.

## Third-Person / Orbit

Spiel mit `?debug=1` öffnen, **Environment Debug → Show → Kamera → Ansicht**:
**Third-Person / Orbit** wählen. Zurückschalten über **Kartenansicht**.

- **Alt + linke Maustaste ziehen:** horizontal um das Schiff drehen, vertikal neigen.
- **Mausrad über der Spielansicht:** näher heran / weiter weg.
- **Orbit hinter Schiff ausrichten:** Blickrichtung erneut am aktuellen Schiffskurs ausrichten.
- Abstand und Neigung sind auch im Kamera-Tab einstellbar (80–2000 m, 8–80°).

Die Kamera folgt der Schiffsposition, nicht jeder Kursänderung. Der Startblick liegt
hinter dem Schiff. Die bisherigen North-up-/Head-up-Parameter gelten ausschließlich
in der Kartenansicht und bleiben beim Umschalten erhalten. Auswahl, Abstand und Neigung
werden lokal gespeichert; der Orbitwinkel wird beim Modus-/Sessionwechsel zurückgesetzt.
Alt-Ziehen löst weder Schüsse noch einen Zielwechsel aus. Normale Mausklicks behalten
ihre Waffenfunktion. Bei Mauspositionen über dem Horizont bleibt der letzte gültige
Wasser-Zielpunkt erhalten (vor dem ersten Treffer: Ziel vor dem Bug).

Der Modus ist eine Testperspektive, kein vollständiges World-of-Warships-Zielsystem:
kein festes Fadenkreuz mit Pointer-Lock, keine Kamera-Kollision mit Inseln und keine
Touch-Orbit-Gesten. Die Standardansicht bleibt unverändert.

## Regressionen

- `createGameScene.test.ts` / `islandGltfVisuals.test.ts`: keine Insel-Downloads im
  Standardmodus, verzögerter Aufbau, Umschalten, Ladefehler, späte Ladeergebnisse
  nach Dispose und getrennte Freigabe von Instanz- und Cache-Ressourcen.
- `islandsMode.test.ts`: Server-Bewegung/Schaden, Raketen, Artillerie, Rundenwechsel,
  rückwärtskompatible Konfiguration und ungültige Datentypen.
- Schema-Publisher/-Adapter: voller Zustand und Delta-Replikation des Kartenparameters.
- Admin-API: Authentisierung, Boolean-Validierung und persistierte Einstellung.
- `thirdPersonCamera.test.ts`: Kursrichtungen, unabhängiger Orbit, Zoom-/Neigungsgrenzen,
  Rückkehr zur Kartenansicht.
- Input-Lebenszyklus: Alt-Geste ohne Schuss, normale Klicks, Mausrad, Fokusverlust und
  vollständige Entfernung der Listener beim Sessionende.
