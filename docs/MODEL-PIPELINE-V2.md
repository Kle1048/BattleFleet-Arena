# Modellpipeline V2 — verbindlicher Umbauplan

Status: umgesetzt und technisch abgenommen am 27.09.2026. Umfang: Punkte 1–6 des 3D-Reviews.
Ausgangsstand: Commit `6f019f0`. Keine implizite Freigabe für Commit/Push oder Deployment.

Aktueller Materialstandard: [kleine, saubere Farbtexturen](CLEAN-MODEL-MATERIALS.md).
Dieser Folgeauftrag ersetzt die historischen Weathering-/Texturbudget-Angaben unten;
der räumliche V2-Vertrag bleibt unverändert.

## Vertrag

- Montagepunkte werden ausschließlich als `SOCKET_<slotId>` / `RAIL_<launcherId>` im 3D-Modell autoriert. Ihre vollständige Transformationshierarchie zählt; Nullrotation ist gültig.
- Exportierte Modelle verwenden Meter, +Y oben und +Z als Bug bzw. Waffenfront. Das Autoren-/Simulationssystem benennt +X als Steuerbord. Die Darstellung muss die vollständige Basisabbildung einschließlich lokaler Geometrie abbilden; nur Weltposition und Heading zu spiegeln reicht nicht.
- Rumpfursprung ist der Simulationsbezugspunkt an der Wasserlinie Y=0. Waffenursprung ist der Montage-/Drehpunkt. Keine Bounding-Box-Normalisierung, inversen Mount-Skalen, Größenfaktoren 100/200 oder lokalen Reparatur-Offsets im Spielrenderer.
- GLB und daraus deterministisch erzeugte, versionierte Metadaten bilden ein Exportartefakt. JSON-Metadaten sind **kein zweiter Autoreneingang**. Ein Check muss jede Abweichung vom GLB erkennen. Server und Client konsumieren dieselben erzeugten Werte. Der Server braucht weder Three.js noch einen GLB-Parser.
- Slot, Waffensystem und 3D-Modell sind getrennte Identitäten. Reichweite, Feuersektor und Abwehrschicht gehören zum Waffensystem/Loadout, nicht zum Assetnamen. Kollisionskörper bleiben bewusst freigegebene Gameplay-Daten.
- `bf_muzzle` definiert den Effektaustritt, seine lokale +Z-Achse die Front. Exportierte Effektmarker definieren Kielwasser. Drehbare Systeme besitzen explizite Yaw-/optionale Pitch-Pivots; Grundstellung folgt der Montageorientierung, nicht dem Vorzeichen der Z-Position.
- Logischer Schiffsknoten: Simulationspose, Maßstab 1. Visuelle Bewegung (Rollen/Stampfen/Sinken) liegt darunter; logische Hitbox/Feuersektoren übernehmen diese kosmetische Bewegung nicht.
- Das Spiel übergibt verbindliche Profile an die Visual-Factory. Die Workbench übergibt ihren expliziten Entwurf. Kein versteckter Zugriff der Factory auf localStorage-Profile.
- Autorenmaterialien werden erhalten und nach visuellen Zustandswechseln vollständig wiederhergestellt.

## Umsetzung und Nachweise

1. Vertrag, asymmetrisches Referenzmodell, GLB-Transformations- und Richtungstests.
2. Reversible Materialzustände und explizite Profilübergabe zwischen Spiel/Workbench/Factory.
3. Export-/Prüfwerkzeug: validierte Modellmarker → gemeinsame Metadaten; alte handgepflegte räumliche Quellen entfernen.
4. Waffensystem und Modellkennung entkoppeln, inklusive aller produktiven Verbraucher.
5. Gepard metrisch migrieren; vorhandene aktive Klassen müssen in der neuen Pipeline funktionsfähig bleiben. Keine zusätzliche Legacy-Laufzeitpipeline als Abschlusszustand.
6. Vollständige Basisabbildung, Richtung/Sektor/Grundstellung, Mündungen und Effekte vereinheitlichen.

