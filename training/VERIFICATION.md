# Verifikation des Trainingslagers — 30.09.2026

## Nachtrag: gemeinsame Sensorregeln

- Radar und ESM verwenden zentrale Reichweitenkonstanten für Spieler-HUD und Bots.
- Tests prüfen Radar an/aus, stumme Ziele, die exakten Radar-/ESM-Reichweitengrenzen und die sendende Schiffsklasse.
- Ein passiver Kontakt enthält nur ID und Peilrichtung. Metamorpher Test: andere unbekannte Entfernung, Geschwindigkeit, HP oder anderer Kurs auf derselben Peilung ergeben identische Netzeingaben.
- Regel- und neuronale Strategie können auf ESM-Peilungen schießen; Kanonenfeuer bleibt dabei gesperrt.
- Abschalten des gegnerischen Radars entfernt den passiven Kontakt sofort und verwirft auch zwischengespeicherte Schussbefehle.
- Gemeinsame Radarsteuerung: passiv bei reinem ESM und defensiven Manövern, aktive Suchphasen ohne Kontakte.
- Neues Modell `bfa-tactics-v2-sensors`, 37 Eingaben; neues Training `bfa-duel-v3-sensors` mit 100.352 Schritten abgeschlossen. Exportprüfung auf 64 Beobachtungen bestanden (maximale Logit-Abweichung ca. 4,36 × 10⁻⁷).
- Das neue Modell liegt unter `training/runs/tactics-v2-sensors/policy.json`; der lokale Launcher lädt diesen Stand. Alte Modellverträge werden abgewiesen.
- 42 Shared-, 30 Server- und 61 Client-Testdateien sowie Typechecks aller drei Workspaces bestanden.
- Exportiertes Sensormodell auf 50 separaten Starts geprüft: 42 Siege, 8 Niederlagen. Das ist ein einzelner Trainingslauf im Duellkurs, kein allgemeiner Spielstärkenachweis.
- Lokale Runde mit neuem Modell neu gestartet; Server und Client erreichbar, zwei Bots bei einem Spieler und 300 Sekunden Rundendauer konfiguriert.

Die Radarsteuerung ist eine gemeinsame Regel, noch keine separat erlernte Netz-Ausgabe. Passive Schüsse starten entlang einer Peilung; die Flugkörperphysik und ihr eigener Sucher wurden nicht verändert. Die Wahrnehmungsfilter sichern den Bot-Entscheidungsweg ab, nicht die vollständige Netzwerkreplikation an Spielerclients.

## Sicherheitsprüfung

Keine kritischen oder mit hoher Sicherheit belegten schwerwiegenden Sicherheitsprobleme in den neuen Schnittstellen gefunden.

Geprüft wurden der lokale Python/Node-Prozessaufruf (Argumentlisten ohne Shell), das Laden der Modelldatei, Vertrags-/Dimensions-/Zahlenprüfung, die Größenbegrenzung sowie die Konfiguration über eine ausschließlich serverseitige Umgebungsvariable. Das Trainingslager legt keine öffentlichen API-Endpunkte an und nutzt keine produktiven Ranglisten-/Speicherdienste. TensorBoard ist im Standardbefehl auf 127.0.0.1 begrenzt.

Restrisiko: SB3-Checkpoints können Python-Objekte deserialisieren; nur vertrauenswürdige eigene `.zip`-Dateien verwenden. Runtime-JSON wird als Daten validiert. Der Modellpfad ist eine lokale Betreiberentscheidung. Ein groß angelegter Lasttest der Inferenz bei allen erlaubten Räumen/Bots wurde nicht durchgeführt.

## Technische Prüfungen

- TypeScript-Typechecks von Server, Shared und Client bestanden.
- 30 Server-Testdateien und 41 Shared-Testdateien bestanden, einschließlich der neuen Trainings- und Modelltests.
- Ergänzte gezielte Tests für getrennte Strategieinstanzen pro Bot und Zeitlimit (`truncated` statt `terminated`) bestanden.
- Shared-Produktionsbundle und TypeScript-Serverbuild erstellt.
- Gymnasium-/SB3-Umgebungsprüfung bestanden.
- Zwei gleiche Seeds mit gleicher Aktionsfolge erzeugen identische Zustände/Rewards.
- Tatsächliche PPO-Gewichtsänderung nach kurzem Lernlauf nachgewiesen.
- JSON-Export gegen Python-Actor auf 64 Beobachtungen geprüft.
- Zwei vollständige Gefechte des Smoke-Modells verlaufen in Python und TypeScript identisch.
- Exportmodell in der kompilierten Server-Simulation mit zwei automatisch erzeugten Bots ausgeführt.
- Regulärer Lauf mit vier parallelen Umgebungen und 100.352 Schritten abgeschlossen.
- Fortsetzen aus dem gespeicherten PPO-Checkpoint mit weiteren 512 Schritten geprüft.
- Exportmodell und Regelbaseline auf denselben 50 separaten Starts ausgewertet.
- TensorBoard-Ereignisse inspiziert; Trainings- und Validierungskennzahlen vorhanden.
- `pip check`: keine defekten Python-Abhängigkeiten.

