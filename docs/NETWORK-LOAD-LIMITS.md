# Netzwerk- und Lastgrenzen

## Client

Eingaben werden höchstens alle 50 ms gesendet (maximal 20 Hz), unabhängig von
60/120/144/240 Render-FPS. Bei 30 FPS entstehen höchstens 15 Sendungen/s; es gibt
keine zusätzlichen Timer und keine Nachhol-Bursts. Unveränderte Befehle ohne Feuer
behalten den 1200-ms-Heartbeat. Rendering, Kamera und HUD bleiben unabhängig.

Innerhalb eines Sendeintervalls gelten die neuesten Steuer-/Zielwerte. Kurze
Feuer-Taps werden pro Waffentyp bis zur nächsten Sendung vorgemerkt; mehrfaches
Drücken derselben Waffe innerhalb der 50 ms wird zu einem Befehl zusammengefasst.
Für ASuM gilt die zuletzt gedrückte Feuerseite. Tod, Matchende und Verlust des
lokalen Spielers/Visuals löschen vorgemerkte Befehle; nach langer Tab-Pause wird
kein veralteter Feuer-Tap nachgeholt. Eine zusätzliche Verzögerung bis zum nächsten
50-ms-Sendetermin ist beabsichtigt. Serverseitige Cooldowns bleiben unverändert.

## Server

Alle Zeitbudgets verwenden die monotone Serveruhr, niemals Client-Zeitstempel.
Ein Token-Bucket erlaubt kurze Netzwerk-Bursts, begrenzt aber die Dauerrate.

| Grenze | Rate / Burst / Verhalten |
| --- | --- |
| Input pro verbundenem Client | 30/s, Burst 12; Überschuss vor Simulation/Publikation verwerfen |
| Input im Prozess | Raumlimit × 16 × 30/s, Burst Raumlimit × 16 × 12 |
| Ping/Debug/Play-again zusammen pro Client | 2/s, Burst 4 |
| Play-again pro Raum | 1 je 5 Sekunden, Burst 1; Admin-Neustart bleibt unabhängig |
| WebSocket vor Colyseus-Decodierung | 60 Nachrichten/s, Burst 120 je Verbindung; Überschreitung trennt Verbindung |
| WebSocket im Prozess | Verbindungsmaximum × 60/s, Burst Verbindungsmaximum × 120 |
| WebSocket-Nachricht | 4096 Bytes; Kompression aus |
| Öffentliche HTTP-Anfragen + Matchmaking + WS-Upgrades | 60/s, Burst 120 im Prozess; 10/s, Burst 40 je Socket-Peer |
| Matchmaking-JSON | 4096 Bytes, auch chunked; maximal 5 Sekunden zum Einlesen |
| Räume | `BFA_MAX_ROOMS`, Standard 4, erlaubt 1–64; beim Start validiert |
| WS-Verbindungen | Raumlimit × 16, einschließlich noch nicht bestätigter Verbindungen |
| TCP-Verbindungen | WS-Maximum + 128; Header-/Request-Timeout 10 s, Keep-alive 5 s |

Das Raumlimit wird synchron vor Simulations-/Bot-Start reserviert und beim
Dispose wieder freigegeben. Fehlgeschlagene Raumstarts räumen auch die bereits
vom Colyseus-Konstruktor angelegten Timer auf. Vorhandene Räume können am Limit
weiter beigetreten werden, sofern sie freie Plätze haben. Client-Limits sind an
das tatsächliche Verbindungsobjekt gebunden, nicht nur an eine angegebene ID.

HTTP-Überlast liefert 429 mit `Retry-After: 1`. Raumkapazität bleibt kompatibel
zum Colyseus-Protokoll: HTTP 200 mit Matchmaking-Fehlercode 503. Zu große Bodies
liefern 413, ungültiges JSON 400, Lese-Timeouts 408. Admin-Routen behalten ihre
separate Token-Authentisierung und 16-KiB-Body-Grenze; sie werden nicht durch den
öffentlichen HTTP-Bucket gesperrt. Die gemeinsame TCP-Kapazität gilt weiterhin.

## Sicherheits- und Betriebsgrenzen

IP-Budgets verwenden standardmäßig `socket.remoteAddress`. Für den vorhandenen
lokalen Nginx muss beim nächsten VPS-Deployment in `/etc/battlefleet.env`
`BFA_TRUST_LOOPBACK_PROXY=1` gesetzt werden. Voraussetzung: Node bleibt auf
`LISTEN_HOST=127.0.0.1` und Nginx überschreibt den Header ausdrücklich mit
`proxy_set_header X-Real-IP $remote_addr;` (nicht aus einem Client-Header).
Nur bei aktivierter Option und einem Loopback-Socket-Peer wird eine gültige
einzelne IP aus `X-Real-IP` verwendet. Andere Peers, ungültige/mehrfache Header
und der Standard ohne Option verwenden weiterhin die Socket-Adresse.
`X-Forwarded-For` bleibt unvertraut. Kein pauschales `trust proxy` aktivieren.
Die globale Prozessgrenze bleibt auch im Proxy-Modus bestehen.
Die Peer-Tabelle hält höchstens 4096 Einträge; nach 60 Sekunden Inaktivität werden
Einträge freigegeben. Bei voller Tabelle werden neue Peers abgewiesen.

Beendete Räume werden sofort für Beitritte gesperrt, führen keine weiteren
Simulationsschritte aus und schließen spätestens nach 30 Sekunden ihre Clients
(Close-Code 4001). Dadurch werden auch unbeaufsichtigte Ergebnisbildschirme
freigegeben. Ein expliziter Rundenneustart löscht den alten Ablauf-Timer.
Der Client erklärt den Rückweg in die Lobby. Fehlgeschlagene Beitritte behalten
die App und den Namen; erneute Versuche erfolgen nur per Knopf nach 2/4/8 Sekunden
Wartezeit (maximal 8), nie in einer automatischen Schleife.

Grenzen gelten **pro Node-Prozess**, nicht clusterweit. Vier Räume/64 Clients sind
eine Sicherheitsobergrenze, keine Leistungszusage. Die bestehenden Bot-/Spieler-
Limits bleiben zusätzlich aktiv. Diese Maßnahmen ersetzen weder einen Reverse
Proxy mit Verbindungs-/Header-Limits noch DDoS-Schutz oder Messungen auf Zielhardware.

Regressionen: `frameInput.test.ts`, Frame-/Replay-Tests, `loadLimits.test.ts`,
`loadBoundaries.test.ts`, `BattleRoom.limits.test.ts` sowie die vorhandenen
Origin-/Admin-/Raumtests. Der Replay hat jetzt 660 statt 1980 Input-Ausgaben in
2100 Frames; HUD-, Todes-, Partikel- und Ressourcen-Referenzen bleiben unverändert.
