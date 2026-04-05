# BattleFleet-Arena — Umsetzungsplan (Project Plan)

Dieses Dokument bricht die MVP-Anforderungen aus `PRD.md` in **inkrementelle Tasks** herunter. **Nach jedem Task** soll eine **spielbare bzw. testbare Version** existieren (lokal im Browser, ggf. mit zwei Tabs für Multiplayer).

**Technologie-Stack (PRD):** Browser-Client mit **Three.js**, Server mit **Node.js** und **Colyseus**, server-authoritative Simulation (~20 Hz), Client-Interpolation.

---

## Übersicht der Tasks

| Task | Kurzbeschreibung | Test / Spielbarkeit |
|------|------------------|---------------------|
| 1 | Offline-Boot, Szene, schiffsähnliche Steuerung | Ein Schiff auf der Karte steuern |
| 2 | **Abgeschlossen** — Colyseus, Schema, Join/Leave, 20 Hz-Server, Aim+Ping | Zwei Tabs, beide Schiffe + Peilung sichtbar; Overlay inkl. Ping |
| 3 | **Abgeschlossen** — Client-Interpolation für entfernte Spieler | Flüssige Darstellung bei State-Updates |
| 4 | **Abgeschlossen** (MVP) — AO, 5 Kreis-Inseln, Schiff↔Insel-Kollision, OOB | Grenze, Inseln, Blockieren; außerhalb 10 s → Zerstörung/Respawn (wie Task 6) |
| 5 | **Abgeschlossen** (MVP) — Artillerie Plan A, Bogen, Splash, HP | LMB, zwei Tabs, HP↓; Tod/Respawn siehe Task 6 |
| 6 | **Abgeschlossen** (MVP) — Respawn, Spawn-Schutz; OOB-Tod = gleicher Pfad wie Kampftod | Nach Tod/OOB-Timer wieder einsteigen |
| 7 | **Abgeschlossen** (MVP ASuM) — Feuerrichtung, Kegel ±30°/210 m, Homing, Insel-Detonation | RMB, HUD **ASuM**, Einschlag `hit`/`island`/`oob` |
| 8 | **Abgeschlossen** (MVP) — Torpedos geradeaus, langsamer, Insel/AO | **Q** oder **Mittelklick**, HUD **Torpedo** |
| 9 | **Abgeschlossen** (MVP) — SAM + CIWS (logische Interception) | Eingehende **ASuM** teils **`airDefenseIntercept`** (Ring SAM blau / CIWS gelb); Torpedos nicht |
| 10 | **Abgeschlossen** (MVP) — Match-Timer via `MATCH_DURATION_SEC` (derzeit **1 min** Test; PRD 12 min), Score (**100**/Kill) | Kein Assist: **letzter Treffer** erhält den Kill; OOB ohne Punkte |
| 11 | **Abgeschlossen** (MVP Kern) — XP/Level 1–10 pro Leben, Stat-Skalierung, Tod → Reset | Level + XP + Toast im Cockpit; keine extra „Fähigkeiten“-Skills |
| 12 | **Abgeschlossen** (MVP) — **FAC / Zerstörer / Kreuzer**, Join-Option **`shipClass`**, Stats/Bogen/Silhouette, Web-Audio | Klassen-Overlay → Match; HUD **Klasse**; Sounds: Feuer, Treffer nah, Level, OOB |

**Querschnitt ab Task 2:** Debug-Overlay (**FPS**, **Ping**, **Room-ID**, Spielerzahl) — umgesetzt.

**Ab Task 5:** Kill-Feed und Treffer-Feedback schrittweise ergänzen.

---

## Task 1 — Offline-Boot & Schiff (abgeschlossen / Basis)

**Ziele:**

- Projektstruktur (`client/`, `server/`), Build mit Vite + TypeScript.
- Three.js: Wasser/Ozean, Licht, einfaches Schiffsmodell.
- Top-down Kamera (leicht geneigt).
- **Steuerung:** W/S Gas, A/D Ruder, träge Beschleunigung, Ruder-Ansprechverhalten, Kurvenradius abhängig von Geschwindigkeit.
- Mauszeiger als Zielrichtung (Visuell; noch kein Schaden).

