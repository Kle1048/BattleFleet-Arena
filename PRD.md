BattleFleet-Arena – Product Requirements Document (PRD)
1. Document Overview
1.1 Product Name

BattleFleet-Arena

1.2 Document Purpose

This document defines the product vision, gameplay design, technical architecture, systems, scope, and implementation requirements for the MVP of BattleFleet-Arena, a browser-based top-down multiplayer naval combat game.

1.3 Intended Use

This PRD is written to be directly usable inside Cursor as the reference document for:

architecture planning
implementation sequencing
system decomposition
technical decisions
feature scope control
future iteration

1.4 Project Goal

Build a playable, stable, browser-based multiplayer naval shooter that combines:

arcade combat feel
semi-realistic ship handling
Cold War to early-2000s naval combat themes
match-based progression
authoritative multiplayer server architecture

2. Product Vision

BattleFleet-Arena is a fast-paced top-down multiplayer naval combat game where players control warships in modern sea battles inspired by the Cold War and early 2000s. The game emphasizes satisfying combat, tactical positioning, layered defense systems, and believable ship handling without becoming a full simulator.

The player should feel that:

the ship moves with weight and inertia
weapons are responsive and satisfying
positioning and firing arcs matter
missile salvos and defense layers create dramatic combat moments
each life becomes a mini-progression run through in-match leveling

The game is not meant to be a hardcore naval simulation. It is a competitive arcade-action PvP game with realistic inspiration.

3. Design Pillars
3.1 Arcade Combat, Not Arcade Movement

Combat should feel immediate and readable. Movement should feel weighted, delayed, and ship-like.

3.2 Easy to Learn, Deep to Master

Players should quickly understand the basics:

move with keyboard
aim with mouse
fire weapons
defend against/avoid missiles

Depth comes from:

maneuvering for firing arcs
timing salvos
class strengths and weaknesses
level-based power spikes
managing exposure and positioning around islands

3.3 Readability Over Simulation Complexity

The player must always be able to understand:

where threats come from
what hit them
why a weapon cannot fire
whether defenses are working
when they leveled up

3.4 Spectacle Through Layered Naval Combat

The game fantasy must strongly deliver:

naval artillery exchanges
anti-ship missile attacks
torpedo threats
CIWS fire and missile interceptions
explosions and close defensive saves

3.5 Stable Multiplayer First

The architecture must prioritize:

stable 16-player matches
simple room lifecycle
predictable state synchronization
clean join/leave behavior
server-authoritative combat logic

4. Genre and Platform

4.1 Genre
Top-down multiplayer naval shooter
Arena PvP
Session-based combat game

4.2 Platform

Primary target: browser

4.3 Rendering Technology
Three.js for rendering
4.4 Multiplayer Technology
Node.js + Colyseus for the authoritative game server
4.5 Future Possibilities

Not part of MVP, but architecture should not block:

desktop wrapper
mobile observation mode
larger player counts
new maps and modes

5. MVP Scope Summary

The MVP must include:

browser client
top-down 3D rendering with Three.js
authoritative multiplayer server with Colyseus
16-player Free For All match
3 ship classes
movement with inertia and rudder handling
artillery
anti-ship missiles
torpedoes (simple version)
automatic defenses (SAM and CIWS/PDMS/laser abstraction)
weapon firing arcs and dead zones
one playable map with islands
in-match leveling from level 1 to level 10
respawn with reset to level 1
scoring, kills, match timer
HUD with core combat information

The MVP does not need:

account system
persistence across matches
clans
advanced matchmaking
team modes
100-player battles
realistic sonar warfare
advanced ECM/ECCM
ship fitting customization

6. Core Player Experience

A new player enters BattleFleet-Arena and immediately joins a live match. They spawn in a ship of their selected class and begin maneuvering through open water and around islands. The ship feels heavy and slightly delayed in turns, but the guns and missiles feel quick and powerful.

The player learns to:

adjust heading with rudder-like turning
point the hull to bring weapons into firing arc
dodge and survive incoming missile attacks
exploit islands for cover and ambushes
[AENDERUNG 2026-04-07] gain XP primarily through kills (no assist XP in MVP)
level up during the life and become more dangerous
fear death because it resets progression

The ideal emotional loop is:

tension during approach
satisfaction during attack
panic during incoming salvos
relief when defenses save the ship
excitement on level-up
frustration-but-motivation on death

7. Core Gameplay Loop
7.1 Macro Loop
Player opens the game.
Player selects a ship class.
Player presses Play.
Client joins an available match room or creates a new one.
Player spawns at level 1.
Player fights, gains XP, and levels up.
Player dies and respawns at level 1.
Match continues until timer expires.
Scoreboard appears.
Player requeues.
7.2 Micro Loop
Move into a favorable position.
Acquire a target.
Align ship to bring weapons into arc.
Fire artillery or missiles.
Survive incoming attacks through maneuvering and layered defenses.
Finish damaged enemies.
Gain XP and level up.
Re-engage.
8. Game Mode
8.1 MVP Mode

Free For All (FFA)

8.2 Why FFA

FFA is the most efficient MVP choice because it avoids:

team balancing
party systems
team scoring complexity
role dependency
uneven team frustration in early tests
8.3 Match Rules
max players per match: 16
mode: every player vs every player
[AENDERUNG 2026-04-07] match duration: 5 minutes (Debug-Tuning; Ziel bleibt spaeter 12 minutes)
respawn enabled
join in progress allowed
leave at any time allowed
8.4 Win Condition

