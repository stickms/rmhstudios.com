Neon Driftway – Multiplayer Update v2.0

Version: 2.0
Scope: Real-time multiplayer racing with abilities
Platform: Browser (Next.js + Canvas + WebSocket server already exists)
Networking: Existing WebSocket infrastructure reused

0. High-Level Overview

Neon Driftway is evolving from a single-player arcade survival racer into a real-time competitive multiplayer racing experience.

New Core Features:

Multiplayer Lobby System

Real-time synced racing

Top-right live scoreboard

New pickup: “Slowdown”

Ability system (one ability for v1)

Improved road visuals (Level 1 overhaul)

Background upgrade (non-gradient)

Constraints:

Preserve single-player mode

Preserve deterministic core loop

Minimize server bandwidth

Avoid full server authoritative physics (for now)

Keep code modular

1. Multiplayer Architecture

We will use a Client-Predicted + Server-Synced Hybrid Model

1.1 Authority Model

Each client simulates its own car locally (authoritative over self)

Server relays:

Player position snapshots

Speed

Score

Ability activations

Server is authoritative over:

Ability targets

Slowdown application timing

Lobby state

Game start countdown

Player disconnects

We are NOT implementing full server-authoritative collision yet.

2. Networking Model

Reuse existing WebSocket connection layer.

Assume:

You already have ws.send(...)

You already have message routing logic

We add a namespace for Neon Driftway:

Event types:

ndw:joinLobby
ndw:lobbyState
ndw:startGame
ndw:playerUpdate
ndw:scoreUpdate
ndw:abilityUsed
ndw:slowdownApplied
ndw:gameOver
ndw:playerDisconnected

All NDW events are prefixed ndw:.

3. Lobby System
3.1 Lobby Flow

Player clicks "Multiplayer"

Player enters name

Player joins lobby room

Lobby shows:

Player list

Ready status

Host indicator

Host clicks "Start"

3-second synchronized countdown

Game begins simultaneously

3.2 Lobby Data Model
interface NDWLobbyPlayer {
  id: string;
  name: string;
  ready: boolean;
  isHost: boolean;
}

interface NDWLobbyState {
  roomId: string;
  players: NDWLobbyPlayer[];
  gameStarted: boolean;
}
3.3 Lobby UI Requirements

Add new UI state:

'multiplayerMenu'
'lobby'
'multiplayerPlaying'

Lobby Screen Displays:

Player list (left column)

Ready toggle

Host Start button

Leave lobby

Host = first player in room.

4. Multiplayer Game Sync
4.1 Player State Broadcast

Every 100ms (10 Hz), send:

{
  type: "ndw:playerUpdate",
  x,
  speed,
  distance,
  score,
  lane,
  timestamp
}

DO NOT send:

Obstacles

Full physics state

RNG seeds

Other players are rendered as:

Simplified remote cars

No obstacle interaction client-side

Their cars do not collide with your obstacles

4.2 Remote Player Rendering

In renderer:

Add remotePlayers: Map<string, RemoteCar>.

Draw:

Remote cars semi-transparent

No physics applied

No collisions

Slight interpolation between snapshots

5. Multiplayer Scoreboard
5.1 Location

Top-right corner overlay.

5.2 Display

Live sorted list by score descending:

1. Sohum — 21,340
2. Alex — 20,990
3. Maria — 18,120

Update every time:

scoreUpdate received

playerUpdate received

5.3 Score Sync Strategy

Clients compute score locally.
Every 500ms send scoreUpdate.

Server relays to all.

Server does not recompute score (v1 trust-based).

6. Ability System – v1 (Slowdown)
6.1 New Pickup Type

Add new obstacle type:

'ability_slowdown'

Template:

Purple glowing orb

Non-damaging

On pickup → increment ability meter

6.2 Ability Storage

Each player:

abilityCharges: number
maxAbilityCharges: 3
6.3 Using Ability

Keybind:

Press E to activate slowdown ability.

Conditions:

abilityCharges > 0

Multiplayer only