**Test:** `npm install`, `npm run dev -w client`, Browser öffnen, Schiff fahren.

---

## Task 2 — Multiplayer-Skelett (Colyseus) — **abgeschlossen**

**Ziele (Plan):**

- Colyseus-Server, ein `GameRoom` pro Match.
- State-Schema: Spieler-IDs, Position, Heading, ggf. Basis-Klassen-Tag.
- Client: Verbindung, Raum beitreten, Input-Pakete (Throttle, Rudder, Aim) an Server senden.
- Server: 20 Hz Tick, **einzige Quelle der Wahrheit** für Position/Heading.

**Test (Plan):** Zwei Tabs zum gleichen Raum; Bewegung des anderen Spielers sichtbar (ggf. noch ruckelig).

**Ist / Abnahme Task 2:**

| Ziel | Status |
|------|--------|
| Colyseus + Raum (`battle` / `BattleRoom`) | Erfüllt |
| Schema (`PlayerState`, `BattleState`, `playerList`) | Erfüllt; ES2022-kompatibel via Konstruktor-Zuweisungen |
| Join / Leave, bis zu 16 Clients | Erfüllt |
| Input **Throttle**, **Rudder**, **Aim** (Welt-XZ); serverseitig verarbeitet & in State repliziert | Erfüllt |
| 20 Hz Simulation; `stepMovement` / `smoothRudder` aus `shared` nur auf dem Server | Erfüllt |
| Debug-Overlay: FPS, Raum, Spielerzahl, **Ping** (ping/pong) | Erfüllt |
| Optional: Basis-**Klassen-Tag** im Schema | *Offen (bewusst; „ggf.“ im Plan)* |
| Darstellung: Peilung (**Aim**) aller Spieler (Linien-Debug, Vorbild Geschütztürme) | Erfüllt |

**Hinweis:** Netto-Updates der replizierten Pose sind **~20 Hz**. **Task 3** glättet die **Darstellung der Fremdspieler** (Interpolation); der **lokale** Spieler nutzt weiterhin die direkte Server-Pose pro Frame (ohne clientseitige Bewegungs-Vorhersage).

**Docs:** `README.md`, `docs/ARCHITECTURE.md` (fortlaufend aktualisiert).

---

## Task 3 — Interpolation — **abgeschlossen**

**Ziele:**

- Pro Entität: letzter und nächster Snapshot, Render-Zustand interpoliert dazwischen.
- Lokaler Spieler: optional sanfte Korrektur an Server-Positions (oder reine Serverpose für MVP).

**Test:** Zwei Tabs, Bewegung wirkt flüssig bei 20 Hz Netzwerk-Updates.

**Ist / Abnahme Task 3:**

| Ziel | Status |
|------|--------|
| Fremdspieler: `prev`/`next` Snapshot mit Patch-Zeitstempel | Erfüllt (`remoteInterpolation.ts`, `advanceIfPoseChanged` nur bei Pose-Änderung) |
| Linear / Winkel-Interpolation inkl. `rudder`, `aimX`/`aimZ` | Erfüllt |
| Render-Zeit = `now − 100 ms` (Puffer ~2× 20 Hz-Tick) | Erfüllt (`DEFAULT_INTERPOLATION_DELAY_MS`) |
| Lokaler Spieler: reine Serverpose (MVP) | Erfüllt |
| `remoteInterp`-Eintrag bei Leave entfernen | Erfüllt |

**Docs:** `docs/ARCHITECTURE.md` (inkl. nachfolgender Tasks).

---

## Task 4 — Map & Insel-Kollision — **abgeschlossen (MVP-Scope)**

**Ziele (Plan / PRD):**