At the end of the timer, the player with the highest score wins.

8.5 Scoring
Kill: 100 score
[AENDERUNG 2026-04-07] Assist scoring removed from MVP scope
Death: 0 penalty

Optional later:

streak bonus
survival bonus
objective score if non-FFA modes are added
9. Ship Classes

The game includes three primary ship classes. For the MVP, the player selects one class before entering the match.

9.1 Fast Attack Craft / Schnellboot

Role: speed, flanking, opportunistic strikes, hit-and-run missile attacks

Characteristics:

highest speed
best turn response
lowest HP
smaller visual target
lower sustained durability

Gameplay identity:

punish isolated ships
ambush from island cover
avoid prolonged trades
9.2 Destroyer

Role: flexible all-round combat platform

Characteristics:

balanced speed
balanced turning
balanced offense and defense
most forgiving class for general play

Gameplay identity:

engage at most ranges
good entry class for players
jack-of-all-trades
9.3 Cruiser

Role: heavy combatant with stronger defenses and more firepower

Characteristics:

slowest speed
largest silhouette
highest HP
strongest sustained weapon pressure
strongest defensive layering

Gameplay identity:

dominate space when positioned well
punish frontal pushes
vulnerable to being outmaneuvered
9.4 Class Philosophy

Classes must differ through more than HP. They should feel different in:

acceleration
maximum speed
turn rate
inertia
firing arcs
weapon access
defensive coverage
visual target size
10. In-Match Progression
10.1 Core Rule

Each player begins every life at Level 1 and can progress up to Level 10 during that life.

10.2 Reset Rule

On death, the player loses all in-life progression and respawns again at Level 1.

10.3 Design Goals

This system should:

reward successful aggression and survival
make individual lives exciting and meaningful
keep matches dynamic
prevent runaway power from lasting forever
10.4 XP Sources
Kill: primary XP source
[AENDERUNG 2026-04-07] Assist XP removed from MVP progression sources
Optional later: damage contribution XP
10.5 Example XP Thresholds

These can be tuned later, but the MVP starts with:

Level	Total XP Required
1	0
2	100
3	250
4	450
5	700
6	1000
7	1400
8	1900
9	2500
10	3200
10.6 Level Benefits

For MVP, each level increases core stats and occasionally unlocks abilities.

Per-level scaling categories:

HP increase
reload improvement
slight mobility improvement
slight defense efficiency improvement
10.7 Ability Unlock Milestones

Suggested unlock levels:

Level 3
Level 5
Level 7
Level 10

These abilities can initially be class-specific and simple:

burst reload
extra missile in salvo
emergency countermeasures
short boost mode
defense overdrive
10.8 Progression Philosophy

Progression should feel meaningful but not create complete invulnerability. Higher-level ships may have stronger stats, but their survival should still depend heavily on positioning and awareness.

11. Controls
11.1 Control Scheme
W / S: throttle increase / decrease
A / D: rudder left / right
Mouse: aim direction or target point
Left Mouse Button: fire artillery / primary weapon
Right Mouse Button: fire anti-ship missile / secondary weapon
Space: use ability or countermeasure
Shift: boost or combat-speed modifier
R: target lock / cycle / targeting utility if used
11.2 Input Design Philosophy

Movement and combat are intentionally split:

keyboard controls navigation
mouse controls weapons

This keeps movement strategic and weapon use reactive.

11.3 UX Goals for Input

Players must understand:

the current heading of their ship
the current aim direction
whether a weapon is in firing arc
whether a weapon is reloading
whether a target is lockable
12. Ship Movement Model
12.1 Movement Feel Goal

Ships must feel like ships, not cars and not tanks.

12.2 Movement Rules

Movement should include:

delayed acceleration
delayed deceleration
turn response linked to current speed
wide turning arcs
inertia-like motion
12.3 Why This Matters

The player should need to think ahead. Positioning and orientation should matter. Bringing the correct weapons to bear should require actual maneuvering.

12.4 Simplification Principle

This is not a full naval simulator. The movement model should be mathematically simple and deterministic, but feel believable.

12.5 Server Simulation Values

Each ship should minimally track:

position
heading
speed
throttle state
rudder state
turn rate
acceleration characteristics
max speed
12.6 Gameplay Result
low-speed ships turn more weakly
high-speed turns are wider
large ships feel committed once moving
small ships can reposition more aggressively
13. Weapons Overview

The game uses a layered naval combat model with player-controlled offensive weapons and automatically controlled defensive systems.

13.1 Offensive Weapons
artillery
anti-ship missiles
torpedoes
13.2 Defensive Systems
SAM
CIWS / PDMS / laser abstraction
13.3 Combat Philosophy

The offensive player decides when and from where to attack. The defensive systems attempt to automatically protect the ship, but they are not perfect. This creates dramatic missile-salvo gameplay.

14. Artillery
14.1 Role

Artillery is the default weapon for direct combat pressure.

14.2 Desired Feel
frequent use
strong feedback
clear impact
easier to understand than missile systems
14.3 Gameplay Properties
short to medium range
medium damage
moderate reload
unlimited ammo in MVP
uses firing arcs
14.4 Technical Simplification

