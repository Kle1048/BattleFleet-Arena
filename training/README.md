# BattleFleet-Arena: Trainingslager

## Im lokalen Netzwerk spielen

LAN-Starter (IP-Adresse muss eine eigene private IPv4-Adresse sein):

```powershell
node training/play-local.mjs --profile mixed --lan 192.168.178.97
```

Andere Geräte im selben LAN öffnen `http://192.168.178.97:5173`. Der Starter
baut den Webclient mit der passenden Spielserveradresse und stellt den Build auf
Port 5173 bereit; der Spielserver bindet Port 2567 an dieselbe LAN-Adresse.
Admin-Zugriff bleibt deaktiviert. Ohne `--lan` bleibt der lokale Entwicklungsstart
auf 127.0.0.1 verfügbar. LAN-Starts zeigen Änderungen nach einem erneuten Build/Start.

Die Firewallregel `BattleFleet-Arena-LAN-5173-2567` erlaubt ausschließlich Node,
TCP 5173/2567, die angegebene lokale IP und Gegenstellen im lokalen Subnetz auf
privaten Netzwerkprofilen. Bei geänderter IP lässt sie sich in einer administrativen
PowerShell mit `./training/enable-lan-firewall.ps1 -LanAddress NEUE_IP` aktualisieren.
Es wird keine Router-Portfreigabe benötigt oder eingerichtet.

## Aktuelle Sensorregeln: Sicht, Rauch und größere Radarreichweite

Seit 01.10.2026 gelten für normale und neuronale Bots sowie die Kontaktanzeige:

| Zielklasse | Passive Sicht | Sicht bei Schadensrauch | Aktives Radar | ESM bei sendendem Ziel |
|---|---:|---:|---:|---:|
| FAC | 600 m | 800 m | 1.200 m | 1.600 m |
| Zerstörer | 800 m | 800 m | 1.600 m | 2.000 m |
| Kreuzer | 1.000 m | 800 m | 2.000 m | 2.400 m |

Entscheidend ist die Größe des **Ziels**, nicht des Beobachters. Sicht funktioniert
auch bei beiden Radaren aus und liefert einen präzisen, identifizierten Kontakt.
Die Rauchreichweite gilt unter 90 % HP, passend zum sichtbaren Schadensrauch,
und ersetzt dann die normale Sichtweite durch exakt 800 m bei jeder Klasse.
Damit sinkt beim rauchenden Kreuzer die optische Reichweite von 1.000 auf 800 m;
Radar und ESM bleiben unverändert.
ESM bleibt eine reine Peilung ohne genaue Zielentfernung oder HP. Die Reichweiten
sind inklusive ihrer Grenze; tote Schiffe sind keine aktiven Zielkontakte.

Die HMI-Kontaktfläche zeigt einen Radius von 2.000 m; Blips, Kartenmittenmarker
und Reichweitenbeschriftung verwenden denselben Maßstab. Optische Kontakte bleiben
bei ausgeschaltetem Radar sichtbar. Der vorhandene manuelle Feuerleitkanal bleibt
bei 800 m und kann weiterhin einen manuell bezeichneten Kontakt markieren.
Waffen- und Flugkörper-/Minen-Erkennungsreichweiten wurden nicht angehoben.

Der Trainingsvertrag enthält jetzt `sensorContract: bfa-visual-smoke-radar-v4`.
Die 37 Features und neun Aktionen sind unverändert, bestehende Spielmodelle bleiben
ladbar. Alte Checkpoints dürfen jedoch nicht stillschweigend mit `--resume` unter
neuen Sensorbedingungen fortgesetzt werden: Dafür ist `--initialize-from` mit neuer
Validierung vorgesehen. Alle oben/unten dokumentierten früheren Trainingsresultate
wurden vor dieser Sensoränderung gemessen und gelten nicht als Leistungsnachweis
unter den neuen Regeln.

## Vierergefechte ohne Teams

Das Trainingslager unterstützt jetzt **vier Schiffe, jeder gegen jeden**, mit
300 Sekunden pro Runde, Respawns und den normalen Überlebens-, Sea-Control- und
Abschusspunkten. Ein lernender Bot spielt gegen drei eingefrorene Actor-Modelle.
Für jedes der drei Profile läuft ein eigener PPO-Lauf; die Gegner lernen während
dieses Laufs nicht mit. Das ist Mehrspielertraining gegen feste Gegner, noch keine
Self-Play-Liga und kein Teamtraining.

`--opponent-roster` wählt diesen Modus. Die JSON-Datei enthält genau drei lokale
Policy-Pfade, relativ zum Ordner dieser Datei. Beispiel:

```json
["frozen/aggressive.json", "frozen/objective.json", "frozen/cautious.json"]
```

Die drei Dateien werden als validierte Modelle geladen. Ihre SHA-256-Werte und
Profile sind Teil des Trainingsvertrags. Alle vier Controller besitzen eigenes
Gedächtnis und verwenden die normalen Radar-/ESM-Filter. Die 37 Netzfeatures und
neun Absichten bleiben kompatibel; vorhandene Gewichte können ausdrücklich mit
`--initialize-from` übernommen werden. `--resume` verlangt den identischen Vertrag.

```powershell
node training/run.mjs train --profile cautious --initialize-from training/runs/balance-20260930/final/cautious/best.zip --opponent-roster training/runs/ffa4-20261001/opponents.json --steps 150000 --envs 2 --learning-rate 0.00003 --eval-every 50000 --eval-episodes 8 --selection-metric game --seed 401 --output training/runs/ffa4-next-cautious
```

Jeder Ausgabepfad muss neu sein. Ohne Roster bleibt der bisherige Duellmodus
verfügbar. `--opponent-policy` und `--opponent-roster` schließen sich aus.

### Belohnung und Vergleich im Vierergefecht

Die FFA-Variante hat den eigenen Szenariovertrag `bfa-ffa4-v1`. Eigene Punkte,
zugerechnete Abschüsse, erhaltene Schäden, Tode und die bisherigen kleinen
Positionsanteile zählen weiterhin. **Für fremden HP-Verlust gibt es im FFA keinen
Schadensreward**, auch nicht für eigene nichttödliche Treffer: Der alte Duellwert
kann nicht unterscheiden, welches Schiff den Schaden verursacht hat. Sonst würde
der Lerner belohnt, wenn sich zwei andere Schiffe bekämpfen. Ein Gegner-Score-Abzug
wird in diesem Modus ebenfalls nicht verwendet. Die tatsächlichen Spielpunkte
bleiben davon unberührt.

Ein Sieg verlangt am Rundenende mehr Spielpunkte als jeder der drei Gegner.
Gleichstand an der Spitze zählt als Remis; sonst verliert der Lerner. Zusätzlich
wird die Platzierung erfasst (1 plus Anzahl besser platzierter Gegner; geteilte
Plätze bei Gleichstand). `opponentScore` bezeichnet im FFA den höchsten Gegnerwert.
Die Startplätze wechseln mit `seed % 4`; Lage, Richtung und Kurs werden zusätzlich
seedabhängig variiert. Alte und neue Modelle werden auf exakt denselben Starts
gegen dieselben drei eingefrorenen Gegner verglichen.

```powershell
node --conditions=bfa-source --import tsx training/ffa-evaluate.mts training/runs/ffa4-20261001/baseline.json training/runs/ffa4-20261001/opponents.json training/runs/ffa4-next-evaluation.json 20 10200000
```

Das erste Manifest ordnet Modellnamen ihren Policy-Pfaden zu (absolute Pfade oder
relativ zum Arbeitsverzeichnis). Der Test verändert keine Spielmodelle. Gemessen
werden unter anderem Platzierung, Siege, Punkte, Tode, Gebietszeit und Radarzeit.
Diese Messung prüft jedes Profil gegen den festen Gegnerpool; sie belegt noch
keine gleiche Stärke einer Besetzung aus ausschließlich neuen Modellen.

Der erste Lauf liegt unter `training/runs/ffa4-20261001/`. Plan, eingefrorene Gegner,
Checkpoints und Auswertungen bleiben dort erhalten. Abschließende Resultate stehen
in [VERIFICATION.md](VERIFICATION.md). Die aktive Spielsession wird durch Training
und Export nicht automatisch umgestellt.

**KI verstehen:** Der lokale [Lernkurs mit acht Lektionen](academy/index.html) erklärt unsere Bots von den Sensoren über neuronale Netze und PPO bis zur Auswertung. Er enthält echte Modellberechnungen, Selbsttests, Übungen mit Lösungen und drei animierte Lehrsequenzen. Die einzelne HTML-Datei funktioniert auch offline im Browser. Die Animationen sind schematische Erklärungen, keine Spielaufzeichnungen.

Bei Bedarf im Projektverzeichnis lokal bereitstellen: `training/.venv/Scripts/python.exe -m http.server 5180 --bind 127.0.0.1 --directory training/academy`, dann `http://127.0.0.1:5180/` öffnen. Die eingebetteten Modell-Snapshots mit `node training/academy/build.mjs` erneuern; Lehrberechnungen und Übereinstimmung mit der Spielinferenz prüfen: `node --conditions=bfa-source --import tsx training/academy/verify.mjs`.

