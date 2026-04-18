# BattleFleet Arena — Ship-Model-Modul (3D / glTF)

Stand: April 2026  
Ziel: **Eine** klare Pipeline für Rumpf- und Mount-GLBs, minimale Umrechnung im Code, reproduzierbare Blender-Arbeit.

---

## 1. Rolle im Spiel

| Begriff | Bedeutung |
|--------|-----------|
| **Rumpf-GLB** | Ein pro Schiffsklasse/Variante (`hullGltfId`) — wird geladen, gecacht, pro Spieler **geklont**. |
| **Mount-GLB** | Kleine eigene Dateien (Geschütz, CIWS, SAM, …) — werden an **Sockets** aus dem **JSON-Profil** montiert, nicht über Objektnamen im Rumpf. |
| **Profil** | `ShipHullVisualProfile` in `shared` (JSON unter `shared/src/data/ships/`) — definiert **Sockets**, **Hitbox**, **Loadout-IDs**, `hullGltfId`. |

Der Client **liest zur Laufzeit** benannte Hilfsknoten **`SOCKET_<slot_id>`** und **`RAIL_<launcher_id>`** aus dem **Rumpf-GLB** (Position/Orientierung relativ zum Rumpf-Root) und **überschreibt** damit die JSON-`socket`-Werte **nur für die Darstellung** der Mount- und SSM-Visuals. **Server und Artillerie-Spawn** nutzen weiterhin ausschließlich die Daten aus `getAuthoritativeShipHullProfile` (`mountSockets/*.json` + Profil) — dort müssen die Werte mit dem Modell übereinstimmen, sonst weichen Mündung/Gameplay und Optik auseinander.

**Mount-Positionen (Transform):** in **`shared/src/data/ships/mountSockets/<profileId>.json`** (Schlüssel = `mountSlots[].id`, Wert = `ShipSocketTransform`). Das **Profil-JSON** enthält **Feuersektoren**, `compatibleKinds`, `defaultLoadout`, aber **keine** Socket-Zahlen. Beim Bundling merged `shipProfiles.ts` Registry + Profil zu einem vollständigen `ShipHullVisualProfile` (Server und Client sehen weiterhin fertige Koordinaten). Ausnahme: ein Slot kann bei Bedarf ein **`socket` im Profil** setzen und überschreibt dann die Registry (siehe `resolveMountSlotsWithSocketRegistry`).

Empties `SOCKET_<slot_id>` im Blender-Modell sind die **Autoren-Quelle**; ins `mountSockets/*.json` kommt ihr per Hand, Tabellenexport oder (später) kleinem glTF-Extrakt-Skript — nicht zur Laufzeit aus dem GLB.

### 1.1 Goldene Regeln (verbindlich für neue / neu exportierte Rümpfe)

1. **Blender / glTF-Export:** **+Y oben**, **1 Einheit = 1 m**, **Bug = +Z** — **dieselbe** Konvention wie Profil- und `mountSockets`-Daten (§2.1). Die Engine **dreht den Rumpf nicht** mehr per Yaw; Ausrichtung im GLB = Ausrichtung im Spiel.
2. **JSON / Gameplay:** Hitbox und **SSM-Schienen** im Profil; **Mount-Sockets** in `mountSockets/<profileId>.json` — alles **+Z Bug, +X Steuerbord, +Y oben** (§2.1); Zahlen müssen zu den Meshes nach `prepare` passen.
3. **Mount-Referenz im Modell:** Pro `mountSlots[].id` ein Empty **`SOCKET_<slot_id>`** (exakt gleiche ID wie im JSON, z. B. `SOCKET_main_fwd`). Lage und Rotation dort pflegen, dann **in das Profil übernehmen** (manuell, Tabellen-Export aus Blender, oder später: kleines Tool, das glTF-Knoten einliest).
4. **Mount-GLBs** (Waffensysteme): Lokal **+Z = Rohr/Front**, **+Y oben** (§4.2).

