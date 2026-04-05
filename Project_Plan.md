# BattleFleet-Arena — Umsetzungsplan (Project Plan)

Dieses Dokument bricht die MVP-Anforderungen aus `PRD.md` in **inkrementelle Tasks** herunter. **Nach jedem Task** soll eine **spielbare bzw. testbare Version** existieren (lokal im Browser, ggf. mit zwei Tabs für Multiplayer).

**Technologie-Stack (PRD):** Browser-Client mit **Three.js**, Server mit **Node.js** und **Colyseus**, server-authoritative Simulation (~20 Hz), Client-Interpolation.

---

## Übersicht der Tasks

| Task | Kurzbeschreibung | Test / Spielbarkeit |
|------|------------------|---------------------|
| 1 | Offline-Boot, Szene, schiffsähnliche Steuerung | Ein Schiff auf der Karte steuern |
| 2 | **Abgeschlossen** — Colyseus, Schema, Join/Leave, 20 Hz-Server, Aim+Ping | Zwei Tabs, beide Schiffe + Peilung sichtbar; Overlay inkl. Ping |
| 3 | Client-Interpolation für entfernte Spieler | Flüssige Darstellung bei State-Updates |
| 4 | Eine Map mit Inseln, Kollision Schiff/Projektil vs. Insel | An Inseln abprallen, keine Durchfahrt |
| 5 | Artillerie, Feuerbögen, HP, Schaden, Tod | Auf Gegner schießen, HP & Zerstörung |
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

**Hinweis:** Bewegung wirkt bei 20 Hz State noch **ruckelig** — glätten ist **Task 3 (Interpolation)**.

**Docs:** `README.md`, `docs/ARCHITECTURE.md` (Stand Task 2).

---

## Task 3 — Interpolation

**Ziele:**

- Pro Entität: letzter und nächster Snapshot, Render-Zustand interpoliert dazwischen.
- Lokaler Spieler: optional sanfte Korrektur an Server-Positions (oder reine Serverpose für MVP).

**Test:** Zwei Tabs, Bewegung wirkt flüssig bei 20 Hz Netzwerk-Updates.

---

## Task 4 — Map & Insel-Kollision

**Ziele:**

- Eine **Island-Cluster-Arena** (PRD): Polygon- oder Kreis-Inseln, konsistent Server + Client.
- Kollision: Schiffe und (später) Projektile/Insel.
- Bounds optional (Open Sea mit weichem oder hartem Rand).

**Test:** Gegen Insel fahren → blockiert; visuell erkennbare Landmasse.

---

## Task 5 — Artillerie & HP

**Ziele:**

- Primärfeuer mit **Feuerbogen**, Reichweite, Cooldown/Reload (serverseitig validiert).
- Vereinfachte Flugzeit oder Hit-Scan mit Delay (PRD-konform, nicht volle Ballistik).
- HP, Schaden, Zerstörung; Kill-Events.

**Test:** Spieler 2 oder Dummy-Ziel beschießen → HP sinkt, Zerstörung möglich.

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