For MVP, artillery should not require full ballistic physics. A simplified ballistic or time-to-impact approach is sufficient.

14.5 Visual Requirement

The client should make artillery feel impactful through:

muzzle flash
tracers or shell visuals
water splashes
impact explosions
15. Anti-Ship Missiles
15.1 Role

High-threat, high-payoff weapon against ships.

15.2 Desired Feel
dangerous
dramatic
counterable, but scary
satisfying to launch and satisfying to survive
15.3 Gameplay Properties
high damage
cooldown-based use
can be intercepted by defenses
may require arc or targeting rule compliance
limited simultaneous active missiles per player
15.4 Technical Simplification

Missiles should be server-simulated as moving entities with:

position
speed
heading
target logic or homing logic
life timer
damage
collision radius
15.5 Gameplay Tension

Missiles should create pressure not only on the target but also on the attacker’s positioning decisions and salvo timing.

16. Torpedoes
16.1 Role

Slow, dangerous anti-ship weapon, especially strong against larger vessels and predictable paths.

16.2 Gameplay Properties
slower than missiles
high damage
more limited launch opportunities
fewer active torpedoes than missiles
simple guidance or straight-run behavior in MVP
16.3 Design Note

Torpedoes add tactical variety and reinforce the naval fantasy, but their initial implementation should stay simple to protect scope.

17. Defensive Systems
17.1 SAM

Role: medium-range interception of incoming missile threats

Properties:

automatic activation
cooldown-based
sector / range dependent
not guaranteed to intercept everything
17.2 CIWS / PDMS / Laser Abstraction

Role: close-in defense against threats that survive outer defensive layers

Properties:

automatic activation
very short range
high reaction intensity
strong visual feedback
not perfect against saturation attacks
17.3 Layered Defense Model

Incoming missile defense should operate in layers:

incoming threat detected
SAM attempts engagement first
close-in defense engages surviving threats
remaining threats hit the ship
17.4 Design Goal

Players should understand that defense is helpful but not absolute. Salvo timing and saturation should matter.

18. Firing Arcs and Dead Zones
18.1 Core Rule

Weapons cannot fire in all directions. Each weapon system has a defined sector.

18.2 Gameplay Purpose

This adds:

ship-handling depth
positional decision-making
realistic flavor
variety between ship classes
18.3 UX Requirement

The player must clearly understand when a weapon cannot fire due to arc constraints.

18.4 Weapon Arc Examples
bow gun: forward-biased arc
stern gun: rear-biased arc
side missile launchers: left or right sectors
point defense: local sector around mount position
18.5 Product Value

Firing arcs are one of the key systems that make the game feel like naval combat instead of generic top-down shooting.

19. Damage Model
19.1 MVP Damage Model

The MVP uses a simplified health model:

each ship has HP
weapon hits reduce HP
when HP reaches zero, the ship is destroyed
19.2 Optional Later Expansion

Possible future additions:

subsystem damage
propulsion damage
radar damage
launcher disablement
bow / mid / stern zones
19.3 Reason for Simplicity

A simple HP model reduces implementation complexity, improves readability, and accelerates balancing.

20. Score, Kills, and Assists
20.1 Score Sources
kill
[AENDERUNG 2026-04-07] no assist score in MVP
20.2 Assist Attribution

[AENDERUNG 2026-04-07] Assist attribution is not part of MVP. Kill credit is awarded to the lethal hit.

20.3 UX Requirement

The game should clearly communicate:

kill confirmed
[AENDERUNG 2026-04-07] assist received removed from MVP HUD requirements
who destroyed the player
21. Map Design
21.1 MVP Map Count
1 map
21.2 MVP Map Type

Island Cluster Arena

21.3 Design Goals

The map should support:

open water engagements
cover-based repositioning
ambush play
flanking
break-up of sightlines
21.4 Structural Elements
open sea lanes
medium islands
narrow passages / choke opportunities
safe-but-not-perfect spawn areas
21.5 Collision Rules

[AENDERUNG 2026-04-07] Islands are hard obstacles for ships, SSM, and torpedoes.
[AENDERUNG 2026-04-07] Artillery is intentionally not blocked by islands.

21.6 Scale Goal

The map should be large enough that full traversal takes noticeable time, but not so large that players spend long periods without contact. A rough goal is that meaningful combat can be found quickly after spawn.

22. Spawn and Respawn
22.1 Spawn Behavior

Players spawn:

at designated valid spawn zones
with minimum enemy distance checks
facing a sensible direction
22.2 Respawn Flow

After destruction:

ship is destroyed
death event is shown
respawn delay occurs
new level-1 ship is spawned
22.3 Spawn Protection

MVP should include short spawn protection:

duration: approximately 3 seconds
no damage taken during protection
clear visual indication

Optional rule:

[AENDERUNG 2026-04-07] Firing does not cancel spawn protection in MVP (intentional).
22.4 Design Goal

Prevent spawn kills and reduce frustration.

23. HUD and UI
23.1 Core HUD Elements

The HUD must include:

HP bar
current level
XP progress bar
weapon cooldown indicators
score
match timer
[AENDERUNG 2026-04-07] notifications for level-up and kill events
23.2 Combat Clarity Indicators

The player should also be able to see:

weapon ready / not ready
weapon in arc / out of arc
lock or target indicator if relevant
incoming threat warning
23.3 Optional MVP Extras