**Aktueller Stand:** Das lokale Spiel lädt weiterhin die ausgewählten Modelle aus `training/runs/balance-20260930/final/`. Die zusätzliche Trainingsrunde vom 01.10.2026 wurde abgeschlossen, aber wegen schlechterer Balance im Abschlusstest nicht übernommen. Die Fortsetzungen mit Stärkevergleich sind am Ende dieses Dokuments beschrieben. Ältere Abschnitte dokumentieren frühere Trainingsstände.

Dieses Trainingslager trainiert einen taktischen Bot mit Reinforcement Learning auf der echten, grafiklosen Spielsimulation. Das Ergebnis ist ein neuronales Netz, dessen Gewichte der Spielserver laden kann. Die erste Version ist ein lokales Kommandozeilen-Werkzeug mit TensorBoard für die Lernkurven. Eine eigene Szenario-Weboberfläche oder ein Replay-Viewer ist noch nicht enthalten.

## 1. Was bereits eingerichtet ist

- Isolierte Python-Umgebung unter `training/.venv`.
- Ein reproduzierbarer Trainingskurs: FAC gegen FAC, ein lernender Agent gegen den bestehenden Regelbot, ohne Inseln.
- Gymnasium-Adapter für die TypeScript-`GameSimulation` über lokale Prozess-Pipes, ohne Netzwerkserver.
- PPO-Training mit zwei kleinen neuronalen Netzen und mehreren parallelen Umgebungen.
- Checkpoints, fortsetzbares Training, feste Validierungsstarts und gesonderte Abschlusstests.
- Regelbot als Vergleich auf denselben Teststarts.
- Export der Actor-Gewichte als `policy.json`, einschließlich Versionsvertrag und numerischer Prüfung gegen TypeScript.
- Optionale serverseitige Aktivierung über `BFA_BOT_POLICY_PATH`.
- Automatischer Smoke-Test für Simulation, Lernen, Export und identische Gefechtsverläufe nach dem Export.

Ein erfolgreicher technischer Test bedeutet nicht, dass das Modell schon besser als der Regelbot spielt. Exportierte Modelle werden nicht automatisch im Spiel aktiviert.

### Erster ausgeführter Lauf (30.09.2026)

**Änderung nach dem ersten Spieltest:** Der Action Planner prüft jetzt die tatsächliche Kanonenreichweite und den Mount-Sektor. Er berechnet getrennte Vorhaltepunkte für Geschosse und Flugkörper; bei Flugkörpern berücksichtigt er Zielgeschwindigkeit, feste Rails, Munition, Sucheraktivierung und Suchkegel. Die Geschwindigkeit ist eine Eingabe des Planners, noch keine zusätzliche Eingabe des neuronalen Netzes. Für die neue Sensorversion wird ein eigenes Modell verwendet. Die folgenden historischen Siegquoten gelten für den damaligen Planner und dürfen nicht auf den geänderten Planner übertragen werden.

Aktuell gilt der Szenariovertrag `bfa-duel-v3-sensors` und der Modellvertrag `bfa-tactics-v2-sensors` mit 37 Eingaben. Alte Checkpoints und alte Actor-JSONs sind nicht kompatibel; ein neuer Lauf ist erforderlich. Das Fortsetzen-Beispiel unten gilt nur für Checkpoints mit übereinstimmendem Vertrag. Die historischen Ergebnisse dieses Abschnitts gelten nicht für die neue Sensorversion.

Die Umgebung wurde installiert und `tactics-v1-initial` mit vier Umgebungen und 100.352 tatsächlichen Trainingsschritten abgeschlossen. Das Modell liegt lokal unter `training/runs/tactics-v1-initial/policy.json`, der fortsetzbare Stand unter `last.zip`.

| Prüfung | Ergebnis |
|---|---|
| Smoke-Test | Gymnasium-Vertrag, Seed-Wiederholung, Gewichtsänderung und Export bestanden |
| Exportprüfung des ersten Modells | 64 Beobachtungen; maximale Logit-Abweichung ca. 3,66 × 10⁻⁷ |
| Separater erster Holdout | Modell 5/8 Siege, Regelbaseline 5/8 Siege |
| Zusätzliche 50 feste Starts, Seeds 2.000.000–2.000.049 | Exportmodell 37 Siege / 13 Niederlagen; Regelbaseline 21 Siege / 29 Niederlagen |
| Training fortsetzen | Weiterer 512-Schritte-Lauf aus `last.zip` erfolgreich, separat gespeichert |
| Lernkurven | TensorBoard-Ereignisse bis Schritt 100.352 vorhanden und lesbar |
| Simulation plus Pipe, ohne PPO-Updates | Bei einer Messung ca. 3.227 Entscheidungen/s; hardware- und lastabhängig |

Der größere Test zeigt einen Fortschritt auf diesem Duellkurs (74 % gegenüber 42 % auf denselben Starts). Es ist ein einzelner Trainingsseed und ein begrenztes Szenario, keine Aussage über alle Spielmodi. Die Detailberichte heißen `runtime-evaluation-50.json` und `baseline-evaluation-50.json` im Laufordner. Für Inseln, weitere Klassen und Mehrspielerpartien ist noch Training/Auswertung erforderlich. Das Modell wurde nicht automatisch als Standardbot aktiviert.

## 2. Was genau lernt der Bot?

Der bisherige Ablauf lautet:

```text
Spielzustand → observeWorld → orient → DecisionTreeStrategy → planAction → Steuerbefehle
```

Die neue Variante ersetzt die Entscheidungsstrategie:

```text
Spielzustand → observeWorld → orient → 37 Zahlen → Actor-Netz → BotIntent
                                                               ↓
                                              planAction → Steuerbefehle
```

Das Netz entscheidet, wann Angriff, Verfolgung, Rückzug oder Ausweichen sinnvoll sind. Die neun möglichen Ausgaben stehen in einer festen Reihenfolge:

| Index | Aktion | Bedeutung |
|---:|---|---|
| 0 | ATTACK | Angreifen |
| 1 | CHASE | Gegner verfolgen |
| 2 | REPOSITION | Position verändern |
| 3 | HOLD_ARC | Schusssektor herstellen/halten |
| 4 | TAKE_COVER | Bestehendes Deckungsmanöver anfordern |
| 5 | RETREAT | Zurückziehen |
| 6 | EVADE_MISSILES | Raketen ausweichen |
| 7 | FINISH_TARGET | Geschwächtes Ziel bekämpfen |
| 8 | SEEK_SEA_CONTROL | Kontrollzone ansteuern |

Die genaue Ausführung dieser Manöver bleibt die des vorhandenen `actionPlanner.ts`. Ohne Inseln kann der Deckungs-Intent keine tatsächliche Inseldeckung garantieren. Zielwahl bleibt vorerst die vorhandene Auswahl in `orient`; das Netz wählt keinen beliebigen Gegner selbst aus. Ruderlage, Geschwindigkeit, Waffenbedienung und Zielpunkt werden noch nicht direkt gelernt.

Ein späterer Agent mit direkter Steuerung braucht einen anderen Aktionsvertrag und neues Training. Er ist kein bloßer Schalter dieses Modells.

## 3. Welche Modelle und Bibliotheken verwenden wir?

| Bestandteil | Gewählte Version / Form | Aufgabe |
|---|---|---|
| Python | lokal eingerichtet: 3.12 | Trainingsprogramme |
| PyTorch | 2.8.0, CPU-Build | Tensoren, neuronale Netze, automatische Gradienten und Optimierung |
| Stable-Baselines3 | 2.7.0 | Erprobte PPO-Implementierung, Rollout-Speicher, Actor/Critic und Modell-Checkpoints |
| Gymnasium | 1.2.0 | Einheitlicher Vertrag für Beobachtung, Aktion, Reward und Episodenende |
| NumPy | 2.2.6 | Float32-Beobachtungen und numerische Prüfungen |
| TensorBoard | 2.20.0 | Lokale Lernkurven und Vergleich von Trainingsläufen |
| Node.js / TypeScript / tsx | bestehende Projektumgebung | Echte Gefechtsphysik und Bot-Ausführung |
| Runtime-Modell | `bfa-tactics-v2-sensors`, JSON-Gewichte | Kleines synchrones Netz im TypeScript-Server |

Die Hauptabhängigkeiten sind in `requirements.txt` festgesetzt. Jeder Trainingslauf speichert zusätzlich `requirements-resolved.txt` mit den tatsächlich installierten transitiven Versionen. Für reproduzierbare Experimente müssen auch Code, Trainingsvertrag und Seeds übereinstimmen.

Wir starten mit **PPO (Proximal Policy Optimization)** und der SB3-`MlpPolicy`. MLP bedeutet ein vollständig verbundenes Netz. Es bekommt Zahlenwerte statt Bilder. Es gibt keine vortrainierten Gewichte: Das neue Modell startet mit initialisierten Gewichten und lernt durch Gefechte.