Abschlussnachweise: reale ausgelieferte GLBs; asymmetrische Punkte und vier Zielrichtungen bei mehreren Kursen; Null-/verschachtelte Transformationen; Abweisung fehlender/doppelter/ungültiger Marker; Client-/Server-Punktgleichheit; Materialrückkehr; Editor-Isolation; gleiche Waffenfunktion bei anderem Modell; Typprüfung, Tests und Builds; Browser-Smoke des resultierenden Zustands. Geänderte Gameplay-Ursprünge sind Inhaltsänderungen und dürfen nicht durch blindes Ersetzen alter Golden-Hashes verdeckt werden.

Nicht Teil dieses Auftrags: Wake-Pufferoptimierung, Texturkompression, Schatten-/GPU-Tuning, vollständige Migration aller Archiv-/Prototypmodelle. Aktive Klassen und neue Exporte müssen den Vertrag jedoch erfüllen.

Nachfolgeauftrag: [Punkt 7 — Kielwasser-Pufferoptimierung](WAKE-RIBBON-OPTIMIZATION.md) ist inzwischen separat umgesetzt; der Modellvertrag bleibt unverändert.

## Arbeitsstand

- Ausgangszustand geprüft: aktive Klassen Gepard, Spruance, Kreuzer. Unversionierte Spruance-Backups bleiben unangetastet.
- Umsetzung und Abschlussnachweise stehen unten; Commit/Push sind separat freizugeben.
- Spiel/Workbench übergeben das Profil jetzt ausdrücklich; Materialzustände werden auf die vollständigen Autorenwerte zurückgesetzt (Tests vorhanden).
- Waffenfunktion ist von Modellnamen entkoppelt: `defaultLoadout[slotId] = { weaponId, modelId }`. Keine zweite Standardbelegung am Slot, keine hull-spezifische URL-Umschreibung und kein stiller Modell-Fallback. Katalog und Import prüfen Modellart, Drehfähigkeit und Slot-Kompatibilität.
- Offline-Extraktion validiert verschachtelte Marker, Nullrotation, Eindeutigkeit und starre Transformationen. Kanonischer Export erhält die eingebetteten Bild-/Geometriedaten unverändert und konvertiert Autoreneinheiten einmalig in Spielmeter.
- Alle 14 aktiven GLBs sind kanonisch migriert und in der Runtime aktiviert. Gemeinsame Metadaten werden aus ihnen erzeugt und bei jedem Test/Build per Quellhash geprüft. Handgepflegte Mount-Socket-Dateien sind entfernt; Profilimporte und Editor-Patches dürfen keine räumlichen Werte überschreiben.
- Rümpfe und Waffen werden ohne Laufzeit-Normalisierung montiert. Der logische Knoten bildet die vollständige Simulationsbasis ab; Rollen, Stampfen und Sinken liegen auf einem kosmetischen Kindknoten. Reale Modelltests prüfen fünf Kurse, fünf Zielrichtungen, Deckneigung, Sektoren, Grundstellung, Rails und Mündungen für alle Klassen.
- Gepard-/Spruance-Generatoren und Bake-Publisher verwenden denselben kanonischen Export. Keine Profil-/Socket-JSON-Ausgabe, keine Mount-Gegenskalierung. Heckorientierung und `bf_wake` werden als Modellmarker autoriert. Alte Profilentwürfe außerhalb der Backups wurden entfernt.
- Blender-Reimport montiert direkt auf importierte GLB-Marker. `test_canonical_pipeline.py` hat alle drei Klassen / 14 montierten Waffen einschließlich Mündungspositionen gegen gemeinsame Metadaten geprüft. Der Publishing-Bridge-Test prüft Aufrufargumente und Einheitenfaktor, ersetzt aber keinen vollständigen Neubake der Quelldateien.
- Bis zu einer ausdrücklichen Entscheidung über reale Maße werden die bisherigen Rumpflängen beibehalten: Gepard 60,016 m, Spruance 120 m, Kreuzer 169,946 m. Hitboxen bleiben unverändert. Die Wahl betrifft den Export, nicht zusätzliche Runtime-Skalen.

### Gespeicherte Autorenquellen und echter Neuexport

