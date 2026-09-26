# BattleFleet-Arena

Browser-Multiplayer (Three.js + Colyseus + Node.js) laut `PRD.md` und `Project_Plan.md`. Enthält **Task 2–9 (MVP)** — Netz, Interpolation, AO & Inseln, **Primär-Artillerie** (Plan A), **HP** & **Respawn** mit `lifeState` (**5 s** Timer, **3 s** Spawn-Schutz ohne Splash-Schaden), **ASuM**, **Torpedo**, **SAM/CIWS** (nur gegen eingehende ASuM). **Außerhalb AO** nach **10 s** dasselbe wie Kampftod (kein Disconnect).

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

Client und Dev-Server laden `shared/src` direkt. Der Server verwendet dafür die
Exportbedingung `bfa-source`; `tsx watch` startet ihn bei Änderungen an Shared-TS
oder -JSON neu (laufende lokale Matches werden dabei beendet). Ein Shared-Build
oder zweiter Watcher ist im Dev-Modus nicht nötig. Produktionsstarts über
`npm start -w server` verwenden weiterhin `shared/dist/index.js` aus dem Build.

## Tests und Typechecks

```bash
npm run typecheck
npm test
npm run build
```

Diese Root-Befehle prüfen alle drei Workspaces. Der gemeinsame Test-Runner findet
alle `src/**/*.test.ts` automatisch, führt sie in isolierten Prozessen aus und
meldet Fehler sowie Timeouts als fehlgeschlagen. Einzelne Pakete lassen sich z. B.
mit `npm test -w server` oder `npm run typecheck -w client` prüfen.
Tests verwenden wie der Dev-Server aktuelle Shared-Quellen, keine alten Bundles.
Die CI prüft Pull Requests und `main`; auch Pages-Deployments durchlaufen diese Gates.
Der aktuelle Sicherheitsstand und separat notwendige Versionsmigrationen stehen in
[Dependency-Wartung](docs/DEPENDENCY-MAINTENANCE.md).

## Lokale Laufzeitdaten

Leaderboard und Admin-Konfiguration gehören nicht ins Repository. Standardmäßig
schreibt der Server `server-data/leaderboard.json` und `server-data/admin-config.json`
relativ zu seinem Arbeitsverzeichnis: bei `npm run dev:server` bzw.
`npm start -w server` ist das `server/server-data/` im Repository.
Alle Verzeichnisse namens `server-data` sind ignoriert, einschließlich temporärer Writes.

`BFA_DATA_DIR` überschreibt den Speicherort; in Produktion einen **absoluten Pfad
außerhalb des Checkouts** verwenden und diesen regelmäßig sichern. Bei einem frei
gewählten Pfad innerhalb des Repositories muss dieser ebenfalls ignoriert werden.
Ohne Dateien startet das Spiel mit leerem Leaderboard und den Code-/Umgebungsdefaults;
der Server legt die Dateien bei der ersten Änderung an.
Optionale, anonymisierte Vorlagen liegen in `server/data-examples/`. Die partielle
Admin-Vorlage überschreibt nur ihre drei Felder; nicht über vorhandene Daten kopieren.

Beim Update eines bestehenden Checkouts **vor dem Pull** Laufzeitdaten extern sichern:
das Entfernen zuvor versionierter Dateien kann sie in anderen Checkouts löschen.
Anschließend bei Bedarf ins Datenverzeichnis zurückkopieren. Die lokalen Dateien
dieses Checkouts bleiben beim Entfernen aus dem Git-Index unverändert erhalten.
Bereits veröffentlichte Spielerkennungen bleiben in der Git-Historie und gelten als
offengelegt; Ignore-Regeln ersetzen weder eine Historienbereinigung noch verlässliche
serverseitige Identitäten. Historie und Spieleridentitäten werden hier nicht geändert.

## Erreichbarkeit

- Von **localhost**: der Client nutzt für Colyseus automatisch `127.0.0.1:2567` (IPv4), damit der Join auch mit Server auf `0.0.0.0:2567` zuverlässig funktioniert.
- **LAN**: z. B. Client über `http://<PC-IP>:5173` — dann wird dasselbe Host-IP für Port **2567** verwendet. Ggf. **Windows-Firewall**: eingehend TCP **2567** für Node erlauben.
- Optional: **`VITE_COLYSEUS_URL`** (ohne trailing slash), z. B. `http://127.0.0.1:2567`.