Die Befehle wurden bei der hier defekten npm-Auflösung direkt mit Node und der lokalen Python-Umgebung ausgeführt. Der esbuild-Aufruf benötigte außerhalb der Sandbox Zugriff auf übergeordnete Verzeichnisse. Ein vollständiger Client-Produktionsbuild war nicht Teil dieser Prüfung. Ein grafisches Gefecht im Browser wurde noch nicht beobachtet.

## Reproduzierbare Befehle

```powershell
node training/run.mjs smoke
node training/run.mjs benchmark --steps 2000
node training/run.mjs train --steps 100000 --envs 4 --eval-every 20000 --eval-episodes 8 --output training/runs/new-verification
node training/run.mjs evaluate --policy training/runs/tactics-v1-initial/policy.json --episodes 50 --seed 2000000
node training/run.mjs evaluate --baseline --episodes 50 --seed 2000000
```

Ergebnisse und Einschränkungen sind in `README.md` dokumentiert. Die lokal erzeugten Modell- und Berichtdateien unter `training/runs` sind absichtlich nicht eingecheckt.


## Persönlichkeiten: Trainings- und Prüfergebnis (30.09.2026)

Drei unabhängige PPO-Läufe mit je 100.352 Lernschritten abgeschlossen. Modelle liegen
unter `runs/personality-{aggressive,cautious,objective}-v1/policy.json`; Gewichte sind
unterschiedlich. Ausgewählte Checkpoints: aggressiv 100.000, vorsichtig 50.000,
Auftrag 25.000 Schritte. Die Auswahl eines früheren Standes erfolgt anhand der
Validierung, nicht automatisch anhand des letzten Trainingsschritts.

Beim aggressiven Profil generalisierte die ursprüngliche Auswahl schlecht. Deshalb
wurden alle gespeicherten Stände nochmals auf 32 separaten Validierungsseeds ab
750.000 verglichen (`expanded-validation.json`). `holdout.json` und
`independent-evaluation.json` dieses Profils dokumentieren noch die ursprüngliche
Auswahl. Maßgeblich für das jetzt exportierte Modell ist
`independent-evaluation-final.json`.

Alle drei endgültigen Exporte wurden auf denselben 20 bisher ungenutzten Seeds
3.000.000 bis 3.000.019 geprüft. Die Zeitanteile beziehen sich auf die tatsächlich
überlebte Gesamtzeit, nicht auf 20 vollständig überlebte Fünfminutenrunden.

| Profil | Mittlere Lebensdauer | Abschüsse pro Episode | Zeit in Zone | Radar an |
|---|---:|---:|---:|---:|
| aggressive | 44.7 s | 1.30 | 42.1 % | 100.0 % |
| cautious | 156.3 s | 0.00 | 6.9 % | 8.2 % |
| objective | 59.7 s | 1.85 | 85.5 % | 34.9 % |

Die vorsichtige Policy vermeidet Nahkampf, erzielt aber in diesem Test keinen
Abschuss. Die Auftragspolicy bleibt überwiegend in der Zone, überlebt jedoch noch
nicht zuverlässig. Der aggressive Bot ist noch kein überlegener Jäger: Die
Auftragspolicy erzielt mehr Abschüsse. Hecksektorzeit beim aggressiven Modell beträgt
nur rund 0,8 % der Lebenszeit. Zuverlässige Heckangriffe sind daher **nicht nachgewiesen**.
Diese drei Artefakte sind trainierte Prototypen, keine fertig qualifizierten Gegner.

Verifikation dieser Änderung:

- 43 Shared- und 30 Server-Testdateien bestanden; zusätzliche Profiltests prüfen
  Zielbindung, schwache Ziele, Radar-Doktrin, Rückkehrgrenze, Heckanlauf und Suchablauf.
- TypeScript-Prüfungen für Shared, Server und Client bestanden.
- Smoke-Test für Standard und aggressives Profil bestanden (inklusive Lernupdate und
  vollständigem Python/TypeScript-Rolloutvergleich).
- Jeder endgültige Export: 64 numerische Paritätsprüfungen; maximaler Logitfehler
  höchstens 3,02e-7. Zusätzlich je zwei vollständige Episoden mit exakt gleichen
  Python- und TypeScript-Ergebnissen.