If time permits:

compact scoreboard preview
minimap / tactical radar display
directional hit warning
23.4 UX Philosophy

UI should prioritize clarity over authenticity. The player should never need to guess why a system is unavailable.

24. Audio and Feedback
24.1 Why It Matters

Game feel depends heavily on audiovisual feedback. A functional combat system without strong feedback will feel flat.

24.2 Required Feedback Types
artillery fire sound
missile launch sound
interception sound
explosion sound
hit confirm sound
level-up sound
incoming threat warning sound
24.3 Visual Feedback Types
muzzle flashes
smoke trails
water wakes
splashes
explosions
CIWS tracers
shielded / protected spawn effect
24.4 Gameplay Outcome

Good feedback helps players learn systems faster and increases satisfaction.

25. Match Flow
25.1 Entry Flow
open game
choose class
press play
auto-join available room
spawn into match
25.2 In-Match Flow
fight continuously
score and level during the match
no mid-match lobby interruption
25.3 End-of-Match Flow

At timer end:

match ends cleanly
scoreboard shown
player offered replay / quick rejoin
25.4 MVP Principle

Minimal friction. No mandatory pre-match lobby required.

26. Technical Architecture Overview

BattleFleet-Arena uses a server-authoritative client-server architecture.

26.1 Architectural Principle

The server is the source of truth for gameplay. The client is responsible for rendering, input capture, effects, and UI.

26.2 Why This Is Required

This architecture is necessary because the game includes:

player-vs-player combat
moving projectiles
automatic defense systems
collision rules
score and XP progression
live join/leave behavior

If the client were authoritative, the game would be highly vulnerable to cheating, desync, and unstable combat outcomes.

26.3 Technology Stack

Client:

TypeScript or JavaScript
Three.js
browser UI framework optional but not required for MVP

Server:

Node.js
Colyseus
TypeScript recommended
27. High-Level System Decomposition

The system should be split into three major layers:

27.1 Client Layer

Responsibilities:

rendering the game world
showing HUD and menus
collecting and sending player input
receiving state updates
interpolating movement
playing effects and sounds
27.2 Game Server Layer

Responsibilities:

room lifecycle management
authoritative simulation loop
movement updates
weapon logic
projectile simulation
defense logic
collision checks
[AENDERUNG 2026-04-07] damage, deaths, XP, levels (no assists in MVP)
respawns
27.3 Infrastructure Layer

Responsibilities:

process hosting
websocket support
deployment and monitoring
logs and observability
future multi-room scaling
28. Client Architecture

The client should be built as modular gameplay systems rather than one monolithic scene file.

28.1 App Shell

Responsible for:

title screen
class selection
play button
end-of-match screen
settings access
28.2 Networking Module

Responsible for:

connecting to Colyseus
joining and leaving rooms
receiving state patches
receiving one-shot events
reconnect handling if later added
28.3 Input Module

Responsible for:

keyboard state
mouse world targeting
fire intent
ability input
building compact input packets
28.4 Game Scene Module

Responsible for:

Three.js scene creation
camera setup
water plane
environment objects
lighting
render loop
28.5 Entity View Module

Responsible for:

mapping server entities to visual objects
ship models
projectile visuals
spawn/despawn visuals
interpolation targets
28.6 HUD Module

Responsible for:

HP display
XP bar
level display
weapon cooldowns
kill feed
alerts and warnings
28.7 Audio Module

Responsible for:

sound playback
spatial cues where appropriate
combat warnings
28.8 Effects Module

Responsible for:

explosions
water splashes
trails
muzzle flashes
hit effects
29. Client Data Flow

The client flow should work like this:

Player inputs are sampled every frame.
Input state is normalized into a compact payload.
Input payload is sent to the server.
Server returns authoritative state patches.
Client receives state changes.
Visual entities update target transforms.
Rendering interpolates toward those targets.
HUD reflects authoritative gameplay state.
Effects respond to server events.

This separation helps prevent state confusion and keeps client code clean.

30. Rendering Architecture
30.1 Render Loop

Client rendering runs independently of the server using requestAnimationFrame.

30.2 Render Rate Goal

Target client visual smoothness:

approximately 60 FPS where possible
30.3 Camera

The MVP uses a top-down or slightly angled top-down camera that prioritizes tactical readability.

30.4 Visual Style

The rendering style should be simple and readable rather than photorealistic. Water, ship silhouettes, wake lines, projectile trails, and explosions matter more than fine texture realism.

31. Synchronization and Interpolation
31.1 Server Tick

The server simulation runs at 20 Hz.

31.2 Why 20 Hz

20 Hz is the chosen MVP simulation rate because it is:

easier to stabilize
lower in bandwidth cost
sufficient for ship-like movement
compatible with client interpolation
31.3 Client Interpolation

Because 20 Hz updates are too sparse to render directly, the client should interpolate visual state between authoritative updates.

31.4 Visual Smoothing Strategy

Each remote entity should store:

last confirmed state
target state
current render state

The render state should smoothly move toward the target state.

31.5 Correction Philosophy

Server corrections should be visually smoothed whenever possible, except for major discrete events like:

respawn
instant destruction
entity creation / removal
32. Backend Architecture
32.1 Server Framework

Use Colyseus for authoritative room-based multiplayer.

