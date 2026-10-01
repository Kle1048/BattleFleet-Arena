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

## Stärkevergleich nach weiterem Training – 30.09.2026

Gleiche frische Startseeds 8400000–8400019 für alten und neuen Roster. Je Roster:
120 Fünfminutenduelle, pro Profil 80 Spielteilnahmen; jedes Paar wird mit vertauschten
Seiten geprüft. Siege beruhen auf tatsächlichen Spielpunkten. Keine Unentschieden.
Die Auswahl war vor diesem Abschlussvergleich eingefroren (selection.json).

| Profil | Siege vorher | Siege jetzt | Score vorher Ø | Score jetzt Ø |
|---|---:|---:|---:|---:|
| Aggressiv | 100,00 % | 78,75 % | 1894,50 | 1659,90 |
| Auftrag | 43,75 % | 47,50 % | 939,95 | 1310,55 |
| Vorsichtig | 6,25 % | 23,75 % | 709,55 | 929,10 |

Die Stärkespanne sinkt von 93,75 auf 55 Prozentpunkte. Das ist eine Verbesserung,
aber kein Nachweis annähernd gleicher Stärke. Die Profile kämpfen gegen die
jeweils anderen ausgewählten Modelle; diese Quoten sind keine absoluten Skillwerte
und keine Vorhersage der Siegchance gegen Menschen.

Verhalten im neuen Roster: Radar an 100,0 / 19,1 / 16,7 Prozent der Lebenszeit
(aggressiv / Auftrag / vorsichtig). Durchschnittliche Kanonenschüsse je Runde
33,05 / 18,30 / 7,275; Flugkörperstarts 15,425 / 15,25 / 26,0. Das vorsichtige Profil
bleibt damit überwiegend still und nutzt relativ mehr Flugkörper. Gebietsnutzung
63,5 / 56,3 / 40,5 Prozent; Tode 2,95 / 4,625 / 6,2. Der vorsichtige Bot überlebt
also weiterhin nicht zuverlässiger. Diese Verhaltensmetriken werden nur auf den
je 40 Runden mit dem Profil auf der beobachteten Lernerseite erhoben; Siegraten
und Score berücksichtigen beide Seiten, insgesamt 80 Teilnahmen pro Profil.

Verifikation:

- Alle acht PPO-Versuche vollständig abgeschlossen (1.354.752 neue Schritte);
  zwei Imitationsläufe mit je 16.000 Beispielen. Verworfene Versuche bleiben archiviert.
- Finale Exporte: je 64 numerische Vergleiche, maximaler Logitfehler 9,56e-7.
- Je finalem Modell zwei vollständige Zehnminuten-Runden mit exakt gleichen
  Python-/TypeScript-Ergebnissen, Seeds 8500000 und 8500001. Diese Prüfungen
  nutzen den jeweiligen Trainingsgegner und dienen der Parität, nicht einer
  gemeinsamen Leistungstabelle.
- TrainingArena-Tests: Seed-Replay, Respawns, echte Spielpunkte, Fünfminutenlimit,
  eingesetzte Gegnerstrategie und kompetitiver Reward bestanden. Ein direkter
  Vergleich zeigt identische Kampfzustände bei verändertem Trainingsreward.
- Alle 30 Server-Testdateien sowie die Server-TypeScript-Prüfung bestanden;
  gemischter Roster erfolgreich geladen. Lokaler Neustart abgeschlossen, Client
  und Server antworten mit HTTP 200; 300 Sekunden und normale Spielpunkte bestätigt.
- Security-Inspector: keine kritischen oder mit hoher Sicherheit festgestellten
  Sicherheitsprobleme im geänderten Umfang. Gegnerartefakte bleiben validierte
  lokale JSON-Dateien mit 2-MB-Grenze; keine neuen Netzwerk-/Admin-Endpunkte.
  SB3-Checkpoints bleiben ausschließlich vertrauenswürdige lokale Trainingsdateien.

