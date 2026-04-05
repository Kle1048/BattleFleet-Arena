# Architektur — BattleFleet-Arena (Stand: Task 2 — Colyseus & autoritative Bewegung)

Dieses Dokument beschreibt die **Ist-Architektur** von Client und Server: **Three.js** im Browser, **Colyseus** auf Node, **gemeinsame Physik** in `shared` als einzige Quelle der Wahrheit für Pose und Bewegung auf dem Server.

---

## 1. Repository-Überblick

```
BattleFleet-Arena/
├── client/                 # Vite + TypeScript + Three.js + colyseus.js
│   └── src/
│       ├── main.ts         # Colyseus-Join, State → Meshes, Input, Ping, Renderloop
│       └── game/
│           ├── scene/      # Three.js-Szene, Kamera, Wasser, Schiff-Meshes
│           ├── input/      # Tastatur & Maus → Samples
│           └── hud/        # HTML-Cockpit, Debug-Overlay
├── server/                 # Colyseus + WebSocket-Transport
│   └── src/
│       ├── index.ts        # GameServer, Matchmaking „battle“
│       └── rooms/
│           └── BattleRoom.ts   # 20 Hz Tick, sim, Schema-Replicate
├── shared/                 # @battlefleet/shared
│   └── src/
│       ├── schema.ts       # BattleState, PlayerState (@colyseus/schema)
│       └── shipMovement.ts # stepMovement, smoothRudder, Config (Server + Zielbild Client)
├── docs/
├── PRD.md
├── Project_Plan.md
└── README.md
```

**Dev:** `npm install` im Root, dann `npm run dev` (siehe README).

---

## 2. Server & Netzwerk (Task 2)

### 2.1 Colyseus

- **Raumname:** `"battle"` — `joinOrCreate("battle")` erzeugt oder tritt einem offenen Raum bei.
- **Transport:** `@colyseus/ws-transport` über gemeinsamen HTTP-Server mit **CORS**; Standardport **2567**.
- **Serializer:** `@colyseus/schema` — Root-State ist `BattleState` mit `playerList: ArraySchema<PlayerState>`.

### 2.2 `BattleRoom`

- **`onCreate`:** `setState(new BattleState())`, Nachrichten `input` / `ping`, **Simulation** `setSimulationInterval(..., 1000/20)` → **20 Hz**.
- **`onJoin` / `onLeave`:** Eintrag in `sim` (Map sessionId → Schiffszustand + Input-Hilfen) sowie `playerList` im Schema.
- **Authorität:** Pro Tick `smoothRudder` + `stepMovement` auf `ShipMovementState` in `sim`; danach Abgleich in `PlayerState` (`x`, `z`, `headingRad`, `speed`, `rudder`, `aimX`, `aimZ`).
- **Input (`input`):** `throttle`, `rudderInput`, `aimX`, `aimZ` (Mauszielfaden Welt-XZ) — genutzt für Gas/Ruder und replizierte Peilung.
- **Ping:** Client sendet `ping` mit `clientTime` (Performance-Zeitstempel); Server antwortet `pong` mit demselben Wert — Client misst RTT fürs Debug-Overlay.

### 2.3 Schema (`shared/src/schema.ts`)

- **`PlayerState`:** `id`, Pose, `speed`, `rudder`, **`aimX`**, **`aimZ`**.
- **ES2022 / `defineTypes`:** Keine Klassenfeld-Initialisierer für Schema-Felder — Zuweisungen im **`constructor()`** nach `super()`, damit `setParent` / `ReferenceTracker` korrekt verdrahtet sind (sonst Encoder-Fehler `getNextUniqueId`).

### 2.4 Client (`main.ts`)

- **Join:** Reflection (kein drittes `joinOrCreate`-Schema-Argument aus `shared`), um **eine** `@colyseus/schema`-Instanz im Bundle zu vermeiden.
- **`playerList`:** Nach jedem `onStateChange` Listener erneut an die aktuelle `ArraySchema` hängen; im Frame immer `playerListOf(room)` — vermeidet „stale“ Liste nach erstem Snapshot.
- **Lokaler Spieler:** sendet pro Frame `input` (Throttle, Rudder, Aim); **Pose** kommt nur aus dem Server-State.
- **Fremde Spieler:** Ziellinie aus **`aimX` / `aimZ`** aus dem State; lokale Ziellinie weiterhin unmittelbar aus Maus (`sample()`), bis der nächste Snapshot kommt.
- **Debug-Overlay:** FPS, gekürzte Room-ID, Spielerzahl, **Ping**; optional Warn-/Diagnosezeilen.