Wer die Rümpfe neu exportiert, hält sich an 1–3 — dann entfällt das Raten bei Vorzeichen und die Mount-Pipeline bleibt konsistent mit `shipGltfHull.ts` / `attachMountVisualsToHullModel`.

---

## 2. Koordinatensysteme (einmal festziehen)

### 2.1 Spiel- / Profil-Koordinaten (Daten in JSON)

Einheitlich in `shared` (`shipVisualLayout.ts`):

- **+Y** = oben  
- **+Z** = **Bug** (vorwärts)  
- **+X** = **Steuerbord** (rechts vom Bug aus)  
- **−X** = Backbord  

Yaw positiv = von oben gegen den Uhrzeigersinn um **+Y** (rechtsdrehend), wenn **+Z** vorn ist.

**Sockets** und **Hitbox** in den JSON-Profilen sind in **diesem** System angegeben (Meter, **vor** `hullScale` auf der Schiffsgruppe; Mounts siehe unten).

### 2.2 glTF-GLB und Engine-`prepare` (Rumpf)

Der Loader (`client/src/game/scene/shipGltfHull.ts`) erwartet den Rumpf **bereits** im **Spiel-/Profil-System**:

- **+Y** oben  
- **+Z** = Bug (vorwärts), **+X** = Steuerbord  

`prepareShipGltfInstance` setzt **keine** Zusatz-Yaw-Rotation mehr — nur **Skalierung** auf Referenzlänge und **Y-Verschiebung** (Unterkante Bounding-Box).

**Für Blender/Export:** Modell und Hilfs-Empties `SOCKET_*` in **dieser** Orientierung ausrichten; Werte 1:1 nach `mountSockets/<profileId>.json` übernehmen.

### 2.3 Nach dem `prepare` (Rumpf im Spiel)

Auf dem geklonten Rumpf:

- **Skalierung** auf eine **Referenz-Länge** (horizontale Ausdehnung in XZ → Abgleich mit `SHIP_BOW_Z - SHIP_STERN_Z` in `createGameScene.ts`, Faktor `SHIP_GLTF_EXTRA_SCALE` in `shipGltfHull.ts`).  
- **Y-Position** so, dass die **untere Bounding-Box** auf einer konsistenten Höhe sitzt (Wasserlinie wird bei Bedarf per Debug-Tuning nachjustiert).

**Wichtig:** `mountSockets` und Hilfs-Empties in Blender nutzen **dieselbe** Konvention (+Z Bug); sonst passen Zahlen nicht zu Hitbox und Gameplay.

---

## 3. Rumpf-GLB — technische Anforderungen

### 3.1 Mesh-Struktur

| Objekt | Pflicht | Hinweis |
|--------|---------|---------|
| **Polygon-Meshes** für sichtbaren Rumpf | ja | `Mesh`, nur **sichtbare** Geometrie in die Bounding-Box einbeziehen (Hilfs-Meshes ausblenden oder nicht exportieren). |
| **NURBS / Surfaces** | — | Vor Export in Meshes konvertieren. |
| **Leere Objekte (Empties)** | optional | Nur für **Layout** in Blender; siehe Namenskonvention (Abschnitt 5). **Nicht** für die Engine-Laufzeit nötig. |
| **Armature / Skinned Mesh** | optional | Aktuell keine Animation im Ship-Renderer; einfache **statische** Meshes bevorzugt. |

### 3.2 Materialien

- **PBR** mit `MeshStandardMaterial` / `MeshPhysicalMaterial` (glTF exportiert das).  
- Der Client kann **Farbe, Metalness, Roughness, Emissive** für Zustände (z. B. beschädigt, Schild) **überschreiben** — siehe `shipVisual.ts` / `materialLibrary`.  
- Keine **benutzerdefinierten Shader** im GLB erwarten, die der Loader 1:1 braucht; Standard-glTF-Materialien sind am stabilsten.

### 3.3 Skalierung in Blender

