# BattleFleet Arena - Optimierungs-Roadmap

Stand: April 2026  
Ziel: Das laufende MVP stabil, skalierbar und production-ready machen, ohne das Spielgefuehl zu verschlechtern.

---

## 1) Zielbild fuer die naechsten 90 Tage

In den kommenden 3 Monaten geht es nicht mehr um "mehr Features", sondern um:

1. **Stabilitaet unter Last** (keine Tick-Spikes, keine unkontrollierten Message-Fluten)
2. **Wartbarkeit** (weg von God-Files, klare Verantwortlichkeiten)
3. **Qualitaetssicherung** (automatisierte Tests und CI-Gates)
4. **Betriebssicherheit** (Logging, Healthchecks, Monitoring, reproduzierbare Deployments)
5. **Saubere Grundlage fuer spaetere Features** (Matchmaking, Progression, Rankings, Mobile-Optimierung)

---

## 2) Aktuelle Inkonsistenzen und Probleme im Code (konkret)

Dieser Abschnitt listet die wichtigsten Probleme mit Prioritaet, Auswirkung und Loesungsrichtung.

## P0 - Kritisch (sofort adressieren)

### 2.1 Ungebremste Input-Message-Frequenz vom Client
- **Dateien:** `client/src/main.ts`, `server/src/rooms/BattleRoom.ts`
- **Beobachtung:** Der Client sendet Input im Render-Loop (`room.send("input", ...)` innerhalb `requestAnimationFrame`), waehrend der Server mit `TICK_HZ = 20` arbeitet.
- **Auswirkung:**
  - unnoetig hoher Upstream-Traffic
  - hoehere CPU-Last durch viele redundante Inputs
  - Missbrauchspotenzial durch Message-Flood
- **Verbesserung:**
  - Client: Input nur bei Aenderung und/oder auf 20-30 Hz drosseln
  - Server: Rate-Limit je Session, "last input wins", ueberzaehlige Pakete droppen

### 2.2 Keine serverseitige Abuse-Protection auf `onMessage`
- **Datei:** `server/src/rooms/BattleRoom.ts`
- **Beobachtung:** `onMessage("input" | "ping" | "playAgain")` ohne harte Frequenz-/Payload-Limits.
- **Auswirkung:**
  - DoS-Risiko
  - unfairer Vorteil bei manipulierten Clients
- **Verbesserung:**
  - Sliding-Window Rate-Limiter je Nachrichtentyp
  - Telemetrie fuer gedroppte/korrigierte Nachrichten
  - klare Kick-Policy bei wiederholtem Missbrauch

### 2.3 Fehlende End-to-End-Tests fuer zentrale Multiplayer-Flows
- **Dateien:** derzeit keine E2E-Teststruktur fuer Join/Leave/Retry sichtbar
- **Auswirkung:** Kritische User-Flows bleiben manuell getestet und regressionsanfaellig.
- **Verbesserung:** 2-3 Smoke-E2E-Szenarien (Join, Match-Ende, Rejoin, Disconnect/Retry) verbindlich in CI.

---

## P1 - Hoch (in den naechsten Wochen)

### 2.4 God-Class im Server (`BattleRoom.ts`)
- **Datei:** `server/src/rooms/BattleRoom.ts`
- **Beobachtung:** Die Datei vereint Match-Lifecycle, Movement, Damage, Respawn, Air-Defense, Weapons, Broadcasts, Score.
- **Auswirkung:**
  - schwer testbar
  - hohe Kopplung
  - regressionsanfaellig bei Aenderungen
- **Verbesserung:**
  - Aufteilung in Systeme/Module:
    - `MatchSystem`
    - `CombatSystem`
    - `ProjectileSystem`
    - `RespawnSystem`
    - `BroadcastSystem`

### 2.5 Zu viel Verantwortung in `client/src/main.ts`
- **Datei:** `client/src/main.ts`
- **Beobachtung:** Netzwerk, State-Sync, Rendering, UI/HUD, Audio, Event-Handling und Runtime-Fehlerbehandlung in einer Datei.
- **Auswirkung:** Hohe Komplexitaet, schwierige Erweiterbarkeit, schlechte Testbarkeit.
- **Verbesserung:**
  - `network/clientSession.ts`
  - `game/gameLoop.ts`
  - `game/stateSync.ts`
  - `ui/uiController.ts`
  - `audio/audioController.ts`

