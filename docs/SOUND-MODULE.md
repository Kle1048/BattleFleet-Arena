# Sound-Modul (Client)

Kurzüberblick über **Spiel-SFX** im Browser: WAV-Dateien als optionale Assets, ansonsten **Web-Audio-Synth**-Fallbacks. Keine zusätzliche npm-Abhängigkeit.

## Dateien

| Pfad | Rolle |
|------|--------|
| `client/src/game/audio/soundCatalog.ts` | Logische Sound-Ids, **Dateinamen** der WAVs, URLs (`import.meta.env.BASE_URL`), Liste `ALL_SOUND_IDS` für Preload |
| `client/src/game/audio/gameAudio.ts` | `AudioContext`, Laden/Abspielen der Buffer, Synth-Fallbacks, öffentliche Methoden wie `primaryFire()` |
| `client/src/main.ts` | Nach Nutzerinteraktion: `unlockFromUserGesture()`, `preloadSounds()`; Verknüpfung mit Netzwerk-Callbacks |
| `client/src/game/runtime/networkRuntime.ts` | Colyseus-Messages → optionale Callbacks (`onAirDefenseSound`, `onCollisionContact`, `onWeaponHitAt`, `onMissileLockOn`) |
| `client/src/game/runtime/frameRuntime.ts` | Nur **HUD-relevante** Töne: `warning` (OOB), `levelUp` (Progression) |
| `server/src/rooms/BattleRoom.ts` | Sendet `collisionContact` an betroffene Clients; **`missileLockOn`** nur an den **Raketenbesitzer**, wenn die ASuM erstmals ein Ziel erfasst |
| `shared/src/collisionContactQueries.ts` | Server nutzt dieselbe Geometrie-Hilfe wie die Kollisionslogik (nur Dokumentationsbezug) |

Assets liegen unter **`client/public/assets/sounds/`** (Vite kopiert sie nach `dist`; URLs werden über `BASE_URL` gebildet).

## Ablauf beim Start

1. Spieler wählt Lobby / Klasse (Nutzeraktion).
2. `gameAudio.unlockFromUserGesture()` weckt den `AudioContext` (Browser-Autoplay-Policy).
3. `await gameAudio.preloadSounds()` lädt **alle** in `ALL_SOUND_IDS` eingetragenen WAVs parallel. Fehlt eine Datei oder schlägt `fetch`/`decodeAudioData` fehl, bleibt der Eintrag leer und es wird der **Synth** verwendet.

## Wann welcher Ton ausgelöst wird

### Direkt über `gameAudio` (Frame-Loop)

- **`warning`**: Lokaler Spieler bekommt OOB-Countdown (`frameRuntime`).
- **`levelUp`**: Progressions-Level steigt (`frameRuntime`).

### Über Netzwerk-Callbacks (`main.ts` → `gameAudio`)