Not already in cooldown

On press:

Send ndw:abilityUsed to server.

Server:

Picks random target (excluding sender)

Sends ndw:slowdownApplied to all clients

6.4 Slowdown Effect

When client receives ndw:slowdownApplied:

If target === me:

Apply:

maxSpeed *= 0.6

last 3000ms

Visual indicator (blue tint overlay)

Speed clamp enforced

After 3000ms:

Restore max speed

6.5 Fairness Rules

Cannot target self

Cannot stack multiple slowdowns

If already slowed → ignore new slowdown

7. Multiplayer Game State

Add new fields to Game class:

isMultiplayer: boolean
remotePlayers: Map<string, RemoteCar>
abilityCharges: number
isSlowed: boolean
slowUntil: number
8. Road Visual Upgrade (Level 1)
8.1 Replace Plain Gradient

Instead of:

Solid background gradient

Add:

Subtle moving asphalt texture

Slight horizontal noise pattern

Road shoulder details

8.2 Road Improvements

Add dashed lane glow

Add subtle shadow under player car

Add tire skid marks occasionally

Add side guardrails

Add depth illusion via slight narrowing toward top

Implementation:

Use trapezoid perspective for road

Draw repeating asphalt texture via offscreen canvas

Scroll based on speed

9. Background Upgrade (Level 1)

Replace gradient with:

Low-poly skyline silhouette

Parallax city lights

Slow-moving distant mountains

Layers:

Far mountains (slow scroll)

Mid buildings (medium scroll)

Near lights (fast scroll)

Use simple vector shapes for v1.

10. Multiplayer Game Flow

Game state transitions:

menu
multiplayerMenu
lobby
countdown
multiplayerPlaying
gameOver

Single-player unchanged.

11. Server-Side Requirements

Server must:

Maintain rooms

Track players per room

Relay playerUpdate

Relay scoreUpdate

Handle abilityUsed

Randomly select target for slowdown

Broadcast slowdownApplied

Handle disconnect

12. Disconnection Handling

If player disconnects:

Remove from remotePlayers

Remove from scoreboard

Broadcast ndw:playerDisconnected

If only one player remains:

End game early OR allow continue solo

13. Performance Constraints

Network tick: 10 Hz for position

Score tick: 2 Hz

Ability events: instant

Max players per lobby: 6 (v1)

14. Anti-Cheat (Lightweight)

Server ensures:

Cannot use ability if no charges

Cannot spam ability

Clients:

Ignore slowdown if not target

Future: server authoritative scoring.

15. UI Additions
15.1 Multiplayer Menu

Buttons:

Join Lobby

Create Lobby

Back

15.2 Lobby Screen

Player list

Ready toggle

Start button (host only)

Leave

15.3 In-Game Multiplayer HUD

Top Right:

Scoreboard

Bottom Left:

Ability charge indicator

Cooldown bar

When slowed:

Blue overlay flash

"SLOWED!" text briefly

16. Ability Pickup Spawn

Spawn rules:

Only in multiplayer

Lower weight than boost

Weight 3

MinElapsed: 10s

Guarantee at least once every 15s

17. Rendering Remote Cars

Remote cars:

No hitbox

Slight transparency (0.8 alpha)

Name label above car

18. Interpolation

When playerUpdate received:

Store snapshot

Interpolate x over 100ms window

Prevent jitter

19. Multiplayer End Conditions

Game ends when:

All players crash
OR

Timer ends (2 min) and no endless

Show multiplayer result screen:

Sorted ranking

Highlight winner

20. Road + Background Technical Implementation

Create new renderer methods:

drawRoadPerspective()
drawAsphaltTexture()
drawSkyline()
drawParallaxLayer()

Use:

Offscreen canvas for asphalt pattern

Translate scroll by speed

Slight scale change toward horizon

21. Acceptance Criteria

Multiplayer lobby works

2 players can race

Scoreboard updates live

Slowdown ability works

Road looks improved

Background no longer plain gradient

Level 3 lighting unchanged (headlight system preserved)