# Hetzner-Server: Einrichtung BattleFleet-Arena (Colyseus)

Dieses Dokument fasst zusammen, wie der **Game-Server** (Node/Colyseus im Ordner `server/`) auf einer **Hetzner Cloud VPS** mit **Ubuntu** betrieben wird. Der **statische Client** (`client/`) läuft separat (lokal mit Vite oder später z. B. Vercel).

---

## 1. Architektur kurz

| Teil | Wo | Rolle |
|------|-----|--------|
| **Backend** | Hetzner VPS | Dauerhafter Node-Prozess, WebSocket (Colyseus), Standard-Port **2567** |
| **Frontend** | Entwickler-PC oder Static-Host | Vite-Build; verbindet sich per `VITE_COLYSEUS_URL` zum Backend |

---

## 2. Vorbereitung auf dem eigenen PC (Windows)

### 2.1 SSH-Key

- In **PowerShell**: `ssh-keygen -t ed25519 -C "deine-email@example.com"`
- Öffentlichen Key anzeigen: `Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub`
- Inhalt in **Hetzner Cloud Console → Security → SSH Keys** eintragen.

Falls `ssh-keygen` fehlt: Windows **OpenSSH-Client** installieren (optionale Features).

### 2.2 GitHub-Zugriff (Clone auf dem Server)

Bei Anmeldung über **Google / SSO** gibt es oft kein klassisches GitHub-Passwort für Git.

- **HTTPS:** Als „Password“ ein **Personal Access Token** (GitHub → Settings → Developer settings → Personal access tokens).
- **SSH:** Key unter GitHub → Settings → SSH keys hinterlegen, Repo per `git@github.com:…` klonen.

---

## 3. Hetzner Cloud

1. Account / Projekt anlegen.
2. **Server erstellen:** Image **Ubuntu 24.04 LTS**, SSH-Key zuweisen, Typ nach Bedarf (z. B. CX22).
3. **IPv4** der VM notieren (für `ssh` und für `VITE_COLYSEUS_URL`).
4. **Firewall** (empfohlen):
   - **TCP 22** — SSH (idealerweise nur von vertrauenswürdigen IPs).
   - **TCP 2567** — Colyseus (nur nötig, wenn **kein** Reverse-Proxy davor; siehe Abschnitt 13).
   - Mit **Nginx + HTTPS** zusätzlich: **TCP 80** und **TCP 443** (Let’s Encrypt + Clients). Dann kann **2567 von außen zu** bleiben, wenn Colyseus nur noch `127.0.0.1:2567` bedient.

---

## 4. Erster Login und Basissoftware

```bash
ssh root@DEINE_IPV4
apt update && apt upgrade -y
```

### Node.js LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
apt install -y nodejs
node -v && npm -v
```

### Git

```bash
apt install -y git
```

---

## 5. Repository auf dem Server

Beispielpfad: `/opt/BattleFleet-Arena` (anpassen, wenn anders gewählt).

```bash
cd /opt
git clone https://github.com/Kle1048/BattleFleet-Arena.git
cd BattleFleet-Arena
```

*(Bei privatem Repo: Token oder Deploy-Key verwenden.)*

---

## 6. Build und Abhängigkeiten

Monorepo mit Workspaces `client`, `server`, `shared`.

```bash
cd /opt/BattleFleet-Arena
npm ci
npm run build -w server
```

**Wichtig (Stand Repo):** Das Paket `@battlefleet/shared` wird für **Node** als gebündeltes **`shared/dist/index.js`** (esbuild) ausgeliefert; `npm ci` löst über das `prepare`-Script von `shared` den Build aus. Ohne funktionierendes `shared/dist` schlägt `node server/dist/index.js` mit Modulfehlern fehl.

Vollständiger Build lokal/CI-ähnlich:

```bash
npm run build
```

(= `shared` → `server` → `client`)

---

## 7. Manueller Test (ohne systemd)

```bash
cd /opt/BattleFleet-Arena
PORT=2567 npm run start -w server
```

Beenden: **Strg+C**.  
Hinweis: Beendet man die SSH-Session, endet oft auch dieser Prozess — für Dauerbetrieb **systemd** (oder tmux/pm2).

---

## 8. systemd-Dienst `battlefleet`

### Neueste Version auf den Server (Kurzfassung)

Voraussetzung: Repo liegt auf dem Server (z. B. `/opt/BattleFleet-Arena`), Dienst `battlefleet` ist eingerichtet.

| Schritt | Aktion |
|--------|--------|
| 1 | Per SSH einloggen: `ssh root@<VPS-IPv4>` |
| 2 | Ins Projekt: `cd /opt/BattleFleet-Arena` |
| 3 | Code + Abhängigkeiten: `git pull` → `npm ci` → `npm run build -w server` |
| 4 | Dienst neu starten: `systemctl restart battlefleet` → optional `systemctl status battlefleet --no-pager` |

**Einzeiler auf dem Server** (nach SSH-Login):

```bash
cd /opt/BattleFleet-Arena && git pull && npm ci && npm run build -w server && systemctl restart battlefleet && systemctl status battlefleet --no-pager
```

**Einzeiler von Windows (PowerShell)** — IP und Pfad anpassen:

```powershell
ssh root@<VPS-IPv4> "cd /opt/BattleFleet-Arena && git pull && npm ci && npm run build -w server && systemctl restart battlefleet && systemctl status battlefleet --no-pager"
```

Ausführlichere Schritte und eine Variante mit PowerShell-Variablen (`$ServerIP`, `$RepoPath`): siehe **„Nach Code-Updates auf dem Server“** und **Abschnitt 8.4** unten.

### 8.1 `npm`-Pfad

```bash
which npm
```

Typisch: `/usr/bin/npm` — in `ExecStart` verwenden.

### 8.2 Unit-Datei

```bash
nano /etc/systemd/system/battlefleet.service
```

Inhalt ( **`WorkingDirectory`** und **`ExecStart`** an echte Pfade anpassen):

```ini
[Unit]
Description=BattleFleet Colyseus Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/BattleFleet-Arena
Environment=NODE_ENV=production
Environment=PORT=2567
Environment=LISTEN_HOST=127.0.0.1
EnvironmentFile=/etc/battlefleet.env
ExecStart=/usr/bin/npm run start -w server
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 8.3 Aktivieren und starten

