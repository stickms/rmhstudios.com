# RMH Studios — New Game Spec
## Game: House Always Wins (working title)
**Repo:** rmhstudios.com (Next.js App Router, TS, Tailwind v4, React 19)  
**Auth:** Better Auth (email/password + Discord OAuth already working)  
**DB:** Neon Postgres (serverless) + Prisma ORM + Neon serverless adapter  
**Status:** Nothing exists yet for this game (no folders/files/routes).  
**Goal:** Build the game incrementally with strict milestones.

---

# RMH Studios — New Game Spec
## Game: House Always Wins (working title)
**Repo:** rmhstudios.com (Next.js App Router, TS, Tailwind v4, React 19)  
**Auth:** Better Auth (email/password + Discord OAuth already working)  
**DB:** Neon Postgres (serverless) + Prisma ORM + Neon serverless adapter  
**Status:** Nothing exists yet for this game (no folders/files/routes).  
**Goal:** Build the game incrementally with strict milestones.

---

# 0) Core Vision (High-level premise)
A dark, narrative 2D pixel exploration-platformer inside an old, almost abandoned casino.

**Core inspirations:**
- Hollow Knight: interconnected exploration + shortcuts + gated access
- Celeste: tight room-based platforming challenges
- Undertale: NPC depth + evolving dialogue + consequences
- “Gambling” is systemic corruption: it never blocks progress; it only changes difficulty, debt, NPC tone, security, lighting/music distortion.

**Key narrative hook:**
- Ritual opening with coin flip + “You’ve been here before.”
- “Debt” is not only a number; it changes the world psychologically.

---

# 1) Non-Negotiable Design Principles
1. **RNG never blocks main progression.**  
   Gambling may modify difficulty, odds modifiers, debt, room rules, but must not hard-lock story/zone access permanently.
2. **Player never ‘dies’ in the traditional sense in certain contexts.**  
   For many event rooms, failure increases Debt instead of death.
3. **Event rooms are the scope-control unit.**  
   Short 1–3 minute challenge rooms, themed to an NPC. Always return to overworld hub.
4. **The system remembers everything.**  
   Even if “debt resets,” certain flags/lines/observations reveal persistence.
5. **Build production-quality scaffolding early.**  
   Consistent folder structure, types, API patterns, auth gating, rate limiting patterns, Prisma models, etc.

---

# 2) Repo Constraints / Rules For Cursor
**DO NOT:**
- add new dependencies unless absolutely necessary and not already installed in `package.json`.
- refactor unrelated existing code.
- rename existing auth routes or rewrite Better Auth configuration.
- create large game systems in milestone 0.

**DO:**
- follow repo conventions:
  - `app/<slug>/page.tsx` for pages
  - `components/<slug>/...` for UI
  - `lib/<slug>/...` for logic
  - `app/api/<slug>/...` for API
  - Zustand store in `lib/store/` if needed
- use Tailwind and existing layout conventions.
- for styling: this game has its own tone (dark/moody) and should not inherit neon/hyperpop visuals.

---

### UI Requirements (UPDATED — IMPORTANT):
- **This game is PC/laptop only. Do not optimize for mobile.**
  - It must still render without breaking on small screens, but do not design for mobile UX.
- **Aesthetic MUST be dark, moody, abandoned-casino tone.**
  - Use deep blacks/grays, muted golds, dim flicker accents.
  - Avoid the site’s neon/hyperpop vibe for this route.
- Use existing shared UI components ONLY if they fit this darker tone.
  - If `NeonButton`/`GlitchText` look too neon, do NOT use them here.
  - It is acceptable to create simple local UI in `components/house-always-wins/` using Tailwind.
- Use framer-motion only if already used in repo (subtle fade/slide in is fine).

# 3) Naming & Slug Conventions
Working route slug:
- **`/house-always-wins`**

Folder names:
- `app/house-always-wins/`
- `components/house-always-wins/`
- `lib/house-always-wins/`
- `app/api/house-always-wins/` (future)
- optional assets under `public/house-always-wins/`

# 4) Milestone Roadmap (Strict)
## Milestone 0 — Skeleton + Login Gate (YOU ARE HERE)
**Goal:** A protected route that requires login to access the game.  
**Deliverables:**
- New route `/house-always-wins`
- A “Login to Play” gate with a clean screen
- After login, show a placeholder “Game Shell” screen (no gameplay yet)
- Add navigation entry / tile on homepage projects list (if one exists)
- No database schema changes required for milestone 0
- No API routes required for milestone 0

