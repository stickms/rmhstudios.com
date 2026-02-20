# specs.md — REDLINE (Browser) — 3-Level Endless Highway Racer w/ Leaderboards
Version: 1.0
Owner: RMH STUDIOS
Platform: Browser (Desktop focus)
Tech: HTML/CSS/TypeScript (Vite) + Canvas 2D (no WebGL), optional Express server for leaderboards
Input: Keyboard (W/A/D + optional Shift/S/Esc)
Target FPS: 60
Resolution: Responsive (scale-to-fit), fixed internal render size
Accessibility: Reduced motion toggle, colorblind-friendly UI option

> NOTE FOR CURSOR:
> This specs.md is intentionally exhaustive and “implementation-ready”.
> If you need more line volume, expand the “DATA TABLES” sections (obstacles, cars, patterns) by duplicating templates.
> Keep code modular and testable. Avoid Unity. This is a browser-only game.

---

## 0) Quick Summary (One Paragraph)
REDLINE is a 2D top-down (or slight-tilt) endless highway survival racer. The player holds **W** to accelerate, and steers left/right with **A/D**. The world scrolls downward relative to the car to simulate constant forward travel. The objective is to survive through **three distinct levels** (each with unique hazards) while maximizing score. Each level has its own **leaderboard** storing top runs (score + time + distance) per level. The game emphasizes tight controls, readable hazard telegraphing, fair procedural generation (no impossible spawns), and instant restarts.

---

## 1) Goals and Non-Goals

### 1.1 Goals
- Desktop browser game that feels responsive and “arcade-tight”
- Simple controls: W accelerate, A/D steer, with optional S brake, Shift boost
- Three levels with distinct themes + mechanics + scoring rules
- Leaderboards per level with persistent storage (server-backed preferred)
- Fair procedural generation with deterministic seeding per run (for debugging)
- Smooth UI transitions, fast restart loop, minimal friction

### 1.2 Non-Goals
- No Unity, no native builds
- No multiplayer racing in real-time (leaderboard only)
- No heavy physics simulation (keep it arcade)
- No complex account system at v1 (anonymous handle + rate limiting)

---

## 2) Game Pillars
1) **Control clarity**: steering and acceleration feel predictable
2) **Readability**: hazards are telegraphed; the player can “see why they died”
3) **Fairness**: procedural spawns never create unavoidable collisions
4) **Replay loop**: instant restart + per-level leaderboard encourages improvement

---

## 3) Core Loop
1) Player chooses a level (1/2/3)
2) Countdown: 3..2..1..GO
3) Drive, avoid obstacles, earn score
4) Difficulty ramps by time + speed tier
5) Crash or HP depletion → Game Over
6) Enter name/handle (or reuse last)
7) Submit run to leaderboard
8) Show stats + “Restart” (same level) + “Next level” (if unlocked)

---

## 4) Player Controls & Feel

### 4.1 Default Controls
- W: accelerate (hold)
- A: steer left (hold)
- D: steer right (hold)
- S: brake (hold) [optional but recommended]
- Shift: boost (hold) [optional, limited meter]
- Esc: pause
- Enter: confirm in menus
- R: restart after game over

### 4.2 Input Handling Requirements
- Use event listeners on keydown/keyup
- Maintain `inputState` booleans per key
- Prevent repeat issues: on keydown, set true; on keyup, set false
- Ignore input when typing in name input field (leaderboard submit modal)

### 4.3 Movement Model (Arcade)
- Car position: x only (lateral); y fixed near bottom of screen
- Road scroll speed = player speed (v)
- Steering influences x velocity, with smoothing:
  - `vx = lerp(vx, targetVx, steerResponsiveness * dt)`
  - `targetVx = steerInput * steerMaxSpeed * steerScaleBySpeed(v)`
- Speed influences steering difficulty: at high v, steering is slightly less sharp (level-specific)

### 4.4 Speed Model
- `v` increases when W held: `v += accel * dt`
- `v` decreases when W released: `v -= coastDecel * dt`
- `v` decreases when S held: `v -= brakeDecel * dt`
- Clamp: `vMin <= v <= vMax`
- Optional boost: while Shift held and boostMeter > 0:
  - `v += boostAccel * dt` (or multiply v)
  - `boostMeter -= boostDrain * dt`
  - regen only when not boosting and below threshold