Vorher `/etc/battlefleet.env` mit den Werten aus Abschnitt 10.1 anlegen.
`LISTEN_HOST=127.0.0.1` setzt Nginx oder einen SSH-Tunnel voraus; ein direkter
öffentlicher Port ist damit bewusst nicht erreichbar.

```bash
systemctl daemon-reload
systemctl enable battlefleet
systemctl start battlefleet
systemctl status battlefleet
```

**Logs:**

```bash
journalctl -u battlefleet -n 80 --no-pager
journalctl -u battlefleet -f
```

**Nach Code-Updates auf dem Server** (gleiche Logik wie Kurzfassung, zeilenweise):

```bash
cd /opt/BattleFleet-Arena
git pull
npm ci
npm run build -w server
systemctl restart battlefleet
systemctl status battlefleet --no-pager
```

### 8.4 Von Windows (PowerShell) in einem Rutsch

Pfade/IP anpassen (`ServerIP`, `RepoPath`):

```powershell
$ServerIP = "DEINE_VPS_IPV4"
$RepoPath = "/opt/BattleFleet-Arena"

ssh root@$ServerIP @"
set -e
cd $RepoPath
git pull
npm ci
npm run build -w server
systemctl restart battlefleet
systemctl status battlefleet --no-pager
"@
```

---

## 9. Server-Konfiguration (Code)

- **Port:** `server/src/index.ts` — `PORT` aus Umgebung oder Standard **2567**.
- **Bind:** `LISTEN_HOST` optional; Standard **`0.0.0.0`** (alle IPv4-Interfaces), damit die öffentliche IP erreichbar ist.
- **Origins:** `BFA_ALLOWED_ORIGINS` muss die tatsächlichen Client-Origins enthalten
  (z. B. `https://deinname.github.io`, ohne Repository-Pfad). Die Prüfung umfasst
  Express, Colyseus-Matchmaking und WebSocket-Upgrades. Produktion erlaubt ohne
  Konfiguration keine Browser-Origin; CLI-Clients ohne Origin bleiben möglich.

---

## 10. Lokales Admin-Panel

Der Server stellt ein kleines Admin-Panel unter **`/admin`** bereit. Es ist für lokale Administration gedacht und sollte nicht öffentlich im Internet freigegeben werden.

### 10.1 Zugriffsschutz

**Jeder Admin-API-Aufruf verlangt ein gültiges `BFA_ADMIN_TOKEN`**, auch vom
Server selbst und über SSH-Tunnel. `127.0.0.1`, `::1` und Forwarded-Header sind
keine Authentifizierung. Ohne Token bleibt die Admin-API deaktiviert (503).
Ungültige/fehlende Zugangsdaten ergeben 401, fremde Admin-Origins 403.
Nur die statische Anmeldemaske unter `/admin` ist ohne Token abrufbar; sie enthält
keine Laufzeitdaten. Die API akzeptiert `Authorization: Bearer ...` oder `x-admin-token`.

Auf dem VPS ein zufälliges Token erzeugen, z. B. mit `openssl rand -hex 32`.
Dieses Geheimnis nicht in Chat, Git, Client-Konfiguration oder URLs kopieren.
Mit `sudo install -m 600 /dev/null /etc/battlefleet.env` **nur bei Ersteinrichtung**
die Datei anlegen (eine vorhandene Datei nicht überschreiben), dann mit
`sudoedit /etc/battlefleet.env` befüllen:

```ini
BFA_ADMIN_TOKEN=<hier-das-zufaellige-64-stellige-Hex-Token>
BFA_ALLOWED_ORIGINS=https://deinname.github.io
```

Platzhalter ersetzen; die Origin enthält keinen Pfad oder abschließenden Slash.
Mehrere Origins werden durch Kommas getrennt. Die Allowlist ist für Spielclients,
nicht für das Admin-Panel: dessen Browser-API bleibt auf dieselbe Origin beschränkt.
Das Token muss 32–256 druckbare ASCII-Zeichen ohne Leerzeichen enthalten; ein
zu kurzes/ungültiges konfiguriertes Token verhindert den Serverstart.
Die Datei wird über `EnvironmentFile` in Abschnitt 8 eingebunden. Anschließend
`systemctl daemon-reload` und `systemctl restart battlefleet` ausführen.
Zum Widerrufen/Rotieren Token ersetzen und neu starten; ohne Token bleibt das Spiel
nutzbar, aber alle Admin-APIs sind gesperrt.

Empfohlen für den VPS ist der SSH-Tunnel. In **Windows PowerShell**:

```powershell
ssh -L 8080:127.0.0.1:2567 root@<VPS-IPv4>
```

Danach lokal im Browser öffnen:

```text
http://127.0.0.1:8080/admin
```

Im Panel das Token eingeben und **Connect** wählen. Es wird nur im Speicher des
Tabs gehalten, nicht in Cookies, Local-/SessionStorage oder URLs. **Disconnect**
oder Neuladen entfernt es. Außerhalb eines lokalen SSH-Tunnels ausschließlich
HTTPS verwenden. Der Tunnel ersetzt die Token-Anmeldung nicht.

Falls ein bestimmter SSH-Key nötig ist:

```powershell
ssh -i C:\Users\Kleme\.ssh\id_ed25519 -L 8080:127.0.0.1:2567 root@<VPS-IPv4>
```

Wichtig: Den Tunnel-Befehl auf dem **Windows-PC** ausführen, nicht in der bereits geöffneten SSH-Session auf dem Server.

### 10.2 Funktionen

Das Panel zeigt Server-Status, aktive Rooms, Leaderboard und Runtime-Konfiguration. Aktuell steuerbar:

- **Match duration:** Dauer neuer oder neu gestarteter Runden in Sekunden.
- **Bot fill target players:** Zielgröße aus Menschen + Server-Bots; Bots füllen nur auf, wenn mindestens ein Mensch im Raum ist.
- **Maintenance mode:** Blockiert neue Joins, bestehende Runden laufen weiter.
- **Map half extent:** Größe des Einsatzgebiets; `0` bedeutet automatische Größe nach Teilnehmerzahl.
- **Passive XP interval / base:** Takt und Menge passiver XP-Vergabe.
- **Sea Control XP multiplier:** Multiplikator für passive XP in der Sea-Control-Zone.
- **Respawn delay:** Wartezeit nach Zerstörung.
- **Spawn protection:** Schutzzeit nach Spawn/Respawn.
- **SAM cooldown:** Globaler SAM-Takt pro Verteidiger.
- **Out-of-bounds destroy timer:** Zeit außerhalb des Einsatzgebiets bis zur Zerstörung.
- **Restart active rounds:** Setzt alle aktiven Rooms sofort neu auf. Die unterbrochene Runde wird nicht in die Bestenliste geschrieben.
- **Reset leaderboard:** Löscht die persistierte Bestenliste nach Bestätigung.

### 10.3 Persistenz

Admin-Werte werden unter `server-data/admin-config.json` gespeichert. Die Bestenliste liegt unter `server-data/leaderboard.json`.

Diese Dateien sind **Laufzeitdaten** und sollten normalerweise nicht mitcommitted werden. Auf dem VPS bleiben sie bei `git pull`, `npm ci`, Build und `systemctl restart battlefleet` erhalten.

### 10.4 API-Beispiele

Token aus einer bereits sicher gesetzten lokalen Umgebungsvariable übernehmen
(nicht als Klartextbefehl in der Shell-Historie eingeben). Diese Beispiele greifen
nur über den zuvor geöffneten SSH-Tunnel zu:

```powershell
$adminHeaders = @{ Authorization = "Bearer $env:BFA_ADMIN_TOKEN" }
```

Status:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/admin/status -Headers $adminHeaders
```

Konfiguration setzen:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/admin/config `
  -Headers $adminHeaders `
  -Method Patch `
  -ContentType "application/json" `
  -Body '{"matchDurationSec":300,"minRoomPlayers":6,"maintenanceMode":false}'
```

