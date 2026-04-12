# BattleFleet Arena — Entwickler-Log

Automatische Kurz-Dokumentation pro **Git-Commit** (Metadaten + Vorschlag für einen Post zu **Vibejam** / KI-generierte bzw. KI-unterstützte Spiele).

## Einmalig: Hook aktivieren

Im Repository-Root:

```bash
git config core.hooksPath scripts/git-hooks
```

Danach wird bei jedem Commit (außer **Merge-Commits**) unten ein neuer Block angehängt. Manuell nachziehen:

```bash
npm run devlog:append
```

---

<!-- Neue Einträge erscheinen unter dieser Linie -->

## 2026-04-11 — `ab3fab3`

- **Autor:** Klemens1048
- **Commit:** feat(audio): Spiel-SFX mit WAV-Assets und Server-Anbindung

**Details:**

- Client: soundCatalog, gameAudio mit Preload und Synth-Fallbacks, Netzwerk-Callbacks in main und networkRuntime (u. a. Kollisionen, Waffentreffer, ASuM Lock-on, Luftverteidigung).
- Server: BattleRoom sendet passende Colyseus-Messages an betroffene Clients.
- Shared: collisionContactQueries mit Tests; Dokumentation in docs/SOUND-MODULE.md.
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> ⚓ feat(audio): Spiel-SFX mit WAV-Assets und Server-Anbindung — BattleFleet Arena nimmt Fahrt auf für #Vibejam: KI-unterstütztes Naval-RTS. Wer baut noch mit am Jam? #gamedev #AIgames

---

## 2026-04-12 — Gameplay: ASuM-Magazine, Progression, Schiffsklassen; Visuals: Umwelt & Wasser

- **Autor:** Klemens1048
- **Commit:** Gameplay: ASuM-Magazine, Progression, Schiffsklassen; Visuals: Umwelt & Wasser

**Details:**

- - ASuM: Magazin port/starboard, Schussabstand 1s, Magic Reload pro Rumpf (20/30/40s), Toast aswmMagazineReloaded
- - Progression: Tod nur -1 Level; Offiziersränge EN im HUD/Scoreboard/Toast; Level 5→Zerstörer, 7→Kreuzer (shipClassIdForProgressionLevel)
- - Lobby: nur Name, Server-FAC; Klassenwahl entfernt; shared shipMovement-Import fix
- - Schiffe: gleiches FAC-GLB für DD/CG mit hullVisualScale; Rumpf-Profile & Tests
- - Client: Environment (Sonne, Lighting, Foam), Reflection-Layers, Wake-Tuning, Wasser-Debug-Panel ersetzt
- - docs: Architektur, Visuals-Plan, Ship-Model, Dev-Log; scripts append-dev-log, post-commit hook
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> Shipped: Gameplay: ASuM-Magazine, Progression, Schiffsklassen; Visuals: Umwelt & Wasser 🚢 Wir hacken an einem AI-collab Wettkampfspiel — #Vibejam #indiedev

---

## 2026-04-12 — Snapshot: 3D hull GLBs, class visuals, tuning & perf (bad FPS)

- **Autor:** Klemens1048
- **Commit:** Snapshot: 3D hull GLBs, class visuals, tuning & perf (bad FPS)

**Details:**

- Includes hull profile cache, visual dirty checks, progression ship classes, feature-module inventory doc. Branch label: 3D Modells implemented bad FPS.
- Made-with: Cursor

### Vorschlag Twitter / X (#Vibejam)

> ⚓ Snapshot: 3D hull GLBs, class visuals, tuning & perf (bad FPS) — BattleFleet Arena nimmt Fahrt auf für #Vibejam: KI-unterstütztes Naval-RTS. Wer baut noch mit am Jam? #gamedev #AIgames