### 4.5 Collision Model
- Use AABB collision for simplicity
- Car collider slightly smaller than sprite (for fairness)
- Obstacles have hitboxes defined in data tables

---

## 5) Levels Overview (Three Levels)

### 5.1 Level 1: “Sunset Freeway” (Intro / Clean)
Theme: clear visibility, moderate traffic
Hazards:
- Cones (static)
- Road blocks (static)
- Slow cars (moving downward slower than world scroll, appears to drift upward relative player)
Unique mechanic:
- “Close Call” bonus is generous to teach risk/reward
Difficulty:
- Gentle ramp; fewer lateral-moving hazards

### 5.2 Level 2: “Rainline” (Reduced Grip)
Theme: rainy highway, reflections, slightly slippery steering
Hazards:
- Puddles (reduce steering for a short duration)
- Hydroplane strips (brief lateral drift)
- Traffic cars + occasional lane-changers
Unique mechanic:
- Grip system: `gripMultiplier` changes steering responsiveness
Difficulty:
- Moderate ramp; obstacles spawn denser; visibility slightly reduced

### 5.3 Level 3: “Night Circuit” (Low Visibility + Aggressive Traffic)
Theme: dark neon, headlight cone visibility
Hazards:
- Debris clusters (irregular hitboxes)
- Aggressive cars that change lanes toward player (telegraphed)
- Light-flicker segments that reduce view range
Unique mechanic:
- Headlights: obstacles outside cone fade; reaction time is limited
Difficulty:
- Hard ramp; high-speed tiers introduce “pattern sets” requiring precise weaving

---

## 6) Progression & Unlocking
- Initially unlocked: Level 1
- Level 2 unlock: survive Level 1 for 120 seconds OR reach distance threshold D1
- Level 3 unlock: survive Level 2 for 150 seconds OR reach distance threshold D2
- Debug mode: allow unlock all (dev flag)

---

## 7) Scoring & Stats

### 7.1 Run Stats Captured
- `score` (integer)
- `timeSurvivedMs`
- `distance` (float or integer meters)
- `avgSpeed`
- `maxSpeed`
- `closeCalls` count
- `nearMissStreakMax`
- `levelId`
- `seed` (for reproduction)
- `gameVersion`

### 7.2 Base Score Formula (General)
- Distance points: `distance * distanceMultiplier`
- Speed multiplier: `1 + (vNormalized * speedBonusFactor)`
- Close call bonus: `closeCalls * closeCallPoints`
- Streak multiplier: `1 + min(streak, streakCap) * streakStep`

### 7.3 Close Call Definition
A close call occurs when:
- An obstacle passes within `closeCallRadius` of car collider without collision
- Must be moving past the car (avoid repeated triggers)
Implementation:
- Track obstacles as they cross a “y trigger line” near car
- If their min distance to car at crossing < threshold → close call

### 7.4 Level-Specific Score Tweaks
- Level 1: closeCallPoints high; streak builds slowly
- Level 2: puddle survival bonus; penalize collisions if HP system exists
- Level 3: higher speed multipliers; aggressive-car dodges give big bonus

---

## 8) Health vs One-Hit Death
Choose one approach globally (recommended: HP for progression feel):
- HP Mode:
  - Car has HP=3 by default
  - Collision reduces HP by 1 (some hazards by 2)
  - Invincibility frames 600ms (blink)
  - On HP=0 → crash end
- One-Hit Mode:
  - Collision ends run immediately
  - Simpler but harsher
SPEC CHOICE FOR V1:
- Use HP=3 for Level 1 & 2
- Use HP=2 for Level 3 (harder)
- Allow “Hardcore” option later (one-hit)

---

## 9) Procedural Generation (Fairness-First)

### 9.1 Core Principles
- Never spawn an obstacle directly overlapping player
- Ensure at least one viable path exists across reaction window
- Difficulty scaling modifies density, speed, and complexity but stays fair

### 9.2 Spawn Zones
- Define road bounds: `roadLeft`, `roadRight`
- Option: lanes (3/4/5) OR free x-range
- For fairness, use lane-based spawning internally even if movement is smooth:
  - Obstacles spawn at lane centers with small random offset

