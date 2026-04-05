# BattleFleet-Arena

Browser-Multiplayer (Three.js + Colyseus + Node.js) laut `PRD.md` und `Project_Plan.md`. Stand: **Task 5 (MVP)** — **Primär-Artillerie** (Plan A: geplanter Einschlag, **0,5 s** Cooldown, Bogen/Streuung), **HP** & Tod (**Disconnect**; Respawn = Task 6); plus Task 2–4 (Netz, Interpolation, AO & Inseln).

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
6. **OOB:** Über die rote Grenze hinaus → englische Warnung + Countdown; **10 s** nicht zurück → Verbindungsende (Zerstörung laut Design); bei Rückkehr innerhalb der Zeit verschwindet die Warnung.
7. **Artillerie (Task 5):** **Linke Maustaste halten** (Dauerfeuer mit serverseitigem Cooldown **0,5 s**) — Ziel im Bug-Feuerbogen (**±120°**, **240°** Sektor); serverseitig Streuung & Splash-Schaden. Client: Kugel-Animation + **VFX nach Trefferart** (`water` / `hit` / `island`); **Cull-Kreis** um das eigene Schiff (sichtbares Ortho-Fenster + Marge) — Flug nur wenn Start **oder** Ziel im Kreis, Splash nur wenn Einschlag im Kreis (Kugel wird immer bereinigt). Gegner-**HP** im Cockpit, bei **0** Ende mit Meldung (Respawn = Task 6).

## Projektstruktur (Monorepo)

| Paket | Inhalt |
|--------|--------|
| `client/` | Vite, Three.js, Colyseus-Client |
| `server/` | Colyseus, `BattleRoom`, Express-HTTP |
| `shared/` | Schema, `shipMovement`, `mapBounds`, `islands`, **`artillery`** (Feuerlogik-Helfer) |
| `docs/` | `ARCHITECTURE.md` — Ist-Architektur inkl. **Task 5** (Artillerie, HP, Client-VFX-Culling) |

## Weiterführend

- `Project_Plan.md` — Tasks & Meilensteine  
- `docs/ARCHITECTURE.md` — Detaillierte technische Beschreibung  
- `PRD.md` — Produktspezifikation  
