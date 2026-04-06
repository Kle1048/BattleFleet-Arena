# Entwicklertagebuch (2026-04-06)

Kurze, technische Zusammenfassung der heute umgesetzten Schritte, um `BattleFleet-Arena` online spielbar zu machen (statischer Client + laufender Colyseus-Server).

## 1) Zielbild festgelegt

- Architektur aufgeteilt in:
  - `client/` als statischer Build
  - `server/` als dauerhafter Node/Colyseus-Prozess
- Erstes Hosting-Ziel: Client auf GitHub Pages, Server auf Hetzner VPS.

## 2) Hetzner-Server aufgesetzt

- Ubuntu-Server bereitgestellt und per SSH erreichbar gemacht.
- Firewall-Basics definiert (SSH, später HTTP/HTTPS, anfangs Colyseus-Port).
- Repo auf den Server geklont und Node-Umgebung installiert.

## 3) Build-/Runtime-Fehler bei `@battlefleet/shared` behoben

### Problem

- Beim Serverstart trat `ERR_MODULE_NOT_FOUND` auf.
- Ursache: `shared` exportierte direkt TypeScript-Quellen (`./src/index.ts`), was unter Node/ESM im Produktionslauf nicht stabil auflösbar war.

### Lösung im Repo

- `shared`-Build für Node eingeführt (esbuild -> `shared/dist/index.js`).
- `exports` in `shared/package.json` aufgeteilt:
  - `node` -> `./dist/index.js`
  - `default` -> `./src/index.ts` (für Tooling/Client-Entwicklung)
- `prepare`-Script ergänzt, damit `shared` bei Installationen automatisch gebaut wird.
- Root-Buildreihenfolge ergänzt (`shared` vor `server` und `client`).

## 4) Serverbetrieb verifiziert

- Serverstart lokal und auf Hetzner getestet.
- Typische Nebenmeldung `EADDRINUSE` eingeordnet (Port bereits belegt, kein Build-Fehler).
- Dokumentation für Setup/Service-Betrieb erstellt (`docs/HETZNER-SERVER-SETUP.md`).

## 5) GitHub Pages Deployment-Pipeline eingerichtet

- Workflow für GitHub Actions erstellt:
  - Build nur `client`
  - Upload von `client/dist` auf GitHub Pages
- Vite-`base` für Pages-Unterpfad konfigurierbar gemacht (`VITE_BASE_PATH`).
- `.nojekyll` ergänzt.
- Begleitdoku ergänzt (`docs/GITHUB-PAGES.md`).

## 6) Mixed-Content-Problem identifiziert und behoben

### Problem

- GitHub Pages (HTTPS) konnte Backend-Aufrufe auf `http://<ip>:2567` nicht ausführen.
- Browser blockierte Requests als Mixed Content.

### Lösung

- Eigene API-Subdomain verwendet: `battlefleet-api.battleshipsandunicorns.com`.
- DNS auf Hetzner-IP umgestellt.
- Nginx-Reverse-Proxy auf Hetzner konfiguriert (`:80` -> `127.0.0.1:2567`, inkl. WebSocket-Header).
- Let’s Encrypt-Zertifikat via Certbot erfolgreich ausgestellt.
- Backend ist jetzt über HTTPS erreichbar:
  - `https://battlefleet-api.battleshipsandunicorns.com`

## 7) Finalisierung

- Client-Build auf neue Backend-URL ausgelegt (`VITE_COLYSEUS_URL=https://...`).
- Deployment erneut durchgeführt.
- Ergebnis: Online-Zugriff funktioniert.

## 8) Wichtige Learnings

- Für Browser-Spiel mit WebSocket gilt: HTTPS-Frontend braucht HTTPS/WSS-Backend.
- Reine IP-URL ist für produktionsnahe TLS-Setups unpraktisch; Domain/Subdomain ist der saubere Weg.
- Monorepo-Pakete mit gemeinsamen TS-Quellen benötigen für Node-Runtime oft klaren Dist-Output.