### 9.3 Reaction Window
Define a minimum time-to-impact for new spawns:
- `minTTI = 1.1s` Level 1
- `minTTI = 0.9s` Level 2
- `minTTI = 0.75s` Level 3
Compute spawn Y so that at current relative speed, time until reaching car >= minTTI

### 9.4 Pattern System
Instead of pure random, use pattern “chunks”:
- Each chunk lasts 3–6 seconds
- Choose from a weighted list based on difficulty tier
- Example chunk: “Left weave cones”, “Center blockade + side car”, “Double lane change”

### 9.5 Deterministic RNG
- Use seeded RNG for each run:
  - `seed = timestamp XOR random` (client-side)
- RNG functions:
  - `randFloat()`, `randInt(a,b)`, `choiceWeighted(items)`
- Store seed in run stats for debugging and replay

---

## 10) Visuals (Canvas)

### 10.1 Render Setup
- Canvas internal resolution: 1280x720 (or 960x540)
- Scale canvas to fit window with letterboxing
- Maintain aspect ratio; show subtle background behind letterbox

### 10.2 Draw Order
1) Background (sky/gradient)
2) Road surface
3) Lane markings (scrolling)
4) Level-specific environment props (guardrails, signs)
5) Obstacles/traffic
6) Player car
7) Particles (sparks, rain)
8) UI overlay (speed, score, HP, meters)
9) Pause or modal overlays (leaderboard submit)

### 10.3 Performance Constraints
- Avoid per-frame allocations
- Use object pooling for obstacles and particles
- Use offscreen canvas for static sprites if needed
- Avoid expensive shadows; use simple alpha effects

---

## 11) Audio
- WebAudio API or HTMLAudio with pooling
- Sounds:
  - engine loop (pitch changes with speed)
  - boost
  - crash
  - close call whoosh
  - UI confirm/back
- Music:
  - Each level has a theme loop (toggleable)
- Settings:
  - master volume
  - music volume
  - SFX volume
  - mute toggle

---

## 12) UI/UX

### 12.1 Main Menu
- Title + Start
- Level Select (Level 1 available, others locked with requirements)
- Leaderboards button
- Settings
- Credits

### 12.2 Level Select
- Each card shows:
  - name
  - difficulty
  - best score (local + global if available)
  - unlock status
- Start button per level

### 12.3 In-Game HUD
- Top-left: Score, Distance
- Top-right: Speed, HP hearts
- Bottom: Boost meter (if enabled), Grip status (Level 2), Headlight indicator (Level 3)
- Small popup text for Close Call / Streak

### 12.4 Pause Menu
- Resume
- Restart Level
- Settings
- Quit to Menu

### 12.5 Game Over Screen
- Big “CRASHED” or “OUT”
- Stats breakdown:
  - Score
  - Distance
  - Time
  - Close Calls
  - Avg speed
- If score qualifies for leaderboard:
  - prompt name (3–16 chars)
  - Submit
- Buttons:
  - Restart
  - Level Select
  - View Leaderboard

---

## 13) Leaderboards (Three Levels)

### 13.1 Requirements
- Separate leaderboard for each level: L1, L2, L3
- Store top N (e.g., 50) per level
- Each entry includes:
  - `name`
  - `score`
  - `distance`
  - `timeMs`
  - `createdAt`
  - `clientVersion`
- Prevent obvious spam:
  - rate limit submissions per IP (server-side)
  - minimum run duration (e.g., 15s) before submit
  - basic validation: score ranges plausible

### 13.2 Architecture Options
A) **Server-backed (recommended)**
- Node/Express server with a small database (SQLite/Postgres)
- Endpoints:
  - `GET /api/leaderboard?level=1`
  - `POST /api/leaderboard` (submit)
B) **Client-only fallback**
- LocalStorage per level
- No global ranking, but still “best runs”

SPEC CHOICE FOR V1:
- Implement both:
  - Server-backed if `VITE_LEADERBOARD_URL` is set
  - Otherwise fallback to LocalStorage “Local Leaderboard”