**Acceptance Criteria:**
- Visiting `/house-always-wins` while logged out shows a login CTA and optionally Discord/email login options (depending on your auth UI patterns).
- Visiting `/house-always-wins` while logged in shows the placeholder game shell.
- No console errors.
- No missing imports.
- TypeScript passes.
- Build passes.
- Uses existing Better Auth patterns (do not invent new auth).

---

## Milestone 1 — Vertical Slice “Lobby Loop” (first playable)
**Goal:** Prove the core loop is fun.
**Deliverables:**
- Lobby overworld room (simple tile map)
- One NPC: Dealer
- 2 event rooms:
  - Dealer movement gamble room
  - Security stealth-ish room (very simple)
- Movement: run, jump, coyote time, jump buffer, wall interactions optional
- Debt system (client-side only first; then persist later)
- Return from event room to lobby
- Minimal dialogue system (branching by debt thresholds)

**Acceptance Criteria:**
- Player can complete loop in <5 minutes.
- Fail states increase debt (in event room contexts) and return player.
- Debt changes at least 1 visible thing (lighting overlay, UI distortion, or audio filter).
'

## 1.1 Core Deliverables

### A) Rendering + Game Loop
- Use a **single `<canvas>`** driven by `requestAnimationFrame` with fixed timestep logic (or semi-fixed) and interpolation optional.
- Pixel-art look via nearest-neighbor scaling.
- Keep assets minimal (can be colored rectangles in Milestone 1).
- Camera is simple: follow player with soft clamp.

### B) Input
- Keyboard controls only (PC/laptop only).
- Required bindings:
  - Left/Right: `A/D` and `ArrowLeft/ArrowRight`
  - Jump: `Space`
  - Interact: `E`
  - Pause: `Esc` (optional minimal overlay)
  - Debug toggle: `F1` (optional: show hitboxes/fps)

### C) Movement (Celeste-inspired “tight room feel”)
Implement:
- Horizontal acceleration + max speed + friction
- Jump velocity
- Gravity
- **Coyote time** (jump slightly after leaving ground)
- **Jump buffer** (queue jump slightly before landing)
- Variable jump height (hold jump = slightly higher)
- Basic collision with solid tiles (AABB)

Non-requirements (not in Milestone 1):
- wall jump, dash, climb, moving platforms (skip for now)

### D) Scene System
Implement a minimal scene manager:
- Scenes:
  - `LobbyScene`
  - `DealerEventScene`
  - `SecurityEventScene`
- Each scene provides:
  - `update(dt)`
  - `render(ctx)`
  - `handleInput(...)`
  - `onEnter(payload?)`
  - `onExit()`

Transition rules:
- From Lobby → DealerEvent when player accepts Dealer challenge in dialogue
- From Lobby → SecurityEvent after completing DealerEvent (or via Dealer “next” option)
- From Event → Lobby on success OR failure (failure increases debt)

### E) NPC Dialogue System (Undertale-lite)
Need a minimal dialogue system with:
- Dialogue boxes with:
  - speaker name
  - text
  - optional choices (2–3 max)
- Dialogue nodes should be data-driven (JSON-like TS objects)
- Choice effects:
  - set flags
  - modify debt
  - trigger scene transitions

Required Dealer dialogue beats:
- initial greeting
- offer “Heads: wake up / Tails: remember” callback line (small)
- offer first event room (“movement gamble”)
- after returning, comment on debt / “you’ve been here before” hint (changes by debt threshold)

### F) Debt System (Core)
Debt is a number tracked in a store (Zustand recommended).
- Start debt = 0 (Milestone 1)
- Failure in event rooms increases debt by a fixed amount:
  - DealerEvent fail: +10 debt
  - SecurityEvent fail: +20 debt
- Success adds 0 debt (for now)

Debt must produce at least 2 visible effects:
1) UI: debt indicator in HUD (top-left)
2) Visual: screen vignette / subtle distortion / darker lighting overlay intensifies with debt
   - No heavy shaders required; simple alpha overlays + flicker is fine.

### G) HUD
Always show:
- Debt
- Current area label: “Lobby”, “Dealer’s Room”, “Security Wing”
- Interaction prompt when near NPC/door: “Press E”

