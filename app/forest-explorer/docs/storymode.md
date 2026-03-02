# Forest Explorer — Story Mode Megaprompt Reference

> Living design document. Updated as implementation progresses.
> Last audit: 2026-03-01

---

## 1. High-Level Overview

Forest Explorer Story Mode is a first-person 3D exploration game built with React Three Fiber.
The player navigates a dark forest, uses a flashlight to reveal hidden interactables, solves
2D overlay puzzles, discovers journal entries, and progresses through 3 acts to restore the forest.

**Tech stack:** Next.js 15 + React 19 + Three.js (R3F) + Zustand + Prisma + Tailwind CSS
**Target platform:** Desktop only (pointer-lock FPS controls)
**Audio:** Hooks implemented but audio files not yet created. Skipped for now.

---

## 2. Architecture Map

```
app/forest-explorer/
├── page.tsx                    # Mode select (Explore vs Story)
├── layout.tsx                  # Viewport meta, shared layout
├── explore/page.tsx            # Free-roam sandbox mode
├── story/page.tsx              # Story mode entry point → renders <StoryGame />
└── docs/storymode.md           # THIS FILE

app/api/forest-explorer/
└── save/route.ts               # GET/POST save data (authenticated, rate-limited)

components/forest-explorer/
├── ForestExplorerGame.tsx       # Re-export of ExploreGame (explore mode only)
├── audio/
│   ├── useForestAudio.ts       # Explore mode: day/night crossfade
│   └── useStoryAudio.ts        # Story mode: per-act tracks + SFX (NOT WIRED IN YET)
├── shared/                     # Components shared between explore & story
│   ├── constants.ts            # RNG, river data, tree colliders, physics constants
│   ├── types.ts                # TreeData interface
│   ├── buildTreeInstancedMeshes.ts  # Instanced mesh builder for trees
│   ├── ForestScene.tsx         # Explore mode's tree/rock/mushroom generator
│   ├── PlayerController.tsx    # Explore mode player (river/tree collision)
│   ├── Ground.tsx              # Ground plane
│   ├── Rock.tsx                # Rock mesh
│   ├── Mushroom.tsx            # Mushroom mesh
│   ├── Pond.tsx                # Pond water surface
│   ├── Fireflies.tsx           # Particle fireflies
│   ├── Mist.tsx                # Volumetric mist particles
│   ├── Clouds.tsx              # Floating cloud meshes
│   ├── Moon.tsx                # Moon sphere
│   ├── GrassBorder.tsx         # Grass around forest edge
│   ├── BoundaryWall.tsx        # Invisible boundary wall
│   ├── River.tsx               # River mesh following catmull-rom curve
│   ├── TikiTorches.tsx         # Light sources
│   └── Flashlight.tsx          # Flashlight spotlight attached to camera
├── explore/
│   ├── ExploreGame.tsx         # Explore mode orchestrator
│   └── ExploreScene.tsx        # Explore mode 3D scene
└── story/
    ├── StoryGame.tsx           # MAIN ORCHESTRATOR: menu, HUD, overlays, transitions
    ├── StoryScene.tsx          # 3D scene container: renders act + player + interactions
    ├── StoryPlayerController.tsx  # WASD/Space/Shift movement + E/F/Tab input
    ├── StoryHUD.tsx            # Act name, puzzle count, flashlight indicator, crosshair
    ├── InteractionSystem.tsx   # Per-frame proximity + flashlight cone detection
    ├── InteractionPrompt.tsx   # "Press E" popup when near interactable
    ├── ActTransition.tsx       # Fade-in/hold/fade-out cinematic between acts
    ├── acts/
    │   ├── ActOneScene.tsx     # Night forest: 1000+ trees, 4 landmarks, bioluminescence
    │   ├── ActTwoScene.tsx     # Dusk forest: shifting trees, corridor system, amber tones
    │   └── ActThreeScene.tsx   # Dawn grove: corruption zones, Heartwood tree, color progression
    ├── landmarks/
    │   ├── AncientStone.tsx    # 6 standing stones in circle + altar + glow
    │   ├── GatewayArch.tsx     # Two pillars + arch + portal plane (opens on puzzle solve)
    │   ├── HollowTree.tsx      # Massive hollow tree (Act 2 central landmark)
    │   └── CrystalCluster.tsx  # 5 crystal shards on rock base, flashlight-reactive
    ├── puzzles/
    │   ├── PuzzleOverlay.tsx   # Fullscreen overlay wrapper (header, hints, close)
    │   ├── PuzzleRegistry.ts   # Maps puzzle type → React component
    │   ├── RuneSequencePuzzle.tsx   # Simon-Says with rune symbols
    │   ├── ConstellationPuzzle.tsx  # Connect stars to form pattern
    │   ├── WardSealPuzzle.tsx       # Rotate concentric rings to align symbols
    │   ├── ShadowMatchPuzzle.tsx    # Drag shadows to match silhouettes
    │   ├── SoundPipePuzzle.tsx      # Route pipes from source to target (flow puzzle)
    │   ├── MemoryEchoPuzzle.tsx     # Repeat sound sequence (visual-only, no actual audio)
    │   ├── RootNetworkPuzzle.tsx    # Select edges to create path in graph
    │   ├── CorruptedGlyphPuzzle.tsx # Drag+rotate fragments to reassemble
    │   └── ReflectionPuzzle.tsx     # Place mirrors to guide light beam
    └── journal/
        ├── journalData.ts      # 26 entries across 3 acts (lore, hints, personal)
        ├── JournalEntry.tsx    # Single entry card component
        └── JournalOverlay.tsx  # Fullscreen journal with category filtering

lib/forest-explorer/
├── types.ts                # All TypeScript types (ActId, PuzzleType, configs, save shape)
├── store.ts                # Zustand store: state + all actions
├── actMaps.ts              # Per-act config: atmosphere, corridors, landmarks, portal position
├── puzzleDefinitions.ts    # 12 puzzle configs: type, difficulty, worldEvent, hints
├── interactables.ts        # All interactable objects with positions, reveal methods, links
└── saveSystem.ts           # localStorage + DB fetch helpers, save factory

prisma/schema.prisma        # ForestExplorerSave model (userId, saveData JSON, updatedAt)
```

