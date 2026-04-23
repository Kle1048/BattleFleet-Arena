# BattleFleet Arena — Referenz: Spiel, Konfiguration & Konsole

Diese Dokumentation beschreibt **laufzeitrelevante Parameter**, **Konfigurationsspeicher**, **URL- und Umgebungsvariablen** sowie die **Browser-Konsole** (`window.__BFA`). Sie ergänzt fachliche Konzepte in anderen Dokumenten unter `docs/` und ist als **technische Nachschlageliste** gedacht.

---

## 1. Inhaltliche Übersicht

| Bereich | Inhalt |
|--------|--------|
| **§2** | Globales Objekt **`__BFA`** (Konsole) — Eigenschaften, Funktionen, typische Befehle |
| **§3** | **URL-Parameter** (`?…`) |
| **§4** | **`localStorage`** — Schlüssel, Werte, Wirkung |
| **§5** | **Umgebungsvariablen** (Vite-Client, Node-Server) |
| **§6** | **Steuerung** — Tastatur, Maus, Mobile-Overlay |
| **§7** | **Gameplay- & Simulationskonstanten** (Auszug aus `@battlefleet/shared`) |
| **§8** | **Netzwerk** — Colyseus-URL, Server-Port, Raum-Nachrichten |
| **§9** | **HUD & Darstellung** — CSS-Variablen, Skalierung (z. B. Mobile) |

---

## 2. `window.__BFA` — Konsole (nach erfolgreichem Spielstart)

Das Objekt wird in `client/src/main.ts` gesetzt, **nachdem** der Client dem Raum `battle` beigetreten ist und Bootstrap abgeschlossen ist. In der **Entwicklerkonsole** (`F12` → „Konsole“):

```js
__BFA
```

### 2.1 Eigenschaften (Getter / Werte)

| Name | Typ | Bedeutung |
|------|-----|-----------|
| `colyseusUrl` | `string` | Basis-URL des Colyseus-Servers (HTTP), z. B. `http://127.0.0.1:2567`. Herkunft: `VITE_COLYSEUS_URL` oder automatisch aus `hostname:2567` (siehe §5). |
| `room` | Colyseus-`Room` | Aktiver Spielraum (`battle`). |
| `mySessionId` | `string` | Eigene Session-ID (Colyseus). |
| `playerListLength` | `number` | Anzahl Einträge in `playerList` (Snapshot). |
| `stateSyncCount` | `number` | Interner Zähler „State-Synchronisationen“ (Debug/Diagnose). |
| `pingMs` | `number \| null` | Zuletzt gemessene Round-Trip-Zeit Ping/Pong (ms), falls verfügbar. |
| `devHudVisible` | `boolean` | Ob das **volle** Dev-Debug-HUD sichtbar ist (FPS-Toggle, Diagnose, Bot-/Environment-Dock). |

### 2.2 Funktionen

| Name | Signatur | Bedeutung |
|------|----------|-----------|
| `showDevHud` | `(show?: boolean) => void` | **`true`** (Standard): volles Debug-Overlay (inkl. `+`/`-` Toggle für Metriken) und **unteres Dock** (Bot-Panel, Environment-Debug). **`false`**: nur kompakte Zeile **FPS · Frame · Ping** (+ ggf. Warnung bei Verbindungsproblemen); Dock ausgeblendet. |

**Beispiele:**

```js
// Volles Dev-HUD + Bot/Environment-Panels einblenden
__BFA.showDevHud()
__BFA.showDevHud(true)

// Wieder nur Minimal-Anzeige (FPS / Frame / Ping)
__BFA.showDevHud(false)

// Aktueller Zustand
__BFA.devHudVisible
```

### 2.3 Hinweise

- **`room`** erlaubt direktes Arbeiten mit der Colyseus-API (z. B. `room.state`, `room.send` — nur wenn du die Server-API kennst; falscher Aufruf kann den Match stören).
- Für **fehlgeschlagene Verbindung** beim Start existiert **`__BFA` noch nicht** — dann erscheint nur die Fehlerseite / Overlay.

