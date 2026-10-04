# Bot-Namen und Beta-Standardbesetzung

Änderung vom 4. Oktober 2026, ausgehend von `b1cc784` mit noch nicht
ausgelieferten lokalen Beta-Korrekturen. Beauftragt: Profilzusätze aus den
Spielernamen entfernen und historische Vorbilder passend zuordnen. Die zunächst
gewünschten drei Bots wurden auf Benutzerwunsch am selben Tag durch fünf
Mindestteilnehmer ersetzt. Keine Änderung der trainierten Policies oder ihrer Reihenfolge.

## Historische Inspiration

Die Zuordnung ist eine spielerische Interpretation konkreter Entscheidungen,
keine historische Persönlichkeitsdiagnose und keine Bewertung der gesamten Person.

| Internes Profil | Sichtbare Namen | Begründung |
| --- | --- | --- |
| aggressive | Nelson, Collingwood | Direkter Angriff in zwei Kolonnen bei Trafalgar; beide führten eine Kolonne. |
| cautious | Jellicoe | Ausweichmanöver gegen den deutschen Torpedoangriff bei Jütland, unter Verlust des Kontakts zur gegnerischen Schlachtflotte. |
| objective | Spruance | In der Philippinensee hatte die Sicherung der Marianenoperation Vorrang vor einer unbegrenzten Verfolgung. |
| standard | Nimitz, Togo, Yi Sun-sin, Makarov, Hipper | Allgemeiner Namensvorrat für Regelbots ohne spezielles Charakterprofil; keine Aussage über eine gemeinsame historische Persönlichkeit. |

Quellen, geprüft am 4. Oktober 2026:

- [Royal Museums Greenwich: Battle of Trafalgar background](https://www.rmg.co.uk/stories/maritime-history/battle-trafalgar-background)
- [National Records of Scotland: Battle of Jutland 1916](https://nrscotland.gov.uk/learning-and-events/first-world-war/battle-of-jutland-1916/)
- [Naval History and Heritage Command: US Navy at War, Second Official Report](https://www.history.navy.mil/research/library/online-reading-room/title-list-alphabetically/u/us-navy-at-war-second-official-report.html)

Die Namensauswahl erfolgt anhand des tatsächlich geladenen Strategieprofils,
nicht anhand des Roster-Platzes. Wiederholungen erhalten nur eine Nummer, etwa
`Nelson 2`. Es gibt keine Zusätze wie `(aggressive)`, `(cautious)` oder `(Bot)`.
Die Vergabe verbraucht keine zusätzlichen Zufallszahlen; bestehende IDs und
Entscheidungslogik bleiben unverändert. Namenszähler gelten pro BotSystem/Raum.

## Fünf Mindestteilnehmer

`DEFAULT_MIN_ROOM_PLAYERS=5` ist der gemeinsame Initialwert für Admin-Konfiguration
und ENV-Fallback. Das bedeutet: kein Mensch → keine Bots; ein Mensch → vier Bots;
zwei Menschen → drei Bots; ab fünf Menschen → keine Bots. Die bestehende
konfigurierbare Auffülllogik und Obergrenze von fünf Bots bleiben erhalten.
Es sind fünf Gesamtteilnehmer als Auffüllziel, nicht fünf zusätzliche Bots.

Explizites `BFA_MIN_ROOM_PLAYERS` gilt weiterhin als Initialwert. Eine vorhandene
persistierte Admin-Konfiguration hat Vorrang und wird nicht automatisch migriert.
Die laut Benutzer bereits auf fünf gesetzte Admin-Einstellung soll erhalten
bleiben; beim späteren Rollout lesend prüfen, nicht auf vier absenken. Kein
Löschen oder Zurücksetzen der Konfigurationsdatei.
Das bisher dokumentierte Policy-Roster bleibt unverändert: die ersten vier
Slots sind objective/aggressive/aggressive/cautious.

## Nachweis und Rückweg

Regressionstests prüfen Standard/ENV-Override, Population, Profilnamen,
Wiederholungsnamen, Zufallsaufrufe und unveränderte Strategieinstanzen.
35 Server-Testdateien und Server-Typprüfung bestanden. Die strenge Kampfprüfung
erkannte zunächst die sichtbaren Namensänderungen im State-Trace. Ein isolierter
Gegencheck mit ausschließlich den alten Join-Namen reproduzierte exakt den alten
Hash `b6aa65a596bb7c0c917e61f481ffbf73a81ca29202ce2454c2e5e37981f8a0d9`.
Drei unabhängige Kandidaten mit den beauftragten neuen Namen lieferten identisch
`6a7abc23426448794f90d4e93edcca7959d11578eeda20b5bb79f024a291d28c`.
Alle Ereigniszahlen und Inhaltsfingerprints blieben identisch. Deshalb wird nur
die explizit beauftragte Namensänderung in der Trace-Referenz akzeptiert; kein
abweichendes Kampfverhalten. Die alte Referenz bleibt in
`scripts/fixtures/combat-baseline.2026-10-03.json` erhalten. Der kanonische
Benchmark setzt weiterhin ausdrücklich 16 Teilnehmer, unabhängig vom neuen Default.
Noch nicht deployt; vorhandene Namen ändern sich erst bei neuen Bot-Spawns.
Rückweg: Code-Rollback; eine später geänderte Live-Mindestspielerzahl separat
über die Admin-Konfiguration zurücksetzen, ohne Spielerdaten wiederherzustellen.
