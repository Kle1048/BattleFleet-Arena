# VPS-Deployment 27.09.2026

Aktiver Commit: `cf0291f0e34308003eff2f2900f30905dbdd37b3`.
Backend: `https://battlefleet-api.battleshipsandunicorns.com`.
Primäre Spieldomain: `https://coldwararena.seacontrol.net/`.
Zusätzlicher Client: `https://kle1048.github.io/BattleFleet-Arena/`.

## Aktueller Betrieb

- SSH: `root@157.90.113.121`; vorhandener lokaler Schlüssel
  `C:\Users\Kleme\.ssh\surpic_vps_ed25519_codex` (kein Schlüsselinhalt in Git).
- Dienst: `battlefleet.service`.
- Aktives Release: `/opt/battlefleet-releases/cf0291f` (aus Git-Archiv des Commits).
- Service-Override: `/etc/systemd/system/battlefleet.service.d/20-release.conf`.
- Persistente Daten: `/var/lib/battlefleet`, Verzeichnisrechte `0700`.
- Umgebung: `/etc/battlefleet.env`, Rechte `0600`, ausschließlich auf dem VPS.
  Enthält das dort neu erzeugte Admin-Token; niemals in Chat, Git oder URL kopieren.
- `LISTEN_HOST=127.0.0.1`, Port 2567; Spielzugriff über vorhandenes Nginx/TLS.
- `BFA_ALLOWED_ORIGINS=https://kle1048.github.io,https://coldwararena.seacontrol.net`.
- Nginx-Datei: `/etc/nginx/sites-available/battlefleet-api`.
  Case-insensitive Sperre für `/admin` und `/api/admin`, öffentlich HTTP 404.

**Wichtig:** `/opt/BattleFleet-Arena` bleibt als alter Checkout und Rückweg erhalten
(HEAD `52aaeb3`, `origin/main` auf neuem Commit). Ein `git pull` dort aktualisiert
nicht mehr den laufenden Dienst! Künftige Updates separat installieren/bauen,
Service-Override auf das geprüfte Release umstellen und neu starten. Den
persistenten Datenpfad unverändert lassen und vor Schemaänderungen sichern.
Keine Änderungen an anderen Anwendungen auf dem gemeinsamen VPS vorgenommen.

## Daten und Rückweg

Backup: `/opt/battlefleet-pre-cf0291f-vqCdnV5T`.
Enthält ursprüngliche Unit, Nginx-Konfiguration und vor Aktivierung bei gestopptem
Dienst kopierte `server-data`. Die Originaldaten unter
`/opt/BattleFleet-Arena/server/server-data` wurden nicht verändert.
Die neue Version migrierte eine separate Kopie nach `/var/lib/battlefleet`.
Alle 9 bestehenden Bestenlisteneinträge und alle bisherigen Einstellungswerte
wurden verglichen und erhalten; neuer Standard `islandsEnabled=false`.

Der erste Aktivierungsversuch wurde nach fehlgeschlagener unmittelbarer
Proxy-Abnahme automatisch zurückgerollt. Die Wiederholung mit begrenzter
Reload-Wartefrist bestand. Der Rückweg auf den alten Dienst wurde damit bereits
ausgeführt; für einen späteren Rollback müssen inzwischen hinzugekommene
Ergebnisse aus dem neuen Datenschema separat berücksichtigt werden.
Nicht blind ältere Daten über die produktiven Dateien kopieren.

## Admin-Zugang

Auf dem Windows-PC in PowerShell (Fenster offen lassen):

```powershell
ssh -i C:\Users\Kleme\.ssh\surpic_vps_ed25519_codex -N -L 127.0.0.1:8080:127.0.0.1:2567 root@157.90.113.121
```

Danach `http://127.0.0.1:8080/admin` öffnen und das `BFA_ADMIN_TOKEN` aus der
VPS-Datei `/etc/battlefleet.env` eingeben. Zum privaten Nachsehen eine eigene
SSH-Sitzung verwenden; den Dateiinhalt nicht in einen Chat posten.
Token bleibt nur im Speicher des Browser-Tabs. Der Tunnel ersetzt keine Anmeldung.

## Verifikation und Grenzen

- GitHub CI und Pages-Deployment für denselben Commit erfolgreich:
  [CI](https://github.com/Kle1048/BattleFleet-Arena/actions/runs/36333076501),
  [Pages](https://github.com/Kle1048/BattleFleet-Arena/actions/runs/36333076527).
- Auf VPS: `npm ci`, Prüfung aller 14 Modellmetadaten, 28 Server-Testdateien und
  Server-/Shared-Build erfolgreich.
- Migration zunächst auf Kopie geprüft; danach Datenvergleich beim Umschalten.
- Dienst aktiv ohne automatische Neustarts; Listener ausschließlich Loopback.
- Admin intern ohne Token 401, mit Token 200; externe Admin-Varianten 404.
- Fremde Spiel-Origin 403; erlaubte Pages-Origin und echter Browser-Spielbeitritt
  über HTTPS/WebSocket erfolgreich. Bots, Kampf und Respawn beobachtet;
  Browserkonsole ohne Warnungen/Fehler. Testverbindung danach geschlossen.
- Keine kritischen neuen Sicherheitsbefunde in geprüfter Deploy-Konfiguration.
  Produktions-Audit weiterhin **1 high / 2 moderate / 0 critical** in der
  bekannten `nanoid`/Colyseus-Kette; nicht behoben und nicht unterdrückt.
  Details: [Dependency Maintenance](DEPENDENCY-MAINTENANCE.md).
- Der Dienst läuft weiterhin unter dem bestehenden Benutzer `root`.
  Wechsel auf eigenen Service-Benutzer und Langzeittest bleiben separate Arbeiten.

Dieses Dokument ist ein lokales Deployment-Protokoll nach dem Release; es ist
nicht Teil des oben genannten ausgelieferten Commits.

## Nachprüfung: primäre Spieldomain

Beim ersten Deployment wurde nur GitHub Pages freigegeben und getestet. Die
tatsächlich verwendete Domain `https://coldwararena.seacontrol.net` fehlte:
ihr Matchmaking-Preflight wurde im Nginx-Log mit HTTP 403 abgewiesen. Nach
Bestätigung durch den Benutzer wurde genau diese Origin ergänzt und der Dienst
neu gestartet. Kein Wildcard-CORS, keine Änderung der Admin-Authentifizierung.
Konfigurationsbackup: `/opt/battlefleet-origin-backup-VJFuzOxI/battlefleet.env`
(enthält Geheimnis, nur auf dem VPS belassen).
Beide erlaubten Origins liefern 204 mit passendem Origin-/Credentials-Header;
fremde Origin weiterhin 403 und öffentliche Admin-API weiterhin 404.
Ein echter Browser-Spielbeitritt über die primäre Domain wurde anschließend
erfolgreich geprüft (laufende Runde, Bots und Kampfereignisse, keine
Konsolenwarnungen/-fehler); die Testverbindung wurde danach geschlossen.