32.2 Room Model

Each active match is one Colyseus room.

A room owns:

all players in the match
the world state
the simulation loop
the match timer
score tracking
respawn logic
32.3 Room Lifecycle
room created
players join until full or until timeout rules are met
room simulates continuously
room ends when match timer expires
results shown
room is disposed when empty or complete
33. Server-Side System Modules

The room should delegate actual logic to explicit simulation systems.

33.1 Movement System

Responsibilities:

apply throttle intent
apply rudder intent
compute heading changes
update position and speed
handle basic collision response
33.2 Weapon System

Responsibilities:

validate firing requests
check cooldowns
check firing arcs
spawn offensive entities or fire events
33.3 Missile System

Responsibilities:

update missile movement
update homing behavior
lifetime expiration
collision checks
33.4 Torpedo System

Responsibilities:

update torpedo movement
simple guidance or straight run
collision and detonation
33.5 Defense System

Responsibilities:

detect incoming threats
decide if SAM can engage
decide if CIWS / close defense can engage
produce intercept outcomes
33.6 Collision System

Responsibilities:

ship vs island
projectile vs island
missile / torpedo vs ship
radius-based impact checks
33.7 Damage System

Responsibilities:

apply damage
trigger destruction
[AENDERUNG 2026-04-07] notify kill attribution (assist attribution not in MVP)
33.8 Progression System

Responsibilities:

award XP
level up ships
apply stat scaling
unlock level-gated abilities
33.9 Respawn System

Responsibilities:

manage death timers
select valid spawn points
reset player to level 1 state
33.10 Match System

Responsibilities:

timer
score tracking
match completion
result ordering
34. Authoritative Simulation Model
34.1 Core Rule

Clients do not decide gameplay outcomes.

34.2 What the Client Is Allowed to Do

The client may:

request movement intent
request fire intent
render predictions lightly
play local non-authoritative effects
34.3 What Only the Server Decides

The server decides:

real ship positions
valid shots
valid firing arcs
hits
interceptions
damage
kills
XP and levels
spawn positions
34.4 Benefits

This is essential for:

stability
fairness
anti-cheat foundations
consistent multiplayer outcomes
35. Simulation Tick Order

A consistent tick order should be enforced every server frame.

Recommended Order
collect newest player inputs
validate player states
update ship movement
process fire requests
spawn missiles / torpedoes / artillery events
update defensive systems
update moving weapon entities
process collisions
apply damage and destruction
award score and XP
process level-ups
process respawns
emit relevant events
finalize state patching

This deterministic ordering simplifies debugging and reduces simulation ambiguity.

36. Entity Model
36.1 Core Entity Types

At minimum, the simulation should support:

Player
Ship
Missile
Torpedo
Artillery impact or shell representation
Island / obstacle
36.2 Player vs Ship Separation

These should be separate concepts.

Player should hold:

player ID
connection/session info
class choice
score
XP
level
input state

Ship should hold:

position
heading
speed
HP
cooldowns
weapon systems
defense state
geometry / collision shape

This separation keeps session logic and world logic clean.

37. Collision Architecture
37.1 Design Goal

Collision must be efficient, predictable, and easy to debug.

37.2 MVP Collision Shapes

Use simple shapes:

ships: circle or oriented rectangle
missiles: small circle
torpedoes: small circle
islands: simple polygons, circles, or boxes
explosions: radius check
37.3 Why Not Mesh Collision

Mesh collision is too expensive and unnecessary for this game. It adds complexity without meaningful gameplay value.

37.4 Collision Categories
ship vs island
ship vs boundary
missile vs ship
torpedo vs ship
projectile vs island
explosion radius vs nearby ships
37.5 Future Optimization Path

If needed later:

spatial grid
spatial hashing
sector partitioning

For 16 players, simple broad-phase approaches should be enough.

38. Weapon Simulation Architecture
38.1 Artillery Simulation

For MVP, artillery should use a simplified model:

fire request accepted by server
target or direction evaluated
shot spread applied
travel delay or pseudo-ballistic timing calculated
impact generated

This keeps artillery lightweight while preserving feel.

38.2 Missile Simulation

Missiles are explicit world entities with:

owner
position
heading
speed
target reference or target vector
guidance responsiveness
lifetime
damage
38.3 Torpedo Simulation

Torpedoes are similar to missiles but should feel slower and more committed.

38.4 Defensive Intercept Logic

Defensive weapons should primarily operate as logical systems rather than spawning hundreds of physical bullets.

Meaning:

detect incoming missile in range and arc
validate cooldown and readiness
roll or calculate intercept result
emit visual intercept event if successful

This is far more efficient than simulating every CIWS round.

39. Networking Model
39.1 Communication Protocol

Use Colyseus state synchronization over WebSockets.

39.2 Client-to-Server Messages

The client should send compact input and action messages such as:

throttle state
rudder state
aim angle or aim point
primary fire intent
secondary fire intent
ability intent
39.3 Server-to-Client Data Types

Two main categories:

Persistent State

Used for things that exist over time:

positions
health
cooldowns
levels
scores
One-Shot Events

Used for temporary moments:

ship destroyed
missile launched
interception success
level-up
respawn
match end
39.4 Why State and Events Must Be Split

Trying to encode every one-shot effect into persistent state makes the game harder to reason about and more bandwidth-heavy.