PPO passt zur diskreten Auswahl zwischen neun Manövern und ist ein praktikabler Ausgangspunkt, nicht eine Garantie für die beste Spielstärke. Die offizielle SB3-Dokumentation empfiehlt für kleine MLP-Policies CPU-Ausführung und unterstützt parallele Umgebungen. Eine GPU ist für diese erste Version nicht erforderlich.

Es werden kein Sprachmodell, keine Cloud-API und keine API-Schlüssel benötigt. Laufende API-Kosten entstehen nicht; Rechenzeit, Strom und Speicherplatz bleiben lokale Kosten.

### Warum zunächst kein ONNX?

Für dieses fest definierte Netz reichen drei Matrixmultiplikationen und zwei Tanh-Aktivierungen. Wir exportieren die trainierten Gewichte unmittelbar aus PyTorch und prüfen die TypeScript-Rechnung gegen das Original. Der bestehende Bot-Controller erwartet eine synchrone Entscheidung; ein kleiner synchroner Interpreter passt dazu und benötigt keine zusätzliche native Laufzeit.

ONNX Runtime bleibt eine mögliche spätere Export-/Ausführungsvariante, etwa bei größeren Netzen. Sie ist in dieser Version nicht installiert. Ein `.json`-Modell enthält dabei dieselben gelernten Gewichte; es ist kein neu programmierter Entscheidungsbaum.

## 4. Die neuronalen Netze verstehen

### Actor: Welche Aktion soll ich wählen?

```text
37 Eingaben → Linear(37,64) → Tanh → Linear(64,64) → Tanh → Linear(64,9)
                                                                              ↓
                                                                    9 Aktionswerte
```

Eine Schicht berechnet `y = W · x + b`: `x` sind Eingabewerte, `W` gelernte Verbindungsgewichte und `b` gelernte Verschiebungen. `tanh(y)` begrenzt die Ausgabe auf -1 bis 1 und ermöglicht nichtlineare Zusammenhänge.

Die neun letzten Werte heißen Logits. Beim Training erzeugt eine Softmax daraus eine Wahrscheinlichkeitsverteilung; daraus wird eine Aktion gezogen. Damit probiert der Agent auch Alternativen aus. Bei der Auswertung und im Spiel wählen wir den größten Logit. Das ist eine deterministische Ausführung eines gelernten Modells.

Der Actor hat **7.177 trainierbare Parameter**: 2.432 in der ersten Schicht, 4.160 in der zweiten und 585 in der Ausgabeschicht.

### Critic: Wie gut ist die Situation voraussichtlich?

```text
37 Eingaben → Linear(37,64) → Tanh → Linear(64,64) → Tanh → Linear(64,1)
```

Der Critic schätzt die noch zu erwartende, zeitlich abgezinste Belohnung. Er hilft zu beurteilen, ob eine Aktion besser oder schlechter als erwartet war. Er hat **6.657 Parameter**. Actor und Critic haben separate Gewichte, insgesamt also **13.834 Parameter**. Der Critic wird für das Training benötigt und bleibt im SB3-Checkpoint; das Spiel braucht nur den Actor.

### Wie ändern sich die Gewichte?

1. Der Actor erhält die aktuelle Beobachtung und wählt eine Aktion.
2. Die Simulation führt diese aus. Gespeichert werden Beobachtung, Aktion, alte Aktionswahrscheinlichkeit, Reward und Critic-Schätzung.
3. Nach einem Rollout schätzt PPO aus den Rewards und Critic-Werten die Vorteile der Aktionen (Advantages, hier mit GAE).
4. Gute Aktionen sollen in vergleichbaren Situationen wahrscheinlicher werden, schlechte unwahrscheinlicher.
5. Die PPO-Zielfunktion begrenzt mit Clipping den Anreiz zu großen Änderungen der Aktionswahrscheinlichkeiten. Das ist keine harte Garantie, dass sich das Netz nur wenig ändert.
6. Backpropagation berechnet die Ableitungen dieser Zielfunktion nach den Gewichten. Der Optimierer Adam aktualisiert die Gewichte.
7. Der Critic wird gleichzeitig auf bessere Return-Schätzungen trainiert. Ein kleiner Entropieterm fördert zunächst weitere Exploration.

### Eingaben: 37 feste Werte

Die maßgebliche Reihenfolge ist `POLICY_FEATURES` in `shared/src/bot/learnedPolicy.ts`:

| Gruppe | Anzahl | Verarbeitung |
|---|---:|---|
| Eigene HP, X/Z und Kurs | 5 | HP/maxHP, Position/Kartenhalbweite, Sinus/Cosinus |
| Drei Waffen-Cooldowns, eingehende Raketenanzahl | 4 | Sekunden/30 bzw. Anzahl/8 |
| Ziel vorhanden, relative X/Z, HP, Kurs, Abstand | 7 | Distanzen/2000, HP-Anteil, Sinus/Cosinus |
| Ziel in Waffenwinkeln, Gefahr, Kontrollzone, Gegnerzahl | 5 | Boolesche Werte, Gefahr 0–1, Anzahl/8 |
| Nächste fremde Rakete: relative X/Z und vorhanden | 3 | Distanzen/1000, boolescher Wert |
| Eigener Radarstatus, ESM-Anzahl, ausgewählte Peilung | 4 | Boolesch, Anzahl/8, Sinus/Cosinus; keine Entfernung |
| Letzter Intent als One-Hot-Vektor | 9 | Ein Wert 1, übrige 0; beim Start alle 0 |

Alle Werte werden auf [-1,1] begrenzt und zu Float32 gerundet. Fehlende Ziele/Raketen erhalten Nullwerte samt eigenem Vorhanden-Flag. Es gibt keine zusätzlich erlernte Normalisierung und keine laufende `VecNormalize`-Statistik, die beim Export vergessen werden könnte.

Die erste Version enthält noch keine Geschwindigkeit, Beobachtungshistorie, Inselgeometrie oder explizite Minenpositionen im Netz-Input. Wahrnehmung und Planner sehen ausschließlich gefilterte Sensordaten. Die Policy ist daher keine vollständige Beschreibung des physikalischen Zustands; sie muss unter begrenzter Information entscheiden. Erweiterungen ändern die Vertragsversion und erfordern neues Training.

Die gemeinsame Wahrnehmung filtert die Server-Bot-Projektion vor Regelstrategie, neuronaler Strategie und Action Planner. Präzise Schiffskontakte gibt es nur bei eingeschaltetem eigenem Radar bis 600 m. ESM funktioniert auch bei ausgeschaltetem eigenen Radar, aber nur gegen sendende Gegner: bis 1.200 m bei FAC, 1.800 m bei Zerstörern und 2.400 m bei Kreuzern (Klasse des Senders). ESM liefert ausschließlich Identität und Peilrichtung, keine Entfernung, Geschwindigkeit, HP oder Position. Verschwundene Kontakte werden nicht heimlich weiterverfolgt.

Flugkörper können entlang einer ESM-Peilung gestartet werden; danach muss ihr eigener Sucher das Ziel erfassen. Es wurde keine automatische Radaremissions-Zielsuchfunktion in die Flugkörper eingebaut. Kanonenfeuer erfordert einen genauen Radarkontakt in Waffenreichweite. Bei Kontaktverlust werden auch zwischengespeicherte Feuerbefehle sofort erneuert.

Beide Bot-Arten verwenden dieselbe regelbasierte Radarsteuerung: Radar aus bei Rückzug, Ausweichen, Deckung und rein passiver Verfolgung; an bei genauer Zielverfolgung; ohne Kontakte zwei Sekunden Suchbetrieb je acht Sekunden, pro Schiff zeitlich versetzt. Das Netz wählt weiterhin die Taktik und erhält Radarstatus/ESM als Eingaben; es besitzt noch keine separate gelernte Radar-Ein/Aus-Aktion. Trainingsstarts variieren zusätzlich die Phase des Suchzyklus. Raketenwarnungen bleiben lokal bis 600 m auch bei ausgeschaltetem Radar verfügbar; Minenkontakte sind auf eingeschaltetes Radar und 600 m begrenzt.

## 5. Trainingskurs und Belohnung

Der aktuelle Kurs heißt `bfa-duel-v3-sensors` (ursprünglicher Lauf: `bfa-duel-v1`):

- Zwei FACs, keine Inseln, Kartenhalbweite 1.200 Meter.
- Zufällige Ausrichtung, Abstand 300–800 Meter, zufällig verschobenes Zentrum.
- Gleicher Regelbot als Gegner, dessen bestehender Controller unverändert bleibt.
- Physik mit 20 Hz: pro Tick 50 ms.
- Eine neue Lernaktion alle drei Ticks, also alle 150 ms. Der bestehende Controller entscheidet bei diesem Tickraster ebenfalls alle 150 ms; sein Planner arbeitet weiter mit seiner bisherigen Kadenz.
- Ende beim ersten Tod oder nach 180 simulierten Sekunden. Kein Respawn innerhalb einer Episode.
- Passive XP sind abgeschaltet, damit das Duell nicht durch Zeitablauf die Schiffsklasse wechselt. Die sonstigen Kampfregeln, einschließlich Regeneration und Waffen, kommen aus der echten Simulation.