---

## 3. Three-Act Story Structure

### Act 1: "The Whispering Woods at Dusk" (Night)
- **Atmosphere:** Deep night, stars visible, moon, heavy fog (15-80), bioluminescent mushrooms
- **Map radius:** 150 units
- **Trees:** 1000+ procedurally placed, seed 42
- **Corridors:** Ring path: Spawn → Stone Circle (N) → Stargazer (E) → Shadow Wall (S) → Gateway (W) → Center
- **Landmarks:**
  | Landmark | Component | Position | Puzzle |
  |----------|-----------|----------|--------|
  | Stone Circle | AncientStone | [0, 0, -60] | act1_rune_sequence (easy) |
  | Stargazer Clearing | CrystalCluster | [50, 0, -40] | act1_constellation (easy) |
  | Shadow Wall | AncientStone | [30, 0, 30] | act1_shadow_match (medium) |
  | Gateway Arch | GatewayArch | [-40, 0, 20] | act1_ward_seal (medium) → OPENS PORTAL |
- **Journal items:** 6 (intro near spawn, lore/hints near each puzzle)
- **Progression:** Solve ward_seal → sets `act1_gateway_opened` flag → portal appears → enter to advance

### Act 2: "Confronting the Shifting Canopy" (Dusk/Twilight)
- **Atmosphere:** Warm orange-red tones, fewer stars (800), corridor wall indicator lights
- **Map radius:** 130 units
- **Trees:** 900+ with corridor-aware placement, seed 137
- **Special mechanic:** Trees shift positions when `trees_calm_briefly` event fires (3 puzzles trigger this)
- **Corridors:** Linear path: Entry → Wind Hollow → Mirror Pool → Echo Chamber → Root Gate
- **Landmarks:**
  | Landmark | Component | Position | Puzzle |
  |----------|-----------|----------|--------|
  | Wind Hollow | HollowTree | [0, 0, -30] | act2_sound_pipe (medium) |
  | Mirror Pool | CrystalCluster | [-30, 0, -60] | act2_reflection (medium) |
  | Echo Chamber | AncientStone | [40, 0, -20] | act2_memory_echo (medium) |
  | Root Gate | GatewayArch | [70, 0, -40] | act2_root_network (hard) → OPENS PORTAL |
- **Journal items:** 4 (hint items near each puzzle)
- **Progression:** Solve root_network → sets `act2_gateway_opened` → portal appears → enter to advance

### Act 3: "Sunrise Over the Tranquil Grove" (Dawn Progression)
- **Atmosphere:** Purple twilight → golden dawn (dynamic based on puzzle completion)
- **Map radius:** 180 units
- **Trees:** 1100+ with 15% corruption markings, seed 271
- **Special mechanics:**
  - Dawn progress: `dawnProgress = solved_count / 4` (0.0 → 1.0)
  - Corruption zones: 20 zones with purple particles, intensity decreases as puzzles solved
  - Stars fade out, sky brightens, fog lifts as dawn progresses