| Auslöser | Mechanismus |
|----------|-------------|
| Primärfeuer, Treffer in der Nähe, ASuM, Torpedo | `registerNetworkHandlers` (z. B. `artyFired`, `artyImpact`, `aswmFired`, …) |
| **SAM / CIWS** | Server-Messages `airDefenseFire` / `airDefenseIntercept` (Wildcard-Handler), Callback `onAirDefenseSound` mit `phase` (`fire` \| `intercept`) und `layer` (`sam` \| `ciws`) |
| **Schiff↔Schiff / Schiff↔Insel** | Server sendet **`collisionContact`** mit `{ kind: "ship" \| "island" }` nur an den **betroffenen** Client; Callback `onCollisionContact` |
| **ASuM Lock-on** | Server sendet **`missileLockOn`** (leerer Payload) nur an den **Abschuss-Client**, wenn die eigene Lenkflugkörper-Simulation von **keinem** auf **ein** Ziel wechselt; Callback `onMissileLockOn` → `gameAudio.missileLockOn()` |
| **Waffentreffer (Hit)** | **`weaponHit`** / `onWeaponHitAt` → `gameAudio.weaponHit(gain)`: Server meldet `kind === "hit"` bei `artyImpact`, `aswmImpact`, `torpedoImpact` (Artillerie nur wenn Splash nicht weggecullt). Kleinere akustische Figur als Schiffs-Explosion. |
| **Explosion (Schiff zerstört)** | **`explosion`** / `gameAudio.explosion(gain)`: nur **Schiffszerstörung** (`onShipDestroyed`), nicht für normale Treffer. |
| **Softkill / Düppel (Chaff)** | **`softkillChaff`** / `gameAudio.softkillChaff(gain)`: lokaler **ECM-/Düppel-Versuch** (Softkill), wenn der Server `softkillResult` meldet. Mit sichtbarem Schiff: **ein Ton pro Rauch-Puff** (Callback an `spawnSoftkillChaffCloud`), Gain pro Puff gedämpft (`0.32/√8`); ohne gültige Pose: einmal `0.32` wie früher. |
| **„Treffer in der Nähe“** | **`hitNear`**: Artillerie-Splash **in der Nähe** des lokalen Spielers (Radius-Check), nicht gleichbedeutend mit `weaponHit`. |

Kollisionssounds kommen **nicht** mehr aus clientseitiger Geometrie, sondern aus der **Server-Simulation** (Kontaktbeginn).

## Katalog: WAV-Dateinamen

Die Eigenschaft in `SoundFiles` legt den **Dateinamen** fest (Ordner `public/assets/sounds/`):

- `primary_fire.wav`, `missile_fire.wav`, `missile_lock_on.wav`, `torpedo_fire.wav`, `hit_near.wav`, `level_up.wav`, `warning.wav`
- `ship_ship_collision.wav`, `ship_island_collision.wav`
- `air_defense_sam_fire.wav`, `air_defense_sam_intercept.wav`, `air_defense_ciws_fire.wav`, `air_defense_ciws_intercept.wav`
- `weapon_hit.wav` (direkter Waffentreffer)
- `explosion.wav` (Schiffszerstörung)
- `softkill_chaff.wav` (ECM / Düppel-Cloud, Softkill-Versuch)

Neue Sounds erfordern einen neuen Eintrag in **`SoundFiles`**, **`SoundUrls`**, **`ALL_SOUND_IDS`** sowie einen Eintrag in **`playSoundId`** (Synth-Fallback) und ggf. eine Methode auf `gameAudio`.

## API-Stichworte (`gameAudio`)

- `unlockFromUserGesture()` / `preloadSounds()` — einmal beim Join
- `hasSoundFile(id)` — optional, ob WAV geladen wurde
- `playSoundId(id, gain?)` — generisch
- Benannte Methoden: `primaryFire`, `missileFire`, `missileLockOn`, `torpedoFire`, `hitNear`, `levelUp`, `warning`, `shipShipCollision`, `shipIslandCollision`, `airDefenseSamFire`, `airDefenseSamIntercept`, `airDefenseCiwsFire`, `airDefenseCiwsIntercept`, `weaponHit(gain?)`, `explosion(gain?)`, `softkillChaff(gain?)`

## Technische Hinweise

- Format: **WAV** (Browser decodiert per Web Audio API; andere Formate wären nur nach Erweiterung der Lade-Logik sinnvoll).
- Mehrere gleichzeitige Sounds: je Abspielen neuer `AudioBufferSourceNode`.
- Lautstärke: grob über `gain` in `playSoundId` / `playBuffer`; kein globales Master-Volume im Modul.

## ElevenLabs (Sound Effects) — Prompts pro Datei

Die Prompts sind auf **Englisch** formuliert (typisch bessere Ergebnisse bei KI-SFX). In ElevenLabs **Sound Effects** (oder vergleichbares Tool) einfügen, Ergebnis als **WAV** exportieren, Dateiname wie in der Spalte **Datei**. Optional: auf **1–3 Sekunden** kürzen, leise Passagen abschneiden, **Lautheit** für Spiel konsistent halten (nicht zu laut im Vergleich zu anderen SFX).

