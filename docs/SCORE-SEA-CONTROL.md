# Score, passives Tick & Sea-Control-Zone

Stand: April 2026

## Ziele

- **Sieg:** Spieler mit dem **höchsten `score`** am Ende der Runde (bei Gleichstand: mehr Kills, dann Session-ID).
- **`score`** ist der **Runden-Punktestand** (Kills und passives Tick erhöhen ihn parallel zu `xp` über dieselbe Vergütung).
- **Kills** bleiben als **Zähler** und Tiebreak für die Rangliste.
- **Passives XP** belohnt **Überleben** zwischen kurzen Feuergefechten (und erhöht `score` gleich mit).
- **Sea-Control-Zone** in der **Kartenmitte** (grüner Rand) vergibt **5×** passiven Tick pro Intervall.

## Server (authoritativ)

| Konstante | Ort | Bedeutung |
|-----------|-----|-----------|
| `MATCH_PASSIVE_XP_INTERVAL_MS` | `shared/match.ts` | Abstand der passiven Vergabe (Standard 4 s). |
| `MATCH_PASSIVE_XP_BASE` | `shared/match.ts` | Basis-XP pro Tick (außerhalb Zone). |
| `SEA_CONTROL_ZONE_HALF_EXTENT` | `shared/seaControl.ts` | Halbe Kantenlänge des Quadrats um (0,0) in Welt-XZ. |
| `SEA_CONTROL_XP_MULTIPLIER` | `shared/seaControl.ts` | Faktor **5** im Gebiet. |
| `isInSeaControlZone(x,z)` | `shared/seaControl.ts` | `true`, wenn \|x\|,\|z\| ≤ `SEA_CONTROL_ZONE_HALF_EXTENT`. |

- **`score`:** `PlayerState`-Feld, **kumulativ** über die Runde, **fällt nicht** bei Tod (im Gegensatz zu Lebens-`xp`).
- **Leben-XP (`xp`) / Level:** Wie bisher; passives Tick und Kills nutzen dieselbe **`grantXpAndProgress`**-Logik (Levelaufstieg, Klassenwechsel, HP).
- **Passive:** Nur Spieler mit `participatesInWorldSimulation` (lebend / spawn-geschützt), nicht im Respawn-Warten.

## Client

- **Grüner Rand:** `createGameScene.ts`, deckungsgleich mit `SEA_CONTROL_ZONE_HALF_EXTENT` (analog OOB-Rand).
- **HUD / Match-Ende:** Anzeige **„Score“** (Spalte und Cockpit-Label).

## Balance

- Werte sind in `match.ts` / `seaControl.ts` zentral; Anpassung ohne Gameplay-Code-Änderung möglich (nur Konstanten).