40. Join, Leave, and Match Admission
40.1 Quick Join Model

The MVP should use a very simple quick-join flow.

When a player presses Play:

server checks for an open room of the selected mode
if a room has capacity, player joins it
if not, create a new room
40.2 Join in Progress

Players are allowed to join ongoing matches.

40.3 Leave Handling

If a player leaves voluntarily:

remove them from room state
despawn or destroy their ship
keep match running
40.4 Disconnect Handling

For MVP, a disconnect may be treated as immediate leave. A reconnect grace period can be added later.

41. Persistence Model
41.1 MVP Persistence

Minimal or none.

Possible local persistence only:

chosen player name
selected class preference
settings
41.2 Not Persistent in MVP
match XP between sessions
progression unlocks
account-based ship upgrades
ranked history
41.3 Reasoning

This keeps the scope focused on making the core combat loop work first.

42. Anti-Cheat Foundations
42.1 MVP Anti-Cheat Goal

Not full anti-cheat coverage, but a solid foundation through server authority.

42.2 Required Validation Rules

The server must validate:

cooldowns
firing arcs
weapon ranges
spawn validity
level progression
damage outcomes
42.3 Key Rule

The client never gets to say:

“I hit this target”
“I am at this position”
“I leveled up”
“this missile intercepted”

Only the server can decide these outcomes.

43. Scalability Strategy
43.1 MVP Target

Stable 16-player matches.

43.2 Future Goal

Architecture should later support:

more simultaneous rooms
more total players across the service
eventual experiments with larger matches
43.3 What This Means Technically

The codebase should avoid hard-coding assumptions that block:

room creation at scale
modular simulation systems
future broad-phase optimization
future interest management
43.4 Important Constraint

Each room should remain fully authoritative on one server process. This keeps each match self-contained and greatly simplifies logic.

44. Deployment Architecture
44.1 MVP Deployment Model

A simple deployment is sufficient:

static frontend hosting
dedicated Node.js server for Colyseus
websocket-capable host
44.2 Operational Needs
uptime monitoring
logs for room lifecycle
logs for exceptions
basic metrics such as active rooms and active players
44.3 Recommended Logging Targets
room create / dispose
player join / leave
match start / end
deaths and kills
simulation warnings
unexpected tick duration spikes
45. Observability and Debugging
45.1 Importance

Multiplayer debugging is difficult. Instrumentation must be planned early.

45.2 Server Metrics to Track
active rooms
players per room
simulation tick time
number of missiles and torpedoes
errors per room
45.3 Client Debug Overlay (Dev Only)

Useful values:

FPS
ping
room ID
player ID
active entities
interpolation delay
local aim angle
current speed and rudder state
46. Non-Functional Requirements
46.1 Performance
stable simulation at 20 Hz server-side
acceptable performance in browser at common desktop resolutions
client rendering should target ~60 FPS where possible
46.2 Stability
join/leave must not break rooms
one player disconnect must not crash a match
invalid client fire requests must be safely rejected
46.3 Readability
combat clarity is mandatory
effects must support gameplay understanding
UI must communicate weapon availability and threats
46.4 Maintainability

The codebase must be modular. Avoid giant files mixing networking, rendering, and game rules.

47. Recommended Project Structure
47.1 Client Structure
client/
  src/
    app/
      screens/
      state/
    game/
      scene/
      camera/
      entities/
      effects/
      audio/
      input/
      network/
      hud/
      utils/
    assets/
47.2 Server Structure
server/
  src/
    rooms/
    matchmaking/
    simulation/
      entities/
      systems/
      math/
      config/
      helpers/
    utils/
47.3 Suggested Server Systems
simulation/
  systems/
    movementSystem.ts
    weaponSystem.ts
    missileSystem.ts
    torpedoSystem.ts
    defenseSystem.ts
    collisionSystem.ts
    damageSystem.ts
    progressionSystem.ts
    respawnSystem.ts
    matchSystem.ts
48. Development Phases
Phase 1 – Offline Playable Prototype

Goals:

ship movement
camera and rendering
artillery prototype
basic missile prototype
simple island collision
Phase 2 – Multiplayer Skeleton

Goals:

Colyseus room
join/leave flow
server-authoritative movement
state sync and interpolation
Phase 3 – Core Combat

Goals:

artillery firing
missile firing
torpedo baseline
damage, death, respawn
score tracking
Phase 4 – Defensive Systems and Progression

Goals:

SAM logic
CIWS logic
XP system
level-up logic
ability unlocks
Phase 5 – UX and Polish

Goals:

HUD refinement
sounds
hit feedback
kill feed
match-end screen
Phase 6 – Balancing and Stabilization

Goals:

class differentiation tuning
arc tuning
cooldown tuning
spawn fairness
performance optimization
49. MVP Acceptance Criteria

The MVP is successful when all of the following are true:

A player can open the game, select a class, and join a live room.
Up to 16 players can coexist in the same match.
Join and leave events do not break the room.
Ship movement feels weighted and ship-like.
Weapon aim and firing feel responsive.
Firing arcs meaningfully affect gameplay.
Artillery, missiles, and torpedoes all function in a stable way.
SAM and CIWS-style defenses visibly and mechanically work.
Players gain XP, level up, and receive stat increases.
On death, players reset to level 1 and respawn cleanly.
The HUD clearly communicates health, level, XP, cooldowns, and match state.
[AENDERUNG 2026-04-07] A full 5-minute debug match can be completed without systemic instability.
50. Risks and Mitigations
Risk 1: Combat feels good but movement feels bad

