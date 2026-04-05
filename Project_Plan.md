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
| 4 | **Abgeschlossen** (MVP) — AO, 5 Kreis-Inseln, Schiff↔Insel-Kollision, OOB | Grenze, Inseln, Blockieren; außerhalb 10 s → Kick |
| 5 | **Abgeschlossen** (MVP) — Artillerie Plan A, Bogen, Splash, HP, Tod (kein Respawn) | LMB, zwei Tabs, HP↓, Kill → Disconnect |
| 6 | Respawn, Spawn-Schutz, faire Spawn-Punkte | Nach Tod wieder einsteigen |
| 7 | Lenkflugkörper (ASuM), Homing, Limits | Sekundärfeuer testen |
| 8 | Torpedos (einfach, langsamer) | Torpedo-Verhalten |
| 9 | Abwehr: SAM + CIWS (logische Interception) | Raketen werden teilweise abgefangen |
| 10 | Match-Timer, Score, Kills/Assists, Endscreen | 12-Minuten-Match, Siegerliste |
| 11 | In-Match-XP, Level 1–10, Stat-Skalierung, Fähigkeiten (MVP) | Level-Up im HUD |
| 12 | 3 Schiffsklassen, Klassenauswahl, HUD/Audio-Polish | Voller MVP-Flow |

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
- **Bounds:** Harte Karte möglich — umgesetzt als **Area of Operations** + Abkommen = Zerstörung.

**Ist / Abnahme Task 4:**

| Ziel | Status |
|------|--------|
| Gemeinsame Kartengrenze (Quadrat XZ), Server = maßgeblich | Erfüllt (`mapBounds.ts`, `isInsideOperationalArea`) |
| Außerhalb AO: Warnung repliziert, 10 s dann Raum verlassen | Erfüllt (`oobCountdownSec`, `OOB_DESTROY_AFTER_MS`, `Protocol.WS_CLOSE_WITH_ERROR` + Reason) |
| Client: sichtbare AO-Linie, OOB-HUD | Erfüllt (`createGameScene.ts`, `areaWarningHud.ts`, `main.ts`) |
| Mehrere Inseln, unterschiedliche Größen | Erfüllt — **5** Einträge in `DEFAULT_MAP_ISLANDS` (Kreise, Radien 64–140) |
| Schiff blockiert / schiebt aus Insel (serverseitig) | Erfüllt (`resolveShipIslandCollisions` nach `stepMovement` in `BattleRoom`) |
| Client nutzt dieselben Inseldaten wie Server | Erfüllt — Import aus `@battlefleet/shared`, keine zweite „Geheim“-Karte |
| Debug-kompakte Karte | Erfüllt — `AREA_OF_OPERATIONS_HALF_EXTENT = 900`, Wasser ~`2.8 × H` |

**Bewusst nicht Teil von Task 4 (Follow-up):**

- Kreise statt Polygon-Inseln (PRD erlaubt vereinfachte Geometrie; Polygone optional später).
- **Keine** Kollision **Projektil ↔ Insel** (ergibt sich mit Task 5).
- Spawn nur platzieren (Ring ~140 um Null); keine automatische „freie Spawn“-Validierung gegen jede Insel-Änderung.

**Test:** Über rote AO-Linie → engl. Warnung + Countdown → Kick. Gegen grüne/braune Inseln fahren → Schiff bleibt außerhalb der Kreis-Hülle. Zwei Tabs → gegnerische Schiffe verhalten sich identisch (serverseitige Kollision).

**Docs:** `docs/ARCHITECTURE.md` (Stand Task 4), `README.md`.

**Nächster planmäßiger Task:** **Task 6** (Respawn & Spawn-Schutz).

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
| **HP** im Schema, Tod | Erfüllt (`hp`/`maxHp`, `leave` Reason `destroyed_in_combat`) |
| Client: **LMB** (halten), Events **`artyFired`/`artyImpact`** inkl. **`kind`** (Wasser/Treffer/Ufer), VFX | Erfüllt (`keyboardMouse.ts`, `artilleryFx.ts`) |
| Client: **VFX-Culling** (Kreis um Eigenschaft, Start/oder Ziel / Einschlag; `skipSplash`) | Erfüllt (`main.ts`, `createGameScene.ts`) |
| HUD: HP, Feuer-Cooldown | Erfüllt (`cockpitHud`) |
| Feuerbogen-Visual (lokal) | Erfüllt (`shipVisual.ts` + `ARTILLERY_ARC_HALF_ANGLE_RAD`) |