Aktive Runden neu starten:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/admin/round/restart `
  -Headers $adminHeaders `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"confirm":"RESTART"}'
```

Leaderboard löschen:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/admin/leaderboard/reset `
  -Headers $adminHeaders `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"confirm":"RESET"}'
```

---

## 11. Lokal gegen den VPS spielen (Entwicklung)

Auf dem **Windows-PC** im Repo-Root (PowerShell), **`DEINE_HETZNER_IP`** ersetzen:

```powershell
cd C:\Users\Kleme\AI-Projects\BattleFleet-Arena
$env:VITE_COLYSEUS_URL = "http://DEINE_HETZNER_IP:2567"
npm run dev -w client
```

Browser: meist `http://localhost:5173` — der Client spricht Colyseus unter der gesetzten URL an.

---

## 12. Technische Repo-Änderung (Shared + Node)

**Problem:** `shared/package.json` exportierte zuvor direkt `./src/index.ts`. **Node** kann diese ESM-Imports (ohne `.js`-Endungen) nicht zuverlässig ausführen.

**Lösung (in Git auf `main`):**

- `shared`: Build mit **esbuild** → `dist/index.js`, Abhängigkeit `@colyseus/schema` extern.
- `exports` in `shared/package.json`: Bedingung **`node`** → `./dist/index.js`, **`default`** → `./src/index.ts` (Vite nutzt Weiterleitung auf Quellen/Alias).
- `prepare` in `shared`: nach `npm ci` / `npm install` wird `shared` gebaut.
- Root-`build`: zuerst **`shared`**, dann **`server`**, dann **`client`**.

---

## 13. HTTPS / WSS (Produktion: Nginx + Let’s Encrypt)

Für Clients unter **HTTPS** (z. B. GitHub Pages) muss das Backend unter **`https://`** erreichbar sein, sonst blockieren Browser oft **Mixed Content** (`http://`-API von `https://`-Seite).

**Kurzablauf:**

1. **DNS:** Subdomain (z. B. `battlefleet-api.example.com`) als **A-Record** auf die **VPS-IPv4**.
2. **Firewall:** **22**, **80**, **443** inbound; **2567** nur noch intern, wenn Nginx auf `127.0.0.1:2567` proxyt.
3. **Nginx:** `server_name` = deine Subdomain; `location /` → `proxy_pass http://127.0.0.1:2567;` inkl. WebSocket-Header (`Upgrade`, `Connection`). Admin-Pfade gemäß folgender Konfiguration sperren; `Host` weitergeben.
4. **Certbot:** `certbot --nginx -d battlefleet-api.example.com`
5. **Client-Build / GitHub Variable:** `VITE_COLYSEUS_URL=https://battlefleet-api.example.com` (ohne `:2567`, wenn alles über 443 läuft).

Im öffentlichen Nginx-`server`-Block Admin-Pfade vollständig sperren, einschließlich
Groß-/Kleinschreibungsvarianten (Express routet standardmäßig case-insensitiv):

```nginx
location ~* ^/(admin|api/admin)(/|$) { return 404; }

location / {
    proxy_pass http://127.0.0.1:2567;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Kein zusätzliches `location ^~ /` verwenden, das die Admin-Sperre übergeht.
Mit `nginx -t` prüfen und Nginx neu laden. Der SSH-Tunnel verbindet sich direkt
mit dem Backend und bleibt nutzbar. Token-Prüfung bleibt auch bei fehlerhafter
Proxy-Konfiguration zwingend; Forwarded-Header werden dafür nicht vertraut.

Smoke-Test auf dem Server:

```bash
curl -I https://battlefleet-api.example.com
```

*(Antwort kann u. a. `404` von Express sein — wichtig ist, dass **HTTPS** und **nginx** sichtbar sind.)*

Siehe auch [GITHUB-PAGES.md](./GITHUB-PAGES.md) für den statischen Client.

---

## 14. Kurz-Checkliste

- [ ] Hetzner: Ubuntu; Firewall **22**; bei direktem Colyseus zusätzlich **2567**, bei Nginx/TLS **80** + **443**
- [ ] Node LTS, Git, Repo unter z. B. `/opt/BattleFleet-Arena`
- [ ] `npm ci`, `npm run build -w server` (oder volles `npm run build`)
- [ ] `battlefleet.service` mit korrektem `WorkingDirectory` und `ExecStart` (`which npm`)
- [ ] `systemctl enable --now battlefleet` bzw. `start` + `status`
- [ ] **Lokal testen:** `VITE_COLYSEUS_URL=http://<VPS-IPv4>:2567`
- [ ] **Produktion (HTTPS-Frontend):** `VITE_COLYSEUS_URL=https://<api-subdomain>` nach Nginx/Let’s Encrypt

---

*Stand: inkl. Nginx/TLS und Remote-Update; konkrete Domain/IP beim Projekt eintragen.*