- **Island-Cluster-Arena:** Inseln konsistent Server + Client.
- **Kollision:** Schiffe vs. Hindernis; Projektile/Insel später (ab Task 5).
- **Bounds:** Harte Karte möglich — umgesetzt als **Area of Operations** + **Abkommen:** zu lange außerhalb → **HP 0** und **Respawn** (wie Kampftod, `enterAwaitingRespawn`).

**Ist / Abnahme Task 4:**

| Ziel | Status |
|------|--------|
| Gemeinsame Kartengrenze (Quadrat XZ), Server = maßgeblich | Erfüllt (`mapBounds.ts`, `isInsideOperationalArea`) |
| Außerhalb AO: Warnung repliziert, 10 s dann Zerstörung (HP 0, Respawn) | Erfüllt (`oobCountdownSec`, `OOB_DESTROY_AFTER_MS`, `enterAwaitingRespawn`) |
| Client: sichtbare AO-Linie, OOB in zentraler Meldungsfläche | Erfüllt (`createGameScene.ts`, `gameMessageHud.ts`, `main.ts`) |
| Mehrere Inseln, unterschiedliche Größen | Erfüllt — **5** Einträge in `DEFAULT_MAP_ISLANDS` (Kreise, Radien 64–140) |
| Schiff blockiert / schiebt aus Insel (serverseitig) | Erfüllt (`resolveShipIslandCollisions` nach `stepMovement` in `BattleRoom`) |
| Client nutzt dieselben Inseldaten wie Server | Erfüllt — Import aus `@battlefleet/shared`, keine zweite „Geheim“-Karte |
| Debug-kompakte Karte | Erfüllt — `AREA_OF_OPERATIONS_HALF_EXTENT = 900`, Wasser ~`2.8 × H` |

**Bewusst nicht Teil von Task 4 (Follow-up):**

- Kreise statt Polygon-Inseln (PRD erlaubt vereinfachte Geometrie; Polygone optional später).
- **Keine** Kollision **Projektil ↔ Insel** (ergibt sich mit Task 5).
- Spawn nur platzieren (Ring ~140 um Null); keine automatische „freie Spawn“-Validierung gegen jede Insel-Änderung.

**Test:** Über rote AO-Linie → Warnung + Countdown → nach Ablauf Zerstörung mit Respawn (kein Raum-Kick). Gegen grüne/braune Inseln fahren → Schiff bleibt außerhalb der Kreis-Hülle. Zwei Tabs → gegnerische Schiffe verhalten sich identisch (serverseitige Kollision).

**Docs:** `docs/ARCHITECTURE.md` (Stand Task 4), `README.md`.

---

## Task 5 — Artillerie & HP — **abgeschlossen (MVP)**

**Ziele:**

- Primärfeuer mit **Feuerbogen**, Reichweite, Cooldown/Reload (serverseitig validiert).
- Vereinfachte Flugzeit oder Hit-Scan mit Delay (PRD-konform, nicht volle Ballistik).
- HP, Schaden, Zerstörung; Kill-Events.

**Ist / Abnahme Task 5:**

| Ziel | Status |
|------|--------|
| Primär: **0,5 s** Cooldown, Server validiert | Erfüllt (`ARTILLERY_PRIMARY_COOLDOWN_MS`, `primaryReadyAtMs`) |
| Feuerbogen, Min/Max-Reichweite | Erfüllt (`shared/artillery.ts`, `isInForwardArc`, `clampedLandPoint`) |
| **Streuung** ± Winkel / ± Distanz | Erfüllt (`ARTILLERY_SPREAD_*`) |
| **Plan A:** geplanter Einschlag + Flugzeit | Erfüllt (`pendingShells`, `impactAtMs`, `computeFlightMs`) |
| **Inseln:** Schuss **ohne** LOS/Lande-Sperre (MVP-Anpassung) | Erfüllt — `tryComputeArtillerySalvo` prüft Inseln nicht; Helfer `lineOfSightBlockedByIslands` / `pointInAnyIsland` nur noch für andere Zwecke bzw. VFX-Einstufung |
| Splash-Schaden, kein Self-Hit | Erfüllt (`ARTILLERY_SPLASH_RADIUS`, Owner ausgenommen) |
| **HP** im Schema, Tod | Erfüllt (`hp`/`maxHp`); Kampftod ohne Disconnect seit **Task 6** (`lifeState` / Respawn) |
| Client: **LMB** (halten), Events **`artyFired`/`artyImpact`** inkl. **`kind`** (Wasser/Treffer/Ufer), VFX | Erfüllt (`keyboardMouse.ts`, `artilleryFx.ts`) |
| Client: **VFX-Culling** (Kreis um Eigenschaft, Start/oder Ziel / Einschlag; `skipSplash`) | Erfüllt (`main.ts`, `createGameScene.ts`) |
| HUD: HP, Feuer-Cooldown | Erfüllt (`cockpitHud`) |
| Feuerbogen-Visual (lokal) | Erfüllt (`shipVisual.ts` + `ARTILLERY_ARC_HALF_ANGLE_RAD`) |