Browserzugriffe werden serverseitig auf **`BFA_ALLOWED_ORIGINS`** begrenzt
(kommagetrennte vollständige Origins, ohne Pfad oder abschließenden Slash).
Im Dev-Modus sind ohne diese Variable nur `http://localhost:5173` und
`http://127.0.0.1:5173` erlaubt. Für LAN-Tests die tatsächliche Client-Origin ergänzen.
In Produktion gibt es keine implizit erlaubten Browser-Origins: z. B.
`BFA_ALLOWED_ORIGINS=https://deinname.github.io` setzen (kein Repository-Pfad).
Die Prüfung gilt für öffentliche HTTP-APIs, Colyseus-Matchmaking und WebSockets.
Native/CLI-Clients ohne Origin bleiben möglich; CORS ersetzt keine Authentifizierung.

## Admin-Zugriff

`/admin` liefert nur die statische Anmeldemaske. **Alle** `/api/admin/*`-Routen
verlangen ein serverseitiges **`BFA_ADMIN_TOKEN`**, auch auf localhost und über SSH.
Ohne Token ist die Admin-API deaktiviert (503); ein falsches/fehlendes Token ergibt 401.
Ein gesetztes Token muss 32–256 druckbare ASCII-Zeichen ohne Leerzeichen enthalten;
empfohlen sind 32 kryptografisch zufällige Bytes als 64 Hex-Zeichen.
Token ausschließlich serverseitig setzen, niemals als `VITE_*`, URL-Parameter oder im Git.

Das Panel über HTTPS oder einen lokalen SSH-Tunnel öffnen, Token eingeben und
**Connect** wählen. Es bleibt nur im Speicher des Tabs; Reload/Disconnect entfernt es.
API-Aufrufe verwenden `Authorization: Bearer <token>` (alternativ `x-admin-token`).
Admin-Browser-Requests sind nur von derselben Origin erlaubt, unabhängig von der
Spielclient-Allowlist. Proxy- und Loopback-Adressen gewähren keinerlei Sonderrechte.
Token-Rotation: Umgebungswert ersetzen und Server neu starten.
VPS-Konfiguration und Nginx-Sperren: [Deployment-Anleitung](docs/HETZNER-SERVER-SETUP.md#10-lokales-admin-panel).

## Build

Performance-Messung, HUD-Taktung und optionale Debug-Panels:
[Client-/Server-Hotpaths](docs/CLIENT-SERVER-PERFORMANCE.md).

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

9. **Luftabwehr (Task 9 — SAM + CIWS):** Automatisch gegen **eingehende ASuM** (Zielrichtung des Geschosses → Verteidiger mit `targetId` oder nächster Gegner im **SAM**-Gürtel). **SAM**-Reichweite **100 m**, **CIWS** **50 m** (serverseitig; SAM vor CIWS, Wahrscheinlichkeit + Cooldowns in `shared/airDefense.ts`). **Torpedos** werden **nicht** abgefangen. Server: `airDefenseFire` (Feuer), im **nächsten Tick** Wurf → bei Treffer `airDefenseIntercept` und Rakete weg; Client: VFX/Puls (`airDefenseFx.ts`).

10. **Artillerie (Task 5) & Leben (Task 6):** **Linke Maustaste halten** (Cooldown **0,5 s**), Ziel im Bug-Feuerbogen (**±120°**). Bei **HP 0** (Treffer oder OOB-Timeout): zentrale Meldung „Zerstört …“, **Wrack**-Darstellung, Cockpit-**Respawn** (~**5 s**), dann **Spawn-Schutz** (~**3 s**, kein Splash-Schaden; Schießen erlaubt). Verbindung bleibt bestehen.

## Projektstruktur (Monorepo)

| Paket | Inhalt |
|--------|--------|
| `client/` | Vite, Three.js, Colyseus-Client |
| `server/` | Colyseus, `BattleRoom`, Express-HTTP |
| `shared/` | Schema (**`missileList`**, **`torpedoList`**), `shipMovement`, `mapBounds`, `islands`, **`artillery`**, **`aswm`**, **`torpedo`**, **`airDefense`**, **`playerLife`**, **`respawn`** |
| `docs/` | Zielarchitektur, Refactoring-Plan, Betriebs- und Feature-Dokumentation |

## Weiterführend

- `Project_Plan.md` — Tasks & Meilensteine  
- [Zielarchitektur](docs/TARGET-ARCHITECTURE.md) — Modulgrenzen und technische Leitplanken für Review-Punkte 12–14
- [Refactoring-Plan](docs/REFACTORING-PLAN.md) — Reihenfolge, Abnahme und Rückweg des Umbaus
- [Historische MVP-Architektur](docs/ARCHITECTURE.md) — Task-9-Stand, nicht die aktuelle Implementierung
- `PRD.md` — Produktspezifikation  