### 13.3 Data Model (Server)
Table: `leaderboard_entries`
- id (uuid)
- levelId (int 1..3)
- name (text)
- score (int)
- distance (int)
- timeMs (int)
- createdAt (timestamp)
- version (text)
- seed (text nullable)
Indexes:
- (levelId, score DESC, timeMs ASC)

### 13.4 Sorting Rules
Primary: score descending
Secondary: timeMs descending (or ascending—choose one; recommend descending so longer survival breaks ties)
Tertiary: createdAt ascending

SPEC CHOICE:
- Secondary: `timeMs DESC` (if same score, longer survival ranks higher)

### 13.5 Client Submission Flow
- On game over:
  - compute run stats
  - if time < minSubmitTime (15s) → no submit
  - show “submit” UI
  - on submit:
    - sanitize name (alphanumeric + _- space), trim, max length 16
    - POST payload with run stats
  - refresh leaderboard view after success



---

## 14) Tech Stack & Repo Structure

### 14.1 Client
- Vite + TypeScript
- Canvas 2D
- Minimal CSS (or Tailwind if desired, but keep simple)
- State machine architecture

Suggested directories:
- `/src`
  - `/app`
    - `main.ts`
    - `router.ts` (if SPA routes)
    - `stateMachine.ts`
  - `/game`
    - `Game.ts`
    - `Loop.ts`
    - `World.ts`
    - `Renderer.ts`
    - `Input.ts`
    - `RNG.ts`
    - `Physics.ts`
    - `Collision.ts`
    - `Spawner.ts`
    - `Patterns.ts`
    - `Difficulty.ts`
    - `Audio.ts`
    - `Particles.ts`
  - `/data`
    - `levels.ts`
    - `obstacles.ts`
    - `patterns.ts`
    - `tuning.ts`
  - `/ui`
    - `Menu.ts`
    - `HUD.ts`
    - `LeaderboardView.ts`
    - `SettingsView.ts`
    - `GameOverModal.ts`
  - `/services`
    - `leaderboardClient.ts`
    - `storage.ts`
  - `/types`
    - `index.ts`

### 14.2 Server (Optional but recommended)
- `/server`
  - `index.ts` (Express)
  - `db.ts` (sqlite)
  - `schema.sql`
  - `rateLimit.ts`
  - `score.ts` (server scoring)
  - `validation.ts`

Env:
- Client:
  - `VITE_LEADERBOARD_URL` (optional)
- Server:
  - `PORT`
  - `DB_PATH`
  - `CORS_ORIGIN`

---

## 15) Game State Machine
States:
- BOOT
- MENU
- LEVEL_SELECT
- LOADING_LEVEL
- COUNTDOWN
- PLAYING
- PAUSED
- GAME_OVER
- LEADERBOARD_VIEW
- SETTINGS

Transitions:
- MENU -> LEVEL_SELECT
- LEVEL_SELECT -> LOADING_LEVEL
- LOADING_LEVEL -> COUNTDOWN
- COUNTDOWN -> PLAYING
- PLAYING -> PAUSED (Esc)
- PAUSED -> PLAYING
- PLAYING -> GAME_OVER (HP=0)
- GAME_OVER -> PLAYING (Restart)
- GAME_OVER -> LEVEL_SELECT
- ANY -> SETTINGS (button)
- SETTINGS -> previous

---

## 16) Difficulty Scaling Details

### 16.1 Difficulty Variables
- spawnRate (obstacles/sec)
- hazardMix weights (cones vs cars vs special)
- lateralMovementChance
- minGapBetweenObstacles
- minTTI (reaction window)
- speedTier thresholds

### 16.2 Speed Tiers
Tier 0: 0–25% vMax
Tier 1: 25–50%
Tier 2: 50–75%
Tier 3: 75–100%

Tier affects:
- steering scale
- spawn patterns allowed
- score multiplier

### 16.3 Level-Specific Tuning (High Level)
Level 1:
- spawnRate starts 0.6, ramps to 1.4
- lateralMovementChance low (0.05 -> 0.12)
Level 2:
- spawnRate starts 0.8, ramps to 1.7
- puddles introduced after 25s
Level 3:
- spawnRate starts 1.0, ramps to 2.1
- aggressive cars introduced after 35s
- reduced visibility always

---

## 17) Level Mechanics Implementation