Daten: `training/runs/balance-20260930/final-tournament.json` und
`baseline-fresh-tournament.json`; Auswahl und Quellcheckpoints in `selection.json`.
Die drei ausgelieferten Modelle liegen unter `training/runs/balance-20260930/final/`.

## Weitere Trainingsrunde – 01.10.2026

Zwei vollständige PPO-Läufe mit je 200.704 neuen Schritten, Lernrate 0,00003,
zwei Umgebungen und 600-Sekunden-Episoden. Aggressiver Gegner eingefroren;
Auftrags- und vorsichtiger Bot aus ihren bisher ausgewählten Checkpoints
initialisiert. Keine Änderung an Spielpunkten, Waffen, Sensoren oder Doktrinen.

Der vorsichtige Bot behielt den initialen Checkpoint: Die exportierten Actor-Layer
sind exakt gleich denen des bisher ausgelieferten Modells. Für Auftrag wurde
der Checkpoint nach 100.000 Schritten ausgewählt. Beide Exporte bestanden je
64 numerische Vergleiche (maximaler Logitfehler 9,73e-7). Beide Trainingsprozesse
endeten erfolgreich; Statusdateien bestätigen zusammen 401.408 Schritte.

Vor den Turnieren festgelegte Übernahmeregel: Die Spanne der Siegquoten muss
in Entwicklung und frischem Abschlusstest sinken, und die niedrigste Siegquote
darf nicht fallen. Im Entwicklungstest mit zwölf gepaarten Seeds ab 9100000
(72 Duelle je Besetzung) sank die Spanne von 77,08 auf 72,92 Prozentpunkte;
die niedrigste Quote stieg von 14,58 auf 16,67 Prozent. Dieser Teil bestand.

Der unabhängige Abschlussvergleich nutzte zwanzig gepaarte Seeds
9200000–9200019: je Besetzung 120 Fünfminutenduelle, vertauschte Seiten,
80 Spielteilnahmen pro Profil. Keine Unentschieden. Beide Besetzungen wurden
auf denselben Starts geprüft; diese Starts wurden nicht zur Checkpointauswahl genutzt.

| Profil | Bisherige Besetzung: Siege | Kandidat: Siege | Score bisher Ø | Score Kandidat Ø |
|---|---:|---:|---:|---:|
| Aggressiv | 73,75 % | 72,50 % | 1645,10 | 1567,90 |
| Auftrag | 38,75 % | 48,75 % | 1197,55 | 1359,75 |
| Vorsichtig | 37,50 % | 28,75 % | 1041,50 | 941,90 |

Die Spanne steigt von 36,25 auf 43,75 Prozentpunkte; zugleich fällt die
niedrigste Siegquote von 37,50 auf 28,75 Prozent. **Abschlussregel nicht erfüllt:
Die bisherigen Spielmodelle bleiben aktiviert.** Der Kandidat verbessert den
Auftragsbot, aber nicht die gemeinsame Balance. Der vorsichtige Actor ist
unverändert; seine schlechtere Quote entsteht durch den veränderten Gegner.
Diese begrenzten Duelltests belegen keine allgemeine oder gleiche Spielstärke.

Daten und Entscheidung: `training/runs/balance-20261001/selection.json`,
`baseline-development.json`, `candidate-development.json`, `baseline-final.json`
und `candidate-final.json`. Neue Checkpoints bleiben in den Unterordnern
`cautious/` und `objective/` erhalten. Kein Austausch im lokalen Starter und
kein Neustart der laufenden Spielsession; keine Änderungen am Simulationscode.

## Erstes Vierertraining ohne Teams – 01.10.2026

Neues Szenario `bfa-ffa4-v1`: genau vier unabhängige Controller, jeder gegen jeden,
300 Sekunden, normale Spielpunkte, fünf Sekunden Respawn und drei Sekunden
Schutz. Bestehende Sensorfilter, Profile und 37 Netzfeatures bleiben erhalten.
Ein Lerner trifft auf drei eingefrorene Modelle (aggressiv, Auftrag, vorsichtig).
Pro Lernerprofil ist somit ein zweites Schiff desselben Profils im Feld.
Keine Teamzugehörigkeit, Kommunikation oder geteilte Belohnung.