- **Einheit 1 = 1 Meter** (empfohlen).  
- Die **absolute** Größe wird im Client **normalisiert**; trotzdem sinnvoll, Rumpf **realistisch** zu modellieren, damit JSON-Sockets und Hitbox konsistent bleiben.

### 3.4 Dateien und IDs

| `hullGltfId` (Profil) | Typische Datei (`client/public/…`) |
|------------------------|-------------------------------------|
| `fac` | `assets/ships/hull_fac.glb` |
| `destroyer` | `assets/ships/hull_destroyer.glb` |
| `cruiser` | `assets/ships/hull_cruiser.glb` |
| `s143a` | Fallback `assets/S143A.glb` |

Mapping: `client/src/game/runtime/hullGltfUrls.ts` (`HULL_GLTF_URL_BY_ID`).

---

## 4. Mount-GLBs (Waffen / Systeme)

### 4.1 Ein Mount = eine Datei

Jeder Mount-Typ ist ein **eigenes** GLB unter `client/public/assets/systems/`. Mapping: `client/src/game/runtime/mountGltfUrls.ts`.

| `visualId` (Profil / Loadout) | Datei (Beispiel) |
|--------------------------------|------------------|
| `visual_artillery` | `mount_artillery_turret.glb` |
| `visual_ciws` | `mount_ciws_rotating.glb` |
| `visual_sam` | `mount_sam_box.glb` |
| `visual_ssm` | `mount_ssm_canister.glb` (Fallback) |
| `visual_torpedo` | `mount_torpedo_launcher.glb` |

Neue Typen: **ID** in `MOUNT_VISUAL_GLB_BY_ID` + Datei + Profil-`defaultLoadout` / Slot-`defaultVisualId`.

### 4.2 Lokales Koordinatensystem am Mount

- **Drehbare Mounts** (Artillerie, CIWS, drehbarer SAM): Modell so, dass **Rohr / Lauf** in **Standard-Export** in **+Z** zeigt (Bug-Richtung des Mounts), **+Y** oben — dann passt `eulerRad` am Socket zur Schiffsachse.  
- **Symmetrische** Kästen (SAM): klare **Front** (+Z) markieren (Hilfs-Empty im Blender-Projekt, nicht zwingend exportieren).  
- Der Client **klont** das Template und setzt **Rotation** aus dem JSON (`socket.eulerRad` bzw. `launchYawRadFromBow` bei SSM).

### 4.3 Skalierung

- Mount-Templates werden **nicht** wie der Rumpf auf `SHIP_LENGTH` normiert; sie werden **mit** dem Rumpf skaliert (siehe `attachMountVisualsToHullModel` — inverses `hullModel.scale`, damit Waffen nicht doppelt mit `hullScale` mitgezogen werden).  
- Mount-Modelle in **ähnlicher** metrischer Größe wie die Slots halten (z. B. Geschütz ~passend zur Deckshöhe in den JSON-Profilen).

---

## 5. Blender — Namenskonventionen

Die Engine **parst keine Namen**. Die Konvention dient **Kollaboration** und **Übertragung** der Socket-Transforms in **`mountSockets/<profileId>.json`**.

### 5.1 Collections (empfohlen)

| Collection | Inhalt |
|------------|--------|
| `HULL` | Mesh-Objekte des Rumpfes |
| `MOUNTS_REF` | Referenz-Platzierungen (optional, nur Doku) |
| `HELPERS` | Empties für Sockets, nicht exportieren oder „Extras“ ausblenden |

### 5.2 Rumpf-Objekte (Meshes)

Präfix **`MESH_`**, dann Funktion, **englisch**, snake_case:

| Name | Bedeutung |
|------|-----------|
| `MESH_hull_main` | Hauptrumpf / Unterwasser |
| `MESH_hull_superstructure` | Aufbauten |
| `MESH_deck` | Deckflächen (falls getrennt) |
| `MESH_details` | kleine Aufbauten, Radar, etc. |

Submeshes nach Material: `MESH_hull_main_paint`, `MESH_hull_main_metal` — optional.