### 17.1 Level 1 Mechanic: Close Call Teaching
- Close call radius increased by 10%
- On close call:
  - show popup “CLOSE CALL +X”
  - play whoosh
- Streak:
  - builds if close calls within 2.0s window

### 17.2 Level 2 Mechanic: Grip / Wet Surface
- `grip` default 1.0
- On puddle hit:
  - set `grip = 0.65` for 1.2s
  - steering responsiveness scaled by grip
  - visual: water splash
- Hydroplane strip:
  - apply lateral drift impulse for 0.4s (telegraph with shiny strip)

### 17.3 Level 3 Mechanic: Headlight Visibility
- Visibility cone from car:
  - angle ~ 50 degrees upward
  - length depends on speed (faster = slightly shorter effective reaction)
- Obstacles outside cone:
  - draw with low alpha (but not invisible)
- Light flicker zones:
  - 0.3s dim + 0.5s normal repeating
- Aggressive cars:
  - telegraph with blink signal 0.6s before lane change

---

## 18) Obstacles & Entities (Data-Driven)

### 18.1 Entity Types
- STATIC_OBSTACLE: cone, barrier
- TRAFFIC_CAR: moving obstacle with lane change behaviors
- SURFACE_HAZARD: puddle, hydroplane strip (affects handling)
- DEBRIS_CLUSTER: irregular shape, multiple hitboxes

### 18.2 Obstacle Definition Schema (TypeScript)
Each obstacle in `/src/data/obstacles.ts`:
- id: string
- type: enum
- spriteKey: string (optional)
- width, height
- hitbox: { insetX, insetY } or custom polygon list (optional)
- spawnWeightByLevel: [w1,w2,w3]
- minSpeedTier
- behavior: parameters per type
- scoreOnDodge (optional)
- damageOnHit (int)

### 18.3 Object Pooling
- Preallocate arrays for each type
- `active` boolean
- `reset()` to reuse

---

## 19) Traffic AI (Simple, Telegraph-First)

### 19.1 Behaviors
- KEEP_LANE: straight
- DRIFT: slow sinusoidal lateral motion
- SIGNAL_AND_CHANGE: blink then shift lanes
- CHASE_BIAS (Level 3): choose lane closer to player but only occasionally

### 19.2 Telegraph
- Blink indicator: small yellow flashes on the car edges
- Minimum telegraph time:
  - Level 2: 0.7s
  - Level 3: 0.6s
- Lane change completes over 0.35–0.5s easing

---

## 20) Road & Environment

### 20.1 Road Geometry
- Road is a rectangle area; edges have guardrails
- Lane markers scroll based on world scroll amount
- Optional gentle curves by offsetting lane centers over time:
  - “curve factor” changes target lane x positions
  - player still uses same steering

### 20.2 Environmental Props
- Non-colliding:
  - signs, lights, billboards
- Level 2 rain particles:
  - diagonal streaks
- Level 3 glow accents:
  - subtle neon outlines (not required)

---

## 21) Camera & Screen Shake
- Camera is fixed; optionally slight shake on collision
- Shake:
  - magnitude based on damage
  - duration 150–250ms
- Accessibility toggle: disable screen shake

---

## 22) Particles & Feedback
- Collision sparks
- Water splash
- Debris dust
- Speed lines at high tier
- Close call whoosh line effect

---

## 23) Settings
- Audio: master/music/sfx
- Graphics: particles on/off, shake on/off
- Accessibility: reduced motion, high contrast UI
- Controls: show mapping (no rebinding in v1)

Persist settings in LocalStorage.

---

## 24) Storage

### 24.1 LocalStorage Keys
- `redline.settings.v1`
- `redline.best.level1`
- `redline.best.level2`
- `redline.best.level3`
- `redline.leaderboard.local.level1` (fallback)
- `redline.handle.last`

### 24.2 Server Storage
- SQLite DB for simplicity

---

## 25) Networking

### 25.1 CORS
- Allow client origin (Vercel / custom domain)
- Disallow wildcard in production if possible

### 25.2 API Contracts
GET `/api/leaderboard?level=1`
Response:
- { levelId, entries: [{name, score, distance, timeMs, createdAt}] }

