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
   - **TCP 2567** — Colyseus (für Tests oft `0.0.0.0/0`; später ggf. einschränken oder hinter Nginx/TLS).

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
ExecStart=/usr/bin/npm run start -w server
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 8.3 Aktivieren und starten

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

**Nach Code-Updates auf dem Server:**

```bash
cd /opt/BattleFleet-Arena
git pull
npm ci
npm run build -w server
systemctl restart battlefleet
```

---

## 9. Server-Konfiguration (Code)

- **Port:** `server/src/index.ts` — `PORT` aus Umgebung oder Standard **2567**.
- **Bind:** `LISTEN_HOST` optional; Standard **`0.0.0.0`** (alle IPv4-Interfaces), damit die öffentliche IP erreichbar ist.
- **CORS:** im Server für Colyseus/Express so gesetzt, dass Clients von anderen Origins verbinden können.

---

## 10. Lokal gegen den VPS spielen (Entwicklung)

Auf dem **Windows-PC** im Repo-Root (PowerShell), **`DEINE_HETZNER_IP`** ersetzen:

```powershell
cd C:\Users\Kleme\AI-Projects\BattleFleet-Arena
$env:VITE_COLYSEUS_URL = "http://DEINE_HETZNER_IP:2567"
npm run dev -w client
```

Browser: meist `http://localhost:5173` — der Client spricht Colyseus unter der gesetzten URL an.

---

## 11. Technische Repo-Änderung (Shared + Node)

**Problem:** `shared/package.json` exportierte zuvor direkt `./src/index.ts`. **Node** kann diese ESM-Imports (ohne `.js`-Endungen) nicht zuverlässig ausführen.

**Lösung (in Git auf `main`):**

- `shared`: Build mit **esbuild** → `dist/index.js`, Abhängigkeit `@colyseus/schema` extern.
- `exports` in `shared/package.json`: Bedingung **`node`** → `./dist/index.js`, **`default`** → `./src/index.ts` (Vite nutzt Weiterleitung auf Quellen/Alias).
- `prepare` in `shared`: nach `npm ci` / `npm install` wird `shared` gebaut.
- Root-`build`: zuerst **`shared`**, dann **`server`**, dann **`client`**.

---

## 12. Später: HTTPS / WSS

Wird das Frontend unter **https** ausgeliefert und das Backend nur unter **http**, können Browser WebSockets blockieren (**Mixed Content**). Dann sinnvoll:

- Eigene **Domain** auf die VPS-IP,
- **Nginx** als Reverse Proxy,
- **Let’s Encrypt** (TLS),
- Client mit **`https://…`** / **`wss://…`** konfigurieren.

---

## 13. Kurz-Checkliste

- [ ] Hetzner: Ubuntu, Firewall **22** + **2567**
- [ ] Node LTS, Git, Repo unter z. B. `/opt/BattleFleet-Arena`
- [ ] `npm ci`, `npm run build -w server` (oder volles `npm run build`)
- [ ] `battlefleet.service` mit korrektem `WorkingDirectory` und `ExecStart` (`which npm`)
- [ ] `systemctl enable --now battlefleet` bzw. `start` + `status`
- [ ] Client: `VITE_COLYSEUS_URL=http://<VPS-IPv4>:2567` zum Testen

---

*Stand: dokumentiert nach der gemeinsamen Einrichtung; Pfade und GitHub-User bei Bedarf anpassen.*
