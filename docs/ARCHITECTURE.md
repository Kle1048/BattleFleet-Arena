# Architektur — BattleFleet-Arena (Stand: **Task 5 MVP** — Artillerie Plan A, HP, Tod; Task 4 weiter gültig)

Dieses Dokument beschreibt die **Ist-Architektur** von Client und Server: **Three.js** im Browser, **Colyseus** auf Node, **`shared`** für Konstanten, **Inseln**, **Artillerie-Helfer** und **`shipMovement`**. **Bewegung**, **Schiff↔Insel** und **Artillerie-Treffer** laufen **serverseitig** (20 Hz).

---

## 1. Repository-Überblick

```
BattleFleet-Arena/
├── client/                 # Vite + TypeScript + Three.js + colyseus.js
│   └── src/
│       ├── main.ts         # Colyseus-Join, State → Meshes, Interpolation, Input, Ping, Renderloop
│       └── game/
│           ├── scene/      # Three.js-Szene, Kamera, Wasser, Schiff-Meshes
│           ├── input/      # Tastatur & Maus → Samples
│           ├── network/    # remoteInterpolation.ts — Task 3
│           ├── effects/    # artilleryFx.ts — Task 5 (nur Darstellung)
│           └── hud/        # Cockpit, Debug-Overlay, areaWarningHud (OOB)
├── server/                 # Colyseus + WebSocket-Transport
│   └── src/
│       ├── index.ts        # GameServer, Matchmaking „battle“
│       └── rooms/
│           └── BattleRoom.ts   # 20 Hz: Bewegung, Inseln, Artillerie-Queue, OOB
├── shared/                 # @battlefleet/shared
│   └── src/
│       ├── schema.ts       # BattleState, PlayerState (@colyseus/schema)
│       ├── mapBounds.ts    # AREA_OF_OPERATIONS_HALF_EXTENT (Debug: klein), OOB-Zeit
│       ├── islands.ts      # DEFAULT_MAP_ISLANDS, resolveShipIslandCollisions
│       ├── artillery.ts    # Feuerbogen, Streuung, Flugzeit; Insel-Helfer für VFX-Klassifikation (Schuss ohne Insel-Sperre)
│       └── shipMovement.ts # stepMovement, smoothRudder, Config (Server + Zielbild Client)
├── docs/
├── PRD.md
├── Project_Plan.md
└── README.md
```

**Dev:** `npm install` im Root, dann `npm run dev` (siehe README).

### 1.1 `@battlefleet/shared` — Überblick

| Datei | Rolle |
|--------|--------|
| `schema.ts` | `BattleState`, `PlayerState`: Pose, Aim, `oobCountdownSec`, **`hp`**, **`maxHp`**, **`primaryCooldownSec`** |
| `mapBounds.ts` | `AREA_OF_OPERATIONS_HALF_EXTENT`, `OOB_DESTROY_AFTER_MS`, `isInsideOperationalArea` |
| `islands.ts` | `DEFAULT_MAP_ISLANDS` (5× Kreis), `resolveShipIslandCollisions`, `SHIP_ISLAND_COLLISION_RADIUS` |
| `artillery.ts` | `tryComputeArtillerySalvo` (kein Insel-Block beim Feuern), `classifyArtilleryImpactVisual` (`artyImpact.kind`), Konstanten Cooldown/Splash/Schaden/Bogen (**±120°** = **240°**), Streuung |
| `shipMovement.ts` | `stepMovement`, `smoothRudder`, `createShipState`, `DESTROYER_LIKE_MVP` |

---

## 2. Server & Netzwerk (Task 2)

### 2.1 Colyseus

- **Raumname:** `"battle"` — `joinOrCreate("battle")` erzeugt oder tritt einem offenen Raum bei.
- **Transport:** `@colyseus/ws-transport` über gemeinsamen HTTP-Server mit **CORS**; Standardport **2567**.
- **Serializer:** `@colyseus/schema` — Root-State ist `BattleState` mit `playerList: ArraySchema<PlayerState>`.

### 2.2 `BattleRoom`