POST `/api/leaderboard`
Request:
- { levelId, name, timeMs, distance, closeCalls, seed, clientVersion }
Response:
- { ok: true, stored: {name, score, distance, timeMs, createdAt}, rank: number }

Error responses:
- { ok:false, error:"..." }

---

## 26) Build & Deploy

### 26.1 Client
- Vite build to static assets
- Deploy to Vercel or Netlify

### 26.2 Server
- Deploy to Render/Fly.io/Railway (or Vercel serverless if desired)
- Provide environment variables
- Ensure DB persistent volume if not ephemeral

---

## 27) Testing Plan

### 27.1 Unit Tests (Vitest recommended)
- RNG deterministic sequences
- Collision AABB correctness
- Difficulty ramp produces expected spawn rates
- Score calculation stable

### 27.2 Play Tests
- Verify no impossible spawns:
  - log spawn patterns and run automated “path check” (optional)
- Verify input latency
- Verify leaderboard submission flow & validation

---

## 28) “Impossible Spawn” Prevention (Hard Requirement)
The spawner MUST ensure:
- At least one lane remains open within the player’s reachable lateral range, given current speed and steering limits
Implementation approach:
- Use lane model with N lanes (e.g., 5)
- For each spawn chunk, guarantee at least one lane not blocked within the next `minTTI` window
- If spawning moving blockers, treat their predicted lane occupancy in that window
- If invalid, reroll pattern up to K times (K=6), then fallback to simplest safe pattern

---

## 29) Deterministic Debug Mode
- Toggle: `?debug=1`
- Shows:
  - current seed
  - difficulty tier
  - active pattern name
  - FPS
  - spawn queue
- Allows:
  - slow motion (key: `[` `]`)
  - frame step (key: `.`)
  - hitbox visualization (key: `H`)

---

## 30) Art Direction (Minimum Viable)
- Use simple colored rectangles for v0
- Later: spritesheets
- Car: 1 sprite
- Obstacles: 5–8 sprites
- Road: procedural lines; no need for texture initially

---

## 31) Minimum Viable Milestones

### Milestone 0: Prototype (Core)
- Canvas render loop
- Car movement + speed
- Spawner + obstacles
- Collisions + HP
- Game over + restart

### Milestone 1: Level 1 Complete
- Patterns, difficulty ramp
- Scoring + HUD
- Close call system
- Local best score storage

### Milestone 2: Level 2 Complete
- Rain visuals + puddles + grip
- Lane-change traffic
- Level select + unlocking

### Milestone 3: Level 3 Complete
- Headlight cone + aggressive traffic
- Hard tuning pass
- Polished feedback

### Milestone 4: Leaderboards
- Server + API
- Client integration + fallback
- Leaderboard UI per level

---

## 32) Cursor Implementation Instructions (VERY IMPORTANT)
Cursor must:
- Create the repo structure as specified
- Use TypeScript everywhere in `/src`
- Keep game loop deterministic relative to dt
- Use pooling for obstacles
- Implement both leaderboard modes (server + local fallback)
- Keep UI minimal but clean (no heavy frameworks required)

---

## 33) Data Tables (EXPANDABLE SECTION)
Below are templates. Duplicate entries as needed to add content.

### 33.1 Levels Data Template (`/src/data/levels.ts`)
- Level 1:
  - id: 1
  - name: "Sunset Freeway"
  - lanes: 5
  - roadWidth: 0.72 * canvasWidth
  - baseSpawnRate: 0.6
  - maxSpawnRate: 1.4
  - minTTI: 1.1
  - closeCallRadius: 1.1
  - mechanics: closeCallBoost=true
- Level 2:
  - id: 2
  - name: "Rainline"
  - lanes: 5
  - baseSpawnRate: 0.8
  - maxSpawnRate: 1.7
  - minTTI: 0.9
  - gripEnabled=true
- Level 3:
  - id: 3
  - name: "Night Circuit"
  - lanes: 5
  - baseSpawnRate: 1.0
  - maxSpawnRate: 2.1
  - minTTI: 0.75
  - headlightsEnabled=true

### 33.2 Obstacles Template (`/src/data/obstacles.ts`)
Example entries:
- cone_small
- barrier_wide
- traffic_slow
- puddle
- hydro_strip
- debris_cluster_a
- traffic_lane_change
- traffic_aggressive