Die fünf aktiven Quellen wurden mit `upgrade_source_markers.py` geprüft und migriert: Gepard `gepard_p6122.blend` / `weathering-checkpoint.blend`, Spruance `spruance_dd963.blend` / `spruance_geometry.blend` / `weathering-checkpoint.blend`. Die Migration änderte Marker und Export-Tags, nicht Mesh-Daten, Mesh-Transformationen oder Texturen. Backups und die zuvor offene Benutzerszene blieben unangetastet.

Aus beiden gespeicherten Bake-Checkpoints wurden über `publish_scene.py` tatsächlich neun neue kanonische GLBs veröffentlicht. Marker-IDs blieben gleich; größte Positionsabweichung gegenüber dem zuvor geprüften Export: 0,00000107 m (Float32-Rundung). Danach bestanden Asset-Audits, reale Client-/Server-Modelltests sowie Blender-Reimport/Mündungsabgleich erneut. Dies ist ein echter Export aus den Autorenquellen, kein Reexport importierter Runtime-GLBs und kein neuer Texturbake.

Tote Aim-Fallback-Raketenstarts, der zweite Client-Socket-Leser, ungenutzte Range-Wrapper und redundante Yaw-Felder sind entfernt. Der archivierte F124-Prüfer prüft nur Offline-Geometrie und beansprucht keine V2-Abnahme. Workbench-Storage validiert Klassen und vollständige Profile vor Verwendung; ungültige gespeicherte Einträge werden mit Warnung ignoriert, bleiben aber zur Wiederherstellung gespeichert. Schreibfehler ändern weder Cache noch Storage. Tests belegen Cache-/Match-Isolation. Sektorformulare erhalten explizite Mitten und Unions; die Bogenrichtung breiter/asymmetrischer Sektoren folgt derselben Semantik wie die Waffenregeln.

## Neuer Exportweg (aktiv)

1. Modell mit Wasserlinien-/Montageursprung, +Y oben, +Z vorne autorieren. `SOCKET_<id>`, `RAIL_<id>` und `bf_wake` gehören in den Rumpf; `bf_muzzle` gehört in jedes Waffenmodell. Marker müssen Empty-Knoten mit angewandter Skalierung sein. Bei drehbaren Waffen ist der Modellursprung der Yaw-Pivot; der Export erzeugt `bf_yaw` darum. Ein bereits vorhandener `bf_yaw` muss dieser Identität entsprechen. Animation/Skins benötigen eine spätere ausdrückliche Vertragserweiterung.
2. Modell im einzigen Katalog `shared/src/content/modelCatalog.json` mit `file`, `kind` und bei drehbaren Waffen `yaw: true` registrieren. Das Loadout verweist unabhängig darauf; Reichweite und Abwehrschicht bleiben beim `weaponId`.
3. `npm run models:export -- <modelId> <source.glb> <Meter-pro-Autoreneinheit>` erzeugt das selbstenthaltene Laufzeit-GLB am festen Katalogpfad. Für bereits metrische Modelle ist der Faktor `1`. Der Faktor wird in die exportierten Transformationen eingerechnet, nicht im Renderer gespeichert.
4. `npm run models:build` erzeugt gemeinsame räumliche Metadaten; `npm run models:check` prüft einschließlich Quellhash gegen die echten GLBs. Die Metadaten werden nie von Hand geändert. Beide Befehle sind für alle 14 Modelle grün; `models:check` ist Bestandteil der normalen Test-/Build-Gates.

Für Blender-Szenen: Szene mit `bfa_marker_contract = 2` und `bfa_metres_per_unit` versehen (neue metrische Modelle: `1`). Direkte Export-Collections erhalten `bfa_model_id` aus dem Katalog; mehrere Collections desselben Modells werden gemeinsam exportiert. Präsentations-/Preview-Collections bleiben unmarkiert. `scripts/blender/publish_scene.py` exportiert die aktuelle Szene über dieselbe Pipeline und erzeugt Metadaten. Die gespeicherten Bake-Checkpoints enthalten Rumpf und separate Waffenvorlagen; die Präsentationsdateien sind kein Ersatz für diese Vorlagen.