- **`onCreate`:** `setState(new BattleState())`, Nachrichten `input` / `ping`, **Simulation** `setSimulationInterval(..., 1000/20)` → **20 Hz**.
- **`onJoin` / `onLeave`:** Eintrag in `sim` (Map sessionId → Schiffszustand + Input-Hilfen) sowie `playerList` im Schema.
- **Imports:** `Room` / `Protocol` von **`@colyseus/core`** (siehe `server/package.json`); **`Client`** nur als **`import type`** (kein Laufzeit-Export im `colyseus`-Meta-Paket unter ESM).
- **Artillerie (Task 5):** `input.primaryFire === true`, **solange die linke Maustaste gehalten** wird (pro Frame im Client-Sample) → bei jedem `input`-Tick **`tryPrimaryFire`**: nur wenn **`primaryReadyAtMs`** erreicht ist, wird `tryComputeArtillerySalvo` ausgewertet → bei Erfolg `pendingShells` + **`broadcast("artyFired")`** (Dauerfeuer: Cooldown **`ARTILLERY_PRIMARY_COOLDOWN_MS`** begrenzt die Schussfolge). **Feuerbogen:** Ziel muss im Bug-Sektor **`ARTILLERY_ARC_HALF_ANGLE_RAD`** liegen (**±120°** Halbwinkel = **240°** Gesamt). Pro Tick zuerst **`resolveShellImpacts`**: fällige Shells → **`artyImpact`** inkl. **`kind`** (VFX: Wasser / Treffer / Ufer), Splash-Radius (**`ARTILLERY_SPLASH_RADIUS`**), Schaden (**Owner ausgenommen**), `hp <= 0` → `leave(..., "destroyed_in_combat")`. Granaten-Queue wird bei `onLeave` des Schützen bereinigt.
- **Pro Tick (Reihenfolge):**  
  1. **`resolveShellImpacts(now)`** — Treffer & HP  
  2. `smoothRudder`  
  3. `stepMovement`  
  4. `resolveShipIslandCollisions(ship, DEFAULT_MAP_ISLANDS)`  
  5. `PlayerState`: Pose, Aim, `oobCountdownSec`, **`primaryCooldownSec`** aus `primaryReadyAtMs`  
  6. OOB → ggf. `leave(..., "left_operational_area")`  
- **Einsatzgebiet (Task 4):** Quadrat \([-H,H]\) auf **X** und **Z** mit `H = AREA_OF_OPERATIONS_HALF_EXTENT` (`mapBounds.ts`, **Debug: 900** → Kante 1800). Außerhalb: `oobSinceMs` / `oobCountdownSec`; nach **10 s** (`OOB_DESTROY_AFTER_MS`) → `client.leave(Protocol.WS_CLOSE_WITH_ERROR, "left_operational_area")`.
- **Inseln:** `DEFAULT_MAP_ISLANDS` — **5** Kreise, gemeinsam mit Client; keine Schema-Replikation nötig, solange Definition statisch bleibt.
- **Input (`input`):** `throttle`, `rudderInput`, `aimX`, `aimZ`, optional **`primaryFire`** (**true**, solange **LMB** gedrückt; Server entscheidet mit Cooldown, ob geschossen wird).
- **Ping:** Client sendet `ping` mit `clientTime` (Performance-Zeitstempel); Server antwortet `pong` mit demselben Wert — Client misst RTT fürs Debug-Overlay.

### 2.3 Schema (`shared/src/schema.ts`)

- **`PlayerState`:** `id`, Pose, `speed`, `rudder`, **`aimX`**, **`aimZ`**, **`oobCountdownSec`**, **`hp`**, **`maxHp`**, **`primaryCooldownSec`**.
- **ES2022 / `defineTypes`:** Keine Klassenfeld-Initialisierer für Schema-Felder — Zuweisungen im **`constructor()`** nach `super()`, damit `setParent` / `ReferenceTracker` korrekt verdrahtet sind (sonst Encoder-Fehler `getNextUniqueId`).

### 2.4 Client (`main.ts`)