**Noch nicht (post-MVP):** Kill-Feed, Score, Granate↔Insel-Kollision / Ballistik (Artillerie fliegt weiterhin ohne Insel-Block beim Feuern).

**Test:** Zwei Tabs; Gegner mit Bug in Richtung Ziel; **LMB** → Einschlag sichtbar, HP sinkt; Kampftod → siehe **Task 6** (Respawn, kein Pflicht-Disconnect).

**Docs:** `docs/ARCHITECTURE.md`, `README.md`.

---

## Task 6 — Respawn & Spawn-Schutz — **abgeschlossen (MVP)**

**Ziele:**

- Nach Tod: kurzer Timer, dann Spawn an gültiger Position (Mindestabstand zu Gegnern).
- **Spawn-Schutz** ~3 s, kein Schaden; optional: Schießen bricht Schutz ab (PRD).
- Client-Feedback (Effekt).

**Ist / Abnahme Task 6:**

| Ziel | Status |
|------|--------|
| Explizite Phasen `alive` / `awaiting_respawn` / `spawn_protected` + Invarianten (`hp`↔`lifeState`) | Erfüllt (`shared/playerLife.ts`, `assertPlayerLifeInvariant` serverseitig) |
| Replikation: `lifeState`, `respawnCountdownSec`, `spawnProtectionSec` | Erfüllt (`schema.ts`) |
| Respawn-Timer **5 s**, Position AO + Abstand zu lebenden Gegnern, Fallback Join-Ring | Erfüllt (`respawn.ts`, `BattleRoom.performRespawn`) |
| Spawn-Schutz **3 s**, kein Splash-Schaden (Primärfeuer während Schutz **erlaubt** — Schutz bricht nicht ab) | Erfüllt (`canTakeArtillerySplashDamage` nur `alive`) |
| Kein `leave` bei Kampftod; schweres OOB ebenfalls **`enterAwaitingRespawn`** (kein `left_operational_area`-Kick) | Erfüllt (`BattleRoom`) |
| Physik/OOB-Timer nur bei `alive`/`spawn_protected` | Erfüllt (`BattleRoom`, `participatesInWorldSimulation`) |
| Client: HUD Respawn / Schutz; **gameMessageHud** (OOB + Toasts); Wrack-Optik `shipVisual` | Erfüllt (`cockpitHud`, `gameMessageHud`, `main.ts`, `shipVisual.ts`) |
| Kein `input`-Spam im Tod (`awaiting_respawn`) | Erfüllt (`main.ts`) |

**Test:** Zwei Tabs; einen auf 0 HP — Countdown, Respawn, Schutz-Anzeige, wieder verwundbar. Optional: AO für **10 s** missachten → gleicher Respawn wie bei Treffer. Progression (Level-Reset) kommt in Task 11.

**Nächster planmäßiger Task:** **Task 7** (ASuM).

---

## Task 7 — Anti-Schiff-Lenkflugkörper — **abgeschlossen (MVP)**