**Noch nicht (Task 6+):** Respawn, Kill-Feed, Score, Granate↔Insel eigene Entität, sekundäre Waffen.

**Test:** Zwei Tabs; Gegner mit Bug in Richtung Ziel; **LMB** → Einschlag sichtbar, HP sinkt; bei 0 Disconnect mit Hinweis.

**Docs:** `docs/ARCHITECTURE.md`, `README.md`.

---

## Task 6 — Respawn & Spawn-Schutz

**Ziele:**

- Nach Tod: kurzer Timer, dann Spawn an gültiger Position (Mindestabstand zu Gegnern).
- **Spawn-Schutz** ~3 s, kein Schaden; optional: Schießen bricht Schutz ab (PRD).
- Client-Feedback (Effekt).

**Test:** Bewusst sterben, nach Respawn wieder Level-1-Leben (Progression kommt in Task 11).

---

## Task 7 — Anti-Schiff-Lenkflugkörper

**Ziele:**

- Entitäten: Position, Heading, Speed, Lifetime, Ziel/Homing, Schaden, Radius.
- Limit gleichzeitig aktiver Raketen; Cooldown; ggf. Bogen-Regeln für Starter.
- Visuell: Rauch, Trail, Impact.

**Test:** Rechte Maustaste / sekundärer Input → Rakete fliegt und trifft.

---

## Task 8 — Torpedos (einfach)

**Ziele:**

- Langsamer als Raketen; geradeaus oder einfache Führung; weniger gleichzeitige Aktive.

**Test:** Eigenständiges Torpedo-Verhalten und Schaden bei Treffer.

---

## Task 9 — Defensive Systeme (SAM + CIWS)

**Ziele:**

- **Schichten:** Bedrohung erkannt → SAM versucht Intercept → überlebende → CIWS.
- Logik-basiert (keine massenhaften Bullet-Simulationen), Cooldowns, Quote/saturation-tauglich.
- Events an Client für SFX/VFX (Abfangen, Nahbereichsfeuer).

**Test:** Salven und Einzelraketen — teils Abfang, teils Treffer.

---

## Task 10 — Match, Score, Ende

**Ziele:**

- FFA, max. 16 Spieler, **12 Minuten** Timer.
- Punkte: Kill 100, Assist 40 (Assist-Attribution serverseitig aus letzten Schadensgebern).
- Match-Ende: Scoreboard, Requeue / Play again.

**Test:** Vollständiger Match-Durchlauf bis Timer.

---

## Task 11 — In-Match-Progression

**Ziele:**

- XP-Schwellen wie PRD (Level 1–10 pro Leben).
- Bei Tod: Reset auf Level 1.
- Pro Level: HP, Reload, leichte Mobilität/Abwehr; optional Meilensteine Level 3/5/7/10 mit einfachen Fähigkeiten.

**Test:** XP durch Kills/Assists, Level-Up sichtbar im HUD.

---

## Task 12 — Schiffsklassen & UX/Audio

**Ziele:**

- Drei Klassen: **FAC**, **Destroyer**, **Cruiser** — unterscheidbare Stats, Bögen, Defensive, Silhouette.
- Vor Match: Klassenwahl, dann Quick-Join in offenen Raum.
- HUD: HP, Level, XP, Cooldowns, Bögen in/out, Timer, Score, Meldungen.
- Mindest-Audio: Waffen, Treffer, Level-Up, Warnungen (PRD 24).

**Test:** End-to-end wie MVP-Akzeptanzkriterien im PRD.

---

## Abnahme (MVP laut PRD)

Erfolg, wenn u. a.:

- Klasse wählen, Match beitreten, bis zu 16 Spieler stabil.
- Schiffsbewegung gewichtet, Waffen responsiv, **Bögen** spürbar.
- Artillerie, Raketen, Torpedos, SAM/CIWS funktionieren stabil.
- XP/Level pro Leben, Tod setzt Progress zurück.
- HUD und 12-Minuten-Match ohne systemische Abstürze.

---

## Referenz

Ausführliche Produkt- und Systemspezifikation: **`PRD.md`**.