### H) Level Data (Tilemap)
For Milestone 1, use a simple tile grid:
- Tile size in world units = 16
- Render scale on canvas (e.g., 3x or 4x) so it’s crisp
- Levels are defined in code as arrays of strings:
  - `#` = solid
  - `.` = empty
  - `P` = player spawn
  - `D` = dealer NPC
  - `X` = exit/goal
  - `C` = camera start (optional)
  - `S` = security hazard/vision area marker (SecurityEvent)

We are not using external tile editors in Milestone 1.

### I) Event Rooms
#### Dealer Event Room (movement challenge)
- Short, self-contained platforming corridor.
- Win condition: reach `X` (exit tile)
- Fail conditions (any):
  - touch spikes/hazard tiles (`^`) OR fall below kill plane
- Instead of “death screen”, instantly fade out → apply debt penalty → return to Lobby.
- Must feel like a tight micro-Celeste room.

#### Security Event Room (simple stealth-lite)
Keep it simple for Milestone 1:
- Room has “vision cones” as rectangles or lines.
- Player must reach exit `X` without entering vision rectangles.
- If detected:
  - immediate fail → debt +20 → return to Lobby
- No complex AI; static sentries are fine.

---

## 1.2 File/Folder Plan (Milestone 1)
Create these new files:

### Page & UI
- `app/house-always-wins/page.tsx` (already exists from Milestone 0)
- `components/house-always-wins/GameShell.tsx` (update to include the playable game canvas for authed users)
- `components/house-always-wins/game/HouseAlwaysWinsGame.tsx` (client component)
- `components/house-always-wins/game/HUD.tsx`
- `components/house-always-wins/game/DialogBox.tsx`
- `components/house-always-wins/game/PauseOverlay.tsx` (optional minimal)

### Game Engine / Logic
- `lib/house-always-wins/constants.ts` (tile size, colors, physics constants)
- `lib/house-always-wins/types.ts` (shared types: SceneName, DialogueNode, etc.)
- `lib/house-always-wins/input.ts` (keyboard state)
- `lib/house-always-wins/math.ts` (clamp, lerp, rect intersects)
- `lib/house-always-wins/collision.ts` (tile collision helpers)
- `lib/house-always-wins/engine/GameEngine.ts` (main loop, canvas, scene manager)
- `lib/house-always-wins/engine/Scene.ts` (scene interface/base)
- `lib/house-always-wins/scenes/LobbyScene.ts`
- `lib/house-always-wins/scenes/DealerEventScene.ts`
- `lib/house-always-wins/scenes/SecurityEventScene.ts`
- `lib/house-always-wins/levels/lobby.ts`
- `lib/house-always-wins/levels/dealerEvent.ts`
- `lib/house-always-wins/levels/securityEvent.ts`
- `lib/store/houseAlwaysWinsStore.ts` (Zustand store for debt + flags + current scene)

No new dependencies unless truly missing.

---

## 1.3 Technical Requirements
- Must run entirely client-side (canvas) with no server calls.
- Must not break auth gating.
- Must not introduce mobile UI constraints (PC-first).
- Must have deterministic behavior with consistent dt clamping.

---

## 1.4 Acceptance Criteria (Milestone 1)
Milestone 1 is done when:
1) Logged in user can play inside `/house-always-wins` without errors.
2) Player can move + jump smoothly with coyote time + jump buffer.
3) Player can approach Dealer, press `E`, see dialogue, choose “Enter”.
4) Dealer Event Room:
   - Reach exit `X` → return to Lobby (success)
   - Fail by hazard/fall → return to Lobby and debt increases by +10
5) Security Event Room:
   - Reach exit `X` → return to Lobby
   - Enter detection zone → return to Lobby and debt increases by +20
6) Debt is visible in HUD and changes at least one visual effect (vignette/overlay intensity).
7) TypeScript passes, no console errors, no new dependencies unless required.

---

## Milestone 2 — Core Systems
- Metroidvania map stub
- elevators/doors gating
- Save/load progress (DB)
- multiple NPCs with branching dialogue
- debt affects patrol frequency and NPC tone

---

## Milestone 3 — Depth Expansion
- Additional zones (Poker, Slots, High Rollers)
- relationship/social tier modifiers
- alternate paths/shortcuts
- multi-ending framework

---

## Milestone 4 — Vault / Reveal
- deterministic “no RNG” reveal
- final boss gauntlet + endings

---

# 5) Milestone 0 Detailed Specs (Implement EXACTLY)
## 5.1 Route: /house-always-wins
Create:
- `app/house-always-wins/page.tsx`
Optional:
- `app/house-always-wins/layout.tsx` only if you need a special layout for this page. Otherwise skip.