Die einmalige V1-Migration ist getrennt vom normalen Export: `node --conditions=bfa-source --import tsx scripts/models/migrateLegacyModels.ts --check`. `--write` wurde zusammen mit der Runtime-Umstellung ausgeführt. Es ist kein normaler Autorenworkflow und überspringt bereits kanonische Modelle. Die Migration importiert die bislang fehlenden Kreuzer-Rails einmalig ins Modell, korrigiert alte Waffenfronten/Marker und übernimmt die vorhandenen Modell-Sockets statt der widersprüchlichen handgepflegten JSON-Positionen. Diese Inhaltskorrekturen müssen im abschließenden Kampf-/Rendervergleich explizit abgenommen werden.

## Abschlussverifikation

Am aktuellen Arbeitsstand bestanden: 116 Testdateien (52 Client, 24 Server, 40 Shared), Typprüfung, vollständiger Produktionsbuild sowie die Blender-Import-/Montageprüfung. Der Build meldet weiterhin einen großen Three.js/Renderer-Chunk; Bundle-Optimierung ist kein Beleg für oder gegen den Modellvertrag. Gepard-/Spruance-Asset-Audits prüfen eingebettete PNGs, UVs, Marker-/Hashgleichheit und 8.398 bzw. 9.588 zusammengesetzte Dreiecke.

Browser-Smoke: Alle drei aktiven Klassen wurden in der Workbench samt Materialien, Mounts und Markern visuell geprüft. Ein ungespeicherter Union-Sektorentwurf wurde ohne Ladefehler dargestellt. Die Kamera rahmt das tatsächliche Modell, ohne dessen Transformation zu ändern. Im lokalen Live-Match wurden FAC → Zerstörer → Kreuzer, Artillerie/SSM, SAM-/PD-/CIWS-Abwehr, Treffer, Zerstörung und Respawn ausgeübt. Der Testspieler erzielte acht Abschüsse; die Browser-Konsole blieb frei von Fehlern/Warnungen. Temporäre Kamerahöhe zurückgestellt, Testbot gestoppt und ausschließlich Testtabs geschlossen.

Die erneute Blender-Prüfung las alle fünf gespeicherten Quelldateien mit V2-Vertrag/Export-Tags und bestätigte den Reimport aller drei Klassen mit 14 montierten Waffen und passenden Mündungen. Die offene Benutzerszene blieb erhalten. Der F124-Offline-Geometrieprüfer besteht ebenfalls, ist aber ausdrücklich keine V2-Runtime-Abnahme.

| Punkt | Autoritativer Nachweis |
| --- | --- |
| 1 · Koordinatenvertrag | `canonicalModelExport.test.ts`, `modelMetadata.contract.test.ts`, reale Richtungstests bei fünf Kursen/Zielen |
| 2 · Materialien / Profile | `shipVisual.contract.test.ts`, `shipProfileRuntime.test.ts`, Browser-Respawn und Workbench |
| 3 · Modelle als räumliche Quelle | 14 GLBs + `models:check`, Override-/Marker-Ablehnung, gespeicherte Blender-Quellen und echter Neuexport |
| 4 · Identitäten trennen | `weaponSystems.test.ts`, Profilvalidator, katalogbasierte Resolver; keine produktiven `visual_*`-Aliases |
| 5 · Metrische aktive Klassen | `legacyModelMigration.test.ts`, reale GLB-/Asset-Audits, Blender-Reimport, Browser aller drei Klassen |
| 6 · Basis / Sektoren / Mündungen | `modelRuntime.contract.test.ts`, `mountedWeaponPose.test.ts`, `mountFireSector.test.ts`, `ModelMuzzleEvents.test.ts`, FX-Tests und Live-Kampf |

Sicherheitsprüfung gemäß Security-Inspector: keine kritischen oder belastbaren hohen Befunde in den geänderten Import-/Export-/Ereignispfaden. Export ist ausschließlich ein lokales Autorenwerkzeug; feste katalogvalidierte Ausgabepfade, keine Shell-Interpolation, keine serverseitigen GLB-Uploads. Ungültige Ereignistupel und räumliche Profil-Overrides werden verworfen. Auth-/Origin-Grenztests bestehen. Kein Deployment-/Internet-Sicherheitstest behauptet.