### 2.6 Offenes CORS mit Credentials
- **Datei:** `server/src/index.ts`
- **Beobachtung:** `cors({ origin: true, credentials: true })`
- **Auswirkung:** Erhoehtes Sicherheitsrisiko bei spaeterem Auth-/Cookie-Einsatz.
- **Verbesserung:** Explizite Allowlist aus ENV, Credentials nur falls zwingend noetig.

### 2.7 CI ohne Quality-Gates vor Deploy
- **Datei:** `.github/workflows/deploy-github-pages.yml`
- **Beobachtung:** Build/Deploy fuer Client, aber kein verpflichtendes Lint/Test/Typecheck-Gate ueber alle Workspaces.
- **Auswirkung:** Fehlerhafte Stages koennen deployed werden.
- **Verbesserung:**
  - separater `ci.yml` fuer `shared`, `server`, `client`
  - Deploy-Workflow nur bei gruener CI

### 2.8 Kein strukturierter Logging-Standard
- **Dateien:** `server/src/index.ts`, `server/src/rooms/BattleRoom.ts`, `client/src/main.ts`
- **Beobachtung:** Verstreute `console.log/warn/error`.
- **Auswirkung:** Schweres Incident-Debugging im Livebetrieb.
- **Verbesserung:** Strukturierter Logger (`level`, `roomId`, `sessionId`, `event`, `errorCode`) und einheitliche Logging-Richtlinie.

---

## P2 - Mittel (nach Stabilisierung)

### 2.9 Hotpath-Suchen mit linearen Zugriffen
- **Datei:** `server/src/rooms/BattleRoom.ts`
- **Beobachtung:** Mehrfache `findPlayer(...)`-Nutzung in mehreren Tick-/Combat-Pfaden.
- **Auswirkung:** Schlechtere Skalierung bei mehr Spielern/Projektilen.
- **Verbesserung:** Tick-lokale Indexstruktur (`Map<sessionId, PlayerState>`) und gezieltes Caching.

### 2.10 Viele kurzlebige Allokationen pro Frame
- **Dateien:** `client/src/main.ts`, `client/src/game/effects/*`
- **Beobachtung:** Temporaere `Set`/Array-Objekte und mehrere kleinere Effekt-Loops.
- **Auswirkung:** GC-Spikes und unruhige Frametimes auf schwachen Geraeten.
- **Verbesserung:** Reuse statt Neuallokation, zentrales FX-Update pro Frame.

### 2.11 Shared-Tests nicht sauber in Standard-Testlauf integriert
- **Dateien:** `shared/src/*.test.ts`, `shared/package.json`, Root `package.json`
- **Beobachtung:** Testdateien mit `assert` + `console.log`, aber kein standardisiertes `test`-Script/Runner im Workspace.
- **Auswirkung:** Tests werden leicht vergessen und nicht konsistent in CI ausgefuehrt.
- **Verbesserung:** Vitest oder Node Test Runner verbindlich einfuehren, root-level `npm test`.

### 2.12 Fehlende Betriebsendpunkte (Health/Readiness/Metrics)
- **Datei:** `server/src/index.ts`
- **Beobachtung:** Keine standardisierten Healthchecks und keine Metriken.
- **Auswirkung:** Schwierigere Ueberwachung/Alerting.
- **Verbesserung:** `/healthz`, `/readyz`, Basis-Metriken (tick_duration, room_count, input_msgs_sec, error_rate).

---

## 3) 90-Tage-Roadmap (mit Phasen)

## Phase 1 (Tag 0-30): Stabilisieren und absichern

**Ziel:** Das bestehende MVP unter Realbedingungen robust machen.

### Arbeitspaket A - Netzwerkrobustheit
- Input-Sendefrequenz am Client begrenzen
- Input nur bei Aenderungen versenden
- Server-Rate-Limiter je Session/Nachrichtentyp
- Missbrauchszaehler + automatische Gegenmassnahmen

**Definition of Done:**
- Kein unkontrollierter Input-Spam mehr moeglich
- Unter Last gleichmaessigere Tick-Zeiten

### Arbeitspaket B - Build- und QA-Basis
- `ci.yml`: install, typecheck, build, test fuer alle Workspaces
- Deploy nur bei gruener CI
- erster minimaler Test-Report in CI-Output

**Definition of Done:**
- Jeder Push auf `main` hat nachvollziehbare Qualitaetschecks

### Arbeitspaket C - Server-Sicherheit und Betrieb
- CORS-Allowlist via ENV
- `/healthz` einfuehren
- strukturierte Logs fuer kritische Events

**Definition of Done:**
- Der Server ist ueberwachbar und sicherer vorkonfiguriert

---