### Behavior:
1. Determine auth state using existing Better Auth approach used by other protected pages (search repo for how `/vega`, `/echoes` or any protected page checks session).
2. If not authenticated:
   - Show a centered “Login to Play” screen.
   - Provide button(s) that route to existing `/login` page OR trigger existing Better Auth sign-in flow (whatever the repo already does).
3. If authenticated:
   - Show a placeholder game shell:
     - Title: “House Always Wins”
     - Subtitle: “Milestone 0 — Skeleton”
     - A card showing:
       - status: “Game not implemented yet”
       - planned features summary
     - Button: “Enter Lobby (Coming Soon)” disabled


---

## 5.2 Components to create (Milestone 0)
Create a small component set to avoid messy page logic:

- `components/house-always-wins/HouseAlwaysWinsGate.tsx`
  - Accepts `isAuthed: boolean` and optional `user` info.
  - Renders either LoggedOut or LoggedIn view.

- `components/house-always-wins/LoggedOutScreen.tsx`
  - “Login to Play”
  - CTA button routes to `/login?next=/house-always-wins` (recommended)
  - Secondary “Back Home” link

- `components/house-always-wins/GameShell.tsx`
  - Placeholder shell for authed users

Keep these minimal, clean, and correct.

---

## 5.3 Auth gating approach (Important)
Follow existing repo conventions. One of these patterns should already exist:

### Pattern A: Server component session check
- In `app/house-always-wins/page.tsx`, fetch session server-side and render accordingly.
- Advantages: no client flicker, best for protected routes.

### Pattern B: Client component session check
- Use `useSession()` style hook from auth-client (if exists).
- Acceptable if repo uses it widely.

**Requirement:** Use whichever pattern your repo already uses.  
**Do not invent a new auth abstraction.**

---

## 5.4 Navigation / Homepage integration
If your homepage has a games/projects section (likely `components/homepage/Projects` or similar):
- Add a new tile/card:
  - Title: House Always Wins
  - Tagline: “A casino metroidvania where gambling is corruption.”
  - Link: `/house-always-wins`
  - Status pill: “In development”

**Requirement:** Follow existing card component pattern for other games.

---

## 5.5 No DB changes in Milestone 0
Do not edit Prisma schema yet.
Do not add migrations.
Do not add `/api/house-always-wins` yet.

---

# 6) Future Data Model (For later milestones; DO NOT IMPLEMENT NOW)
This section is for planning only so structure stays coherent later.

## 6.1 Entities (conceptual)
- User (existing)
- GameProgress (per user per game)
- RunHistory (optional)
- DialogueFlags (stored in JSON)
- DebtHistory (optional)
- LeaderboardScore (optional)

## 6.2 Suggested Prisma direction (later)
Prefer a unified table keyed by `gameSlug`:
- `GameProgress { userId, gameSlug, data Json, updatedAt }`

This avoids per-game tables unless you need strict schemas.

---

# 7) Code Quality & Conventions
- TypeScript strictness: no `any` unless unavoidable.
- Avoid importing server-only modules into client components.
- Keep components in `components/house-always-wins/`
- Keep logic stubs in `lib/house-always-wins/` (even if empty in milestone 0)
- Use `export const metadata` in page only if repo already uses it.

---

# 8) Testing / Verification Checklist (Milestone 0)
- `pnpm dev` (or repo’s package manager) runs with no errors.
- Open:
  - `/house-always-wins` logged out => shows gate + CTA
  - `/house-always-wins` logged in => shows game shell
- Links work:
  - CTA sends you to login and returns you to game route after login (via `next` query param or existing mechanism)
- No lint/type errors.

---

# 9) Deliverable Summary (Milestone 0)
### New files expected
- `app/house-always-wins/page.tsx`
- `components/house-always-wins/HouseAlwaysWinsGate.tsx`
- `components/house-always-wins/LoggedOutScreen.tsx`
- `components/house-always-wins/GameShell.tsx`
- (Optional) `components/house-always-wins/index.ts` barrel export (only if repo uses barrels)
- (Optional) add homepage tile in existing projects component

### No new dependencies
Only add a dependency if it’s missing and required for build.

---

# 10) Definition of Done (Milestone 0)
Milestone 0 is complete when:
- Route exists and is protected by login gate
- UI matches site aesthetic
- Homepage includes game tile (if projects grid exists)
- Zero runtime errors
- Zero TS errors
- No DB/schema/API work introduced