---

## 3. URL-Parameter

Die Auswertung erfolgt über `URLSearchParams(window.location.search)` in `client/src/main.ts` bzw. `mobileControls.ts`.

| Parameter | Wert | Wirkung |
|-----------|------|---------|
| `resetLocal` | `1` | **Einmaliger Reset:** alle in `BATTLEFLEET_LOCAL_STORAGE_KEYS` gelisteten `localStorage`-Einträge werden gelöscht, der Parameter aus der URL entfernt, Seite neu geladen. Implementierung: `clearPersistedClientSettings()` in `client/src/game/runtime/clearPersistedClientSettings.ts`. |
| `bot` | `1` | Nach dem Lobby-Join wird der **KI-Bot** automatisch aktiviert (`botController.enable()`). |
| `mobileControls` | `0` | **Erzwingt:** Mobile-Steuerung (Nipple + Softkeys) **aus**. |
| `mobileControls` | `1` | **Erzwingt:** Mobile-Steuerung **an** (unabhängig von `pointer: coarse`). |

**Beispiele:**

```
https://example.com/?resetLocal=1
https://example.com/?bot=1&mobileControls=1
```

---

## 4. `localStorage` — Schlüssel und Parameter

### 4.1 Von `clearPersistedClientSettings` entfernte Keys

Diese Liste ist die **Quelle der Wahrheit** für `?resetLocal=1` (`client/src/game/runtime/clearPersistedClientSettings.ts`):

| Schlüssel | Kurzbeschreibung |
|-----------|------------------|
| `bfa.waterShaderTuning.v2` | Wasser-Shader (Debug-Panel / Editor-Pfad) |
| `bfa.shipDebugTuning.v2` | Schiffs-Debug (Environment-Panel) |
| `bfa.environmentTuning.v1` | Umgebung (Himmel, Wasser, Nebel, Licht-Presets) — `EnvironmentTuning` |
| `bfa.followCameraTuning.v1` | Follow-Kamera (`pitchDeg`, `northUp`, `heightAbovePivot`, `headUpYawLagSec`) |
| `bfa.wakeRuntimeTuning.v1` | Wake/Kielwasser-Visual-Tuning |
| `battlefleet_ship_profile_patch_v1` | JSON-Map: Hull-Visual-Patches für Profil-Editor/Workbench (nicht autoritativ im Live-Match) |
| `battlefleet_show_ship_hitbox` | `"1"` = Schiff-Hitbox-Drahtrahmen (Debug) |
| `battlefleet_show_wreck_collision` | `"1"` = Wrack-Kollisionszylinder (Debug) |

### 4.2 Weitere Keys (nicht zwingend durch `resetLocal` gelöscht)

| Schlüssel | Werte | Bedeutung |
|-----------|-------|-----------|
| `bfa.hud.debugOverlayCompact` | `"1"` / `"0"` | Debug-Overlay: kompakt (nur eine Zeile) vs. erweitert — wenn **Dev-HUD voll** (`showDevHud(true)`). |
| `bfa.hud.bridgeCompact` | `"1"` / `"0"` | Cockpit-Brücke: reduziertes Panel („nur Kurs“). |
| `bfa.hud.opzCompact` | `"1"` / `"0"` | OPZ-Panel: reduziert („nur HP“). |
| `battlefleet_missionBriefing_v1` | `"1"` | Mission-Briefing wird nicht mehr beim Start angezeigt („Nicht mehr anzeigen“). |

### 4.3 Struktur ausgewählter JSON-Objekte

**`bfa.followCameraTuning.v1`** (`FollowCameraTuning` in `followCameraTuning.ts`):

