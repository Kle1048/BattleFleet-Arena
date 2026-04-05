# BattleFleet-Arena

Browser-Multiplayer (Three.js + Colyseus + Node.js) laut `PRD.md` und `Project_Plan.md`. Stand: **Task 2** (serverseitige Bewegung, gemeinsamer Raum, Debug-Overlay inkl. Ping).

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
3. Beide sollten im gleichen Raum („battle“) erscheinen; Schiffsbewegung des anderen sichtbar (Updates ~20 Hz).
4. Debug-Overlay: **FPS**, **Raum**, **Spielerzahl**, **Ping** (Roundtrip ping/pong ~2 s).

## Projektstruktur (Monorepo)

| Paket | Inhalt |
|--------|--------|
| `client/` | Vite, Three.js, Colyseus-Client |
| `server/` | Colyseus, `BattleRoom`, Express-HTTP |
| `shared/` | `@colyseus/schema` (`BattleState` / `PlayerState`), `shipMovement` (gemeinsame Physik mit Server) |
| `docs/` | `ARCHITECTURE.md` — Ist-Architektur & Bewegungsmodell |

## Weiterführend

- `Project_Plan.md` — Tasks & Mehnsteine  
- `docs/ARCHITECTURE.md` — Detaillierte technische Beschreibung  
- `PRD.md` — Produktspezifikation  
