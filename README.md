# BattleFleet-Arena

Browser-Multiplayer (Three.js + Colyseus + Node.js) laut `PRD.md` und `Project_Plan.md`. Enthält **Task 2–8 (MVP)** — Netz, Interpolation, AO & Inseln, **Primär-Artillerie** (Plan A), **HP** & **Respawn** mit `lifeState` (**5 s** Timer, **3 s** Spawn-Schutz ohne Splash-Schaden). **Außerhalb AO** nach **10 s** dasselbe wie Kampftod (kein Disconnect).

## Voraussetzungen

- **Node.js** (LTS empfohlen)
- **npm**

## Installation

```bash
npm install
```

## Entwicklung

**Server und Client gleichzeitig** (empfohlen):

```bash
npm run dev
```

Nur Client (http://localhost:5173):

```bash
npm run dev:client
```

Nur Colyseus-Server (Standard **http://0.0.0.0:2567**):

```bash
npm run dev:server
```

### Erreichbarkeit

- Von **localhost**: der Client nutzt für Colyseus automatisch `127.0.0.1:2567` (IPv4), damit der Join auch mit Server auf `0.0.0.0:2567` zuverlässig funktioniert.
- **LAN**: z. B. Client über `http://<PC-IP>:5173` — dann wird dasselbe Host-IP für Port **2567** verwendet. Ggf. **Windows-Firewall**: eingehend TCP **2567** für Node erlauben.
- Optional: **`VITE_COLYSEUS_URL`** (ohne trailing slash), z. B. `http://127.0.0.1:2567`.

## Build

```bash
npm run build
```

(baut zuerst `server`, dann `client`.)

## Multiplayer kurz testen

1. `npm run dev` starten.
2. Zwei Browser-Tabs auf die Client-URL öffnen.
3. Beide sollten im gleichen Raum („battle“) erscheinen; das **andere** Schiff sollte sich dank Interpolation **flüssiger** bewegen als die Roh-Snapshot-Rate (~20 Hz); das eigene Schiff folgt der autoritativen Server-Pose.
4. Debug-Overlay: **FPS**, **Raum**, **Spielerzahl**, **Ping** (Roundtrip ping/pong ~2 s).
5. **Karte (Task 4):** Rote Linie = AO-Grenze; **Inseln** als grün/braune „Tupfer“. Gegen eine Insel fahren → das Schiff bleibt an der **Kreis-Kollision** außen (serverseitig).
6. **OOB:** Über die rote Grenze hinaus → zentrale Meldungsfläche (Text + Countdown); **10 s** nicht zurück → **HP 0** und **Respawn** wie bei Kampftod (kein Raum-Kick); bei Rückkehr vorher verschwindet die Warnung.
7. **ASuM (Task 7):** **Rechte Maustaste halten** — Start in **Peilrichtung** (Maus); Sucher **±30°** um die **Flugrichtung** mit **max. Erfassungstiefe** (shared: `ASWM_ACQUIRE_CONE_LENGTH`); nur Ziele in diesem Kegelsegment werden angeflogen. Raketen **detonieren auf Inseln** (serverseitig, ohne Schiffs-Schaden) und an der **AO-Grenze**. Max. **2** gleichzeitig, **~3,2 s** Cooldown (**ASuM** im Cockpit). Client: Kegel-Mesh + Einschlag-Ring (kein Rauch-Schweif im MVP).

8. **Torpedo (Task 8):** Taste **Q** oder **mittlere Maustaste halten** — ein Torpedo in **Peilrichtung**, **geradeaus** (ohne Homing), langsamer als ASuM. Max. **1** aktiv, **~7,5 s** Cooldown (**Torpedo** im Cockpit). Insel- und AO-Detonation wie ASuM.

9. **Artillerie (Task 5) & Leben (Task 6):** **Linke Maustaste halten** (Cooldown **0,5 s**), Ziel im Bug-Feuerbogen (**±120°**). Bei **HP 0** (Treffer oder OOB-Timeout): zentrale Meldung „Zerstört …“, **Wrack**-Darstellung, Cockpit-**Respawn** (~**5 s**), dann **Spawn-Schutz** (~**3 s**, kein Splash-Schaden; Schießen erlaubt). Verbindung bleibt bestehen.

## Projektstruktur (Monorepo)

| Paket | Inhalt |
|--------|--------|
| `client/` | Vite, Three.js, Colyseus-Client |
| `server/` | Colyseus, `BattleRoom`, Express-HTTP |
| `shared/` | Schema (**`missileList`**, **`torpedoList`**), `shipMovement`, `mapBounds`, `islands`, **`artillery`**, **`aswm`**, **`torpedo`**, **`playerLife`**, **`respawn`** |
| `docs/` | `ARCHITECTURE.md` — Task **7–8** (ASuM, Torpedo) |

## Weiterführend

- `Project_Plan.md` — Tasks & Meilensteine  
- `docs/ARCHITECTURE.md` — Detaillierte technische Beschreibung  
- `PRD.md` — Produktspezifikation  
