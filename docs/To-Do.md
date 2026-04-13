# To-Do (BattleFleet Arena)

Kurze Sammlung geplanter Arbeiten — kein Ersatz für Issues, eher Projekt-Notizen.

---

## Feuersektor: Datenmodell an Simulation und UI anbinden

**Kontext:** Im `ShipHullVisualProfile` existieren bereits `defaultRotatingMountFireSector` (Profil-Fallback) und optional `fireSector` pro `MountSlotDefinition`. Die **Spielsimulation** nutzt sie aktuell **nicht**: Artillerie-Bogen kommt nur aus `getShipClassProfile(…).artilleryArcHalfAngleRad` (klassenweit, ein Wert), siehe `server` → `tryPrimaryFire` / `tryComputeArtillerySalvo`. Die **lokale Zielhilfe** im Client (`shipVisual`, Bogen-Overlay) orientiert sich ebenfalls an der Klassen-Konstante, nicht am Rumpfprofil.

**To-Do:**

1. **Server:** Beim Primärfeuer den zulässigen Horizontalbogen aus dem **effektiven Hull-Profil** ableiten (Basis + optional Client-Patch ist für den Server irrelevant — nur gebündelte `shared`-JSONs), z. B.:
   - Hauptgeschütz-Slot identifizieren (z. B. erster `artillery`-Slot oder feste Slot-ID),
   - `fireSector` dieses Slots nutzen, sonst `defaultRotatingMountFireSector`, sonst weiter Fallback auf `artilleryArcHalfAngleRad` der Klasse.
2. **`tryComputeArtillerySalvo` / Hilfsfunktionen:** Bogen-Prüfung (`isInForwardArc` o. ä.) an die gleiche **MountFireSector**-Semantik anbinden wie im Typ dokumentiert (`symmetric` / `asymmetric`).
3. **Client:** Lokale Aim-Arc-Anzeige und ggf. HUD-Schematic konsistent mit derselben Logik (effektives Profil / gleicher Slot), damit Anzeige und Server übereinstimmen.
4. **Tests:** Mindestens shared/reine Funktionen für „Yaw im Sektor?“ mit symmetrisch/asymmetrisch abdecken; Server-Integration wo sinnvoll.

**Reihenfolge:** Zuerst die **Darstellung** (Viewport / Workbench / HUD) angleichen und verifizieren — **danach** diese Gameplay-Anbindung umsetzen.

---

*Stand: Notiz für Feuersektor-Anbindung; ergänzen nach Bedarf.*