Die Belohnung pro Agentenschritt ist:

```text
  normalisierter gegnerischer Netto-HP-Verlust
- normalisierter eigener Netto-HP-Verlust
- 0,01 × neue eigene collisionContact-Ereignisse
+ 5 bei Sieg beziehungsweise -5 bei Niederlage
```

HP-Verluste werden pro Physiktick mit `max(0, vorherigeHP - aktuelleHP) / vorherigeMaxHP` gemessen. Das ist **Netto-HP-Verlust nach Regeneration**, keine exakte Treffer- oder Schadensattribution. Auch Umweltschaden kann dadurch eingehen. Für diesen ersten Duellkurs ist das ein einfacher Start; für Teamspiele und mehrere Gegner wäre eine explizite Schadensquelle erforderlich.

Ein Zeitlimit zählt im Bericht als Unentschieden und als Gymnasium-`truncated`. Tod zählt als `terminated`; bei beidseitigem Tod ist das Ergebnis ebenfalls Unentschieden. Es gibt keinen zusätzlichen Unentschieden-Bonus. Die Unterscheidung zwischen Tod und Zeitlimit ist für die Werteschätzung wichtig.

Es gibt noch keinen Reward für Kontrollzonen. Obwohl der entsprechende Intent auswählbar ist, trainiert dieser Kurs primär Duellverhalten. Überleben allein erhält keinen Bonus. Reward-Gewichte sind Startwerte; sie müssen anhand beobachteter Gefechte und unabhängiger Testergebnisse überprüft werden.

## 6. Gewählte Hyperparameter

| Einstellung | Standard | Zweck |
|---|---:|---|
| Parallele Umgebungen | 4 | Unabhängige Simulatoren sammeln Erfahrung |
| Schritte pro Umgebung/Rollout | 512 | Mit 4 Umgebungen: 2.048 Übergänge pro Update |
| Minibatch | 128 | Größe einer Optimierungscharge |
| Optimierungsepochen | 10 | Mehrere Durchläufe über einen Rollout |
| Lernrate | 0,0003 | Schrittweite von Adam |
| Gamma | 0,995 | Gewicht zukünftiger Rewards; bei 150 ms etwa 30 s geometrische Zeitskala |
| GAE Lambda | 0,95 | Kompromiss zwischen Varianz und Verzerrung der Advantage-Schätzung |
| PPO Clip | 0,2 | Begrenzt den Anreiz zu großen Policy-Änderungen |
| Entropiegewicht | 0,01 | Exploration |
| Critic-Gewicht | 0,5 | Gewicht des Value-Loss |
| Max. Gradientennorm | 0,5 | Begrenzung großer Gradienten |
| Ziel-KL | 0,03 | Zusätzlicher früher Stopp bei großer Policy-Änderung |
| Standardbudget | 100.000 Schritte | Erster konfigurierbarer Lauf, keine Spielstärkegarantie |

`--steps` zählt Übergänge über alle Umgebungen zusammen. SB3 beendet vollständige Rollouts; die tatsächliche Schrittzahl kann das gewünschte Budget deshalb etwas überschreiten. Vier Umgebungen sind für Simulator-Parallelität zuständig; PyTorch verwendet im Trainingsprozess zunächst einen CPU-Thread. Mehr Umgebungen sind nicht zwangsläufig schneller: erst messen.

## 7. Starten

### Lokal gegen zwei trainierte Bots spielen

```powershell
node training/play-local.mjs
```

Danach `http://127.0.0.1:5173` öffnen. Der Launcher startet Server und Client ausschließlich lokal, lädt `tactics-v2-sensors/policy.json` und stellt drei Teilnehmer ein: bei einem menschlichen Spieler zwei trainierte Bots. Die Runde dauert fünf Minuten, Inseln und passive XP sind ausgeschaltet. Eigene Testdaten liegen unter `training/runs/local-play/server-data`. Strg+C beendet beide Dienste; belegte Ports 2567 oder 5173 werden gemeldet. Das neue Sensormodell muss vorhanden sein.

Alle Befehle werden aus dem Repository-Hauptverzeichnis ausgeführt. Node.js und die vorhandenen Projektabhängigkeiten müssen verfügbar sein. Die Python-Umgebung muss nicht aktiviert werden; der Launcher verwendet sie direkt.

### Einrichtung auf einem anderen Windows-Rechner

```powershell
powershell -ExecutionPolicy Bypass -File training/setup.ps1 -Python python
```

Alternativ bei mehreren Installationen den absoluten Pfad zur gewünschten Python-3.12-Installation an `-Python` übergeben. Das Skript installiert die Bibliotheken nur in `training/.venv`. Auf diesem Rechner wurde diese Umgebung bereits eingerichtet.

Unter Linux/macOS:

```bash
python3 -m venv training/.venv
training/.venv/bin/python -m pip install torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu
training/.venv/bin/python -m pip install -r training/requirements.txt
```

Die Linux/macOS-Anleitung ist nicht auf diesem Windows-System getestet. Insbesondere auf macOS kann statt des CPU-Index die reguläre PyTorch-Distribution erforderlich sein.

### Technischer Funktionstest

```powershell
node training/run.mjs smoke
```

Prüft den Gym-Vertrag, deterministische Wiederholung, tatsächliche Gewichtsänderung nach 256 PPO-Schritten, Speichern/Laden, 64 numerische Exportvergleiche und zwei vollständige identische Gefechtsverläufe in Python/TypeScript. Das dabei gespeicherte Modell ist nur ein Pipeline-Testmodell.

### Durchsatz messen

```powershell
node training/run.mjs benchmark --steps 2000
```

Die Messung enthält Prozesskommunikation und die Simulation, aber keinen PPO-Optimierungsschritt. Die ausgegebene Echtzeitbeschleunigung ist näherungsweise, weil ein Tod den letzten Agentenschritt vorzeitig beenden kann.

### Training starten

```powershell
node training/run.mjs train --steps 100000 --envs 4 --output training/runs/tactics-v1
```

Ein vorhandener Ausgabeordner wird nicht überschrieben. Ohne `--output` wird ein Zeitstempelordner verwendet. Für einen längeren Versuch zum Beispiel `--steps 1000000` verwenden, nachdem Durchsatz und erste Lernkurven geprüft wurden.

### Lernkurven öffnen

```powershell
node training/run.mjs dashboard
```

Danach `http://127.0.0.1:6006` im Browser öffnen. TensorBoard bindet standardmäßig ausschließlich an die lokale Loopback-Adresse. Interessant sind `rollout/ep_rew_mean`, `rollout/ep_len_mean`, `train/entropy_loss`, `train/value_loss`, `train/explained_variance`, `train/approx_kl` sowie `validation/win_rate`, `validation/mean_reward` und `validation/mean_collisions`.

Mehr Reward allein beweist keine bessere Spielstärke. Siegquote und Verhalten müssen ebenfalls stimmen; der Value-Loss darf nicht isoliert als Qualitätsmaß interpretiert werden.

### Unterbrechen und fortsetzen

Strg+C speichert bei einer Unterbrechung während `learn()` einen `interrupted.zip`-Checkpoint. Ein harter Prozessabbruch kann keinen neuen Checkpoint garantieren; bereits geschriebene Checkpoints bleiben vorhanden. Unterbrechungen während späterer Auswertung/Export lassen den zuvor gespeicherten Modellstand bestehen.

```powershell
node training/run.mjs train --resume training/runs/tactics-v1/last.zip --steps 200000 --output training/runs/tactics-v2
```

Das lädt Gewichte und Optimiererzustand und sammelt neue Rollouts. Es stellt keine bitgenaue Fortsetzung des letzten Simulationszustands dar. Ein neuer Lauf bekommt eigene Validierung und wählt seinen besten Checkpoint innerhalb dieses Laufs; der frühere Lauf wird nicht verändert.

### Einzelne Modelle auswerten oder erneut exportieren

```powershell
node training/run.mjs evaluate --model training/runs/tactics-v1/best.zip --episodes 50 --seed 2000000 --output training/runs/tactics-v1/release-evaluation.json
node training/run.mjs evaluate --baseline --episodes 50 --seed 2000000 --output training/runs/tactics-v1/release-baseline.json
node training/run.mjs export --model training/runs/tactics-v1/best.zip --output training/runs/tactics-v1/policy.json
node training/run.mjs evaluate --policy training/runs/tactics-v1/policy.json --episodes 50 --seed 2000000
```

Export prüft erst die Übereinstimmung mit dem aktuellen Vertrag und die numerische Parität. `--policy` prüft tatsächlich das im TypeScript-Worker laufende Exportmodell.

