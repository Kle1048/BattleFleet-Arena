# Beta Deployment vom 3 Oktober 2026

Commit `b1cc78422f0be8d8ec12d0baf8700b0c0d943eec` wurde nach `main`
gepusht und auf dem VPS aktiviert. Enthalten sind die Beta-Korrekturen,
Versionsdiagnose, private Feedbackpipeline und der Konfigurationsleitfaden.
Der bereits vorhandene lokale Ordner `output/` wurde nicht aufgenommen.

## Ausgelieferter Stand

- Spiel: `https://coldwararena.seacontrol.net/`, Vercel-Deployment erfolgreich.
- Zusätzlicher Client: GitHub Pages; Workflow erfolgreich.
- Backend: `https://battlefleet-api.battleshipsandunicorns.com`.
- Aktives Release: `/opt/battlefleet-releases/b1cc784`.
- Dienst: `battlefleet.service`; Listener ausschließlich `127.0.0.1:2567`.
- Daten unverändert unter `/var/lib/battlefleet`; Konfigurationsrevision 1.
- `BFA_TRUST_LOOPBACK_PROXY=1` im Service-Override gesetzt; Nginx überschreibt
  `X-Real-IP`. Beide bisherigen Spiel-Origins bleiben erlaubt.
- Bestehendes gelerntes Bot-Roster und dessen Reihenfolge unverändert.

Frontend und Backend melden denselben Git-Commit, aber getrennte
Build-Fingerprints: Vercel und Pages `c88a3cfdfab2…`, VPS `54d72995f91d…`.
Die Ursache wurde lesend nachgewiesen: Das unter Windows erzeugte Git-Archiv
enthält 528 Textdateien mit CRLF. Nach ausschließlich virtueller LF-Normalisierung
ergibt sich exakt der vollständige Frontend-Fingerprint
`c88a3cfdfab21521db73dc45b481a6be8c579fdd47e2d8ed4cfc6d18e9e411e0`.
Die VPS-Eingabedateien stimmen unverändert mit dem übertragenen Archiv überein;
es wurden keine produktiven Quellen zur Angleichung umgeschrieben.
Vercel meldet `dirty=true`, Pages `false`. Der Grund der Vercel-Checkout-Markierung
ist nicht bestimmt, beeinflusst hier aber nicht den übereinstimmenden
Frontend-Quellfingerprint. Der Vercel-Build verwendet weiterhin `npm install`;
Umstellung auf `npm ci` und normalisierte Fingerprints sind mögliche Nacharbeiten.
Der VPS-Build stammt aus dem Git-Archiv, mit explizit gesetzter
`BFA_BUILD_REVISION`; ohne `.git` bleibt der Clean-Status ehrlich unbekannt
(`unverified`).

## Laufzeit und Prüfungen

Die bisherige systemweite Node-Version 24.14.1 scheiterte am exakten
Partikel-Zustandsfingerprint. Derselbe Release bestand diesen Test unter
Node 22.23.3, passend zur Node-22-Linie der CI. Keine Effekt-Referenz geändert.
Nur BattleFleet nutzt nun
`/opt/battlefleet-runtimes/node22/node_modules/node/bin/node` direkt über
`ExecStart`; die systemweite Node-Version und andere Dienste blieben unverändert.

Auf dem VPS bestanden unter Node 22 alle 151 Testdateien, die Modellprüfung,
die strenge Kampf-Referenz und der Server-/Shared-Build. Die Typprüfung bestand
ebenfalls. GitHub-CI und Pages bestanden für denselben Commit:

- [CI](https://github.com/Kle1048/BattleFleet-Arena/actions/runs/37142121359)
- [Pages](https://github.com/Kle1048/BattleFleet-Arena/actions/runs/37142121361)

Extern geprüft: Versionsroute mit Spiel-Origin 200, fremde Origin 403,
`/admin`, `/api/admin/feedback` und Großschreibungsvariante der Admin-API 404.
Nginx-Konfiguration gültig. Ein echter Browserbeitritt auf der primären Domain
war erfolgreich; die Versionsvorschau zeigt beide Release-Kennungen und das
aktive Bot-Roster. Steuerung, Bot-Kampfereignisse, reguläres Rundenende nach
fünf Minuten, Continue mit erhaltenem Namen und erneuter Beitritt mit frischer
Fünf-Minuten-Runde wurden im Browser geprüft. Kein Langzeit-Leaderboard im
Rundenende-Dialog. Die Konsolenprüfung zeigte keine Warnungen/Fehler.
Die Testverbindung wurde danach geschlossen. Die regulär beendete Testrunde
kann den gekennzeichneten Spieler `ReleaseSmokeTest` in der Bestenliste
enthalten; produktive Bestenlistendaten wurden dafür nicht zurückgesetzt.

Die gekennzeichnete Meldung `Deployment smoke test b1cc784` wurde ohne
Diagnosedaten über das öffentliche Formular abgesendet, privat geprüft und
über die authentifizierte Admin-API auf `done` gesetzt. Sie bleibt als
technischer Abnahmenachweis in der Inbox, nicht als offenes Spielerproblem.

## Sicherung und Rückweg

Backup: `/opt/battlefleet-pre-b1cc784-B8yuh0TB` mit Modus 0700.
Enthält bisheriges Service-Override, beide ENV-Dateien, Nginx-Konfiguration
und eine bei gestopptem Dienst erstellte Kopie der persistenten Daten.
ENV-Dateien enthalten Geheimnisse und bleiben ausschließlich auf dem VPS.
Konfiguration und Bestenliste wurden direkt nach dem Start byteweise mit
dem Backup verglichen; alle neun bisherigen Bestenlisteneinträge blieben erhalten.

Für einen autorisierten Code-Rollback das gesicherte `20-release.conf` nach
`/etc/systemd/system/battlefleet.service.d/20-release.conf` zurückkopieren,
`systemctl daemon-reload` und `systemctl restart battlefleet` ausführen.
Das vorherige Release `/opt/battlefleet-releases/8827d80` bleibt erhalten.
Neuere Ergebnisse und Feedback nicht durch einen pauschalen Daten-Restore
überschreiben. Frontend-Rollback ist getrennt in Vercel/Pages vorzunehmen.

## Offene Grenzen

- Last-/Langzeittest weiterhin ausstehend; keine Kapazitätszusage.
- Produktions- und Gesamtaudit weiterhin 1 high / 2 moderate / 0 critical
  in der bekannten nanoid-/Colyseus-Kette. Nicht behoben oder unterdrückt.
- Dienst weiterhin unter dem bisherigen Benutzer root.
- Fachliche Beta-Abnahme und Spielbalance benötigen Spielerfeedback.
- Backup-Aufbewahrung und regelmäßige Feedback-Triage bleiben Betreiberaufgaben.

Dieses nachträgliche Deployment-Protokoll ist nicht Teil des ausgelieferten
Commits. Es enthält keine Zugangsdaten.