- **Landmarks:**
  | Landmark | Component | Position | Puzzle |
  |----------|-----------|----------|--------|
  | Shattered Monument | AncientStone | [20, 0, -40] | act3_corrupted_glyph (medium) |
  | Twilight Observatory | CrystalCluster | [-20, 0, -80] | act3_constellation (hard) |
  | Crystal Nexus | CrystalCluster | [0, 0, -50] | act3_reflection (hard) |
  | Heartwood Tree | HeartwoodTree* | [40, 0, -70] | act3_ward_seal (hard) → GAME COMPLETE |
- **Journal items:** 4 (hint items near each puzzle)
- **Progression:** Solve ward_seal → sets `act3_forest_restored` → completion screen after 2s delay
- **\*HeartwoodTree** is a custom inline component in ActThreeScene (not a separate landmark file)

---

## 4. State Management (Zustand Store)

**File:** `lib/forest-explorer/store.ts`
**Store name:** `useStoryStore`

### Key State Fields
```
currentAct: ActId                          // 'act1' | 'act2' | 'act3'
actPhase: ActPhase                         // 'exploring' | 'puzzle' | 'transition'
actProgress: Record<ActId, ActProgress>    // Per-act solved puzzles, journal entries, checkpoints
puzzleStates: Record<string, PuzzleState>  // Per-puzzle status + attempt count
activePuzzleId: string | null              // Currently open puzzle
showPuzzleOverlay: boolean                 // Puzzle UI visible
discoveredEntries: string[]                // Found journal entry IDs
journalOpen: boolean                       // Journal overlay visible
nearbyInteractable: string | null          // Closest interactable in range
flashlightRevealedIds: string[]            // Currently flashlight-revealed objects
playerPosition: [x, y, z]                  // Camera position
playerRotation: [yaw, pitch]               // Camera rotation
flashlightOn: boolean                      // Flashlight state
playtime: number                           // Total seconds played
storyFlags: Record<string, boolean>        // World event flags
isLoggedIn: boolean                        // Auth state for DB sync
initialized: boolean                       // Game ready
```

### Key Actions
```
initializeGame(isLoggedIn)    // Load save from localStorage/DB
newGame()                     // Reset all state
solvePuzzle(puzzleId)         // Mark solved, set worldEvent flag, auto-save
openPuzzle(puzzleId)          // Show puzzle overlay
closePuzzle()                 // Hide puzzle overlay
incrementAttempt(puzzleId)    // Track failed attempts
discoverEntry(entryId)        // Add to discovered list
toggleJournal()               // Open/close journal
advanceToAct(act)             // Switch acts, reset position
setStoryFlag(flag, value)     // Set world event flags
saveProgress()                // localStorage + debounced DB sync
tickPlaytime(delta)           // Frame-by-frame playtime tracking
```

### World Event Flags (storyFlags)
These are set by puzzle `worldEvent` fields when solved:
```
act1_stones_awakened      → act1_rune_sequence solved
act1_stars_aligned        → act1_constellation solved
act1_shadows_aligned      → act1_shadow_match solved
act1_gateway_opened       → act1_ward_seal solved (OPENS ACT 1 PORTAL)
trees_calm_briefly        → act2_sound_pipe / act2_reflection / act2_memory_echo solved
act2_gateway_opened       → act2_root_network solved (OPENS ACT 2 PORTAL)
act3_corruption_recedes_1 → act3_corrupted_glyph solved
act3_corruption_recedes_2 → act3_constellation solved
act3_corruption_recedes_3 → act3_reflection solved
act3_forest_restored      → act3_ward_seal solved (GAME COMPLETE)
portal_activated          → Player presses E on portal → triggers act transition
```

---

## 5. Interaction Flow

### Detection (InteractionSystem.tsx)
Runs every 3rd frame:
1. Get camera position + direction
2. For each interactable in current act:
   - If `flashlight_only`: check if within flashlight cone (20 degrees) AND distance < 40
   - If `always_visible` or `proximity`: always revealed
   - If portal: only show if gateway puzzle is solved
3. Find closest revealed interactable within `interactionRadius`
4. Set `nearbyInteractable` in store

### Player Input (StoryPlayerController.tsx)
- **E key:** Interact with `nearbyInteractable`
  - `puzzle_stone` → `openPuzzle(puzzleId)`
  - `journal_item` → `discoverEntry(journalEntryId)`
  - `portal` → `setStoryFlag('portal_activated', true)`
  - `landmark` → `visitLandmark(id)` (sets checkpoint)