## Phase 2 (Tag 31-60): Architektur und Performance aufraeumen

**Ziel:** Komplexitaet reduzieren und Skalierungsreserven schaffen.

### Arbeitspaket D - Server-Modularisierung
- `BattleRoom.ts` in Fachmodule extrahieren
- klare Schnittstellen zwischen Lifecycle, Combat, Projectiles
- gezielte Unit-/Integrationstests je Modul

**Definition of Done:**
- `BattleRoom` nur noch Orchestrierung
- Kernlogik ist testbar und besser isoliert

### Arbeitspaket E - Hotpath-Optimierung
- Player-Lookup-Index pro Tick
- unnnoetige lineare Suchketten reduzieren
- Performance-Baseline vor/nachher dokumentieren

**Definition of Done:**
- stabilere Tick-Latenz bei steigender Last

### Arbeitspaket F - Client-Aufteilung
- `main.ts` auf Verantwortungsbereiche aufteilen
- klarer Lifecycle (`start`, `stop`, `dispose`)
- saubere Trennung von Netzwerk, UI, Rendering, Audio

**Definition of Done:**
- deutlich kleineres `main.ts`
- weniger Seiteneffekte und bessere Testbarkeit

---

## Phase 3 (Tag 61-90): Produktionsreife und Skalierung

**Ziel:** Solide Betriebsgrundlage fuer Wachstum und neue Features.

### Arbeitspaket G - Observability ausbauen
- Metriken integrieren (Prometheus-kompatibel oder aequivalent)
- Dashboards fuer Tick-Time, Room-Count, Error-Rate
- Alarme fuer kritische Schwellwerte

### Arbeitspaket H - E2E und Release-Qualitaet
- Multiplayer-Smokes automatisieren
- Release-Checkliste standardisieren
- Fehlerklassen mit Repro-Schritten dokumentieren

### Arbeitspaket I - Laufzeitoptimierung Client
- FX-System zentralisieren
- Allokationen in Render-/Update-Loops reduzieren
- Basisprofiling fuer Low-End-Hardware

**Definition of Done fuer Phase 3:**
- nachvollziehbare Stabilitaets- und Performance-KPIs ueber mehrere Releases

---

## 4) Konkret priorisiertes Backlog (Top 15)

1. Input-Throttling im Client implementieren (P0)
2. Server Rate-Limiter fuer `input`/`ping` bauen (P0)
3. CI-Workflow fuer alle Workspaces einrichten (P0)
4. 3 Multiplayer-Smoke-Tests in CI integrieren (P0)
5. CORS-Allowlist in `server/src/index.ts` (P1)
6. `/healthz` und `/readyz` bereitstellen (P1)
7. Strukturiertes Logging einfuehren (P1)
8. `BattleRoom` in Subsysteme splitten (P1)
9. Player-Index fuer Tick-Hotpaths einfuehren (P1)
10. `client/src/main.ts` modularisieren (P1)
11. Shared-Testlauf standardisieren (`npm test`) (P1)
12. Deploy-Workflow an CI-Gates koppeln (P1)
13. Disconnect-Lifecycle im Client sauber stoppen (P2)
14. Effekt-Update-Loops zentralisieren (P2)
15. Frametimes + Ticktimes als KPI tracken (P2)

---

## 5) Messbare KPIs (ab sofort tracken)

- **Server tick p95/p99** (ms)
- **Input messages per client per second**
- **Disconnect rate pro Match**
- **Client frame time p95/p99** (ms)
- **Crash-/Unhandled-Error-Rate**
- **CI success rate** und **Mean Time to Fix**

Zielwerte (Startpunkt):
- Tick p95 < 55 ms unter normaler Last
- Input-Rate max. 20-30 msg/s pro Client
- CI pass rate > 90% nach 4 Wochen

---

## 6) Risiken bei Nicht-Umsetzung

- Lastprobleme werden mit mehr Spielern ueberproportional sichtbar.
- Netzwerk-Missbrauch kann Matches destabilisieren.
- Ohne Tests und CI-Gates steigen Regressionen mit jedem Feature.
- Ohne modulare Struktur verlangsamt sich jedes weitere Development.

---

## 7) Empfohlene Reihenfolge (kurz)

1. **Sicherheit + Lastschutz** (Input/Rate-Limit/CORS/Health)
2. **CI + Tests** (damit Refactoring sicher bleibt)
3. **Modularisierung Server/Client**
4. **Performance-Feinschliff und Observability**

Diese Reihenfolge minimiert Risiko und maximiert den Nutzen pro investierter Entwicklungszeit.