**Ziele (PRD, gekürzt):**

- Entitäten: Position, Heading, Lifetime, Zielwahl/Homing, Schaden, Trefferradius.
- Limit gleichzeitig aktiver Raketen; Cooldown; Start entlang **Schiff→Aim**.
- Client: Sekundärfeuer, HUD, sichtbarer Flugkörper; Einschlag-Feedback.
- *(Optional PRD: Rauch/Trail — im MVP nicht umgesetzt.)*

**Ist / Abnahme Task 7:**

| Ziel | Status |
|------|--------|
| Replikation `missileList` (`MissileState`), `PlayerState.secondaryCooldownSec` | Erfüllt (`schema.ts`) |
| Homing; Suchkegel **±30°** um **aktuelle** Flugrichtung; Erfassungstiefe **`ASWM_ACQUIRE_CONE_LENGTH`** (210 m); Start `spawnAswmFromFireDirection` | Erfüllt (`shared/aswm.ts`) |
| Geschwindigkeit/Drehrate/Radius/Schaden/Cooldown/Limit laut Konstanten; Simulation `stepAswmMissile` | Erfüllt (`aswm.ts`, `BattleRoom.stepMissiles`) |
| AO: `aswmImpact` **`oob`**, FK entfernen | Erfüllt (`BattleRoom`) |
| **Insel:** Kreis-Kollision wie Karte; Treffer = Detonation ohne Schiffs-HP, `aswmImpact` **`island`** | Erfüllt (`isInsideAnyIslandCircle`, `ASWM_ISLAND_COLLISION_RADIUS`) |
| Schiffstreffer: Splash-ähnlich Radius, Schaden, `kind: "hit"`; kein Selber-Treffer Owner | Erfüllt (`BattleRoom`) |
| Client: **RMB** `secondaryFire`, Cockpit **ASuM**-Cooldown; **`missileFx`**: nur Kegel-Mesh + Ring bei `aswmImpact` (kein Rauch/Trail im MVP) | Erfüllt (`main.ts`, `keyboardMouse.ts`, `cockpitHud.ts`, `missileFx.ts`) |

**Noch nicht (Polish / später):** Schweif/Rauch; ggf. optimierte Visuelle für `island`/`oob`.

**Test:** Zwei Tabs; **RMB** — FK startet in Peilrichtung; Ziel nur im **Kegel** (Winkel **und** max. 210 m vom FK); Homing mit begrenzter Wendigkeit; max. **2** aktiv; FK **detoniert auf Insel** (bläulicher Ring, kein HP-Schaden); **Grenze** = `oob`.

---

## Task 8 — Torpedos — **abgeschlossen (MVP)**

**Ziele:**

- Langsamer als ASuM; **geradeaus** (kein Homing); weniger gleichzeitig aktiv.
- Gleiche Feuerrichtung wie andere Waffen (**Schiff→Aim**); AO- und Insel-Detonation wie ASuM.

**Ist / Abnahme Task 8:**

| Ziel | Status |
|------|--------|
| Replikation `torpedoList` (`TorpedoState`), `PlayerState.torpedoCooldownSec` | Erfüllt (`schema.ts`) |
| `shared/torpedo.ts`: `spawnTorpedoFromFireDirection`, `stepTorpedoStraight`, Konstanten | Erfüllt |
| Server: `tryTorpedoFire`, `stepTorpedoes` (Lebensdauer, OOB, Insel, Treffer/Schaden), Leave-Cleanup | Erfüllt (`BattleRoom.ts`) |
| Max. **1** aktiv pro Besitzer, Cooldown **7,5 s**; Schaden/Radien laut `torpedo.ts` | Erfüllt |
| Client: **Q** oder **mittlere Maustaste** halten (`torpedoFire`), `torpedoFx`, `torpedoImpact`-VFX | Erfüllt (`keyboardMouse.ts`, `torpedoFx.ts`, `main.ts`) |
| Cockpit-Zeile **Torpedo** | Erfüllt (`cockpitHud.ts`) |