- **F key:** Toggle flashlight
- **Tab key:** Toggle journal
- **WASD/Arrows:** Move (5 units/s walk, 9 units/s sprint)
- **Space:** Jump (JUMP_VEL=9, GRAVITY=22)
- **Shift:** Sprint

### Puzzle Flow
1. Player presses E near puzzle_stone → `openPuzzle(puzzleId)`
2. `showPuzzleOverlay = true`, `actPhase = 'puzzle'`
3. PuzzleOverlay renders: looks up puzzle in `puzzleDefinitions`, gets component from `PuzzleRegistry`
4. Player solves puzzle → component calls `onSolve` callback
5. `solvePuzzle(puzzleId)` → marks solved, sets worldEvent flag, closes overlay, auto-saves
6. If worldEvent is a gateway flag → portal becomes interactable

### Act Transition Flow
1. Player enters portal → `portal_activated` flag set
2. StoryGame detects flag → sets `transitioning = true`, clears flag
3. ActTransition renders: 1.5s fade-in → 2s hold (shows act name) → 1.5s fade-out
4. On complete → `advanceToAct(nextAct)` → resets position, loads new act scene

---

## 6. Save System

### localStorage (all users)
- Key: `forest-explorer-story-v1`
- Max payload: 200KB
- Saves: currentAct, actProgress, puzzleStates, journalEntries, storyFlags, playtime
- Auto-saves on: puzzle solve, journal discover, landmark visit, act advance, manual save

### Database (authenticated users)
- Model: `ForestExplorerSave` (Prisma)
- Endpoint: `POST /api/forest-explorer/save` (rate limited: 20/min)
- Sync: Debounced 2s after any localStorage save
- Load priority: Whichever has newer `savedAt` timestamp wins

---

## 7. Puzzle Reference

| ID | Type | Act | Difficulty | Grid/Config | World Event |
|----|------|-----|------------|-------------|-------------|
| act1_rune_sequence | rune_sequence | 1 | easy | 5 symbols, 4-length sequence | act1_stones_awakened |
| act1_constellation | constellation | 1 | easy | 18 stars, 7 edges, 6 decoys | act1_stars_aligned |
| act1_shadow_match | shadow_match | 1 | medium | 4 shapes (deer/tree/moon/river) | act1_shadows_aligned |
| act1_ward_seal | ward_seal | 1 | medium | 3 rings, 6 symbols each | act1_gateway_opened |
| act2_sound_pipe | sound_pipe | 2 | medium | 6x6 grid, 4 pipe types | trees_calm_briefly |
| act2_reflection | reflection | 2 | medium | 7x7 grid, 5 mirrors, 3 obstacles | trees_calm_briefly |
| act2_memory_echo | memory_echo | 2 | medium | 6 sounds, 5-length sequence | trees_calm_briefly |
| act2_root_network | root_network | 2 | hard | 12 nodes, 20 edges, max 6 active | act2_gateway_opened |
| act3_corrupted_glyph | corrupted_glyph | 3 | medium | 8 fragments, 90deg snap | act3_corruption_recedes_1 |
| act3_constellation | constellation | 3 | hard | 24 stars, 10 edges, 8 decoys | act3_corruption_recedes_2 |
| act3_reflection | reflection | 3 | hard | 9x9 grid, 7 mirrors, 4 obstacles | act3_corruption_recedes_3 |
| act3_ward_seal | ward_seal | 3 | hard | 4 rings, 8 symbols each | act3_forest_restored |

---

## 8. Known Issues & Gaps

### Critical (blocks end-to-end play)
- [ ] **Untested** — Story mode has never been loaded in browser. TypeScript compiles cleanly (0 errors). Runtime errors unknown.
- [x] **Portal interaction logic** — VERIFIED CORRECT.
- [x] **Prisma DB sync** — FIXED. `prisma db push` applied. ForestExplorerSave table exists.

### Medium (gameplay bugs)
- [x] **`trees_calm_briefly` re-trigger** — FIXED. Store now tracks `treesShiftCount` counter that increments on each solve. StoryGame watches the counter, not the boolean flag.
- [x] **mapRadius per act** — FIXED. StoryPlayerController reads `actConfig.mapRadius` from act maps (150/130/180).
- [x] **Tree collision in story mode** — FIXED. StoryPlayerController now builds tree colliders from act config using same deterministic RNG as act scenes. Corridor-aware rejection included.
- [x] **Corridor collision** — FIXED. Corridors prop removed. StoryPlayer reads corridors from act config directly and uses them in tree collider generation (trees rejected inside corridors).
- [x] **setPlayerPosition throttled** — FIXED. Position updates every 3rd frame, rotation every 6th frame.
- [ ] **MemoryEchoPuzzle has no audio** — Uses visual icons only. The "sound" in "Sound Pipe" and "Echo" puzzles is purely visual.