### 5.3 Hilfs-Empties für Sockets (nur Blender)

Damit **Slot-IDs** aus dem JSON (`mountSlots[].id`) in Blender wiederfindbar sind:

| Muster | Beispiel |
|--------|----------|
| `SOCKET_<slot_id>` | `SOCKET_main_fwd`, `SOCKET_ciws_fwd`, `SOCKET_sam_mid` |

**`slot_id`** muss **exakt** wie in `mountSlots[].id` und in `mountSockets/<profileId>.json` lauten. Position des Empties in **Profil-Koordinaten** (+Z Bug) ablesen und in die Registry eintragen.

**Empties im exportierten glTF:** Du kannst `SOCKET_*` als **leere Nodes** mitexportieren (z. B. zur Prüfung in drei.js-Debug oder für ein späteres `socket → JSON`-Skript). Der **laufende Client** montiert nach den **gemergten** Profildaten (`mountSockets` + Profil); die Registry ist die **kanonische** Transform-Quelle, synchron zu den Empties.

Für **fixedSeaSkimmerLaunchers**:

| Muster | Beispiel |
|--------|----------|
| `RAIL_<launcher_id>` | `RAIL_ssm_rail_port` |

### 5.4 Export-Filter

- **Nur** `MESH_*` (und ggf. benötigte Nodes) exportieren; oder Empties in einer nicht exportierten Collection lassen.  
- Keine Kamera/Licht aus dem Schiff-GLB exportieren (Szene im Spiel bringt Licht).

---

## 6. Checkliste vor dem Einchecken der GLBs

1. **Rumpf:** **+Y** oben, **Bug +Z** im GLB — keine Engine-Yaw-Korrektur.  
2. **Profil:** `hullGltfId` und Dateiname stimmen mit `hullGltfUrls.ts` überein.  
3. **Sockets:** `mountSockets/<profileId>.json` = **Meter**, **+Z Bug**, **+X Steuerbord**; nach erstem Ingame-Test `gltfHullYOffset` / `hullVisualScale` nur bei Bedarf.  
4. **Hitbox:** `collisionHitbox` in JSON zur groben Silhouette; optional Client-Debug für Drahtrahmen.  
5. **Material:** Standard-PBR; keine exotischen Shader, die Three.js nicht importiert.  
6. **Größe:** Mount-GLBs visuell zu den Slots; Rumpf-Länge wird clientseitig normalisiert — JSON-Sockets trotzdem **konsistent** zur Modellform halten.

---

## 7. Referenz (Code)

| Thema | Datei |
|-------|--------|
| Laden, Cache, Rotation, Skalierung, Klonen | `client/src/game/scene/shipGltfHull.ts` |
| Rumpf + Mounts zusammenbauen | `client/src/game/scene/shipVisual.ts`, `shipMountVisuals.ts` |
| URL-Mapping Rumpf / Mount | `hullGltfUrls.ts`, `mountGltfUrls.ts` |
| Profil-Typen + Koordinaten-Kommentar | `shared/src/shipVisualLayout.ts` |
| Referenz-Länge Schiff | `SHIP_BOW_Z`, `SHIP_STERN_Z` in `createGameScene.ts` |
| Platzhalter erzeugen | `npm run generate:placeholder-glb -w client` |

---

## 8. Kurzfassung für Artist:innen

1. **Rumpf:** Y-up, Bug **+Z** im Export, **Meter**, PBR-Meshes mit sauberen Namen `MESH_*`.  
2. **Daten:** Hitbox (und ggf. Schienen) im Profil-JSON; Mount-Transforms in **`mountSockets/<profileId>.json`**; Hilfs-Empties `SOCKET_<slot_id>` optional.  
3. **Mounts:** separate GLBs, Rohr/Front **+Z** lokal, IDs `visual_*` wie `mountGltfUrls.ts`.  
4. **Keine** Engine-Logik über Objektnamen — nur Daten + saubere GLBs.