Bewusste Grenzen: F124/Archivmodelle bleiben außerhalb der aktiven Migration; keine neue Texturkompression oder GPU-Optimierung. Der bekannte große Renderer-Chunk bleibt eine Build-Warnung. Reale statt bisheriger Spielgrößen erfordern eine separate Inhaltsentscheidung. Kein Commit/Push dieser Änderungen erfolgt.

## Abschussursprünge und Ereignisse (umgesetzt)

- `mountedWeaponPose.ts` berechnet ohne Three.js den vollständigen Socket-XYZ-Transform, die gerichtete Train-Rotation und die Mündung aus den erzeugten Modelldaten. Client und Server nutzen denselben projizierten Yaw-Solver; die kosmetische Schiffsbewegung bleibt ausschließlich im Renderer.
- `artyFired` enthält `slotId` und `fromX/fromY/fromZ`. `airDefenseFire` enthält den serverseitig nach Schicht und Sektor ausgewählten Slot und dessen Mündung. `aswmFired` enthält `launcherId`, Mündung und Richtung. Der Client sucht exakt diese Identität, niemals den ersten gleichartigen Mount.
- Artillerieblitz und Geschoss starten am selben dargestellten Punkt. SAM/PD/CIWS verwenden ebenfalls die Modell-Mündung inklusive Höhe; CIWS-Streuung wirkt am Ziel statt als verschobener Startpunkt. Fehlende Renderassets verwenden die autoritative Modell-Mündung aus dem Ereignis.
- ASuM starten am Mündungsmarker statt am Socket plus 12 m. Kein versteckter Aim-Fallback ohne Rail. Start-Rauch wird ausschließlich aus einem Feuerereignis erzeugt; reine Snapshots erzeugen keine Starts. Eine auf 256 Einträge / 1 s begrenzte Präsentationsablage überbrückt Ereignisse vor dem State-Patch und wird bei Disposal geleert. Der visuelle Übergang zur See-Flughöhe dauert 250 ms und verändert keine Simulationspose.
- Neue numerische Ereignisfelder werden am Client als endliche Zahlen geprüft; teilweise oder ungültige Mount-Angaben werden verworfen. Alte Replay-Ereignisse ohne räumliche Erweiterung dürfen die bestehende reduzierte Darstellung nutzen, aber lösen keine Suche nach einem beliebigen Mount aus.

### Bewusste Inhaltsänderung gegenüber Socket-Ursprüngen

Schiff an (0,0), Kurs 0, Hauptwaffe Richtung +Z; Angaben in Spielmetern, gerundet.
Die neuen Ursprünge wurden gegen die tatsächlichen GLB-Knoten geprüft, nicht aus alten Golden-Hashes übernommen.

| Klasse | bisheriger Geschütz-Socket Z | neue Mündung Z | neue Mündung Y |
| --- | ---: | ---: | ---: |
| Gepard | 17,974 | 22,975 | 5,447 |
| Spruance | 44,030 | 49,412 | 7,295 |
| Kreuzer | 56,866 | 65,647 | 5,884 |

Nominale Artilleriereichweite und Flugzeit werden folgerichtig von der Mündung aus berechnet; auch die HUD-Freigabe nutzt sie. SAM-/PD-Abfangzeit beginnt an der Mündung statt am Schiffsmittelpunkt. Waffenregeln, Schäden, Magazine und Sektoren werden dadurch nicht umdefiniert. Die bestehenden deterministischen Replay-/Partikel-Referenzen wurden nicht neu gehasht und bestehen weiterhin.

Nachweise: `modelRuntime.contract.test.ts` (reale GLBs, mehrere Kurse/Ziele, Client-/Server-Mündungen), `ModelMuzzleEvents.test.ts` und `CombatSystems.test.ts` (reale Serverereignisse), `mountedWeaponPose.test.ts` (Transformationskonvention/Schicht-/Slot-Auswahl), `artilleryFx.test.ts`, `missileFx.test.ts`, `airDefenseFx.test.ts` sowie Decoder-/Presenter-Tests. Browser-Abnahme siehe Abschlussverifikation.