**Test:** Zwei Tabs; **Q** oder Mittelklick — Torpedo in Peilrichtung, deutlich langsamer als ASuM; Treffer auf Gegner; Aufprall auf **Insel** / **AO-Rand**.

**Nächster planmäßiger Task:** **Task 9** (SAM/CIWS).

---

## Task 9 — Defensive Systeme (SAM + CIWS) — **abgeschlossen (MVP)**

**Ziele:**

- **Schichten:** Bedrohung erkannt → SAM versucht Intercept → überlebende → CIWS.
- Logik-basiert (keine massenhaften Bullet-Simulationen), Cooldowns, Quote/saturation-tauglich.
- Events an Client für SFX/VFX (Abfangen, Nahbereichsfeuer).

**Ist / Abnahme Task 9:**

| Ziel | Status |
|------|--------|
| `shared/airDefense.ts`: Reichweiten, Cooldowns, **`pickAirDefenseEngagementLayer`** / **`rollAirDefenseHit`**; Feuer vs. Wurf 1 Tick getrennt | Erfüllt |
| Server `SimEntry`: `adSamNextAtMs` / `adCiwsNextAtMs`; Join/Respawn **0**; nur bei tatsächlichem Wurf Cooldown | Erfüllt (`BattleRoom`) |
| **`stepMissiles`:** vor Schiffstreffer — bei Eintritt/bereitem Layer **`airDefenseFire`** (Pending pro Rakete); **nächster Tick** `rollAirDefenseHit` → Treffer **`airDefenseIntercept`** (`weapon: "aswm"`, `defenderX`/`defenderZ`) + Rakete entfernen; Fehlschuss nur Cooldown. Verteidigung **`m.targetId`** oder **nächster Gegner in SAM-Reichweite** | Erfüllt |
| **Torpedos:** keine SAM/CIWS (Unterwasser / außerhalb Rollenmodell) | Erfüllt |
| Client: **`airDefenseFire`** → Flug-VFX; **`airDefenseIntercept`** → Burst + HUD-Puls (`airDefenseFx`, `main.ts` `*`) | Erfüllt |

**Test:** Salven und Einzelraketen — teils Abfang, teils Treffer.

**Nächster planmäßiger Task:** **Task 10** (Match, Score, Ende).

---

## Task 10 — Match, Score, Ende — **abgeschlossen (MVP)**

**Ziele:**

- FFA, max. 16 Spieler, Match-Dauer **`shared/match.ts` → `MATCH_DURATION_SEC`** (aktuell **60 s** zum Testen; Produktziel PRD **12 min**), ab `BattleRoom`-Erstellung.
- Punkte: **Kill 100** — **kein Assist**; der Spieler mit dem **tödlichen Treffer** (Artillerie / ASuM / Torpedo) erhält Score + Kill-Zähler. **OOB**-Tod: keine Punkte.
- Match-Ende: Kampf stoppt (keine neuen Treffer/Projektile), **`matchEnded`** + Scoreboard, **Erneut spielen** (Reload → neuer Raum).

**Ist / Abnahme Task 10:**

| Ziel | Status |
|------|--------|
| `shared/match.ts` — Dauer, `SCORE_PER_KILL`, Hilfen | Erfüllt |
| `BattleState`: `matchPhase`, `matchRemainingSec`; `PlayerState`: `score`, `kills` | Erfüllt (`schema.ts`) |
| Server: Timer, `endMatch`, Kill nur bei Combat-Tod mit Killer-Id | Erfüllt (`BattleRoom.ts`) |
| Client: Cockpit Matchzeit + Punkte, `matchEndHud` | Erfüllt |

**Test:** Match bis 0:00; Scoreboard; zweiter Tab zeigt konsistente Punkte nach Kill.

**Nächster planmäßiger Task:** **Task 11** (In-Match-Progression).

---

## Task 11 — In-Match-Progression — **abgeschlossen (MVP Kern)**

**Ziele:**

