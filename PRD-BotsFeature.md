Saubere Trennung:

- `Game Rendering`
- `Network State`
- `Bot Brain`
- `Debug Presentation`

---

## Empfohlene Client-Module

```ts
BotController
BotPerceptionSystem
BotOrientationSystem
BotDecisionEngine
BotActionPlanner
BotMemoryStore
BotDebugPanel
BotDecisionLog
Klassenstruktur
class BotController {
  enable(): void
  disable(): void
  update(deltaMs: number): void
}
class BotPerceptionSystem {
  observe(worldState: ClientWorldState, selfId: string): PerceptionSnapshot
}
class BotOrientationSystem {
  orient(snapshot: PerceptionSnapshot, memory: BotMemory): TacticalContext
}
class BotDecisionEngine {
  decide(input: DecisionInput): BotIntent
}
class BotActionPlanner {
  plan(intent: BotIntent, input: ActionPlanningInput): PlayerInputCommand
}
class BotDebugPanel {
  render(state: BotDebugState): void
}
class BotDecisionLog {
  add(entry: BotLogEntry): void
  getRecent(limit: number): BotLogEntry[]
}
Datenmodelle
BotIntent
type BotIntent =
  | "ATTACK"
  | "CHASE"
  | "REPOSITION"
  | "HOLD_ARC"
  | "TAKE_COVER"
  | "RETREAT"
  | "EVADE_MISSILES"
  | "FINISH_TARGET"
PlayerInputCommand
type PlayerInputCommand = {
  throttle: number
  rudder: number
  aimAngle: number
  firePrimary: boolean
  fireSecondary: boolean
  useAbility: boolean
}
PerceptionSnapshot
type PerceptionSnapshot = {
  timestamp: number
  self: {
    id: string
    position: Vec2
    heading: number
    speed: number
    hp: number
    hpPercent: number
    level: number
    gunReady: boolean
    missileReady: boolean
  }
  enemies: VisibleEnemy[]
  missiles: VisibleMissile[]
  torpedoes: VisibleTorpedo[]
  islands: VisibleIsland[]
}
TacticalContext
type TacticalContext = {
  dangerScore: number
  aggressionScore: number
  survivalScore: number
  bestTargetId: string | null
  bestCoverPosition: Vec2 | null
  targetInGunArc: boolean
  targetInMissileArc: boolean
  incomingMissileThreat: boolean
  preferredRange: "close" | "medium" | "long"
  situationTag:
    | "safe"
    | "pressure"
    | "advantage"
    | "missile_threat"
    | "retreat_needed"
}
BotLogEntry
type BotLogEntry = {
  timestamp: number
  phase: "OBSERVE" | "ORIENT" | "DECIDE" | "ACT"
  message: string
  data?: Record<string, unknown>
}
Decision Log Anforderungen

Der Bot soll seine Entscheidungen live sichtbar protokollieren.

Ziel

Ein Entwickler soll im laufenden Spiel verstehen können:

was der Bot wahrgenommen hat
wie er die Lage bewertet
warum er einen Intent gewählt hat
welche Inputs gesendet wurden
Log-Ausgabe

Die Ausgabe soll in einem UI-Panel im Client sichtbar sein.

Beispiele
[12:01:03.120] OBSERVE  Enemy destroyer detected at 420m bearing 0.82
[12:01:03.140] ORIENT   danger=0.74 target=enemy_2 missileThreat=true
[12:01:03.141] DECIDE   intent=EVADE_MISSILES reason=incoming_missile_and_low_cover
[12:01:03.160] ACT      throttle=1.0 rudder=-0.8 firePrimary=false useAbility=true
Logging-Regeln
neue Logs oben oder unten konsistent anzeigen
Log begrenzen, z. B. auf letzte 100–300 Einträge
Filter möglich:
all
observe
orient
decide
act
Debug Overlay Anforderungen

Zusätzlich zum Log soll es ein sichtbares Overlay geben.

Es soll anzeigen:
Bot aktiv / inaktiv
aktueller Intent
aktuelles Ziel
dangerScore
aggressionScore
survivalScore
Ziel in Gun Arc: ja/nein
Ziel in Missile Arc: ja/nein
eingehende Raketen: Anzahl
letzte 5 Inputs
letzte Intent-Wechsel
Optional später:
Linien zum Ziel
Linie zur bevorzugten Deckung
Visualisierung von Feuerwinkeln
Anzeige des geplanten Kurses
UI-Aufteilung
Debug Panel

Seitenpanel oder Overlay, z. B. rechts oben.

Inhalt:

aktueller Bot-Status
OODA-Werte
aktueller Intent
Ziel-ID
Ziel-Distanz
Waffenstatus
Danger Score
Survival Score
Decision Log Panel

Scrollbares Panel.

Inhalt:

Zeit
OODA-Phase
Text
optionale strukturierte Daten
Visual Debug in der Szene

Optional:

Zielmarker
Kursmarker
Cover-Marker
Threat-Marker
Decision Tree Requirements

Die erste Bot-Version nutzt nur Entscheidungsbäume.

Prioritätslogik
Überleben
akute Bedrohung
sichere Schusschance
Zielverfolgung
Repositionierung
Beispielregeln
EVADE_MISSILES

Wenn:

incomingMissileThreat == true
Dann:
intent = EVADE_MISSILES
RETREAT

Wenn:

hpPercent < 0.25
und Deckung erreichbar
Dann:
intent = RETREAT
FINISH_TARGET

Wenn:

bestTarget vorhanden
bestTarget.hpPercent < 0.2
Waffe nutzbar
Dann:
intent = FINISH_TARGET
ATTACK

Wenn:

Ziel im Feuerwinkel
Waffen bereit
dangerScore moderat
Dann:
intent = ATTACK
HOLD_ARC

Wenn:

Ziel sichtbar
Ziel nicht im Feuerwinkel
Dann:
intent = HOLD_ARC
REPOSITION

Fallback wenn keine bessere Regel greift.

KI-Erweiterbarkeit

Auch wenn erstmal nur Decision Trees genutzt werden, muss die Architektur offen sein.

Strategy Interface
interface BotDecisionStrategy {
  decide(input: DecisionInput): BotIntent
}
Erste Implementierung
DecisionTreeStrategy
Spätere Implementierungen
UtilityStrategy
BehaviorTreeStrategy
RLPolicyStrategy
ExternalAgentStrategy

Wichtig:
Der Rest des Clients darf nicht wissen, welche Strategie aktiv ist.

Speicher / Gedächtnis

Der Bot braucht ein kleines Kurzzeitgedächtnis.

Beispiele:

letztes Ziel
letzte Bedrohung
letzter Intent
Zeitpunkt des letzten Intent-Wechsels
letzte sichere Deckungsposition
letzter bekannter Kurs des Gegners
type BotMemory = {
  lastIntent: BotIntent | null
  lastIntentChangeAt: number
  lastTargetId: string | null
  lastThreatId: string | null
  lastSafeCoverPosition: Vec2 | null
}
Timing / Update-Frequenz

Der sichtbare Bot-Client soll nicht jede Entscheidung pro Frame neu treffen.

Empfohlen
Rendering: normal über requestAnimationFrame
Observe: bei jedem relevanten State-Update
Orient + Decide: alle 100–200 ms
Act / Input senden: alle 50–100 ms

Das verhindert hektisches, unnatürliches Verhalten.

Beobachtungsmodus

Es soll möglich sein, einen Bot aktiv zu beobachten.

Anforderungen
Kamera folgt dem Bot-Schiff
Debug Panels bleiben sichtbar
Ziel und Kurs können hervorgehoben werden
Umschalten zwischen mehreren Bots später möglich
Akzeptanzkriterien

Die erste Version ist erfolgreich, wenn:

Ein sichtbarer Client im Bot-Modus einem Match beitreten kann.
Der Bot normal gerendert wird und sich wie ein Spieler im Match bewegt.
Die Steuerung des Schiffs vollständig vom Bot übernommen werden kann.
Die OODA-Schleife im Client sauber getrennt implementiert ist.
Der Bot über Entscheidungsbäume Intents wählen kann.
Der Bot normale Player-Inputs an den Server sendet.
Ein sichtbares Debug Overlay den aktuellen Zustand anzeigt.
Ein sichtbares Log die Entscheidungen des Bots nachvollziehbar protokolliert.
Die Decision-Logik kann später ausgetauscht werden, ohne Rendering oder Netzwerkschicht umzubauen.
Implementationshinweise
TypeScript verwenden
Bot nur auf replizierten Client-State stützen
keine direkten Server-Hooks verwenden
Bot-Logik modular halten
Debug UI komplett von Bot-Logik trennen
OODA-Schritte getrennt implementieren
Entscheidungssystem über Interface kapseln
Log-Einträge strukturiert halten