# F124 – Animationsdemo

`f124_hessen_animated.blend` enthält eine separate, texturierte Szene mit 20 Sekunden Vorbeiflug (Frames 1–481, 24 fps). Das ursprüngliche F124-Modell und die Runtime-GLBs bleiben unverändert.

In Blender die Szene `F124_Animation_Demo` wählen und die Timeline abspielen. Die Hauptkamera zeigt Schiff und Vorbeiflug; weitere Kameras zeigen den gesamten Flugweg, das Vorschiff sowie SMART-L und achteren RAM. Die Animation ist ein einzelner Vorbeiflug, kein nahtloser Loop.

## Steuerung und Grenzen

| Bauteil | Spiel-Slot aus destroyer.json | Horizontaler Bereich |
|---|---|---|
| 76-mm-Geschütz | main_fwd | ±120° um den Bug |
| RAM vorn | ciws_fwd | ±150° um den Bug |
| RAM achtern | sam_aft | ±120° um das Heck |

Die F124 ist dem Spielprofil `destroyer` zugeordnet. Für diese Demo werden dessen vorhandene Luftabwehr-Slots auf die beiden RAM-Modelle abgebildet. Die gerundeten 2,1-Rad-Werte des älteren visuellen F124-Prototypprofils werden nicht verwendet. Keine Waffen- oder Loadout-Regeln des Spiels wurden geändert.

Zielwinkel werden mit `clampYawToMountSector` aus `shared/src/artillery.ts` berechnet. Lokale Blender-Limit-Rotation-Constraints sichern die gleichen Grenzen zusätzlich ab. Lineare Zwischenframes und das Schwenken innerhalb des erlaubten Intervalls verhindern Abkürzungen durch den gesperrten Sektor beim Wechsel zwischen Anschlägen.

SMART-L: kontinuierlich 20 U/min als Demo-Einstellung. Höhenwinkel: Geschütz 0–75°, RAM 0–80°. Schwenkgeschwindigkeit: 55°/s. Diese drei Einstellungen sind illustrative Animationsparameter, keine aus dem Spiel oder technischen Originaldaten abgeleiteten Werte. Es werden keine Schüsse oder Flugkörper simuliert.

## Prüfung und Reproduktion

`validation.json` bestätigt 961 ausgewertete Positionen einschließlich halber Frames gegen die echte Spiel-Sektorprüfung. Jeder Mount erreicht mindestens einmal seinen Anschlag. `saved-animation-validation.json` prüft zusätzlich Radarbewegung, Flugbahn, getrennte Szene und eingebettete Texturen.

Vom Repository-Stamm:

```powershell
.\node_modules\.bin\tsx.cmd scripts/blender/create_f124_animation_data.ts
& 'C:\Users\Kleme\AppData\Local\BattleFleetArena\blender-mcp\.venv\Scripts\python.exe' scripts/blender/run_blender_mcp.py scripts/blender/animate_f124_scene.py
.\node_modules\.bin\tsx.cmd scripts/blender/create_f124_animation_data.ts --verify
```

Die Blender-Skripte setzen die geöffnete F124-v3-Quellszene voraus. Das Ergebnis ist eine Blender-Animationsdemo, noch kein in die Laufzeit eingebauter Animationscontroller.