- Lokaler Starter: JavaScript-/TypeScript-Syntax geprüft; ungültige Profilnamen werden
  vor dem Start abgewiesen. Bestehende Sitzung wurde nicht neu gestartet.
- Security-Review gemäß `security-inspector`: keine kritischen oder mit hoher
  Sicherheit festgestellten Sicherheitsprobleme. Modellimport weiterhin datenbasiert,
  größenbegrenzt, Profil-Allowlist; lokale Prozesse ohne Shell-Interpolation und nur
  Loopback-Spielstarter. Kein Deployment und kein grafischer Spieltest dieser Profile.

Nächster fachlicher Trainingsschritt: eigene Szenarien für Heckangriff, Verfolgung
und Raketenangriff nach Rückzug; anschließend mehrere Trainingsseeds, stärkere und
verschiedene Gegner. Die obigen Testseeds dürfen dann nicht wieder zur Modellauswahl
verwendet werden.

## Ausgewogenere Verhaltensregeln – 30.09.2026

Aktuelle Exporte: `personality-aggressive-balanced`, `personality-cautious-balanced`
und `personality-objective-balanced-final` unter `training/runs/`.
Je Profil wurden zuletzt 100.352 weitere PPO-Schritte mit übernommenen Gewichten
trainiert. Trainingsrunden dauern 600 Sekunden einschließlich Respawns; die lokale
Spielrunde bleibt bei 300 Sekunden. Die Herkunft der Startgewichte steht jeweils
in `initialization.json`.

Alle Profile erhalten den Gebietsauftrag und eine kleine gemeinsame Heckpositions-
Belohnung. Heckanläufe sind optional; gültige Kanonenschüsse haben Vorrang.
Auch der vorsichtige Bot darf die Kanone nutzen. Gemeinsame Rückkehr- und
Sicherheitsregeln im Controller ergänzen die gelernte Aktionswahl; sie sind keine
nachgewiesenen Lernerfolge des neuronalen Netzes.

Abschlussvergleich: je 20 vollständige 600-Sekunden-Runden gegen den Regelbot,
Seeds 7000000–7000019. Mittelwerte; Zonen- und Radarzeit beziehen sich auf die
Lebenszeit. Dies ist kein Mehrspieler-Balancetest.

| Profil | Siege | Spielpunkte | Abschüsse | Tode | Kanonenschüsse | Flugkörper | Zone | Radar an |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Aggressiv | 18/20 | 2898,2 | 5,4 | 2,25 | 19,65 | 26,5 | 74,7 % | 100 % |
| Vorsichtig | 0/20 | 969,2 | 0,1 | 9,8 | 11,3 | 12,4 | 19,1 % | 17,0 % |
| Auftrag | 0/20 | 1052,0 | 0,3 | 15,3 | 10,75 | 17,95 | 24,3 % | 20,3 % |

Die gemeinsamen Möglichkeiten sind ausgewogener, die Spielstärke ist es noch
nicht. Insbesondere zuverlässiges Überleben des vorsichtigen Bots und zuverlässige
Gebietskontrolle des Auftragsbots sind nicht nachgewiesen. Auch erfolgreiche
Heckangriffe sind kein belegtes Ergebnis. Die Exporte bleiben Prototypen.
Die Abschlussseeds künftig nicht zur Modellauswahl wiederverwenden.

Verifikation:

- 43 Shared- und 30 Server-Testdateien bestanden. Nach der letzten Anpassung der
  Auftrags-Rückkehrgrenze bestanden zusätzlich Profil-, Modell- und Roster-Tests.
- TypeScript-Prüfungen für Shared, Server und Client bestanden; Shared und Server
  nach den abschließenden Änderungen erneut geprüft.
- Langzeittest prüft exakt 600 Sekunden, Respawns und echte Spielpunkte.
- Jeder Export bestand 64 numerische Paritätsprüfungen (maximaler Logitfehler
  6,14e-7) sowie zwei vollständige Runden mit exakt gleichen Python-/Runtime-Werten.
- Gemischter Roster lädt erfolgreich: Auftrag, aggressiv, aggressiv, vorsichtig.
- Security-Review: keine kritischen oder mit hoher Sicherheit festgestellten
  Sicherheitsprobleme im geänderten Umfang; Modelle bleiben lokal validierte
  Datenartefakte. Kein Deployment.

Vollständige Abschlussdaten: jeweils `independent-evaluation-final.json` in den
oben genannten Modellverzeichnissen. Die früheren Tabellen dieses Dokuments
beschreiben ältere Modelle und kürzere Episoden und sind nicht direkt vergleichbar.
