# Dependency maintenance

Stand: 26. September 2026.

## Kompatible Bereinigung

- Ungenutztes `colyseus`-Metapaket entfernt; Core, Schema und WS-Transport bleiben
  explizite Abhängigkeiten. Auth-/Redis-/OAuth-Pakete des Metapakets entfallen.
- Lockfile-Updates innerhalb der vorhandenen Versionsbereiche, insbesondere
  `ws` 7.5.13 / 8.22.0, Express 4.22.3, body-parser 1.20.8, qs 6.16.0,
  Vite 6.4.3 und tsx 4.23.15 (esbuild 0.28.2).
- Kein `npm audit fix --force`, kein Colyseus-Protokoll-/Schema-Versionswechsel
  und keine Major-Overrides transitiver Abhängigkeiten.

## Verbleibender Sicherheitsbefund

`npm audit --omit=dev` meldet weiterhin drei betroffene Pakete (1 high, 2 moderate):
`nanoid` 2.1.11 unter `@colyseus/core` 0.15.57 sowie dessen abhängige Pakete Core
und WS-Transport. Das ist eine verbleibende Dependency-Kette, nicht drei voneinander
unabhängige Schwachstellen. npm schlägt hierfür einen brechenden Wechsel auf
Colyseus 0.18 vor. Dieser bleibt eine separate, mit Client-/Server-/Schema-
Kompatibilitätstests abzusichernde Migration.

Die advisories betreffen u. a. ungültige Generatorgrößen:
[negative Größen](https://github.com/advisories/GHSA-28wg-ghj8-5hjv),
[Größe null](https://github.com/advisories/GHSA-2v37-7h3g-55p8),
[Integer-Overflow](https://github.com/advisories/GHSA-xwg4-73v4-xw9w).
Der geprüfte Core-Code verwendet `generateId(length = 9)`; dies ist keine pauschale
Entwarnung für die verwundbare Paketversion. Nicht als behoben behandeln oder
durch Audit-Unterdrückung verstecken.

Vor weiteren Releases `npm audit` und `npm audit --omit=dev` erneut ausführen.
Ein erfolgreicher Build ersetzt keinen Sicherheitscheck. Der bereits bekannte
Admin-/Reverse-Proxy-Zugriff (Review-Punkt 7) wird nicht durch Dependency-Updates
behoben. Inzwischen verlangt der Code ein Admin-Token unabhängig vom Proxy;
vor Deployment müssen Token, Origin-Allowlist und Nginx-Sperren gemäß
`HETZNER-SERVER-SETUP.md` auf dem Zielsystem eingerichtet und geprüft werden.