| Feld | Typ | Default (Auszug) | Beschreibung |
|------|-----|-------------------|--------------|
| `pitchDeg` | number | `70` | Kameraneigung (15–90). |
| `northUp` | boolean | `true` | `true`: Norden oben; `false`: Bug oben (mitdrehend). |
| `heightAbovePivot` | number | `900` | Höhe über Blickpunkt (Clamp 80–5000). |
| `headUpYawLagSec` | number | `0.2` | Gedämpfte Gier im Head-up-Modus (0–0,75 s). |

**`bfa.environmentTuning.v1`** (`EnvironmentTuning` in `environmentTuning.ts`): u. a. `skyEnabled`, `turbidity`, `rayleigh`, `mieCoefficient`, `mieDirectionalG`, `elevationDeg`, `azimuthDeg`, Wasser-Parameter (`waterDistortionScale`, `waterSize`, `waterAlpha`, …), `lightingPreset`, `ambientIntensityMul`, `sunIntensityMul`, `fogStrength`. Vollständige Defaults: `DEFAULT_ENVIRONMENT_TUNING` in derselben Datei.

---

## 5. Umgebungsvariablen

### 5.1 Client (Vite)

| Variable | Pflicht | Bedeutung |
|----------|---------|-----------|
| `VITE_COLYSEUS_URL` | Nein | Wenn gesetzt und nicht leer: **Basis-URL** des Colyseus-Servers (ohne trailing slash). Sonst: `http://<hostname>:2567` mit `hostname` der aktuellen Seite (localhost → `127.0.0.1`). Siehe `colyseusHttpBase()` in `sessionBootstrap.ts`. |
| `BASE_URL` / `import.meta.env.BASE_URL` | Vite | Basis-Pfad für Assets (GLB, Sounds). |

### 5.2 Server (Node)

| Variable | Default | Bedeutung |
|----------|---------|-----------|
| `PORT` | `2567` | HTTP/WebSocket-Port des Spielservers (`server/src/index.ts`). |
| `LISTEN_HOST` | `0.0.0.0` | Bind-Adresse. |
| `NODE_ENV` | — | u. a. `production` schützt Debug-Route `debugSetShipClass`. |
| `BFA_DEBUG_SHIP_SWITCH` | — | Wenn `1`, ist Klassenwechsel in Production erlaubt (sonst nur Dev). |

---

## 6. Steuerung (Desktop)

Aus `client/src/game/input/keyboardMouse.ts` und der Hilfe in `index.html` (`#hud`). Maus bewegt sich nur über dem **Canvas** (Zielpunkt auf Boden).

| Eingabe | Bedeutung |
|---------|-----------|
| **W / S** | Gas vor / zurück (`throttle` ±1) |
| **A / D** | Ruder links / rechts (`rudderInput` ±1) |
| **Maus** | Zielpunkt (X/Z) für Artillerie-Bogen / ASuM-Fallback-Richtung |
| **Leertaste** oder **LMB halten** | Primärfeuer (Artillerie) |
| **RMB halten** | Sekundärfeuer (ASuM) — Seitenwahl **aim-basiert** |
| **MMB halten** oder **Q** | Torpedo/Minen (wenn Feature aktiv) |
| **R** (Toggle) | Suchrad an/aus (`radarActive`) |
| **B** | Bot an/aus (wenn nicht durch KI-Input übersteuert) |
| **F** | Feuerleitkanal: nächstes gegnerisches Ziel wählen (zyklisch; Zielwahl bis ca. **600 m**) |
| **Esc** | Feuerleitkanal-Ziel aufheben (Fire-Control) |

**Cockpit-HUD:** Button **„RADAR ON/OFF“** entspricht **R** (Touch-freundlich).

**Mobile** (`mobileControls.ts`): Joystick Gas/Ruder, **NEXT TGT** (wie **F**), **FEUER**, **Port SSM** / **Stb SSM** (mit Server-Flag `aswmFireSide`), Dead-Zones für Fehlziele. Kein Minen-Button auf Mobile (Tastatur/PC).