Mitigation: prototype movement first and tune inertia before expanding content.

Risk 2: Networked movement looks jittery

Mitigation: build interpolation early and keep server ownership strict.

Risk 3: Missile systems become too complex too early

Mitigation: begin with simple homing logic and logical interception.

Risk 4: Codebase becomes monolithic

Mitigation: enforce module boundaries from day one.

Risk 5: High-level players become unstoppable

Mitigation: keep progression meaningful but bounded and reset on death.

51. Future Expansion Opportunities

Not for MVP, but supported by architecture if possible:

team-based modes
multiple maps
larger player counts
radar / sensor layers
electronic warfare
subsystem damage
persistent progression
ship unlocks
class-specific loadouts
ranked play
52. Final Product Statement

BattleFleet-Arena should deliver a multiplayer naval combat experience that is easy to jump into, satisfying to master, and technically stable enough to serve as the foundation for a much larger game later.

The MVP succeeds if it proves three things:

ship movement can feel heavy and believable without slowing the game down too much
naval weapon systems can be translated into readable, exciting arcade combat
a browser-based authoritative multiplayer architecture can support stable and fun 16-player matches

53. Code-Review-Status (Stand: 2026-04-07)

Hinweis:
Diese Sektion dokumentiert den aktuellen Umsetzungsgrad des Codes gegenüber diesem PRD und benennt Abweichungen sowie Redundanzen. Sie ist bewusst technisch gehalten und dient als Working-Agreement für nächste Iterationen.

53.1 Gesamtfazit

Der Kern der MVP-Architektur ist vorhanden:

server-authoritative Simulation mit Colyseus-Room
gewichtete Ship-Movement-Logik
Artillery, ASWM und Torpedo im Live-Tick
Layered Air Defense (SAM/CIWS) gegen Missiles
Respawn + Spawn-Protection
HUD, VFX, Audio und Interpolation im Client

Die wichtigsten Abweichungen zum PRD sind aktuell:

[AENDERUNG 2026-04-07] Assist-Scoring bewusst gestrichen (Designentscheidung)
[AENDERUNG 2026-04-07] Matchdauer temporaer 5 Minuten (Debug-Tuning; spaeter hochsetzen)
[AENDERUNG 2026-04-07] Spawn-Protected Spieler duerfen weiterhin feuern (bewusste Regel)
[AENDERUNG 2026-04-07] Artillery ignoriert Insel-Blocking bewusst; SSM/Torpedos werden weiterhin von Inseln abgefangen
HUD-Readability fuer Arc/Lock/Incoming-Threat noch nicht vollstaendig

53.2 PRD-Mapping: Was umgesetzt ist und was abweicht

26/27/32/34 (Authoritative Architecture, System Decomposition)
Status: Weitgehend erfuellt
Kommentar:
`server/src/rooms/BattleRoom.ts` simuliert serverseitig Bewegung, Schuesse, Treffer, Schaden, Respawn und Match-Timer. Client sendet Input-Intent und rendert autoritative States.

8/40 (FFA, Join-in-Progress, Room Lifecycle)
Status: Teilweise erfuellt
Kommentar:
`joinOrCreate("battle")`, `maxClients=16`, laufende Matches sind beitretbar.
Abweichung: `playAgain` kann von jedem Client ausgelöst werden (`BattleRoom.onMessage("playAgain")`), ohne Voting/Host-Gate.

12/33.1 (Ship Movement Model)
Status: Erfuellt
Kommentar:
`stepMovement`, `smoothRudder` und Klassen-/Level-Skalierung sind aktiv und PRD-nah.

13/14/15/16/33.2-33.5/38 (Weapons + Defense)
Status: Weitgehend erfuellt
Kommentar:
Artillery, ASWM und Torpedo sind implementiert; SAM/CIWS arbeitet als logische Interception-Layer.
[AENDERUNG 2026-04-07]:
Kein Gap mehr: Artillery-Island-Blocking ist bewusst deaktiviert (Designentscheidung).
Wichtig: Island-Blocking bleibt fuer SSM/Torpedos aktiv und gewuenscht.

18 (Firing Arcs / Dead Zones)
Status: Teilweise erfuellt
Kommentar:
Arc-Checks existieren (v. a. Forward-Arc).
Abweichung:
Das PRD-Zielbild mit klar getrennten sektorspezifischen Weapon-Arcs (bow/stern/side pro System) ist noch nicht voll umgesetzt.

20/8.5 (Score, Kills, Assists)
Status: Erfuellt nach aktueller Produktentscheidung
Kommentar:
Kill-Scoring ist vorhanden.
[AENDERUNG 2026-04-07]:
Assist-Attribution und Assist-Score sind bewusst aus dem Scope entfernt.

10/33.8 (In-Match Progression)
Status: Erfuellt mit Balancing-Abweichung
Kommentar:
Level- und XP-System pro Leben ist vorhanden, inklusive Reset auf Tod.
Abweichung:
XP-Kurve in `shared/src/progression.ts` weicht von den PRD-Beispielwerten ab (Tuning-Drift).