Der Reward übernimmt keine fremden HP-Verluste: Im Vierergefecht wären sie ohne
saubere Trefferzuordnung häufig von anderen Gegnern verursacht. Eigene erhaltene
Schäden bleiben negativ; eigene zugerechnete Abschüsse und Spielpunkte zählen.
Die Spielphysik und tatsächlichen Punktvergaben sind unverändert.

Alle drei Läufe wurden erfolgreich mit je **150.528 neuen PPO-Schritten**
abgeschlossen, zusammen **451.584**. Zwei Umgebungen je Profil, Lernrate 0,00003,
Trainingsseeds 301/302/303. Ausgangspunkt waren die zuletzt ausgelieferten Modelle.
Die besten Checkpoints nach Validierung (acht Episoden, zuerst Siege, danach
Punkteabstand zum führenden Gegner) stammen aus Schritt 100.000 / 50.000 / 150.000
für aggressiv / Auftrag / vorsichtig. Alle drei Actor-Gewichte haben sich verändert.

Abschlusstest: 20 neue Starts 10100000–10100019 je Profil und Variante, insgesamt
60 Baseline- und 60 Kandidatengefechte. Immer dieselben drei eingefrorenen Gegner,
identische Starts für Alt/Neu, wechselnde geometrische Startplätze. Kleinere
mittlere Platzierung ist besser. Die Siegquote verlangt den alleinigen ersten Platz.

| Profil | Platz Ø vorher → neu | Punkte Ø vorher → neu | Siege vorher → neu | Tode Ø vorher → neu |
|---|---:|---:|---:|---:|
| Aggressiv | 1,75 → 1,75 | 1555,8 → 1558,0 | 50 % → 35 % | 4,20 → 3,00 |
| Auftrag | 2,95 → 2,80 | 934,8 → 901,8 | 5 % → 10 % | 6,50 → 6,15 |
| Vorsichtig | 2,75 → 2,80 | 1168,2 → 926,0 | 20 % → 5 % | 5,85 → 5,85 |

Vorab festgelegt: mittlere Platzierung und Punkte dürfen nicht schlechter werden,
mindestens eines muss besser werden. Aggressiv erfüllt dieses enge Kriterium mit
nur 2,2 zusätzlichen Punkten bei unveränderter Platzierung; seine Siegquote fällt.
Auftrag und vorsichtig bestehen das Kriterium nicht. **Kein überzeugender Nachweis
eines insgesamt stärkeren oder ausgeglicheneren Rosters; die aktive Spielbesetzung
bleibt unverändert.** Alle FFA-Checkpoints bleiben für weitere Experimente erhalten.
Dies ist ein Pilot mit einem Trainingsseed je Profil, kein allgemeiner Stärkenachweis
und kein Vergleich einer Besetzung aus ausschließlich neuen Modellen.

Verifikation:

- Alle 31 Server-Testdateien und die Server-TypeScript-Prüfung bestanden.
- FFA-Tests prüfen vier unabhängige Gegnerentscheidungen, deterministischen Replay,
  Beobachtungsgrenzen, 300-Sekunden-Ende, Respawns, Platzierung sowie einen gezielt
  isolierten fremden HP-Verlust ohne Schadensbonus für den Lerner.
- Bestehende Duell- und Zehnminuten-Tests bleiben erfolgreich.
- Gym-Brücke bestätigt vier Teilnehmer, drei gehashte Gegner und kompatible Features.
- Je Export 64 numerische Vergleiche; maximaler Logitfehler 1,25e-6.
- Je Profil zwei vollständige Fünfminuten-FFA-Runden mit exakt gleichen Python-
  und TypeScript-Ergebnissen, Seeds 10300000 und 10300001.
- Security-Inspector: keine kritischen oder mit hoher Sicherheit festgestellten
  Sicherheitsprobleme im geänderten Umfang. Lokale Roster maximal 16 KB und exakt
  drei Pfade; Modelle maximal 2 MB mit bestehender Struktur-/Wertevalidierung.
  Gegnerhashes sind Teil des Szenariovertrags. Keine neuen Netzwerkendpunkte.

