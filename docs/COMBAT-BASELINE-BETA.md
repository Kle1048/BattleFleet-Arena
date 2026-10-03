# Kampf Referenz für die Beta

Technische Abnahme am 3. Oktober 2026 im Auftrag zur Umsetzung von Review-Punkt 5.
Ausgangspunkt ist Code-Commit `8827d80` einschließlich der lokal umgesetzten
Verbindungs-/Raumkorrekturen; diese betreffen den isolierten 60-Sekunden-Kampf
nicht. Es wird keine abgeschlossene Spieler- oder Balance-Abnahme behauptet.

## Änderungen seit der vorherigen Referenz

Die unter `cf0291f` abgenommene Referenz bleibt unverändert als
`scripts/fixtures/combat-baseline.2026-09-27.json` erhalten. Die damalige Abnahme
steht in [Kanonische Modelle](COMBAT-BASELINE-CANONICAL.md).

- `shared/src/bot/perceptionSystem.ts` begrenzt präzise Kontakte anhand der
  Sensorregeln und trennt sie von passiven ESM-Peilungen. `botController.ts`
  verwirft veraltete Feuer-/Zielinformationen nach Kontaktverlust.
- `shared/src/bot/actionPlanner.ts` und `fireControl.ts` verwenden Vorhalt,
  Reichweite, Cooldown, Munitionsverfügbarkeit und die Ausrichtung der festen
  Starter. Radarentscheidungen werden berücksichtigt. Die Zusammensetzung der
  Kämpfe und die Reihenfolge der Zufallsabrufe können sich dadurch ändern.
- `adCooldownMask` wurde dem replizierten Zustand hinzugefügt. Das ändert den
  vollständigen State-Trace auch unabhängig von geänderten Ereigniszahlen.
- Der erzwungene ASuM-Seitenwechsel fällt bei leerer gewählter Seite weg. Dies
  ist separat getestet; die menschlichen Benchmark-Eingaben erzwingen keine Seite.
  Diese Änderung wird deshalb nicht als Ursache der gemessenen Zähler ausgegeben.
- Die Gameplay-/Modell-Fingerprints sind gegenüber der letzten Referenz gleich.
  Sie decken nicht den geänderten Bot-Code ab und beweisen keine Verhaltensgleichheit.

Die Zuordnung ist ein Review der zusammenhängenden Änderungen, keine isolierte
Kausalmessung jedes einzelnen Ereigniszählers. Insbesondere bedeuten 7 statt 2
Interceptions in unterschiedlichen Kampfverläufen nicht, dass die Abwehrchance
pauschal um einen entsprechenden Prozentsatz verändert wurde.

## Nachweise

Fokussiert bestanden: Bot-Aktionsplanung/Feuerleitung, Bot-Sensorisolation,
Bot-Profile, gemeinsame Sensorregeln, ASuM-Seitenwahl und autoritative
Flugabwehr-HUD-Cooldowns. Alle drei Kandidatenläufe lieferten identische
Gameplay-/Modell-Fingerprints, Ereignisse und den Trace
`b6aa65a596bb7c0c917e61f481ffbf73a81ca29202ce2454c2e5e37981f8a0d9`.

| Ereignis | Bisher | Neuer technischer Referenzstand |
| --- | ---: | ---: |
| Artilleriestarts | 936 | 910 |
| Artillerieeinschläge | 922 | 896 |
| ASuM-Starts | 188 | 192 |
| ASuM-Impacts | 89 | 90 |
| Softkill-Ergebnisse | 25 | 27 |
| Lock-Warnungen | 29 | 33 |
| Abwehrfeuer | 34 | 41 |
| Interceptions | 7 | 2 |
| Kollisionskontakte | 4 | 5 |
| Nachladeereignisse | 16 | 15 |

Der kanonische Test setzt nun ausdrücklich Regelbots ein und entfernt im eigenen
Prozess geerbte Policy-/Roster-Einstellungen vor dem Laden des Servers. Das ist
keine Änderung der produktiven Bot-Auswahl. Trainierte VPS-Bots müssen weiterhin
mit ihrem tatsächlichen Roster gesondert abgenommen werden.

Die Mediane der Kandidaten lagen bei 0,912 / 0,918 / 0,925 ms, p95 bei
1,560 / 1,583 / 1,673 ms. Diese Werte sind keine Performance-A/B-Abnahme gegen
einen anderen Kampfverlauf und keine Aussage über GPU-/Netzwerkleistung.

## Entscheidung und Rückweg

Der vorhandene, fokussiert getestete Sensor-/Bot-/HUD-Vertrag wird als neue
technische Regressionserwartung übernommen. Die Spielbalance bleibt ein Ziel
der Beta-Rückmeldungen. `--candidate` schreibt weiterhin keine Referenzdateien;
CI und Pages-Auslieferung führen künftig die strenge Prüfung aus.

Für eine Rücknahme der Gameplay-Änderungen zuerst den passenden Code herstellen
und dann die dazugehörige alte Referenz prüfen. Die alte Referenz allein über
neuen Code zu kopieren ist kein funktionierender Rollback. Nicht deployt durch
diese Abnahme.
