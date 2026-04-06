# GitHub Pages: Client deployen

Der Workflow [.github/workflows/deploy-github-pages.yml](../.github/workflows/deploy-github-pages.yml) baut bei jedem Push auf `main` den **Vite-Client** und veröffentlicht `client/dist` als GitHub Pages.

## Einmalig im GitHub-Repo

1. **Pages aktivieren:** *Settings → Pages → Build and deployment*  
   - **Source:** **GitHub Actions** (nicht „Deploy from branch“).

2. **Backend-URL als Variable:** *Settings → Secrets and variables → Actions* → Tab **Variables** → **New repository variable**  
   - Name: `VITE_COLYSEUS_URL`  
   - Wert: öffentliche URL deines Colyseus-Servers, z. B. `https://spiel.example.com` (ohne Slash am Ende ist ok).

3. **Pfad `VITE_BASE_PATH`:** Im Workflow ist `VITE_BASE_PATH: /BattleFleet-Arena/` gesetzt (Projekt-URL `https://<user>.github.io/BattleFleet-Arena/`). Wenn du das Repository umbenennst oder die angezeigte Pages-URL anders ist, Workflow und ggf. diesen Wert anpassen.

## Nach dem ersten erfolgreichen Run

- Unter **Actions** und **Pages** siehst du die **öffentliche URL**.
- Client im Browser öffnen und in den DevTools auf **Mixed Content** / **WebSocket (wss)** achten.

## HTTPS / Mixed Content

GitHub Pages liefert den Client über **HTTPS**. Verbindungen zu einem reinen **`http://`-Backend** können im Browser blockiert werden. Für ein spielbares Setup sollte das Backend über **HTTPS** (und passendes **wss**) erreichbar sein — z. B. Nginx + Let’s Encrypt auf dem VPS (siehe [HETZNER-SERVER-SETUP.md](./HETZNER-SERVER-SETUP.md), Abschnitt HTTPS).

## Lokal mit gleichem Base wie Pages testen

```powershell
cd <repo-root>
$env:VITE_BASE_PATH = "/BattleFleet-Arena/"
$env:VITE_COLYSEUS_URL = "http://127.0.0.1:2567"
npm run build -w client
npm run preview -w client
```

`preview` zeigt die URL; unter Windows ggf. `/BattleFleet-Arena/` in der angezeigten Adresse mitdenken (wie Vite preview den Base handhabt).