Dieselben Befehle sind auch als `npm run training:smoke`, `training:train`, `training:evaluate`, `training:export`, `training:benchmark` und `training:dashboard` verfügbar. Argumente bei npm nach `--` übergeben. Falls die lokale npm-Installation defekt ist, funktionieren die direkten `node training/run.mjs …`-Befehle unabhängig davon.

## 8. Was ein Trainingslauf hinterlässt

| Datei | Inhalt |
|---|---|
| `run.json` | Startkonfiguration, Bibliotheken, Git-Commit und Trainingsvertrag |
| `requirements-resolved.txt` | Tatsächlich installierte Python-Versionen der Pakete |
| `checkpoint-<steps>.zip` | Periodischer SB3-Stand zum Weitertrainieren |
| `best.zip` | Bester geprüfter Stand dieses Laufs nach Siegquote, dann Reward |
| `last.zip` | Letzter Trainingsstand |
| `validation-*.json` | Ergebnisse auf festen Validierungsstarts |
| `holdout.json` | Abschlusstest von ausgewähltem Modell und Regelbaseline |
| `policy.json` | Export für den Spielserver, nur Actor |
| `tensorboard/` | Lernkurven |
| `status.json` | Abschluss- oder Unterbrechungsstatus, soweit erreicht |

`run.json` dokumentiert den Start und bleibt unverändert; für den Abschluss `status.json` lesen. Bei einem Fehler ohne Abschlussstatus sind die Dateien zu prüfen. Der Git-Commit allein bildet uncommittete Änderungen nicht ab: Für streng reproduzierbare Experimente den passenden Quellstand zusätzlich sichern.

Die Modellgewichte sind nicht Bestandteil von Git. `.venv`, Caches und `training/runs` werden ignoriert. Gute Modelle und ihre Berichte deshalb gesondert sichern. Ein einzelnes Modell kann viele Bot-Schiffe steuern; pro Schiff bleibt ein eigener Controller mit eigener Erinnerung bestehen.

## 9. Aussagekräftige Auswertung

Die regulären zufälligen Trainingsstarts liegen im Seed-Bereich 0–499.999. Die feste Validierung beginnt bei 500.000 und die abschließende Holdout-Prüfung bei 1.000.000. Die explizite Startseed eines Trainingslaufs sollte ebenfalls unter 500.000 liegen. Weitere Freigabetests können ab 2.000.000 laufen.

Alle Kandidaten werden in einem Lauf auf denselben Validierungsstarts geprüft. Auswahlkriterium ist zuerst die Siegquote, bei Gleichstand der mittlere Reward. Der Holdout dient anschließend der Bewertung und nicht der automatischen Checkpoint-Auswahl. Wird immer wieder anhand desselben Holdouts nachgebessert, ist er praktisch ebenfalls zum Validierungssatz geworden; dann neue Teststarts reservieren.

Acht Episoden sind der schnelle Entwicklungsstandard und statistisch schwach. Für eine Freigabe mindestens einen deutlich größeren, vorher festgelegten Test durchführen, mehrere Trainingsseeds vergleichen und Sieg/Niederlage/Unentschieden gemeinsam berichten. Eine zufällige Siegquote über 50 % in wenigen Gefechten ist kein belastbarer Fortschritt.

Zusätzlich prüfen: Kollisionen, Ausweichverhalten, Flucht/Stillstand, Verhalten bei niedrigem HP und Kosten pro Entscheidung bei realer Botzahl. Der aktuelle Kurs prüft keine Inseln, andere Schiffsklassen, Mehrspielerpartien oder Teamtaktik. Ein gutes Ergebnis hier ist deshalb noch keine Freigabe für alle Spielmodi.

## 10. Mit dem Spiel verknüpfen

Nach Prüfung eines Exportmodells kann es beim Serverstart aktiviert werden:

```powershell
$env:BFA_BOT_POLICY_PATH = (Resolve-Path 'training/runs/tactics-v1/policy.json').Path
npm run dev:server
```

Direkter Start bei einer defekten npm-Installation:

```powershell
node --conditions=bfa-source --import tsx server/src/index.ts
```

Client und sonstige Serverkonfiguration bleiben wie bisher. Ohne gesetzte Modellvariable werden die vorhandenen Regelbots verwendet. Rückkehr zu Regelbots:

```powershell
Remove-Item Env:BFA_BOT_POLICY_PATH -ErrorAction SilentlyContinue
```

Anschließend den Server neu starten. Das Modell wird einmal beim Prozessstart geladen; es gibt keinen automatischen Hot-Reload und keinen öffentlichen Upload-Endpunkt. Es gilt für die serverseitig erzeugten Bots, nicht für den optionalen Client-Debugbot.

Ein explizit konfiguriertes, fehlendes oder inkompatibles Modell bricht den Start mit einer Fehlermeldung ab. Das verhindert, dass versehentlich ein anderes Verhalten als das konfigurierte Modell läuft. Version, Feature-/Aktionsreihenfolge, Dimensionen, numerische Gewichte und eine Dateigröße von maximal 2 MB werden geprüft.

Das erste Exportmodell kennt ausschließlich den oben beschriebenen Kurs. Auf einem normalen Server mit Inseln und mehreren Schiffsklassen ist die Integration technisch nutzbar, die Spielqualität dort aber noch nicht nachgewiesen. Zunächst in einem lokalen Testspiel beurteilen.

## 11. Sicherheit und Betriebsgrenzen

- Training läuft lokal über stdin/stdout. Es wird kein zusätzlicher Trainingsport geöffnet.
- Die Spielsimulation schreibt im Training keine Ranglisten und greift nicht auf die produktive Speicherung zu.
- SB3-`.zip`-Checkpoints können serialisierte Python-Objekte enthalten: nur eigene vertrauenswürdige Checkpoints laden. Das Runtime-JSON enthält ausschließlich Daten.
- Der Modellpfad ist eine lokale Betreiberkonfiguration, kein Wert aus einer Spieleranfrage.
- Der Worker meldet ungültige Aktionen und Seeds; der Python-Adapter beendet nicht antwortende Worker nach 30 Sekunden.
- TensorBoard nur lokal betreiben. Training und große Auswertungen nicht unbemerkt auf einem ausgelasteten Spielserver starten.
- Ein laufendes Spiel verändert keine Modellgewichte. Neue Modelle kommen aus neuen Trainingsläufen und werden bewusst aktiviert.

## 12. Nächste Ausbaustufen

1. **Duellbasis verbessern:** mehrere Trainingsseeds, längere Trainingsläufe, Reward-Auswertung, unabhängige Tests und gefilmte/reproduzierte Gefechte.
2. **Wahrnehmung erweitern:** Geschwindigkeit und einige vorherige Beobachtungen, Minen und Inselabstände. Feature-Version erhöhen; Policy neu trainieren. Frame-Stacking ist zunächst einfacher als ein LSTM.
3. **Curriculum:** erst offenes Wasser, dann Inseln, verschiedene Entfernungen, weitere Schiffsklassen und mehrere Gegner. Bisher ist ausschließlich der erste Kurs implementiert.
4. **Gegnerpool und Self-Play:** eingefrorene ältere Policies und unterschiedliche Regelgegner mischen. Nicht nur gleichzeitig gegen die jeweils neueste Policy lernen; das kann instabil werden.
5. **Zielwahl/Wunschabstand:** zusätzliche diskrete Ausgaben. Direkte kontinuierliche Steuerung erst als eigener, deutlich komplexerer Trainingsversuch.
6. **Bedienoberfläche und Replays:** Kurse verwalten, Läufe starten/stoppen und Gefechte ansehen. TensorBoard deckt bisher nur die Lernkurven ab.

## 13. Codekarte und Originalquellen

| Datei | Verantwortung |
|---|---|
| `server/src/training/TrainingArena.ts` | Kurs, Reset, Seed, Simulationstakte, Rewards und Episodenende |
| `server/src/training/worker.ts` | JSON-Protokoll zum lokalen Python-Prozess |
| `training/environment.py` | Gymnasium-Adapter und Prozesslebenszyklus |
| `training/camp.py` | PPO, Auswertung, Checkpoints, Export und Smoke-Test |
| `shared/src/bot/learnedPolicy.ts` | Gemeinsamer Beobachtungsvertrag und Runtime-Netz |
| `shared/src/bot/botController.ts` | Austauschbare Entscheidungsstrategie |
| `server/src/application/botPolicy.ts` | Sicher begrenztes Laden des lokalen Modells |
| `server/src/simulation/systems/BotSystem.ts` | Eigener Controller je serverseitigem Bot |