---

## 3. Client-Laufzeit (Frame-Ablauf)

Pro Bild (`requestAnimationFrame`) — **ohne** clientseitige Schiffsphysik:

1. **`playerList`** aus dem Raum-State lesen; fehlende `ShipVisual`s nachziehen.
2. **Input** `sample()` (Gas, Ruder-Soll, Maus → Weltpunkt auf Meeresebene `Y = 0`).
3. **Visuals:** Alle Schiffe: Position/Kurs/Ruder aus State; **Peilung** als Linien-Debug für alle sichtbar — lokal **orange** (Maus, sofort), remote **cyan** (State); Vorbild für spätere **Geschütztürme**.
4. **Lokaler Spieler:** Kamera folgen, **`room.send("input", …)`**, Cockpit aus State + Input (Gas/Ruder-Anzeige sinnvoll aus Input, Speed/Kurs aus Server).
5. **`renderer.render`**

Netzwerk-Updates der Pose erfolgen über Colyseus-State (Patches ~20 Hz) — **Task 3** (Interpolation) kann hier später dazwischengeschaltet werden.

---

## 4. Modul-Zuständigkeiten (Client)

| Modul | Rolle |
|--------|--------|
| `game/scene/createGameScene.ts` | Szene, orthografische Kamera, Wasser, Gitter, `updateFollowCamera`, `resizeCamera` |
| `shared/…/shipMovement.ts` | `stepMovement`, `smoothRudder`, `DESTROYER_LIKE_MVP` — **läuft auf dem Server** mit fester `dt` |
| `game/input/keyboardMouse.ts` | W/S/A/D, NDC aus Maus, Raycast-Ergebnis |
| `game/hud/cockpitHud.ts` | DOM-Cockpit |
| `game/hud/debugOverlay.ts` | FPS, Raum, Spieler, Ping |

---

## 5. Koordinatensystem & Karte

- **Welt:** rechtshändig, **Y nach oben**, Spiel fliegt auf der **XZ-Ebene**.
- **Seekarten-Konvention auf dem Bildschirm** (nach Kamera-Anpassung):
  - **+Z** = **Nord** → Bildschirm **oben**
  - **+X** = **Ost** → Bildschirm **rechts**
  - **−X** = **West** → **links**
  - **−Z** = **Süd** → **unten**
- **Kurs / Peilung:** `headingRad = 0` ⇒ Bug zeigt **+Z (Nord)**. Uhrzeigersinn in der XZ-Ansicht ⇒ Kurs **zunimmt** (N → O → S → W).

**Kamera:** `OrthographicCamera`, senkrecht von **+Y**; durch **Vertauschen von `left` / `right`** am Ortho-Frustum: **Ost rechts** wie auf einer Karte (`resizeCamera`).

**Ruder-Mesh:** Drehung des Heck-Strichs mit `rudderRotationRad` aus dem Anzeige-Layer — der **Server** liefert `rudder` aus derselben Simulation wie `shipMovement`.

---

## 6. Bewegungsmodell (`shared/src/shipMovement.ts`)

**Wird auf dem Server** mit `dt = tick-Dauer` ausgeführt. Kurzfassung:

| Baustein | Bedeutung |
|----------|-----------|
| `ShipMovementState` | `x`, `z`, `headingRad`, `speed`, `throttle`, `rudder` |
| `stepMovement` | Geschwindigkeit, Gier (abhängig von \|speed\|), Position entlang Bug |
| `smoothRudder` | Annäherung Ruder-Ist an Tastatur-Soll |
| `DESTROYER_LIKE_MVP` | Demo-Config (später pro Schiffsklasse) |

Details (Formeln, Grenzfälle): unverändert die gleiche Struktur wie im bisherigen Architektur-Dokument — nur der **Ausführungsort** ist jetzt der **20-Hz-Server-Tick**, nicht mehr der Offline-Client.

---

## 7. Szene & Darstellung (Kurz)

- **Wasser:** große `PlaneGeometry` auf `Y ≈ 0`.
- **Gitter:** `GridHelper`, `depthWrite: false`.
- **Schiff:** einfaches Mesh + Ziellinie + Ruderstrich; Kamera folgt lokalem Schiff.

---

## 8. Referenzen

- `README.md` — Install, Dev, Build, Test mit zwei Tabs  
- `PRD.md` — Produktvision, MVP, Netzwerk  
- `Project_Plan.md` — Tasks inkl. Task-3-Interpolation als Nächstes  