- **Join:** Reflection (kein drittes `joinOrCreate`-Schema-Argument aus `shared`), um **eine** `@colyseus/schema`-Instanz im Bundle zu vermeiden.
- **`playerList`:** Nach jedem `onStateChange` Listener erneut an die aktuelle `ArraySchema` hängen; im Frame immer `playerListOf(room)` — vermeidet „stale“ Liste nach erstem Snapshot.
- **Lokaler Spieler:** sendet pro Frame `input` (Throttle, Rudder, Aim); **Schiffspose** (Position, Heading, Ruder) autoritativ aus dem Server-State; **Peilungslinie** (orange) unmittelbar aus Maus (`sample()`), bezogen auf Server-Position.
- **Fremde Spieler (Task 3):** sichtbare Pose und Ruder sowie **cyan**-Ziellinie aus **`sampleInterpolatedPose`** (zwei Snapshots, Render-Zeit ≈ `now − 100 ms`); State-Patches weiter ~20 Hz.
- **Interpolation-Puffer:** `remoteInterp` — bei `onStateChange` nur `advanceIfPoseChanged`, wenn sich Pose/Peilung gegenüber dem letzten Snapshot messbar ändert; bei `onRemove` Eintrag löschen.
- **OOB-HUD:** `areaWarningHud` — roter Text + Countdown aus **`oobCountdownSec`** des lokalen Spielers; `onLeave`-Code **4002** + Reason `left_operational_area` → Hinweis „Destroyed…“.
- **Artillerie:** `room.send("input", { …, primaryFire })` mit **`primaryFire` aus `keyboardMouse.sample()`** (LMB halten); Nachrichten **`artyFired`** / **`artyImpact`** (`kind`: `water` \| `hit` \| `island`) → `artilleryFx` (Kugel + typisierter Splash, nicht autoritativ). **4002** + **`destroyed_in_combat`**.
- **Artillerie-VFX Culling (Client):** Kreis um Eigenschaft, Radius aus sichtbarem Ortho-Rechteck + Marge (`ARTILLERY_FX_CULL_MARGIN`, Helfer in `createGameScene.ts`). **`artyFired`:** zeichnen nur wenn **Start oder Ziel** im Kreis. **`artyImpact`:** Kugel immer cleanup; Splash nur wenn **Einschlag** im Kreis (`skipSplash`). Policy als Kommentar in `main.ts` beim Bootstrap — Analogon für spätere Welt-VFX möglich.
- **Debug-Overlay:** FPS, gekürzte Room-ID, Spielerzahl, **Ping**; optional Warn-/Diagnosezeilen.

---

## 3. Client-Laufzeit (Frame-Ablauf)

Pro Bild (`requestAnimationFrame`) — **ohne** clientseitige Schiffsphysik:

1. **`playerList`** aus dem Raum-State lesen; fehlende `ShipVisual`s nachziehen.
2. **Input** `sample()` (Gas, Ruder-Soll, Maus → Weltpunkt auf Meeresebene `Y = 0`).
3. **Visuals:** **Lokaler Spieler:** Position/Kurs/Ruder direkt aus Server-State (autoritativ). **Fremdspieler:** `sampleInterpolatedPose` aus `remoteInterpolation.ts` — zuletzt/nächster Snapshot (Zeit beim State-Patch), Darstellung bei `performance.now() − 100 ms` linear/kurven-interpoliert (`headingRad` kürzester Bogen); Ruder und **Peilung** (`aimX`/`aimZ`) ebenfalls interpoliert; Ziellinie **cyan** aus interpolierter Pose.
4. **Lokaler Spieler:** Kamera folgt **Server**-Pose, **`room.send("input", …)`** inkl. **`primaryFire`** (**LMB** gehalten = `true`, sonst `false`), Cockpit aus State + Input; **areaWarningHud**; **artilleryFx.update** pro Frame.
5. **`renderer.render`**

Bei neuem `onStateChange` wird pro Fremdspieler nur bei geänderter Pose (`posesEqual` mit Toleranz) `prev ← altes next`, `next ← neuer Snapshot` gesetzt — vermeidet „Zurückspringen“, wenn andere Felder patchen.

---

## 4. Modul-Zuständigkeiten (Client)