**Hybrid (Tablet / Surface + Tastatur):** Solange **W, S, A oder D** gehalten wird, gelten dieselben Telegraf-Stufen wie am PC, und die Touch-Schieber werden daran ausgerichtet. **Maus oder Stift** auf dem Canvas (`pointerType` `mouse` / `pen`) steuert die Zielpeilung wie am Desktop; reines Touch-Spiel ohne Maus nutzt weiter die feste Bug-Marke, wenn kein Ziel-Pin gesetzt ist. **Q**, **Leertaste**, **R**, **F** usw. wirken weiter global.

---

## 7. Gameplay- & Simulationsparameter (Auszug aus Shared)

| Konstante | Typischer Wert | Datei / Kontext |
|-----------|----------------|-----------------|
| `MATCH_DURATION_SEC` | `720` (12 Min) | `shared/src/match.ts` |
| `MATCH_PASSIVE_XP_INTERVAL_MS` | `4000` | |
| `RADAR_RANGE_WORLD` | `600` (m) | `shared/src/radarHudMath.ts` — Suchrad/Blips |
| `RADAR_ESM_RANGE_WORLD` | `1200` | Passives ESM (2× Suchrad-Basis) |
| `ASWM_SPEED`, `ASWM_LIFETIME_MS`, `ASWM_HIT_RADIUS`, … | diverse | `shared/src/aswm.ts` |
| `MATCH_PHASE_RUNNING` / `MATCH_PHASE_ENDED` | Strings | Match-Ende / HUD |

Vollständige Werte bitte in den jeweiligen Dateien unter `shared/src/` nachlesen; hier werden nur **häufig zitierte** Größen genannt.

---

## 8. Netzwerk & Server-Nachrichten

### 8.1 Colyseus

- Client: `Client` + `joinOrCreate("battle", { shipClass, displayName }, BattleState)`.
- **Server-Raum-Nachrichten** (Auszug `BattleRoom.ts`):

| Nachricht | Richtung | Inhalt (Kurz) |
|-----------|----------|----------------|
| `ping` | Client → Server | `{ clientTime? }` — RTT |
| `pong` | Server → Client | Antwort |
| `input` | Client → Server | Steuerung: `throttle`, `rudderInput`, `aimX`, `aimZ`, `primaryFire`, `secondaryFire`, `torpedoFire`, `radarActive`, optional `aswmFireSide`, `mineSpawnLocalZ`, … |
| `playAgain` | Client → Server | Neue Runde |
| `debugSetShipClass` | Client → Server | Nur Dev / mit `BFA_DEBUG_SHIP_SWITCH` in Production |

Weitere Nachrichten (Treffer, `aswmFired`, `artyFired`, …) sind im Server und in `networkRuntime.ts` verteilt.

---

## 9. HUD, Darstellung & Mobile-Skalierung

### 9.1 CSS-Variable `--hud-ui-scale`

- **Default:** `0.8` (global wie „80 % UI-Zoom“).
- **Touch:** `index.html` passt per Media Query an:
  - `(hover: none)` und `max-width: 767px` → **0.5**
  - `(hover: none)` und `768px–1366px` → **0.7**

### 9.2 Dev-HUD-Modi

- **Minimal (Standard nach aktueller Implementierung):** nur eine Zeile **FPS · Frame ms · Ping**; `__BFA.showDevHud(true)` blendet volles Debug + unteres Dock wieder ein.

---

## 10. Pflege dieser Dokumentation

- Neue **`localStorage`-Keys**, die beim Reset mitgelöscht werden sollen, müssen in **`BATTLEFLEET_LOCAL_STORAGE_KEYS`** in `clearPersistedClientSettings.ts` ergänzt werden — und in **§4.1** dieser Datei.
- Neue **`__BFA`-APIs** in `main.ts` → **§2** aktualisieren.
- Neue **URL-Parameter** → **§3**.

---

*Stand: generiert als Referenz für Entwickler und fortgeschrittene Spieler; Spiel- und Design-Logik kann sich in Commits ändern — bei Abweichungen im Zweifel den Quellcode prüfen.*