### Low (polish)
- [ ] **useStoryAudio not wired** — Hook exists but StoryGame.tsx never imports it. Audio is skipped for now.
- [ ] **Missing audio files** — Expected at `/public/music/ForestExplorer/story_act*.mp3` and `/public/sfx/ForestExplorer/*.mp3`
- [x] **Login required** — FIXED. StoryGame uses `authClient.useSession()` and redirects to `/login?callbackURL=/forest-explorer/story` if not authenticated. `initializeGame(true)` now wired.
- [ ] **HeartwoodTree not extracted** — Defined inline in ActThreeScene.tsx instead of as reusable landmark component

---

## 9. Implementation Status Checklist

### Core Infrastructure
- [x] Zustand store with all actions
- [x] TypeScript types for everything
- [x] Act map configs (atmosphere, corridors, landmarks)
- [x] Puzzle definitions (12 puzzles across 3 acts)
- [x] Interactable registry (puzzle stones, journal items, landmarks, portals)
- [x] Save system (localStorage + DB sync)
- [x] API route for authenticated saves
- [x] Prisma model

### 3D Scenes
- [x] StoryScene container
- [x] ActOneScene (night, 1000+ trees, 4 landmarks, bioluminescence)
- [x] ActTwoScene (dusk, shifting trees, corridors, amber lighting)
- [x] ActThreeScene (dawn progression, corruption zones, Heartwood tree)
- [x] AncientStone landmark
- [x] GatewayArch landmark (with portal plane)
- [x] HollowTree landmark
- [x] CrystalCluster landmark
- [x] Shared components (Ground, Fireflies, Mist, Clouds, Moon, etc.)

### Player & Interaction
- [x] StoryPlayerController (WASD, sprint, jump, flashlight, interact)
- [x] InteractionSystem (proximity + flashlight cone detection)
- [x] InteractionPrompt ("Press E" UI)
- [x] Flashlight spotlight component

### Puzzles (all 9 types)
- [x] PuzzleOverlay wrapper
- [x] PuzzleRegistry
- [x] RuneSequencePuzzle
- [x] ConstellationPuzzle
- [x] WardSealPuzzle
- [x] ShadowMatchPuzzle
- [x] SoundPipePuzzle
- [x] MemoryEchoPuzzle
- [x] RootNetworkPuzzle
- [x] CorruptedGlyphPuzzle
- [x] ReflectionPuzzle

### Journal
- [x] 26 journal entries (journalData.ts)
- [x] JournalEntry card component
- [x] JournalOverlay with category filtering

### UI & Flow
- [x] Mode select page (Explore vs Story)
- [x] Story page with back button
- [x] Pre-game menu (New Game / Continue)
- [x] Pause menu (Resume / Save & Quit)
- [x] StoryHUD (act name, puzzle count, flashlight, crosshair)
- [x] ActTransition cinematic (fade in/out with act name)
- [x] Game completion screen (Act 3 finale)

### Audio
- [x] useStoryAudio hook (per-act crossfade + SFX)
- [ ] Wire useStoryAudio into StoryGame
- [ ] Create/source audio files
- [x] useForestAudio hook (explore mode, working)

### Not Started
- [ ] End-to-end testing
- [ ] Bug fixes for runtime errors
- [ ] Performance profiling (1000+ trees per act)
- [ ] Mobile support (not planned)

---

## 10. File Quick Reference

When working on story mode, these are the key files by concern:

**Game flow:** `components/forest-explorer/story/StoryGame.tsx`
**3D rendering:** `components/forest-explorer/story/StoryScene.tsx`
**Player controls:** `components/forest-explorer/story/StoryPlayerController.tsx`
**Interaction detection:** `components/forest-explorer/story/InteractionSystem.tsx`
**Act content:** `components/forest-explorer/story/acts/Act{One,Two,Three}Scene.tsx`
**Puzzle UI:** `components/forest-explorer/story/puzzles/PuzzleOverlay.tsx`
**State:** `lib/forest-explorer/store.ts`
**Data:** `lib/forest-explorer/{puzzleDefinitions,interactables,actMaps}.ts`
**Types:** `lib/forest-explorer/types.ts`
**Save:** `lib/forest-explorer/saveSystem.ts` + `app/api/forest-explorer/save/route.ts`