Kein Gesang, keine Musik, keine Sprache — nur kurze Effekte.

| Datei | Kontext (DE) | Prompt (EN, für ElevenLabs) |
|-------|----------------|-------------------------------|
| `primary_fire.wav` | Schiffshauptgeschütz, ein Schuss | `Single naval cannon shot from a warship, sharp crack, distant boom echo, military maritime, dry and punchy, no shell whistle, very short 0.5 seconds, realistic` |
| `missile_fire.wav` | ASuM / Lenkflugkörper-Start | `Anti-ship missile launch whoosh from a ship deck, solid rocket ignition, short powerful burst, naval warfare, realistic, under 1 second, no explosion` |
| `missile_lock_on.wav` | ASuM-Sucher erfasst Ziel (Chirp) | `Missile seeker lock-on tone, rapid ascending electronic chirps, radar tone, military air-to-air style lock cue, short 0.4 seconds, no voice, no music` |
| `torpedo_fire.wav` | Torpedo / Mine abfeuern | `Above water torpedo tube launch thump and bubble rush, ship torpedo, muffled heavy water sound, short 0.8 seconds, realistic naval` |
| `hit_near.wav` | Artillerie knapp vorbei / Einschlag in der Nähe | `Large artillery shell splash and shockwave in water very close to camera, terrifying near miss, huge water impact, rumble and spray, 1–2 seconds, cinematic but realistic` |
| `level_up.wav` | Levelaufstieg, positiv | `Short uplifting game level-up chime, bright positive bells or soft synth fanfare, rewarding, no voice, clean UI style, 1 second max` |
| `warning.wav` | Außerhalb des Einsatzgebiets / Alarm | `Urgent military radar warning alarm beep, repeating tense tone, submarine or ship bridge, serious not comical, 1.5 seconds loopable tail optional` |
| `ship_ship_collision.wav` | Schiff rammt Schiff | `Two large ships colliding, heavy metal bang and hulls grinding together, steel on steel, maritime, about 1 second, realistic` |
| `ship_island_collision.wav` | Schiff streift Land / Insel | `Ship hull scraping rocky shoreline or reef, grinding stone and wood, slower crunch, coastal, 0.8 seconds, realistic` |
| `air_defense_sam_fire.wav` | SAM startet | `Surface-to-air missile launch from naval ship, whoosh and ignition roar, vertical launch, military, short 1 second, realistic` |
| `air_defense_sam_intercept.wav` | SAM trifft Ziel | `Missile intercept explosion in the sky, sharp blast, small aerial detonation, distant thunder echo, 1 second, realistic military` |
| `air_defense_ciws_fire.wav` | CIWS-Salve | `Naval CIWS Phalanx gatling gun burst, extremely fast rattling cannon fire, short 0.4 second burst, metallic mechanical, realistic` |
| `air_defense_ciws_intercept.wav` | CIWS-Treffer | `Small close-range anti-air impact sparks and ricochet, CIWS hitting incoming target, metallic hits and tiny explosion, 0.6 seconds, realistic` |
| `weapon_hit.wav` | Direkter Waffentreffer auf Schiff | `Naval shell or missile impact on steel ship hull, sharp clang and secondary boom, medium explosion on metal, 0.8 seconds, realistic, not huge` |
| `explosion.wav` | Schiff zerstört | `Massive naval warship explosion, huge fireball and debris, deep bass rumble, catastrophic ship sinking detonation, 2–3 seconds, cinematic realistic, no human screams` |
| `softkill_chaff.wav` | Düppel / ECM (Softkill) | `Naval ship chaff and flare countermeasures burst, several repeated small detonations similar to a fireworks battery.` |