- [Stable-Baselines3: PPO, Aktionsräume, CPU-Ausführung und Hyperparameter](https://stable-baselines3.readthedocs.io/en/master/modules/ppo.html)
- [Gymnasium: Env, reset/step sowie terminated/truncated](https://gymnasium.farama.org/api/env/)
- [Gymnasium: eigene Umgebung erstellen](https://gymnasium.farama.org/introduction/create_custom_env/)
- [Originalarbeit: Proximal Policy Optimization Algorithms](https://arxiv.org/abs/1707.06347)
- [PyTorch](https://pytorch.org/)
- [ONNX Runtime für Node.js als spätere Alternative](https://onnxruntime.ai/docs/get-started/with-javascript/node.html)

Bibliotheksdokumentation erklärt die allgemeinen Mechanismen; Architektur, Feature-Vertrag, Rewards und Parameter oben sind die konkreten Entscheidungen dieses Projekts.


## Drei separat trainierte Persönlichkeiten

Der Trainingskurs `bfa-personalities-v1` ergänzt drei eigenständige PPO-Modelle:
`aggressive`, `cautious` und `objective`. Jeder Lauf beginnt mit eigenen Gewichten;
es werden nicht nur drei Namen an dasselbe Modell vergeben. Die bestehende Standard-Policy
bleibt ladbar. Das Profil steht im JSON-Artefakt und wird beim Laden geprüft und vom
Spielcontroller übernommen. Ein unbekanntes Profil führt zum Fehler.

### Was das Netz lernt und was vorgegeben ist

Die Architektur bleibt bewusst hybrid. Das Netz wählt situationsabhängig aus neun
Absichten (Angriff, Verfolgung, Umpositionierung, Ausrichten, Deckung, Rückzug,
Ausweichen, Ziel erledigen, Gebiet aufsuchen). Schiffsteuerung, Ballistik,
Raketenstartbedingungen, Sensorfilter und Doktrin setzt der gemeinsame Controller um.
Deshalb sind die Eigenschaften nicht allein durch neuronales Lernen entstanden.

- **Aggressiv:** Bei der Zielwahl zählen bekannte niedrige HP und ein starker Bonus für
  das bereits verfolgte Ziel. Solange es erkannt bleibt, gibt es kein Zeitlimit für
  die Zielbindung. Verfolgung/Umpositionierung können einen Punkt 180 m hinter dem
  beobachteten Ziel ansteuern. Nach Kontaktverlust darf der Bot 30 Sekunden lang zur
  letzten bekannten Position suchen, aber darauf nicht präzise feuern. Radar ist
  auch beim Rückzug immer eingeschaltet.
- **Vorsichtig:** Radar sendet eine Sekunde je zwölf Sekunden (rund 8,3 %).
  Rückzug fährt mit Vorwärtsfahrt vom Kontakt weg. Unter 380 m Abstand wird nach
  außen gedreht; ansonsten kann der Bot bei geringer Fahrt die Raketenstarter
  ausrichten. Er verwendet keine offensive Kanonenattacke. Raketen können weiterhin
  auf aktuelle Radarziele oder passive Peilungen gestartet werden. Der Start bedeutet
  keine garantierte Zielerfassung durch den Suchkopf.
- **Auftragsorientiert:** Präzise Ziele werden nur in der Zone bzw. ihrem 80-m-Rand
  priorisiert (Quadrat mit Halbkante 500 m; eigentliche Zone: 420 m).
  Außerhalb dieser Grenze erzwingt die Doktrin die Rückkehr. Gebietspatrouille steuert
  Punkte auf einem Kreis mit Radius 240 m an. Rückzug und Ausweichen stehen dem Netz
  weiterhin zur Verfügung. Bei einer reinen ESM-Peilung ist die Lage des Senders
  relativ zur Zone unbekannt; der Bot kann aus dem Gebiet auf die Peilung schießen.

Alle Profile kennen Gegner nur über denselben Sensorfilter: Radar bis 600 m bei
aktivem eigenen Radar; passive Peilungen auf aktive Sender innerhalb ihrer
klassenabhängigen ESM-Reichweite. Eine Peilung verrät weder Entfernung, HP noch Kurs.
Der Reward darf zur Bewertung den vollständigen Simulationszustand verwenden; diese
Information wird nicht zusätzlich an das Netz weitergereicht.

### Netze und Software

Pro Profil: Actor `37 → 64 → 64 → 9`, Critic `37 → 64 → 64 → 1`, Tanh in den beiden
verdeckten Schichten. Der Actor wählt die Absicht. Der Critic schätzt beim Training den
zukünftigen Reward und wird nicht ins Spiel exportiert. Es gibt kein LSTM; die begrenzte
Zielerinnerung verwaltet der Controller. Der Actor hat 7.177, der Critic 6.657 Parameter.

Wir nutzen die bereits installierten Versionen PyTorch 2.8.0 CPU, Stable-Baselines3
2.7.0 (PPO), Gymnasium 1.2.0, NumPy 2.2.6 und TensorBoard 2.20.0. Die Spielphysik läuft
unverändert im TypeScript-Worker. Vier parallele Umgebungen sammeln Erfahrungen;
PPO aktualisiert die Netze in Batches. Hyperparameter: Rollout 512 Schritte je Umgebung,
Batch 128, 10 Epochen, Lernrate 0,0003, Gamma 0,995, GAE 0,95, Clip 0,2,
Entropiebonus 0,01. Ein Entscheidungsschritt entspricht 150 ms Spielzeit.

### Unterschiedliche Belohnungen

HP-Verlust wird als Anteil der maximalen HP gemessen, nach Regeneration; er ist kein
exakt einem Schützen zugeordneter Schadenszähler. Auch Umweltschaden kann enthalten sein.

| Ereignis | Aggressiv | Vorsichtig | Auftrag |
|---|---:|---:|---:|
| Gegner verliert 100 % HP | +3 | +0,5 | +2, wenn Gegner in der Zone |
| Eigener Verlust von 100 % HP | −0,5 | −4 | −2 |
| Gegner wird versenkt | +10 | +2 | +3 |
| Eigene Versenkung | −3 | −12 | −8 |
| Sekunde hinter Gegner, unter 300 m | +0,02 | 0 | 0 |
| Überlebte Sekunde | 0 | +0,03 | 0 |
| Sekunde näher als 300 m am lebenden Gegner | 0 | −0,04 | 0 |
| Sekunde in der Sea-Control-Zone | 0 | 0 | +0,05 |

Zusätzlich gilt −0,01 je gemeldetem Kollisionskontakt. Der Hinter-dem-Ziel-Bonus ist
nur ein geometrischer Näherungswert (hinterer Sektor mit Richtungs-Cosinus < −0,7),
kein Nachweis, dass jede gegnerische Waffenanlage dort einen Totsektor hat.

Die Episode endet nach fünf Minuten oder der eigenen Versenkung. Der Gegner respawnt
nach zehn Sekunden, damit ein früher Abschuss die Überlebens- und Gebietsbewertung
nicht abkürzt. Startlagen und Kurse variieren reproduzierbar per Seed. Die erste Serie
nutzt einen Regelbot als Gegner, keine menschlichen Spieler und kein Self-Play.
Die Spawnklasse ist FAC; die echte Spielsimulation kann durch Kampf-XP Klassen wechseln.

### Training, Auswahl und Spielanbindung

```powershell
node training/run.mjs train --profile aggressive --steps 100000 --envs 4 --eval-every 25000 --eval-episodes 8 --output training/runs/personality-aggressive-v1
node training/run.mjs train --profile cautious --steps 100000 --envs 4 --eval-every 25000 --eval-episodes 8 --output training/runs/personality-cautious-v1
node training/run.mjs train --profile objective --steps 100000 --envs 4 --eval-every 25000 --eval-episodes 8 --output training/runs/personality-objective-v1
```

Auswertung auf separaten Seeds wählt `best.zip` anhand des profilspezifischen Rewards.
`last.zip` enthält den letzten Stand, `policy.json` das Spielmodell. `holdout.json`
vergleicht die Policy mit dem Regelentscheider unter derselben Profildoktrin.
Die Exportprüfung vergleicht 64 Beobachtungen zwischen Python und TypeScript.
Radar-, Zonen-, Nahkampf- und Hecksektorzeiten sowie Überlebensdauer und Abschüsse
stehen in den Auswertungen. Bei diesem Kurs bedeutet `win`: fünf Minuten überlebt
und mindestens einen Gegner versenkt; für den vorsichtigen Bot ist diese Kennzahl
allein kein geeignetes Erfolgskriterium.

Weitere Prüfung eines exportierten Modells:

```powershell
node training/run.mjs evaluate --policy training/runs/personality-cautious-v1/policy.json --episodes 50 --seed 2000000 --output training/runs/personality-cautious-v1/evaluation-50.json
node training/run.mjs smoke --profile cautious
```

Nach Beenden einer laufenden lokalen Sitzung startet beispielsweise
`node training/play-local.mjs --profile aggressive` ein Spiel mit zwei aggressiven
Bots und fünfminütigen Runden. Entsprechend funktionieren `cautious`, `objective`
und `standard`. Der Starter verändert eine bereits laufende Sitzung nicht und
meldet belegte Ports. Der allgemeine Spielserver kann ein Modell über
`BFA_BOT_POLICY_PATH` laden. Python wird zum Spielen nicht benötigt.

### Aussagekraft und nächster Trainingskurs

100.000 Schritte pro Profil sind ein erster trainierter Prototyp, kein Nachweis
zuverlässiger Taktikbeherrschung. Harte Doktrinregeln sind testbar garantiert;
erlernte Entscheidungen müssen sich in unabhängigen Spielen bewähren. Insbesondere
Heckanläufe, lange Verfolgungen nach Sensorausfällen und vorsichtige Raketenangriffe
sollten als eigene Szenarien geprüft werden. Danach: mehrere Trainingsseeds,
Gegner aus früheren Checkpoints und unterschiedliche Profile, verschiedene Schiffsklassen,
Inselkarten und Mehrspielerrunden. Trainingsleistung gegen genau einen Regelgegner
ist kein Beleg für dieselbe Leistung gegen Menschen.

Die Ergebnisse dieser ersten drei Läufe und ihre Grenzen stehen in [VERIFICATION.md](VERIFICATION.md#persönlichkeiten-trainings--und-prüfergebnis-30092026). Die endgültige unabhängige Auswertung liegt jeweils in `independent-evaluation-final.json`.

Lokale gemischte Besetzung: `node training/play-local.mjs --profile mixed` startet einen Objective-, zwei Aggressive- und einen Cautious-Bot für einen menschlichen Spieler. Die Profilnamen erscheinen im Schiffsnamen; Runden dauern fünf Minuten.


## Ausgewogenere Profile, zweite Trainingsgeneration

Dieser Abschnitt ersetzt die Doktrin und den Kurs der ersten Persönlichkeitsmodelle.
Die Modelle der ersten Generation sind archivierte Versuchsergebnisse. Neue Exporte
tragen `profileControllerVersion: balanced-v2.1` (aggressiv/vorsichtig) bzw.
`balanced-v2.2-objective` (Auftrag); der Loader weist alte Persönlichkeitsmodelle
ab, damit ihre Gewichte nicht unbemerkt mit geänderten Manövern kombiniert werden.
Die ursprüngliche Standard-Policy bleibt kompatibel.

### Gemeinsamer Auftrag mit unterschiedlichen Schwerpunkten

Alle drei Profile erhalten jetzt Belohnung für die **tatsächlichen Spielpunkte**:
4 Punkte alle 4 Sekunden für lebende Schiffe, 20 in der Sea-Control-Zone, 100 je
zugerechnetem Abschuss. Die Spielsimulation vergibt gleichzeitig Aufstiegs-XP und
führt die normalen Klassenwechsel aus. Das Trainingssignal nutzt zusätzlich
Schaden, Versenkungen und eine kleine taktische Formung; Trainingsreward und
Spielscore bleiben verschiedene Größen.

Ohne Kampfkontakt kehren alle Profile zur Gebietspatrouille zurück. Ein gesundes Schiff
(ab 60 % HP) ohne präzisen Gegnerkontakt und ohne nahen/eingehenden Flugkörper wird
außerhalb der Zone auch bei einer reinen ESM-Peilung zum Gebiet zurückgeführt. Ohne
Bedrohung wird ein endloser Rückzugs-/Ausweichbefehl ebenfalls durch Patrouille ersetzt.
Tatsächliche Bedrohungen und beschädigte Schiffe können weiter ausweichen oder sich
zurückziehen. Während der Gebietsrückkehr sind gültige Raketenstarts erlaubt; die
Kanone benötigt unverändert einen präzisen Kontakt. Ziele im Gebiet bekommen bei allen Profilen einen
Bonus in der Zielwahl, beim Auftragsbot den größten. Ziele außerhalb von 500 m werden
nicht mehr pauschal verworfen: Der Auftragsbot darf sich gegen sie verteidigen. Seine
Navigation kehrt jedoch außerhalb dieser Grenze zum Gebiet zurück, solange keine
Rakete unmittelbar droht und er keinen Rückzug bzw. Deckung gewählt hat. Eine Zwischen-
version ohne diese Rückkehrgrenze verschlechterte die Auftragstreue und wurde verworfen.
Der aggressive Bot bindet sich weniger starr an sein bisheriges Ziel.

Heckanläufe sind für alle verfügbar: Umpositionieren nutzt einen Punkt 120 m hinter
dem beobachteten Ziel, Verfolgen nur 60 m dahinter. Eine bereits mögliche Kanonensalve
hat Vorrang vor diesem Anlauf. Eine reine ESM-Peilung liefert weiterhin keinen Kurs,
aus dem ein Heckpunkt berechnet werden könnte. Für geometrische Heckpositionen gibt
es lediglich +0,002 Reward pro Sekunde, höchstens +1,2 bei einer ganzen Zehnminutenrunde.
Es besteht keine Pflicht, vor einem Angriff erst einen Hecksektor zu erreichen.

Der vorsichtige Bot darf ebenfalls mit der Kanone kämpfen, während einer Rückkehr
zum Gebiet oder beim Rückzug eine gültige Schussgelegenheit nutzen. Reichweite,
Waffensektor, Cooldown und Sensorerfassung bleiben verbindlich. Bei Ausweichmanövern
und Deckung wird nicht mit der Kanone geschossen. Er fährt im Angriff langsamer und
versucht unter 40 % HP bei einem nahen Kontakt Abstand zu gewinnen. Die frühere
pauschale Flucht unter 380 m entfällt. Sein Radar sucht zwei Sekunden je zwölf Sekunden;
bei ausreichenden eigenen HP kann es einen nahen Kontakt für den Kanonenkampf halten.
Aggressiv sendet wie gewünscht immer; das Auftragsprofil nutzt weiterhin die gemeinsame
situative Radarsteuerung.

### Längere Runden mit echten Respawns

Der Kurs `bfa-personalities-v2.1-balanced` läuft **600 Sekunden**, auch wenn der Lerner
zwischendurch versenkt wird. Beide Schiffe respawnen nach fünf Sekunden mit drei
Sekunden Schutz. Wartezeit zählt nicht als Überlebens- oder Gebietszeit. Der Trainings-
Entscheidungsschritt endet bei einem Lebenszustandswechsel, damit Python nach dem
Respawn dieselbe Beobachtung wie der Spielcontroller verwendet. Sonst driftete der
Entscheidungstakt bei längeren Runden auseinander.

Die Karte ist wie beim lokalen Spiel mindestens 4.000 m breit (Halbkante 2.000 m),
Startpositionen liegen weiter verteilt. Inseln sind aus. Der Gegner ist weiterhin
ein Regelbot. Ein Sieg im Trainingsbericht bedeutet nun höheren tatsächlichen
Spielscore am Rundenende, nicht bloß einen Abschuss vor dem eigenen Tod.

Alle Profile bekommen `0,015 × neu erworbene Spielpunkte`. Weitere Gewichte:

| Trainingsereignis | Aggressiv | Vorsichtig | Auftrag |
|---|---:|---:|---:|
| Gegner verliert 100 % HP, netto nach Regeneration | +2 | +1,2 | +1,5 |
| Eigener Verlust von 100 % HP, netto | −1,2 | −2,4 | −1,8 |
| Zusätzlicher Abschussbonus | +2 | +0,5 | +1 |
| Eigene Versenkung | −3 | −5 | −4 |
| Zusätzlicher Bonus je lebender Sekunde in der Zone | +0,015 | +0,020 | +0,045 |
| Sekunde unter 150 m Abstand zum lebenden Gegner | 0 | −0,005 | 0 |

Gemeinsam: kleiner Heckbonus +0,002/s, Kollisionskontakt −0,01 und +0,002 pro Meter
Annäherung an die Zone (mit entsprechend negativem Wert beim Entfernen). Ein Respawn-
Teleport erhält keinen Annäherungsbonus. Schadenswerte sind weiterhin netto gemessene
HP-Verluste, keine vollständige Schützenzuordnung; Abschüsse werden jetzt direkt aus
dem Killzähler des Lerners übernommen.

### Training und Vergleich

Netzgrößen und Bibliotheken bleiben unverändert. Der Discount-Faktor steigt für die
Persönlichkeiten auf 0,998, damit spätere Auswirkungen stärker zählen. Pro Profil
beginnt ein neuer Lauf mit rund 200.000 Schritten, vier parallelen Umgebungen und Seed 84.
Validierung erfolgt alle 100.000 Schritte über zwölf vollständige Runden. Der Jäger
bekommt zusätzlich einen Fortsetzungslauf über 200.000 Schritte; dessen Übernahme
hängt vom Vergleich auf denselben Validierungsseeds ab.

```powershell
node training/run.mjs train --profile cautious --steps 200000 --envs 4 --eval-every 100000 --eval-episodes 12 --seed 84 --output training/runs/personality-cautious-v2
```

Die erste v2-Zwischenserie zeigte trotz höherer Rewards zu viel Rückzug ohne Bedrohung.
Die endgültigen Läufe verwenden daher die oben beschriebene Regel `balanced-v2.1`.
`personality-aggressive-balanced` und `personality-cautious-balanced` beginnen per
`--initialize-from` mit vorher gelernten Gewichten und trainieren je weitere rund
100.000 Schritte. `personality-objective-balanced` trainiert rund 200.000 Schritte neu.
Die Initialisierung prüft Features, Aktionsraum und Profil, setzt aber Optimierer
und Trainingsvertrag neu auf; sie ist ausdrücklich kein kompatibler `--resume`.
Der Auftragsbot wird nach Wiederherstellung seiner Rückkehrgrenze ebenfalls weitere
rund 100.000 Schritte ausgehend von den gelernten Gewichten trainiert; dieser finale
Stand liegt in `personality-objective-balanced-final`. Quellcheckpoint und Hash werden
in `initialization.json` gespeichert. Abgebrochene
Zwischenversuche bleiben als solche dokumentiert und werden nicht ins Spiel geladen.

Die Auswertung erfasst jetzt tatsächliche Punkte, Versenkungen, Lebenszeit, Kanonen-
und Raketenstarts. Zonen- und Radarzeitanteile beziehen sich auf die lebende Zeit.
Alte Lebensdauerwerte aus bei der ersten Versenkung beendeten Episoden sind damit
nicht direkt vergleichbar. Die langen Übungsrunden ändern **nicht** die fünfminütige
Rundendauer des lokalen Spiels.


Die lokale gemischte Runde lädt `personality-aggressive-balanced`,
`personality-cautious-balanced` und `personality-objective-balanced-final`. Die
Standard-Spielpunkte bleiben aktiv; lokale Runden dauern weiterhin fünf Minuten.
Reproduzierbare unabhängige Prüfung der endgültigen Spielmodelle:

```powershell
training/.venv/Scripts/python.exe training/verify_profiles.py aggressive --seed 7000000
training/.venv/Scripts/python.exe training/verify_profiles.py cautious --seed 7000000
training/.venv/Scripts/python.exe training/verify_profiles.py objective --run personality-objective-balanced-final --seed 7000000
```

Jeder Befehl prüft zwanzig vollständige Runden und zusätzlich zwei vollständige
Python/TypeScript-Vergleichsrunden, einschließlich Respawns.

## Fortsetzung: Spielstärke der Profile angleichen (30.09.2026)

Das lokale Spiel lädt jetzt `training/runs/balance-20260930/final/{aggressive,cautious,objective}/policy.json`.
Die Spielregeln, Sensorreichweiten und Profildoktrinen wurden dabei nicht verändert.
Trainingsrunden bleiben zehn Minuten, lokale Spielrunden fünf Minuten.

Acht PPO-Versuche liefen vollständig durch: insgesamt 1.354.752 zusätzliche
Umgebungsschritte. Darunter waren Fortsetzungen der vorhandenen Gewichte,
explizite Übertragung zwischen Profilen und Training gegen einen eingefrorenen
aggressiven KI-Gegner. Zwei Imitationsversuche verwendeten zusätzlich jeweils
16.000 beobachtete Übergänge. Nicht jeder Versuch wurde übernommen.

Die Auswahl berücksichtigt diesmal tatsächliche Siege, danach den mittleren
Spielpunkte-Vorsprung (`--selection-metric game`). Der Ausgangsstand wird vor der
Fortsetzung ebenfalls geprüft und als Rückfalloption gespeichert. Das verhindert,
dass ein schlechter letzter Trainingsstand automatisch den bisherigen ersetzt.
Ein abschließender Vergleich verschiedener Checkpoints berücksichtigt außerdem die
Stärkespanne der gesamten Zusammenstellung; deshalb ist der gewählte aggressive
Stand dessen letzter Checkpoint, nicht dessen bester Einzelvalidierungsstand.

### Gegen trainierte Gegner lernen

`--opponent-policy <lokale policy.json>` setzt einen festen trainierten Gegner ein.
Sein Datei-Hash und Profil gehören zum Trainingsvertrag. Der zusätzliche
Trainingsreward zieht 0,015 pro neuem gegnerischen Spielpunkt ab. Das stellt den
Wettbewerb um den Rundensieg stärker in den Vordergrund. Es verändert weder
Spielpunkte noch Waffen, Physik oder Beobachtungen. Ohne diesen Parameter bleibt
der bisherige Regelgegner samt bisherigem Trainingsvertrag erhalten.

Bei Modellen aus solchen Läufen verwenden Python-Auswertung und Exportprüfung
standardmäßig den gespeicherten Trainingsgegner. Dieser lokale Pfad muss noch
vorhanden sein und zum gespeicherten Hash passen. Der normale Spielserver liest
den Trainingsgegner nicht; er lädt ausschließlich den Actor des eigenen Bots.
Für direkte Profilvergleiche verwendet `tournament.mts` die explizite Teilnehmerliste.

`--allow-profile-transfer` erlaubt ausschließlich zusammen mit `--initialize-from`
einen bewussten Gewichtsstart aus einem anderen Profil. Features und Aktionen
müssen weiterhin identisch sein. Optimierer und Szenariovertrag beginnen neu;
Quellpfad, Hash und Profilwechsel werden protokolliert. `--learning-rate` erlaubt
bei einem frischen Optimierer eine kleinere Lernrate; mit `--resume` ist diese
Option gesperrt, um eine vermeintliche Änderung des alten Optimierers zu vermeiden.

### Zusätzliche Lernbeispiele und tatsächlich ausgewählte Modelle

`imitation_start.py` sammelt erlaubte Beobachtungen mit einem einfachen Lehrer:
Kontakte angreifen, ohne Kontakte zum Gebiet fahren, bei kritischen eigenen HP
situationsabhängig zurückziehen bzw. ausweichen. Ein MLP lernt die Aktionslabels
mit Cross-Entropy; danach folgt ein separater PPO-Lauf. Keine versteckten
Gegnerkoordinaten werden als Lehrer- oder Policy-Eingaben verwendet. Der Lehrer
läuft nicht als Entscheidungsregel im veröffentlichten Spielbot.

- Aggressiv: weitertrainierter PPO-Stand, `aggressive/last.zip` (100.352 neue Schritte).
- Auftrag: bester Stand von `objective/best.zip` aus 200.704 neuen Schritten,
  initialisiert mit zuvor gelernten aggressiven Gewichten; die Auftragsdoktrin bleibt aktiv.
- Vorsichtig: neuronal gelernter Imitationsstart. Die anschließenden PPO-Stände
  verschlechterten seine Validierung und wurden ausdrücklich nicht übernommen.
  Sein Export kann daher `timesteps: 0` für PPO ausweisen; die 16.000 überwachten
  Trainingsbeispiele stehen separat in `cautious-imitation/imitation.json`.

`selection.json` dokumentiert die Auswahl. Die Entwicklungsturniere nutzten Seeds
8100000–8100011. Der Abschlussvergleich auf neuen Seeds steht in VERIFICATION.md.
**Die Lücke ist kleiner, aber ähnliche Spielstärke ist noch nicht erreicht.**
Der vorsichtige Bot sendet weiter selten und greift stärker mit Flugkörpern an;
zuverlässig bessere Überlebensleistung ist noch nicht belegt.

Direktes Turnier (fünf Minuten, jedes Paar auf beiden Seiten):

```powershell
node --conditions=bfa-source --import tsx training/tournament.mts training/runs/balance-20260930/final-roster.json training/runs/balance-20260930/another-tournament.json 20 8600000
```

Das Turnier ist ein Duellvergleich, kein Ersatz für einen Test mit Menschen und
vier Bots. Ergebnisse auf den bereits verwendeten Abschlussseeds künftig nicht
zur Auswahl einer weiteren Generation wiederverwenden. Der Lernkurs enthält
weiterhin seine ausdrücklich datierten älteren Modell-Snapshots.

### Weitere Trainingsrunde – 01.10.2026

Auftrags- und vorsichtiger Bot wurden jeweils um 200.704 PPO-Schritte weitertrainiert,
mit zwei Umgebungen, Zehnminuten-Episoden und Lernrate 0,00003. Ausgangspunkt waren
ihre bisherigen ausgewählten Checkpoints; Trainingsgegner war der eingefrorene
aggressive Bot. Die Optimierer wurden neu initialisiert. Spielregeln und Doktrinen
blieben unverändert. Zusammen: 401.408 neue Trainingsschritte.

Der vorsichtige Bot verbesserte seine Validierung nicht; sein ausgewählter Actor
entspricht weiterhin exakt dem Ausgangsmodell. Beim Auftragsbot wurde der Stand
nach 100.000 Schritten ausgewählt. Im Entwicklungsturnier wirkte die Besetzung
etwas ausgewogener, im vorher reservierten Abschlusstest jedoch nicht: Der
Auftragsbot gewann vor allem zulasten des vorsichtigen Bots. Deshalb wurde nach
der vorab festgelegten Auswahlregel **kein neues Modell im Spiel aktiviert**.

Alle Checkpoints, Exportprüfungen und vier Turnierberichte liegen unter
`training/runs/balance-20261001/`. `plan.json` enthält die Auswahlregel,
`selection.json` die berechnete Entscheidung. Die Ergebnistabelle steht in
[VERIFICATION.md](VERIFICATION.md). Die Abschlussseeds 9200000–9200019 sind
verbraucht und dürfen nicht als frischer Abschlusstest einer späteren Auswahl dienen.