(Expand this list by cloning and adjusting parameters.)

### 33.3 Patterns Template (`/src/data/patterns.ts`)
Each pattern defines a timed list of spawns:
- pattern id
- duration
- requiredSpeedTier
- spawns: [{ t, lane, obstacleId, behaviorOverrides? }]

Provide per-level pattern sets:
- L1 patterns: simple blocks, cones slalom
- L2 patterns: puddles + lane-change cars
- L3 patterns: headlight choke + aggressive swerves

---

## 34) UI: Leaderboard View Spec

### 34.1 Leaderboard Screen Layout
- Tabs: Level 1 | Level 2 | Level 3
- Table columns:
  - Rank
  - Name
  - Score
  - Distance
  - Time
  - Date
- Buttons:
  - Back
  - Refresh (if server)
- If offline or server missing:
  - show “Local leaderboard” badge

### 34.2 Submission Modal
- Title: “Submit Score”
- Input: name
- Show: score, time, distance
- Buttons: Submit, Cancel
- On success: highlight your rank row

---

## 35) Edge Cases & Requirements Checklist

### 35.1 Input Edge Cases
- Switching tabs pauses game
- Losing focus: pause
- Sticky keys: ensure keyup resets on blur

### 35.2 Resize Handling
- Keep internal resolution fixed
- Recompute scale factor
- Do not distort aspect ratio

### 35.3 Performance
- Maintain 60 FPS on typical laptop
- No memory growth across runs
- Use pooling

### 35.4 Fairness
- Must never spawn unavoidable wall
- Must telegraph lane changes

### 35.5 Leaderboard Reliability
- Timeout after 4s on submission; fallback to local store with warning

---

## 36) Implementation Notes (Concrete Algorithms)

### 36.1 Fixed Update vs Variable dt
Use variable dt but clamp dt:
- `dt = min(dt, 0.033)` (cap at 30ms)
Optional: accumulator fixed-step (more complex). Keep v1 simple.

### 36.2 Collision Check Frequency
- Check collisions every frame between player and active obstacles
- For performance: early-out with broadphase (y distance threshold)

### 36.3 Spawn Scheduler
- Maintain `spawnTimer`
- `spawnInterval = 1 / currentSpawnRate`
- When timer exceeds interval, pop next pattern spawn(s)

---

## 37) Deliverables
- Working browser game with 3 levels
- Leaderboard per level (server + local fallback)
- Clean codebase with modules
- README with:
  - local dev setup
  - server setup
  - deploy instructions
- No Unity usage

---

## 38) README Requirements (Must Include)
- How to run client:
  - `npm i`
  - `npm run dev`
- How to run server:
  - `cd server`
  - `npm i`
  - `npm run dev`
- How to configure env:
  - `VITE_LEADERBOARD_URL=http://localhost:3001`
- Deploy:
  - client on Vercel
  - server on Render/Fly + DB persistence
- Troubleshooting:
  - CORS issues
  - missing env
  - local fallback behavior

---

## 39) “Definition of Done” (v1 Release)
- Level 1/2/3 playable end-to-end
- Distinct mechanics per level
- No obvious impossible spawns in 20+ playtests
- Leaderboard works and displays correctly
- Restart loop is fast and smooth
- Settings persist
- No major memory leaks

---

## 40) Backlog (Post-v1)
- Ghost replay (record input + seed)
- Daily seed challenge
- Car unlocks / cosmetics
- Mobile support
- Rebindable controls
- Better anti-cheat (server authoritative simulation)
- Replays shareable via URL containing seed

---

## 41) Cursor Task Breakdown (Copy/Paste to Cursor as Plan)
1) Scaffold Vite + TS project + Canvas
2) Implement state machine and menus
3) Implement Input + physics + renderer
4) Implement Spawner + patterns + fairness constraints
5) Implement Level 1 mechanics + tuning
6) Add Level 2 + grip
7) Add Level 3 + headlights + aggressive cars
8) Implement leaderboard client (server + local fallback)
9) Implement server with SQLite + scoring validation
10) Polish UI and deploy instructions

---

END OF SPECS