| Modul | Rolle |
|--------|--------|
| `game/scene/createGameScene.ts` | Wasser-/`Grid`-Extent `waterMapHalfExtent()` (**≈ 2.8×H**), AO-**Randlinie**, **Insel-Meshes** aus `DEFAULT_MAP_ISLANDS`, **Kamera** (`resizeCamera`, `updateFollowCamera`), **VFX-Cull:** `orthoVisibleHalfExtents`, `cameraPivotXZ`, `artilleryFxCullRadiusSq`, `ARTILLERY_FX_CULL_MARGIN` |
| `shared/…/shipMovement.ts` | `stepMovement`, `smoothRudder`, `DESTROYER_LIKE_MVP` — **läuft auf dem Server** mit fester `dt` |
| `game/input/keyboardMouse.ts` | W/S/A/D, NDC aus Maus, Raycast-Ergebnis; **`primaryFire`** = LMB gehalten (`pointerup` auch auf `window`, damit Loslassen außerhalb des Canvas zählt) |
| `game/hud/cockpitHud.ts` | DOM-Cockpit |
| `game/hud/debugOverlay.ts` | FPS, Raum, Spieler, Ping |
| `game/hud/areaWarningHud.ts` | Meldung „Area of Operations“ + verbleibende Sekunden |
| `game/effects/artilleryFx.ts` | Kugel-Interpolation; Einschlag-VFX nach `kind` (Wasser / Treffer / Insel-Ufer); Material **`depthTest: false`**, **`DoubleSide`** für sichtbare Ringe von oben; **`skipSplash`** ohne Cleanup-Verlust der Kugel |
| `game/network/remoteInterpolation.ts` | Zwei-Punkt-Interpolation, Render-Verzögerung 100 ms |

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

**Einsatzgebiets-Grenze:** Dieselbe Konstante `AREA_OF_OPERATIONS_HALF_EXTENT` auf Server und Client (rote Linie). **Wasser/Gitter:** `waterMapHalfExtent() ≈ 2.8 × H` in `createGameScene.ts` (mit kleinem `H` kompakte Debug-Szene).

**Insel-Darstellung:** `DEFAULT_MAP_ISLANDS` — pro Eintrag `createIslandMesh` (Zylinder + Kappe + flacher Ufer-Ring). Kollisionshülle Server = Kreis (`radius`); Mesh leicht kleiner — rein visuell akzeptabel fürs MVP.

**Task-4-Grenzen (MVP):** Keine Polygon-Inseln; **keine** Kollision Granate/Rakete ↔ Insel (Task 5+); Spawn fix im Ring um Null ohne generische Freiheitsprüfung (Layout hält Inseln vom Zentrum fern).

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

- **Wasser:** `PlaneGeometry`, Ausdehnung aus `waterMapHalfExtent()`.
- **Gitter:** `GridHelper`, Auflösung skaliert mit `AREA_OF_OPERATIONS_HALF_EXTENT`.
- **AO:** rote **Linie** auf Höhe `borderY ≈ 0.18`.
- **Inseln:** fünf Gruppen, Namen `island_i1` … `island_i5` (Debug).
- **Schiff (`shipVisual.ts`):** Dreieck-Hull, Ziellinie, Ruderstrich; **lokales Schiff** zusätzlich **Feuerbogen** (Bogen + Randstrahlen, Konstante **`ARTILLERY_ARC_HALF_ANGLE_RAD`** aus `@battlefleet/shared`, identisch zum Server). Kamera folgt lokalem Schiff.

---

## 8. Review-Hinweise (Stand Task 5)

- **Server bleibt maßgeblich** für Schussvalidierung (`tryComputeArtillerySalvo`), Treffer (`resolveShellImpacts`), HP und Disconnect.
- **Client-VFX** sind **dekorativ**: `artyFired` / `artyImpact` können theoretisch manipuliert werden — Spielstand nicht daraus leiten.
- **Artillerie-Culling:** reduziert Mesh-/rAF-Last; **Netzwerk** schlägt weiter `broadcast` für alle Raum-Clients (kein Server-LOD). Schüsse, deren Bahn das sichtbare Rechteck schneidet, obwohl **Start und Ziel** außerhalb des Cull-Kreises liegen, werden nicht gezeichnet (selten).
- **Granate ↔ Insel:** keine Kollisions-Simulation; Schüsse können visuell „durch“ Inseln fliegen (Konsistenz mit entfernter Insel-Sperre beim Feuern).

---

## 9. Referenzen

- `README.md` — Install, Dev, Build, Multiplayer- und **Task-4/5-Tests** (AO, Inseln, Artillerie)  
- `PRD.md` — Produktvision, MVP, Netzwerk, Karte & Kollision  
- `Project_Plan.md` — **Task 5 MVP abgeschlossen**; nächster Fokus **Task 6** (Respawn)  