Reproduktion: `training/runs/ffa4-20261001/plan.json`, `implementation.json`
(Quellhashes), `opponents.json`, `baseline-final.json`, `candidates-final.json`
und `selection.json`. Ergebnisse und Checkpoints pro Profil in dessen Unterordner.
Die Abschlussseeds sind verbraucht; spätere Auswahlen brauchen frische Teststarts.

## Sensoränderung nach dem Vierertraining – 01.10.2026

Passive Sicht 600/900/1200 m; Schadensrauch unter 90 % HP erweitert sie auf
800/1200/1600 m. Aktives Radar 1200/1800/2400 m, jeweils nach Zielklasse
FAC/Zerstörer/Kreuzer. ESM bleibt 1200/1800/2400 m bei aktivem Zielradar und
liefert weiterhin nur Peilungen. Regelbots, neuronale Bots und HMI-Kontakte nutzen
dieselben präzisen Erkennungsregeln. HMI-Radius und Beschriftung: 2400 m.

44 Shared-, 67 Client- und 31 Server-Testdateien bestanden. Die drei
TypeScript-Prüfungen bestanden; nach Ergänzung des HMI-Reichweitenhinweises wurden
HUD-Test und Client-Typecheck erneut erfolgreich ausgeführt. Neue Tests prüfen
alle drei Zielklassen, beide Radarzustände, Sicht-/Rauch-/Radargrenzen einschließlich
direkt außerhalb der Grenze, 90-%-Rauchschwelle, tote Ziele sowie die HMI-Projektion
eines Kreuzers bei 2400 m. Der bestehende Feuerleitkanal bei 800 m bleibt getestet.

Die bestehende lokale gemischte Spielsession wurde mit den neuen Sensorregeln
neu gestartet; Client und Matchmaking antworten mit HTTP 200. Keine neue
Trainingsrunde oder Änderung der Modellgewichte. Frühere Modellmessungen sind
historisch; der neue Sensorvertrag verhindert ein unbemerktes identisches Resume.


### Reduzierte Groessenstaffelung (ersetzt die Reichweiten oben)

Sicht jetzt 600 / 800 / 1000 m, Rauch 800 / ca. 1067 / ca. 1333 m,
Radar und ESM 1200 / 1600 / 2000 m nach Zielklasse FAC / Zerstoerer / Kreuzer.
Faktoren exakt 1, 4/3 und 5/3; Rauchwerte nur in der Anzeige gerundet.
HMI-Radius 2000 m; Sensorvertrag bfa-visual-smoke-radar-v2.
Sechs gezielte Sensor-, Bot-, HUD- und Projektions-Testdateien bestanden.
Lokale gemischte Spielsession mit unveraenderten Modellen neu gestartet.


### Einheitliche Rauchweite

Auf Nutzerwunsch ersetzt Schadensrauch die normale optische Sichtweite nun bei
allen Klassen durch exakt 800 m (auch Kreuzer). Radar und ESM unveraendert.
Sensorvertrag v3; HMI-Hinweis angepasst. Vier gezielte Sensor-/Bot-/HUD-Tests
bestanden; lokale Spielsession neu gestartet, Client und Matchmaking HTTP 200.


### ESM angepasst

ESM erkennt sendende FAC auf 1600 m, Zerstoerer auf 2000 m und Kreuzer
auf 2400 m. ESM-Faktoren sind von Sicht-/Radar-Groessenfaktoren getrennt.
Bots und HMI verwenden dieselbe Reichweitenfunktion; keine neuen Ingame-Hilfetexte.
Sicht, Rauch, Radar, Waffen und Flugkoerperwarnungen unveraendert.
Fuenf gezielte Sensor-/Bot-/HMI-Testdateien und Client-Typecheck bestanden.
Lokale Session neu gestartet, HTTP 200 fuer Client und Matchmaking. Sensorvertrag v4.