- XP-Schwellen Level **1–10** pro Leben (`shared/progression.ts`, Kill = **100 XP** — wie Match-Score-Granularität, kein Assist).
- Bei **Tod** (Kampf oder OOB): **Level 1**, **XP 0**, Basismax-HP.
- Pro Level: **max HP ↑**, **kürzere** Primär-/ASuM-/Torpedo-CD, **etwas** mehr Top-Speed & Drehrate, **etwas weniger** eingehenden Schaden.
- *(Optional PRD: Meilenstein-Fähigkeiten L3/5/7/10 — nicht umgesetzt; nur passive Skalierung.)*

**Ist / Abnahme Task 11:**

| Ziel | Status |
|------|--------|
| `PlayerState`: `level`, `xp`; `progression.ts` Schwellen & Helfer | Erfüllt |
| Kill → XP + Level-Up-Schleife, HP-Bonus bei Up (`grantXpForKill`) | Erfüllt (`BattleRoom`) |
| Waffen-CD / Movement / Schadensreduktion vom Level | Erfüllt |
| Client: Cockpit **Level** + ** XP** (`a/b` bis nächstes Level), Toast bei Aufstieg | Erfüllt (`main.ts`, `cockpitHud`) |
| Neues Leben / `resetMatchForNewRound`: Progression zurück | Erfüllt |

**Test:** Kill Gegner → XP steigt; bei Schwelle Level-Up + Toast; sterben → wieder L1/0 XP.

**Nächster planmäßiger Task:** **Task 12** (Schiffsklassen & UX/Audio).

---

## Task 12 — Schiffsklassen & UX/Audio — **abgeschlossen (MVP)**

**Ziele:**

- Drei Klassen: **FAC**, **Zerstörer**, **Kreuzer** — unterscheidbare Stats, Bug-Bogen, Schadens-Mitigation, **Skalierung der Silhouette** (`shipVisual`).
- Vor Match: **Klassenwahl** (`classPicker`), dann `joinOrCreate("battle", { shipClass })` — Server `onJoin(..., options)`.
- HUD: weiter **Level, XP, Cooldowns, Match, Punkte** + Zeile **Klasse**.
- **Web-Audio (minimal):** eigener Artillerie-Schuss, ASuM, Torpedo, Treffer in der Nähe, Level-Up, OOB-Warnung (einmal pro Grenzübertritt).

**Ist / Abnahme Task 12:**

| Ziel | Status |
|------|--------|
| `shared/shipClass.ts` — Profile, `normalizeShipClassId`, `getShipClassProfile` | Erfüllt |
| `PlayerState.shipClass`; Artillerie `tryComputeArtillerySalvo(..., arcHalf)` | Erfüllt |
| Server: Movement/HP-Basis/CD/ASuM-Cap/Torpedo-Cap/Schaden pro Klasse | Erfüllt (`BattleRoom`) |
| Client: Picker, Silhouette + lokaler Feuerbogen, Cockpit **Klasse** | Erfüllt |
| `gameAudio.ts` — Kurz-Töne an Events | Erfüllt (`main.ts`) |

**Test:** Zwei Tabs, unterschiedliche Klassen — sichtbare Größen-/Bogen-Unterschiede; Join nur nach Auswahl.

**Hinweis:** Voller PRD-MVP (Menü, Klassen **Cruiser**-Benennung engl. im Code `cruiser`) — für spätere Lobby/Persistenz offen.

---

## Abnahme (MVP laut PRD)

Erfolg, wenn u. a.:

- Klasse wählen, Match beitreten, bis zu 16 Spieler stabil.
- Schiffsbewegung gewichtet, Waffen responsiv, **Bögen** spürbar.
- Artillerie, Raketen, Torpedos, SAM/CIWS funktionieren stabil.
- XP/Level pro Leben, Tod setzt Progress zurück.
- HUD und Match bis Timer-Ende ohne systemische Abstürze.

---

## Referenz

Ausführliche Produkt- und Systemspezifikation: **`PRD.md`**.