22 (Spawn/Respawn/Protection)
Status: Erfuellt nach aktueller Produktentscheidung
Kommentar:
Respawn-Delay + Spawn-Schutz existieren.
[AENDERUNG 2026-04-07]:
`shared/src/playerLife.ts` erlaubt Weapon-Use in `spawn_protected` via `canUsePrimaryWeapon`; diese Regel bleibt bewusst bestehen.

23 (HUD Clarity)
Status: Teilweise erfuellt
Kommentar:
HP, Level, XP, Cooldowns, Matchzeit, Score/Kills und Life-State sind sichtbar.
Abweichung:
Explizite Anzeige fuer in-arc/out-of-arc, lock/target-indicator und klare incoming-threat-Warnung ist noch nicht vollstaendig (`client/src/game/hud/cockpitHud.ts`).

24 (Audio/Feedback)
Status: Erfuellt
Kommentar:
Primary/Missile/Torpedo/Impact/Interception-Feedback ist in Audio- und FX-Pipelines vorhanden.

31 (Sync/Interpolation)
Status: Erfuellt mit Inkonsistenzrisiko
Kommentar:
Ship-Interpolation ist gut umgesetzt (`client/src/game/network/remoteInterpolation.ts`).
Abweichung:
Entitaeten-Typen werden unterschiedlich geglaettet (Ships vs Missiles/Torpedos), was bei Latenz visuelle Inkonsistenz verursachen kann.

49 (MVP Acceptance)
Status: Groesstenteils erreicht, aber noch nicht voll PRD-konform
Offene Punkte bis "voll erfuellt":

[AENDERUNG 2026-04-07] Assist-System ist kein offener Punkt mehr (bewusst gestrichen)
[AENDERUNG 2026-04-07] Matchdauer bleibt vorerst 5 Minuten aus Debuggruenden
[AENDERUNG 2026-04-07] Spawn-Protection-Fairness-Regel ist bewusst so belassen
HUD-Clarity fuer Arc/Lock/Threat

53.3 Doppelte/parallele Funktionen und Wartungsrisiken

Wichtig: Es gibt keine katastrophale Duplizierung, aber mehrere Drift-Hotspots.

1) Spawn-/Reset-Logik mehrfach aehnlich implementiert
Betroffen:
`BattleRoom.onJoin`
`BattleRoom.resetMatchForNewRound`
`BattleRoom.performRespawn` (Fallback-Zweig)
Risiko:
Kleine Spawn-Regel-Aenderungen muessen an mehreren Stellen konsistent nachgezogen werden.

2) Hit-/Damage-/Kill-Pfade pro Weapon-Typ parallel aufgebaut
Betroffen:
`resolveShellImpacts`
`stepMissiles`
`stepTorpedoes`
Risiko:
Regel-Drift zwischen Weapon-Typen (z. B. Attribution, Resistenz, Event-Timing).

3) Sehr aehnliche Spawn-Helfer in Shared
Betroffen:
`spawnAswmFromFireDirection` (`shared/src/aswm.ts`)
`spawnTorpedoFromFireDirection` (`shared/src/torpedo.ts`)
Risiko:
Bugfixes an Fire-Direction/Heading werden leicht nur in einem Pfad umgesetzt.

4) Insel-Punktpruefung funktional doppelt vorhanden
Betroffen:
`pointInAnyIsland` (`shared/src/artillery.ts`)
`isInsideAnyIslandCircle(..., objectRadius=0)` (`shared/src/islands.ts`)
Risiko:
Kleine Geometrie-Unterschiede koennen spaeter zu inkonsistentem Verhalten fuehren.

5) Client-Visual-Ensure defensiv doppelt
Betroffen:
OnAdd-Bindings plus frameweises Ensure in Visual-Runtime/Main-Loop.
Risiko:
Unnoetige Komplexitaet und potenzielle Doppelarbeit bei großen Rooms.

53.4 Priorisierte Abweichungen (Severity)

Hoch

[AENDERUNG 2026-04-07] Keine offenen High-Severity-Gaps aus den bewusst getroffenen Produktentscheidungen

Mittel

[AENDERUNG 2026-04-07] Matchdauer 5 statt 12 Minuten ist temporaeres Debug-Tuning (`shared/src/match.ts`)
[AENDERUNG 2026-04-07] Artillery ohne Insel-Blocking ist bewusstes Design; SSM/Torpedo-Island-Blocking bleibt aktiv
HUD-Clarity-Luecken (Arc/Lock/Threat)

Niedrig

Mehrere redundante/parallel gepflegte Hilfsfunktionen (Shared + Server + Client)

53.5 Empfohlene naechste Schritte (in Reihenfolge)

1) PRD-Pflege:
[AENDERUNG 2026-04-07] Assist-Scoring wurde in den Basis-Kapiteln konsistent entfernt/markiert.

2) Match-Tuning:
Matchdauer nach Debug-Phase wieder auf Zielwert hochsetzen.

3) Readability:
HUD um Arc-/Lock-/Threat-Indikatoren erweitern.

4) Refactor:
Gemeinsame Helper fuer Spawn-Logik, Weapon-Hit-Pfad und FireDirection-Spawn extrahieren.

5) Konsistenz:
Die bewusste Regel "Artillery ohne Island-Blocking, SSM/Torpedo mit Island-Blocking" klar in den Weapon-Kapiteln verankern.