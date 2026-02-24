# Phase 7: Minigames Set 3 — Sequence Sam, Human Keyboard, Cursor Curling, Human Tetris

> **Depends on:** Phase 4 (Minigame Engine & Lifecycle), Phase 5 (first minigame set establishes implementation patterns: BaseMinigame extensions, registry registration, constants, Zod schemas, data pipelines, client components, and `buildGameLog()`)
>
> **Parallelizable with:** Phase 6, Phase 8 — after Phase 5 is complete, Phases 6, 7, and 8 can be implemented in parallel since they share no inter-dependencies. Each phase independently extends `BaseMinigame`, registers games in the shared registry, and follows the patterns established in Phase 5.
>
> This phase implements the third set of four minigames for RMHbox. Each game extends `BaseMinigame` from Phase 4. Notable in this phase: Cursor Curling includes a custom server-side 2D physics simulation, and Human Keyboard and Human Tetris are cooperative games.

---

## Table of Contents

1. [7.1 Sequence Sam](#71-sequence-sam)
2. [7.2 Human Keyboard](#72-human-keyboard)
3. [7.3 Cursor Curling](#73-cursor-curling)
4. [7.4 Human Tetris](#74-human-tetris)
5. [7.5 Cross-Game Integration Testing](#75-cross-game-integration-testing)
6. [7.6 Game Settings Test Plan (§12A)](#76-game-settings-test-plan-12a)

---

## 7.1 Sequence Sam

**Game ID:** `sequence-sam` | **Category:** `action` | **Icon:** `grid-3x3`
**Players:** 2–16 | **Duration:** ~120s (up to 20 rounds)

---

### 7.1.1 Install NPM Packages

- [ ] No additional NPM packages required for Sequence Sam
  - The game is pure algorithmic logic: sequence generation, rotation mapping, input validation.
  **Verification:** Confirm no new dependencies needed.

---

### 7.1.2 Add Constants to `lib/rmhbox/constants.ts`

- [ ] Add `SS_MAX_ROUNDS = 20` — maximum number of rounds
- [ ] Add `SS_STARTING_LENGTH = 3` — initial sequence length
- [ ] Add `SS_MAX_STRIKES = 3` — strikes before elimination
- [ ] Add `SS_CHAOS_INTERVAL = 4` — every 4th round is a Chaos Round
- [ ] Add `SS_TILE_FLASH_DURATION_MS = 500` — how long each tile lights up during pattern display
- [ ] Add `SS_TILE_GAP_MS = 200` — gap between tile flashes
- [ ] Add `SS_INPUT_TIME_PER_STEP_MS = 1500` — input time allowed per step in the sequence
- [ ] Add `SS_ROUND_RESULTS_SECONDS = 2` — round results display duration
- [ ] Add `SS_TRANSITION_SECONDS = 1` — transition between rounds
- [ ] Add `SS_SURVIVE_POINTS = 50` — points for surviving a round
- [ ] Add `SS_PERFECT_ROUND_BONUS = 25` — bonus for zero mistakes in a round
- [ ] Add `SS_CHAOS_SURVIVE_BONUS = 50` — bonus for surviving a Chaos Round
- [ ] Add `SS_SPEED_BONUS_PER_MS = 0.05` — bonus per ms under time limit
- [ ] Add `SS_WINNER_BONUS = 200` — points for last player standing
- [ ] Add `SS_PLACEMENT_POINTS = 20` — points per placement rank
- [ ] Add `SS_GRID_SIZE = 9` — total grid cells (3×3)
- [ ] Add `SS_GRID_COLS = 3` — grid column count
- [ ] Add `ROTATION_MAP_CW` — rotation mapping for 90° clockwise:
  ```ts
  const ROTATION_MAP_CW: Record<number, number> = {
    0: 2, 1: 5, 2: 8,
    3: 1, 4: 4, 5: 7,
    6: 0, 7: 3, 8: 6,
  };
  ```
- [ ] **Verification:** Import all `SS_*` constants; confirm correct types. Verify `ROTATION_MAP_CW` maps all 9 positions. Verify center (4) maps to itself.

---

### 7.1.3 Define Zod Validation Schemas

- [ ] Create `lib/rmhbox/sequence-sam/schemas.ts`

- [ ] Define `SSTapSchema`:
  ```ts
  const SSTapSchema = z.object({
    position: z.number().int().min(0).max(8),
  });
  ```
  **Verification:** Valid: `{ position: 0 }`, `{ position: 8 }`. Invalid: `{ position: 9 }`, `{ position: -1 }`, `{ position: 4.5 }`.

---

### 7.1.4 Implement Server Handler

- [ ] Create `server/rmhbox/minigames/sequence-sam.ts`

#### 7.1.4.1 Type Definitions

- [ ] Define `SSPhase` type:
  ```ts
  type SSPhase = 'PATTERN_DISPLAY' | 'INPUT' | 'ROUND_RESULTS' | 'TRANSITION' | 'GAME_OVER';
  ```
  **Verification:** Type has exactly 5 values matching spec.

- [ ] Define `SSPlayerState` type:
  ```ts
  type SSPlayerState = {
    userId: string;
    strikesRemaining: number;
    isEliminated: boolean;
    eliminatedOnRound: number | null;
    currentInputIndex: number;
    hasCompletedSequence: boolean;
    hasFailed: boolean;
    failedAtIndex: number | null;
    inputStartedAt: number | null;
    completedAt: number | null;
    totalScore: number;
    roundScore: number;
  };
  ```

- [ ] Define `SequenceSamState` type:
  ```ts
  type SequenceSamState = {
    currentRound: number;
    maxRounds: number;
    sequence: number[];
    rotatedSequence: number[] | null;
    isChaosRound: boolean;
    phase: SSPhase;
    playerStates: Map<string, SSPlayerState>;
    eliminatedPlayers: string[];
    activePlayers: string[];
    phaseStartedAt: number;
    phaseEndsAt: number;
    currentDisplayStep: number;
  };
  ```
  **Verification:** All types compile. Cross-reference against spec §1.4.

#### 7.1.4.2 Class: `SequenceSamGame extends BaseMinigame`

- [ ] Constructor: call `super(context)`
  **Verification:** Instantiate class; confirm no errors.

#### 7.1.4.3 State Initialization (`start()`)

- [ ] Initialize `playerStates` map: for each player, set `strikesRemaining = SS_MAX_STRIKES`, `isEliminated = false`, `totalScore = 0`
- [ ] Set `activePlayers = [...context.players]`, `eliminatedPlayers = []`
- [ ] Set `currentRound = 0`, `maxRounds = SS_MAX_ROUNDS`
- [ ] Initialize `sequence = []` (will be built on first round)
- [ ] Call `startNextRound()`
  **Verification:** Unit test with 4 players: all have 3 strikes, all active.

#### 7.1.4.4 Sequence Generation

- [ ] `extendSequence()`:
  - If `sequence.length === 0`: generate initial sequence of length `SS_STARTING_LENGTH` (3 random positions 0–8, no consecutive duplicates)
  - Otherwise: append 1 new random position (not the same as the last position in the sequence)
  - If current round is a Chaos Round (`currentRound % SS_CHAOS_INTERVAL === 0`):
    - Compute `rotatedSequence` by mapping each position through `ROTATION_MAP_CW`
    - Set `isChaosRound = true`
  - Otherwise: `rotatedSequence = null`, `isChaosRound = false`
  **Verification:** Unit test: round 1 → sequence length 3, no consecutive duplicates. Round 2 → length 4, extends previous. Round 4 → chaos, `rotatedSequence` computed. Center (4) stays center in rotation.

#### 7.1.4.5 Round Lifecycle

- [ ] `startNextRound()`:
  - Increment `currentRound`
  - If `currentRound > maxRounds` OR `activePlayers.length <= 1`, call `endGame()`; return
  - Call `extendSequence()`
  - Reset each active player's round state: `currentInputIndex = 0`, `hasCompletedSequence = false`, `hasFailed = false`, `failedAtIndex = null`, `roundScore = 0`
  - Set `phase = 'PATTERN_DISPLAY'`, `currentDisplayStep = 0`
  - Emit `SS_ROUND_START` to all: `{ round: currentRound, sequenceLength: sequence.length, isChaosRound }`
  - Begin pattern display sequence
  **Verification:** Round starts correctly. Player states reset. Event emitted.

- [ ] `displayPattern()`:
  - Emit `SS_PATTERN_STEP` events one at a time with proper timing:
    - For step `i`: emit after `i × (SS_TILE_FLASH_DURATION_MS + SS_TILE_GAP_MS)` ms
    - Payload: `{ step: i, position: sequence[i], totalSteps: sequence.length }`
  - **CRITICAL:** Send one step at a time via scheduled timers, NOT the entire sequence at once
  - After all steps displayed, wait `SS_TILE_FLASH_DURATION_MS` (last tile's display time)
  - If `isChaosRound`: emit `SS_GRID_ROTATE` with `{ degrees: 90 }`; wait 500ms for rotation animation
  - Emit `SS_PATTERN_COMPLETE` with `{ rotated: isChaosRound }`
  - Call `startInputPhase()`
  **Verification:** Unit test: sequence of length 5 → 5 `SS_PATTERN_STEP` events emitted with correct timing. Chaos round → rotate event before input phase. Raw sequence array is NOT in any event payload.

- [ ] `startInputPhase()`:
  - Set `phase = 'INPUT'`
  - Compute input time: `sequence.length × SS_INPUT_TIME_PER_STEP_MS`
  - Set `phaseEndsAt = Date.now() + inputTime`
  - Record `inputStartedAt` for each active player
  - Start `TIMER_TICK` interval (1s)
  - Schedule `endInputPhase()` after input time expires
  **Verification:** Input time scales with sequence length. Timer ticks.

- [ ] `endInputPhase()`:
  - Stop timer
  - Any active player who hasn't completed or failed the sequence → mark as failed (timeout)
  - Call `processRoundResults()`
  **Verification:** Timeout players marked as failed.

- [ ] `processRoundResults()`:
  - Set `phase = 'ROUND_RESULTS'`
  - For each active player:
    - If `hasCompletedSequence`:
      - Award `SS_SURVIVE_POINTS`
      - If `hasFailed === false` (no wrong taps at all): award `SS_PERFECT_ROUND_BONUS`
      - If `isChaosRound`: award `SS_CHAOS_SURVIVE_BONUS`
      - Speed bonus: `floor((phaseEndsAt - completedAt) × SS_SPEED_BONUS_PER_MS)` — ms remaining at completion
    - If `hasFailed`:
      - Deduct 1 strike
      - If `strikesRemaining <= 0`:
        - Set `isEliminated = true`, `eliminatedOnRound = currentRound`
        - Move from `activePlayers` to `eliminatedPlayers`
        - Emit `SS_ELIMINATION`: `{ userId, userName, finalRank: activePlayers.length + eliminatedPlayers.length - ... }`
  - **Grace Rule:** If ALL remaining active players failed the round, NONE are eliminated (no strikes deducted). This prevents anticlimactic simultaneous elimination on a hard round.
  - Compute ranks for eliminated players this round (shared rank if multiple eliminated same round)
  - Award `SS_PLACEMENT_POINTS × (totalPlayers - rank + 1)` for eliminated players
  - Build `SSRoundSurvivor[]` and `SSRoundEliminated[]`
  - Emit `SS_ROUND_RESULTS`: `{ survivors, eliminated, roundNumber }`
  - If `activePlayers.length <= 1`:
    - Award `SS_WINNER_BONUS` to the remaining player (if exactly 1)
    - Schedule `endGame()` after `SS_ROUND_RESULTS_SECONDS`
  - Else: schedule `startTransition()` after `SS_ROUND_RESULTS_SECONDS`
  **Verification:** Unit test: 4 players (2 complete, 1 fail, 1 timeout) → 2 survive with points, 2 lose strikes. Grace rule: all 3 active fail → no eliminations. Last player standing → gets winner bonus.

- [ ] `startTransition()`:
  - Set `phase = 'TRANSITION'`
  - Schedule `startNextRound()` after `SS_TRANSITION_SECONDS`
  **Verification:** Next round starts after transition.

#### 7.1.4.6 Input Handling — `SS_TAP`

- [ ] Validate phase is `'INPUT'`; reject if not
- [ ] Validate sender is in `activePlayers` and not eliminated; reject if not
- [ ] Parse through `SSTapSchema`
- [ ] Check player hasn't already completed or failed this round; reject if so
- [ ] Determine expected position:
  - If `isChaosRound`: use `rotatedSequence[player.currentInputIndex]`
  - Else: use `sequence[player.currentInputIndex]`
- [ ] Compare tapped `position` against expected:
  - **Correct:**
    - Increment `player.currentInputIndex`
    - Emit `SS_TAP_RESULT` to tapper ONLY: `{ position, correct: true, currentIndex, sequenceLength }`
    - If `currentInputIndex === sequence.length`:
      - Set `hasCompletedSequence = true`, `completedAt = Date.now()`
      - Emit `SS_PLAYER_COMPLETE` to ALL: `{ userId, userName, timeMs }`
      - If ALL active players have completed or failed, immediately call `endInputPhase()`
  - **Incorrect:**
    - Set `hasFailed = true`, `failedAtIndex = player.currentInputIndex`
    - Emit `SS_TAP_RESULT` to tapper ONLY: `{ position, correct: false, currentIndex, sequenceLength }`
    - Emit `SS_PLAYER_FAILED` to ALL: `{ userId, userName, failedAtIndex }`
    - If ALL active players have completed or failed, immediately call `endInputPhase()`
  **Verification:** Unit test: correct tap → index advances. Wrong tap → immediate fail. Chaos round → rotated position used for validation. All finished → early phase end.

#### 7.1.4.7 `getStateForPlayer(userId)`

- [ ] During PATTERN_DISPLAY:
  ```ts
  { currentRound, isChaosRound, sequenceLength: sequence.length, phase, currentDisplayStep,
    myStrikesRemaining, otherPlayers: [...], scores: [...] }
  ```
  - Raw `sequence` array is NEVER included
- [ ] During INPUT:
  ```ts
  { currentRound, isChaosRound, sequenceLength, phase, timeRemaining,
    myInputIndex, myHasCompleted, myHasFailed, myStrikesRemaining,
    otherPlayers: Array<{ userId, userName, hasCompleted, hasFailed, strikesRemaining, isEliminated }>,
    scores: [...] }
  ```
  - Other players' `currentInputIndex` is NOT visible (only completed/failed status)
- [ ] During ROUND_RESULTS: include full `survivors[]` and `eliminated[]` arrays
- [ ] **CRITICAL:** The raw `sequence` and `rotatedSequence` arrays are NEVER sent to any client. Players only see tile flashes via individual `SS_PATTERN_STEP` events.
  **Verification:** Unit test: sequence array absent from all player states. Other players' input progress masked.

#### 7.1.4.8 `getStateForSpectator()`

- [ ] Same as player but with additional data:
  - Each player's `currentInputIndex` and which tiles they've tapped — spectators watch attempts in real-time
  - Still NO raw sequence in the state
  **Verification:** Spectator sees per-player tap progress.

#### 7.1.4.9 Join-in-Progress Handling

- [ ] Policy: `spectate_only`
- [ ] Sequence is cumulative; JIP player would lack context for early steps
- [ ] Send spectator state on join
  **Verification:** JIP → spectator only.

#### 7.1.4.10 Reconnection Handling (`handlePlayerReconnect(userId)`)

- [ ] If PATTERN_DISPLAY still active: player re-sees pattern from current step onward (missed earlier steps is natural penalty)
- [ ] If INPUT phase: player can continue from their `currentInputIndex`
- [ ] Strike count and elimination status preserved
- [ ] If eliminated: reconnect as spectator
- [ ] Send current timer tick with accurate time remaining
  **Verification:** Reconnect during INPUT → can continue inputting. Reconnect after elimination → spectator.

#### 7.1.4.11 Disconnect Handling (`handlePlayerDisconnect(userId)`)

- [ ] If INPUT phase and player hasn't completed/failed → they'll timeout at phase end (treated as fail)
- [ ] No special cleanup
  **Verification:** Disconnect → timeout → fail → strike deducted.

#### 7.1.4.12 `computeResults()` and Awards

- [ ] Compute final rankings: last standing → rank 1, then by elimination order (later = higher rank)
- [ ] Players eliminated on the same round share rank
- [ ] Final score = cumulative `totalScore`
- [ ] Compute awards:
  - [ ] **Memory Master** — last player standing (winner); icon: `brain`
  - [ ] **Perfect Memory** — most perfect (no-mistake) rounds; icon: `check-circle`
  - [ ] **Chaos Survivor** — survived the most Chaos Rounds; icon: `rotate-ccw`
  - [ ] **Speed Demon** — fastest average completion time across survived rounds; icon: `zap`
  - [ ] **Iron Will** — survived a round with 1 strike remaining (0 left after that round); icon: `shield`
- [ ] Return `MinigameResults` with rankings, awards, and `gameSpecificData`
  **Verification:** Unit test: scenarios for each award. Ties handled correctly.

#### 7.1.4.13 `buildGameLog()`

- [ ] Maintain an `actionLog: GameLogAction[]` array on the game instance
- [ ] Build `GameLog` conforming to core.md §13.3, including `gameSettings` per §12A.11

**`initialState` (from minigames-3.md §1.14):**

```typescript
interface SSInitialState {
  gridSize: number;
  maxStrikes: number;
  chaosInterval: number;
  playerCount: number;
  tileFlashDurationMs: number;
  inputTimePerStepMs: number;
  gameSettings: GameSettingValues;
}
```

**Actions Logged:**

| Action Type | Payload | Recorded When |
|---|---|---|
| `round_start` | `{ round: number; sequenceLength: number; sequence: number[] }` | Start of each round |
| `chaos_rotation` | `{ round: number; rotationType: string; mapping: Record<number, number> }` | When a chaos round triggers a tile remap |
| `round_result` | `{ round: number; correct: string[]; failed: string[]; strikes: Record<string, number> }` | After all inputs are evaluated |
| `elimination` | `{ userId: string; round: number; placement: number }` | When a player is eliminated |
| `game_end` | `{ winner: string; finalPlacements: Array<{ userId: string; placement: number; score: number }> }` | Game over |

- [ ] In `computeResults()`, build `GameLog` with `initialState`, full action log, and `finalResults`
- [ ] Return `GameLog` from `buildGameLog()`
  **Verification:** Unit test: 8-player game lasting 10 rounds, verify log contains `round_start`/`round_result` per round, `elimination` for each elimination, `initialState` has grid and chaos config, `finalResults` matches placements.

---

### 7.1.5 Register Game in Minigame Registry

- [ ] Add entry to `lib/rmhbox/minigame-registry.ts`:
  ```ts
  {
    id: "sequence-sam",
    displayName: "Sequence Sam",
    description: "Remember the pattern, repeat it perfectly! Chaos Rounds rotate the grid to test your spatial reasoning. Last one standing wins.",
    category: "action",
    icon: "grid-3x3",
    minPlayers: 2,
    maxPlayers: 16,
    estimatedDurationSeconds: 120,
    supportsTeams: false,
    instructionDurationSeconds: 15,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: "spectate_only",
    tags: ["action", "memory", "speed", "competitive"],
  }
  ```
  **Verification:** Registry lookup for `"sequence-sam"` returns correct metadata.

- [ ] Add server handler to `MINIGAME_SERVER_REGISTRY` in `server/rmhbox/minigame-server-registry.ts`:
  ```ts
  import { SequenceSamGame } from './minigames/sequence-sam';
  MINIGAME_SERVER_REGISTRY.set('sequence-sam', SequenceSamGame);
  ```
  **Verification:** `MINIGAME_SERVER_REGISTRY.get('sequence-sam')` returns `SequenceSamGame` class.

- [ ] Add lazy-loaded component to `MinigameRenderer` map:
  ```ts
  'sequence-sam': lazy(() => import('./minigames/sequence-sam/SequenceSamGame'))
  ```
  **Verification:** `MinigameRenderer` renders `<Suspense>` fallback, then `SequenceSamGame` component.

---

### 7.1.6 Build Client Components

#### 7.1.6.1 `components/rmhbox/minigames/sequence-sam/SequenceSamGame.tsx`

- [ ] Phase router — renders based on `phase`
- [ ] Subscribe to all `SS_*` and `TIMER_TICK` events
- [ ] Maintain local state: round, phase, chaos status, strikes, progress, player statuses
- [ ] Handle `SS_ROUND_START` → reset round state, prepare grid
- [ ] Handle `SS_PATTERN_STEP` → flash tile at given position for `SS_TILE_FLASH_DURATION_MS`
- [ ] Handle `SS_GRID_ROTATE` → trigger 90° rotation animation on the grid
- [ ] Handle `SS_PATTERN_COMPLETE` → enable input on grid tiles
- [ ] Handle `SS_TAP_RESULT` → flash tile green (correct) or red (incorrect)
- [ ] Handle `SS_PLAYER_COMPLETE` → update player status
- [ ] Handle `SS_PLAYER_FAILED` → update player status
- [ ] Handle `SS_ROUND_RESULTS` → show survivors and eliminated
- [ ] Handle `SS_ELIMINATION` → show elimination banner if self eliminated
- [ ] Handle `SS_GAME_OVER` → show final results
- [ ] Conditional rendering:
  - `PATTERN_DISPLAY` → `<GridDisplay />` with animated flashes (non-interactive)
  - `INPUT` → `<GridDisplay />` interactive (tappable tiles)
  - `ROUND_RESULTS` → results overlay
  - `GAME_OVER` → `<SequenceSamResults />`
  **Verification:** Component renders for each phase. Grid flashes play correctly. Tap handling works.

#### 7.1.6.2 `components/rmhbox/minigames/sequence-sam/GridDisplay.tsx`

- [ ] 3×3 CSS Grid layout with `GridTile` components
- [ ] During PATTERN_DISPLAY: tiles flash in sequence (non-interactive)
- [ ] During INPUT: tiles are tappable
- [ ] Chaos Round: grid rotation animation (CSS transform `rotate(90deg)` with smooth Framer Motion transition)
- [ ] Responsive sizing: grid fills available width on mobile
- [ ] Min tap target: 80px per tile on mobile
  **Verification:** Grid renders 9 tiles. Flashes animate correctly. Rotation is smooth.

#### 7.1.6.3 `components/rmhbox/minigames/sequence-sam/GridTile.tsx`

- [ ] Individual tile states: `default`, `flashing` (yellow/white glow during pattern display), `tapped-correct` (green), `tapped-incorrect` (red), `disabled` (after round fail)
- [ ] On tap: emit `rmhbox:game:input` with `{ action: "SS_TAP", data: { position } }`
- [ ] Visual feedback: brief scale animation on tap
- [ ] Accessibility: aria-label with tile position
  **Verification:** All states render correctly. Tap emits event.

#### 7.1.6.4 `components/rmhbox/minigames/sequence-sam/StrikeIndicator.tsx`

- [ ] Display hearts (❤️) for remaining strikes, black hearts (🖤) for lost strikes
- [ ] Animate heart loss (shake + fade to black)
- [ ] Accept `strikesRemaining` and `maxStrikes` as props
  **Verification:** 3 hearts → lose 1 → 2 red + 1 black. Animation plays.

#### 7.1.6.5 `components/rmhbox/minigames/sequence-sam/ChaosOverlay.tsx`

- [ ] "🌀 CHAOS ROUND!" announcement overlay
- [ ] Appears at round start for Chaos Rounds
- [ ] Brief animation (shake/spin effect), auto-dismisses after 1.5s
  **Verification:** Only appears on Chaos Rounds. Dismisses automatically.

#### 7.1.6.6 `components/rmhbox/minigames/sequence-sam/EliminationBanner.tsx`

- [ ] "You've been eliminated!" overlay
- [ ] Shows final rank and total score
- [ ] "Watch the remaining players" prompt
- [ ] Appears once, persists until game ends (with opacity to still see game)
  **Verification:** Appears on elimination. Shows rank.

#### 7.1.6.7 `components/rmhbox/minigames/sequence-sam/SequenceSamResults.tsx`

- [ ] Final rankings table: rank, player name, total score, rounds survived, perfect rounds, chaos rounds survived
- [ ] Winner highlighted with crown icon
- [ ] Awards display
  **Verification:** Rankings correct. Awards shown.

#### 7.1.6.8 Sound Effects

- [ ] Wire up sound effects using `playSound()` for each Sequence Sam event:
  - `SS_ROUND_START` → `playSound('goFanfare')`
  - `SS_PATTERN_STEP` → `playSound('click')`
  - `SS_PATTERN_COMPLETE` → `playSound('swoosh')`
  - `SS_GRID_ROTATE` (chaos round) → `playSound('swoosh')`
  - `SS_TAP_RESULT` correct → `playSound('scoreDing')`
  - `SS_TAP_RESULT` wrong / `SS_PLAYER_FAILED` → `playSound('buzzer')`
  - `SS_ELIMINATION` → `playSound('buzzer')`
  - `SS_GAME_OVER` → `playSound('victoryFanfare')`
  **Verification:** Each event triggers the correct sound exactly once. No overlapping duplicate sounds.

#### 7.1.6.9 Zustand Store Integration

- [ ] Read grid state from `publicState`
- [ ] Read own strike count and input index from `privateState` (raw sequence never exposed)
- [ ] Detect spectator mode → render read-only grid with progress indicators
  **Verification:** Players see grid + own strikes. Spectators see grid + all players' progress. Raw sequence never sent to client.

---

### 7.1.7 Integration Testing

- [ ] End-to-end test: 4 players → play through multiple rounds
  - [ ] Verify sequence grows by 1 each round (3, 4, 5, 6...)
  - [ ] Verify sequence is cumulative (each round extends the previous)
  - [ ] Verify no consecutive duplicate positions in sequence
  - [ ] Verify Chaos Round on rounds 4, 8, 12, 16, 20
  - [ ] Verify `ROTATION_MAP_CW` applied correctly (e.g., original position 0 → tapped position 2 in chaos)
  - [ ] Verify strike system: 3 strikes per player, elimination on 0
  - [ ] Verify Grace Rule: all active players fail → no eliminations
  - [ ] Verify scoring: survive + perfect bonus + chaos bonus + speed bonus + winner bonus
  **Verification:** All assertions pass.

- [ ] Information masking test:
  - [ ] Raw `sequence` array NEVER in any WebSocket event or player state
  - [ ] Pattern is delivered only via timed `SS_PATTERN_STEP` events (one at a time)
  - [ ] Other players' `currentInputIndex` not visible (only completed/failed)
  **Verification:** Zero sequence leakage.

- [ ] Reconnection test: Disconnect during PATTERN_DISPLAY → reconnect → see remaining steps only (natural penalty for missed steps)
  **Verification:** Reconnected player can attempt input but may have missed earlier steps.

### 7.1.8 Game Settings Integration (§12A)

Integrate host-configurable settings using the §12A system established in Phase 5. See `lib/rmhbox/game-settings.ts` and `BaseMinigame.getSetting()` for the canonical pattern.

#### Registry Entry

- [ ] Export `SEQUENCE_SAM_SETTINGS: GameSettingsSchema` in `lib/rmhbox/minigame-registry.ts` with 5 entries:
  - `maxRounds` (integer, default `5`, min 3, max 8, step 1)
  - `startingLength` (integer, default `3`, min 2, max 5, step 1)
  - `maxStrikes` (integer, default `3`, min 1, max 5, step 1)
  - `enableChaosRounds` (boolean, default `true`)
  - `chaosInterval` (integer, default `3`, min 2, max 5, step 1)
- [ ] Attach `settingsSchema: SEQUENCE_SAM_SETTINGS` to the `sequence-sam` `MinigameDefinition`.
  **Verification:** Registry lookup returns definition with `settingsSchema` containing 5 entries.

#### Handler `getSetting()` Integration

Replace hardcoded constants with `this.getSetting()` calls in the Sequence Sam handler:

| Constant | Setting Key | Replacement |
|---|---|---|
| `SS_MAX_ROUNDS` | `maxRounds` | `this.getSetting('maxRounds', SS_MAX_ROUNDS)` |
| `SS_STARTING_LENGTH` | `startingLength` | `this.getSetting('startingLength', SS_STARTING_LENGTH)` |
| `SS_MAX_STRIKES` | `maxStrikes` | `this.getSetting('maxStrikes', SS_MAX_STRIKES)` |
| `SS_ENABLE_CHAOS` | `enableChaosRounds` | `this.getSetting('enableChaosRounds', SS_ENABLE_CHAOS)` |
| `SS_CHAOS_INTERVAL` | `chaosInterval` | `this.getSetting('chaosInterval', SS_CHAOS_INTERVAL)` |

- [ ] **Boolean setting logic:** When `enableChaosRounds` is `false`, skip all chaos-round logic (no tile remapping, no shuffled sequences). The `chaosInterval` setting is ignored when chaos rounds are disabled.
  **Verification:** Each constant usage replaced. Handler respects custom settings passed via `MinigameContext.gameSettings`.

---

### 7.1.9 History Display Configuration

Implement the history display config for Sequence Sam as defined in `minigames-3.md §1.15`.

#### 7.1.9.1 Create Detail Component

Create `components/rmhbox/minigames/sequence-sam/SequenceSamHistoryDetail.tsx`:
- Render round-by-round elimination view with 3×3 tile grid visualization
- Show chaos round indicators with rotation badges
- Display per-player status (survived/eliminated/strikes remaining)
- Show elimination order timeline and speed bonus indicators

#### 7.1.9.2 Register History Display

Add registration in `lib/rmhbox/history-display-registrations.ts` with:
- Searchable fields: `playerNames` (player names)
- Filterable fields: `roundsSurvived` (range), `hadChaosRound` (boolean), `wasEliminated` (boolean)
- Summary: `{rounds} rounds ({chaos} chaos) — Sequence memory`

#### 7.1.9.3 Tests

- [ ] Verify `getHistoryDisplay('sequence-sam')` returns a valid config
- [ ] Verify searchable fields extract player names from a mock game log
- [ ] Verify filterable fields include roundsSurvived (range), hadChaosRound (boolean), wasEliminated (boolean)
- [ ] Verify `getSummary()` returns a meaningful string for a mock game log
- [ ] Verify `DetailComponent` renders without errors when given a valid game log

---

## 7.2 Human Keyboard

**Game ID:** `human-keyboard` | **Category:** `action` | **Icon:** `keyboard`
**Players:** 3–10 | **Duration:** ~120s (cooperative)

---

### 7.2.1 Install NPM Packages

- [ ] No additional NPM packages required for Human Keyboard
  **Verification:** Confirm no new dependencies needed.

---

### 7.2.2 Add Constants to `lib/rmhbox/constants.ts`

- [ ] Add `HK_TYPING_DURATION_SECONDS = 90` — maximum typing phase duration
- [ ] Add `HK_SENTENCE_REVEAL_SECONDS = 3` — sentence reveal duration
- [ ] Add `HK_RESULTS_SECONDS = 5` — results display duration
- [ ] Add `HK_RESHUFFLE_INTERVAL_SECONDS = 8` — time between key reshuffles
- [ ] Add `HK_RESHUFFLE_WARNING_SECONDS = 3` — warning before reshuffle
- [ ] Add `HK_SPACE_DELAY_MS = 200` — auto-advance delay for spaces
- [ ] Add `HK_WRONG_KEY_PENALTY_MS = 500` — cursor lock duration on wrong key
- [ ] Add `HK_INPUT_RATE_LIMIT = 5` — max key presses per second per player
- [ ] Add `HK_CORRECT_KEY_POINTS = 20` — points per correct key press
- [ ] Add `HK_WRONG_KEY_PENALTY_POINTS = -5` — penalty per wrong key press
- [ ] Add `HK_PERFECT_ACCURACY_BONUS = 200` — bonus for 100% accuracy
- [ ] Add `HK_COMPLETION_BONUS = 100` — bonus for completing the sentence (per player)
- [ ] Add `HK_TIME_BONUS_PER_SECOND = 5` — bonus per second remaining on completion
- [ ] Add `HK_MVP_BONUS = 100` — bonus for the player with most correct presses
- [ ] **Verification:** Import all `HK_*` constants; confirm correct types.

---

### 7.2.3 Create Static Data Files

- [ ] Create directory `public/data/rmhbox/human-keyboard/`
  **Verification:** Directory exists on disk.

- [ ] Create `public/data/rmhbox/human-keyboard/sentences.json` — curated target sentences
  - Each entry follows:
    ```ts
    {
      id: string;
      text: string;                          // e.g., "the quick brown fox jumps over the lazy dog"
      normalizedText: string;                // lowercase, only a-z and spaces
      letterCount: number;                   // count of non-space characters
      difficulty: "easy" | "medium" | "hard";
      category: string;                      // "Pangram", "Quote", "Phrase"
    }
    ```
  - [ ] Include at least 60 sentences
  - [ ] Normalized: lowercase letters and spaces only (no punctuation, no numbers)
  - [ ] Length range: 20–60 characters
  - [ ] Easy: 20–30 chars, Medium: 30–45 chars, Hard: 45–60 chars
  - [ ] At least 5 categories
  - [ ] No duplicates
  **Verification:** Parse JSON; validate all entries; confirm ≥60 sentences; confirm normalized format (regex `/^[a-z ]+$/`).

---

### 7.2.4 Define Zod Validation Schemas

- [ ] Create `lib/rmhbox/human-keyboard/schemas.ts`

- [ ] Define `HKPressSchema`:
  ```ts
  const HKPressSchema = z.object({
    key: z.string().length(1).regex(/^[a-z]$/),
  });
  ```
  **Verification:** Valid: `{ key: "a" }`, `{ key: "z" }`. Invalid: `{ key: "A" }` (uppercase), `{ key: "ab" }` (2 chars), `{ key: "1" }` (digit).

---

### 7.2.5 Create Data Loader

- [ ] Create `lib/rmhbox/human-keyboard/data-loader.ts`
  - [ ] Export `loadSentences(): TargetSentence[]` — reads and parses `sentences.json`, caches as singleton
  - [ ] Export `selectSentenceForGame(pool: TargetSentence[], playerCount: number, usedIds: Set<string>): TargetSentence`
    - Select sentence appropriate for player count (shorter for more players, longer for fewer)
    - Exclude used IDs
  **Verification:** Unit test: selection scales with player count. Exclusion works.

---

### 7.2.6 Implement Server Handler

- [ ] Create `server/rmhbox/minigames/human-keyboard.ts`

#### 7.2.6.1 Type Definitions

- [ ] Define `HKPhase` type:
  ```ts
  type HKPhase = 'SENTENCE_REVEAL' | 'TYPING' | 'RESULTS';
  ```
  **Verification:** Type has exactly 3 values.

- [ ] Define `HKPlayerStats` type:
  ```ts
  type HKPlayerStats = {
    userId: string;
    correctPresses: number;
    wrongPresses: number;
    wrongPlayerPresses: number;
    accuracy: number;
    totalScore: number;
    currentKeys: string[];
  };
  ```

- [ ] Define `HumanKeyboardState` type:
  ```ts
  type HumanKeyboardState = {
    targetSentence: TargetSentence;
    normalizedText: string;
    cursorPosition: number;
    displayCursorPosition: number;
    phase: HKPhase;
    isComplete: boolean;
    keyAssignments: Map<string, string[]>;
    letterToPlayer: Map<string, string>;
    nextReshuffleAt: number;
    reshuffleCount: number;
    playerStats: Map<string, HKPlayerStats>;
    lockUntil: number | null;
    phaseStartedAt: number;
    phaseEndsAt: number;
    startedAt: number;
    completedAt: number | null;
  };
  ```
  **Verification:** All types compile. Cross-reference against spec §2.4.

#### 7.2.6.2 Class: `HumanKeyboardGame extends BaseMinigame`

- [ ] Constructor: call `super(context)`; load sentences via data loader
  **Verification:** Instantiate class; confirm no errors.

#### 7.2.6.3 Key Assignment Algorithm

- [ ] Implement `assignKeys(playerIds: string[]): Map<string, string[]>`:
  - Shuffle the 26 letters a–z
  - Distribute evenly across players (round-robin)
  - Sort each player's assigned letters alphabetically
  - Build reverse lookup `letterToPlayer: Map<string, string>` (letter → userId)
  - For 5 players: ~5 letters each; for 3 players: ~8-9 each
  **Verification:** Unit test: 5 players → 26 letters distributed, 5 or 6 each. All 26 letters assigned. No duplicates. Reverse lookup works.

#### 7.2.6.4 State Initialization (`start()`)

- [ ] Select sentence via `selectSentenceForGame()`
- [ ] Compute `normalizedText` (lowercase, a-z and spaces only — should already be normalized in data)
- [ ] Set `cursorPosition = 0` (index into non-space characters), `displayCursorPosition = 0` (index into full string)
- [ ] Call `assignKeys()` for initial assignment
- [ ] Initialize `playerStats` for each player (all counters at 0)
- [ ] Set `phase = 'SENTENCE_REVEAL'`, `isComplete = false`
- [ ] Emit `HK_SENTENCE_REVEAL` to all: `{ sentence: targetSentence.text, normalizedLength: targetSentence.letterCount, typingDurationSeconds: HK_TYPING_DURATION_SECONDS }`
- [ ] Emit `HK_KEY_ASSIGNMENT` to each player individually: `{ assignments: Record<string, string[]>, myKeys: string[] }`
  - `assignments` contains ALL players' key lists (but see masking — other players' keys are hidden for players, visible for spectators)
  - Actually per spec: other players' key assignments are HIDDEN from players; only `myKeys` is sent
  - Revise: send `{ myKeys: string[] }` to each player only; NO global assignments map
- [ ] Schedule `startTypingPhase()` after `HK_SENTENCE_REVEAL_SECONDS`
  **Verification:** Sentence selected. Keys assigned. Each player receives only their own keys.

#### 7.2.6.5 Typing Phase

- [ ] `startTypingPhase()`:
  - Set `phase = 'TYPING'`, `startedAt = Date.now()`, `phaseEndsAt = startedAt + HK_TYPING_DURATION_SECONDS * 1000`
  - Set `nextReshuffleAt = startedAt + HK_RESHUFFLE_INTERVAL_SECONDS * 1000`
  - Start `TIMER_TICK` interval (1s)
  - Start reshuffle timer: schedule `reshuffleWarning()` at `nextReshuffleAt - HK_RESHUFFLE_WARNING_SECONDS * 1000`
  - Schedule `endTypingPhase()` after `HK_TYPING_DURATION_SECONDS`
  **Verification:** Timer starts. Reshuffle scheduled.

- [ ] `reshuffleWarning()`:
  - Emit `HK_RESHUFFLE_WARNING` to all: `{ secondsUntilReshuffle: HK_RESHUFFLE_WARNING_SECONDS }`
  - Schedule `performReshuffle()` after `HK_RESHUFFLE_WARNING_SECONDS`
  **Verification:** Warning emitted 3s before reshuffle.

- [ ] `performReshuffle()`:
  - Re-call `assignKeys()` with current active players
  - Update `keyAssignments` and `letterToPlayer`
  - Increment `reshuffleCount`
  - Emit `HK_RESHUFFLE` to all (broadcast): `{ reshuffleNumber: reshuffleCount }`
  - Emit `HK_KEY_ASSIGNMENT` to each player individually with their new `myKeys`
  - Update each player's `currentKeys` in `playerStats`
  - Set `nextReshuffleAt = Date.now() + HK_RESHUFFLE_INTERVAL_SECONDS * 1000`
  - Schedule next `reshuffleWarning()`
  - Handle orphaned keys if a player disconnected since last reshuffle (redistribute)
  **Verification:** New keys assigned. Each player notified. Next reshuffle scheduled.

- [ ] `handleSpaceAutoAdvance()`:
  - When cursor position reaches a space character in the sentence:
  - After `HK_SPACE_DELAY_MS` (200ms) delay, auto-advance cursor to the next non-space character
  - Emit `HK_SPACE_AUTO` to all: `{ newCursorPosition, newDisplayCursorPosition }`
  - Check if sentence is complete after advancing
  **Verification:** Spaces auto-skip with brief delay. Event emitted.

- [ ] `endTypingPhase()`:
  - Stop all timers
  - Set `phase = 'RESULTS'`
  - Call `computeResults()`
  **Verification:** Phase ends. Results computed.

#### 7.2.6.6 Input Handling — `HK_PRESS`

- [ ] Validate phase is `'TYPING'`; reject if not
- [ ] Parse through `HKPressSchema`
- [ ] Apply rate limiting: check player hasn't exceeded `HK_INPUT_RATE_LIMIT` presses/second; reject if exceeded
- [ ] Check cursor is not locked (`lockUntil`); if locked, reject silently
- [ ] Check sentence is not already complete; reject if so
- [ ] Determine expected character: the next non-space character at `cursorPosition` in normalized text
- [ ] Determine who owns this key: `letterToPlayer.get(pressed key)`
- [ ] Evaluate:
  - **Correct key by correct player** (pressed key === expected AND player owns it):
    - Increment `playerStats[userId].correctPresses`
    - Advance `cursorPosition` and `displayCursorPosition`
    - Emit `HK_KEY_CORRECT` to ALL: `{ key, userId, userName, cursorPosition, displayCursorPosition }`
    - Check if next character is a space → call `handleSpaceAutoAdvance()`
    - Check if sentence is complete → emit `HK_COMPLETE`, schedule results
  - **Correct key by WRONG player** (pressed key === expected BUT player doesn't own it):
    - Increment `playerStats[userId].wrongPlayerPresses`
    - Emit `HK_KEY_WRONG_PLAYER` to pressing player ONLY: `{ key, correctOwner: ownerUserId }`
    - NO cursor advance; NO penalty
  - **Wrong key entirely** (pressed key !== expected):
    - Increment `playerStats[userId].wrongPresses`
    - Emit `HK_KEY_WRONG` to pressing player ONLY: `{ key, penaltyMs: HK_WRONG_KEY_PENALTY_MS }`
    - Set `lockUntil = Date.now() + HK_WRONG_KEY_PENALTY_MS`
    - Emit `HK_CURSOR_LOCKED` to ALL: `{ lockDurationMs: HK_WRONG_KEY_PENALTY_MS, reason: "wrong key" }`
  **Verification:** Unit test: correct key by owner → cursor advances. Correct key by wrong player → rejected with "wrong player" message, no penalty. Wrong key → cursor locked for 500ms. Rate limit: 6th press in 1s rejected.

#### 7.2.6.7 Scoring Computation (`computeResults()`)

- [ ] For each player:
  - Base score: `correctPresses × HK_CORRECT_KEY_POINTS` + `wrongPresses × HK_WRONG_KEY_PENALTY_POINTS`
  - If personal accuracy === 100%: add `HK_PERFECT_ACCURACY_BONUS`
  - If sentence completed: add `HK_COMPLETION_BONUS`
  - Determine MVP: player with most `correctPresses`; award `HK_MVP_BONUS`
  - Time bonus (if completed): `HK_TIME_BONUS_PER_SECOND × Math.floor(secondsRemaining)`
- [ ] Apply team performance multiplier:
  - Time ≤ 50% of limit → "Outstanding" (1.5×)
  - Time ≤ 75% of limit → "Good" (1.0×)
  - Incomplete → "Better luck next time" (0.5×)
  - Multiply each player's score by the multiplier
- [ ] Build `HKPlayerResult[]` with all stats
- [ ] Emit `HK_RESULTS` to all: `{ playerResults, teamPerformance, timeBonus, completed }`
  **Verification:** Unit test: 3 players complete sentence in 30s (< 50% of 90s) → "Outstanding" → 1.5× multiplier. MVP is player with most correct presses.

#### 7.2.6.8 `getStateForPlayer(userId)`

- [ ] During TYPING:
  ```ts
  {
    sentence: string;
    cursorPosition: number;
    displayCursorPosition: number;
    phase: 'TYPING';
    timeRemaining: number;
    myKeys: string[];
    nextExpectedLetter: string;
    isMyTurn: boolean;                    // nextExpectedLetter is in myKeys
    myStats: { correctPresses, wrongPresses, accuracy };
    progress: number;                     // 0.0–1.0
    isLocked: boolean;
    nextReshuffleIn: number;
  }
  ```
  - Other players' key assignments NOT visible
  - Other players' individual stats NOT visible until results
  **Verification:** Own keys visible. Other keys hidden. Progress accurate.

#### 7.2.6.9 `getStateForSpectator()`

- [ ] Full state: all players' key assignments, real-time stats, which player owns the next expected letter
- [ ] Creates dramatic tension for spectators watching
  **Verification:** Spectator sees all key assignments and stats.

#### 7.2.6.10 Join-in-Progress Handling

- [ ] Policy: `spectate_only`
- [ ] Key assignments are balanced at game start; adding mid-game would require redistribution
- [ ] JIP players receive spectator state
  **Verification:** JIP → spectator.

#### 7.2.6.11 Reconnection Handling (`handlePlayerReconnect(userId)`)

- [ ] Send current key assignment, cursor position, sentence state
- [ ] Player can resume pressing keys
- [ ] If reshuffle occurred while disconnected, receive latest assignment
  **Verification:** Reconnect → current keys and state restored.

#### 7.2.6.12 Disconnect Handling (`handlePlayerDisconnect(userId)`)

- [ ] Letters assigned to the disconnected player become orphaned
- [ ] After grace period: redistribute orphaned letters among remaining players via `performReshuffle()`
- [ ] System chat message explains redistribution
  **Verification:** Orphaned letters redistributed. All 26 letters covered.

#### 7.2.6.13 `computeResults()` and Awards

- [ ] Final rankings by `totalScore` (descending)
- [ ] Compute awards:
  - [ ] **MVP Typist** — most correct key presses; icon: `crown`
  - [ ] **Perfect Fingers** — 100% accuracy (no wrong presses); icon: `check-circle`
  - [ ] **Butterfingers** — most wrong key presses; icon: `x-circle`
  - [ ] **Not My Job** — most "wrong player" presses (kept pressing keys they don't own); icon: `user-x`
  - [ ] **Team Spirit** — team completed the sentence (awarded to ALL players); icon: `users`
- [ ] Return `MinigameResults`
  **Verification:** Unit test: each award triggers correctly.

#### 7.2.6.14 `buildGameLog()`

- [ ] Maintain an `actionLog: GameLogAction[]` array on the game instance
- [ ] Build `GameLog` conforming to core.md §13.3, including `gameSettings` per §12A.11

**`initialState` (from minigames-3.md §2.15):**

```typescript
interface HKInitialState {
  sentence: string;
  sentenceLength: number;
  typingDurationSeconds: number;
  reshuffleIntervalSeconds: number;
  playerCount: number;
  initialKeyAssignments: Record<string, string[]>;
  gameSettings: GameSettingValues;
}
```

**Actions Logged:**

| Action Type | Payload | Recorded When |
|---|---|---|
| `reshuffle` | `{ period: number; newAssignments: Record<string, string[]>; progressAtReshuffle: number }` | Each key reshuffle |
| `progress_milestone` | `{ milestone: 25 \| 50 \| 75 \| 100; elapsedMs: number; currentChar: number }` | At 25%, 50%, 75%, 100% completion |
| `player_summary` | `{ userId: string; correctKeys: number; wrongKeys: number; accuracy: number }` | End of game, per player |
| `game_end` | `{ completed: boolean; finalProgress: number; elapsedMs: number; mvpUserId: string; totalCorrectKeys: number; totalWrongKeys: number }` | Game over |

- [ ] In `computeResults()`, build `GameLog` with `initialState`, full action log, and `finalResults`
- [ ] Return `GameLog` from `buildGameLog()`
  **Verification:** Unit test: 5-player game, 2 reshuffles, verify log captures `reshuffle` events, `progress_milestone` at each threshold, `player_summary` per player, `initialState` has sentence and key assignments.

---

### 7.2.7 Register Game in Minigame Registry

- [ ] Add entry to `lib/rmhbox/minigame-registry.ts`:
  ```ts
  {
    id: "human-keyboard",
    displayName: "Human Keyboard",
    description: "Each player controls a few letters. Work together to type the sentence! Keys reshuffle every 8 seconds.",
    category: "action",
    icon: "keyboard",
    minPlayers: 3,
    maxPlayers: 10,
    estimatedDurationSeconds: 120,
    supportsTeams: true,
    instructionDurationSeconds: 15,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: "spectate_only",
    tags: ["action", "coordination", "cooperative", "speed", "chaos"],
  }
  ```
  **Verification:** Registry lookup correct.

- [ ] Add server handler to `MINIGAME_SERVER_REGISTRY` in `server/rmhbox/minigame-server-registry.ts`:
  ```ts
  import { HumanKeyboardGame } from './minigames/human-keyboard';
  MINIGAME_SERVER_REGISTRY.set('human-keyboard', HumanKeyboardGame);
  ```
  **Verification:** `MINIGAME_SERVER_REGISTRY.get('human-keyboard')` returns `HumanKeyboardGame` class.

- [ ] Add lazy-loaded component to `MinigameRenderer` map:
  ```ts
  'human-keyboard': lazy(() => import('./minigames/human-keyboard/HumanKeyboardGame'))
  ```
  **Verification:** `MinigameRenderer` renders `<Suspense>` fallback, then `HumanKeyboardGame` component.

---

### 7.2.8 Build Client Components

#### 7.2.8.1 `components/rmhbox/minigames/human-keyboard/HumanKeyboardGame.tsx`

- [ ] Phase router — renders based on `phase`
- [ ] Subscribe to all `HK_*` and `TIMER_TICK` events
- [ ] Maintain local state: sentence, cursor, myKeys, stats, progress, lock status, reshuffle timer
- [ ] Handle `HK_SENTENCE_REVEAL` → store sentence
- [ ] Handle `HK_KEY_ASSIGNMENT` → update myKeys
- [ ] Handle `HK_KEY_CORRECT` → advance cursor, highlight typed character
- [ ] Handle `HK_KEY_WRONG` → shake animation on input, show penalty
- [ ] Handle `HK_KEY_WRONG_PLAYER` → show "not your key" toast
- [ ] Handle `HK_CURSOR_LOCKED` → show lock indicator, disable input briefly
- [ ] Handle `HK_SPACE_AUTO` → advance cursor past space
- [ ] Handle `HK_RESHUFFLE_WARNING` → show countdown overlay
- [ ] Handle `HK_RESHUFFLE` → scramble animation, update keys
- [ ] Handle `HK_COMPLETE` → celebration animation
- [ ] Handle `HK_RESULTS` → show results
- [ ] Conditional rendering:
  - `SENTENCE_REVEAL` → sentence display with entrance animation
  - `TYPING` → `<SentenceDisplay />` + `<KeyAssignment />` + `<KeyboardLayout />`
  - `RESULTS` → `<HumanKeyboardResults />`
  **Verification:** Component renders for each phase.

#### 7.2.8.2 `components/rmhbox/minigames/human-keyboard/SentenceDisplay.tsx`

- [ ] Full sentence text with character-by-character highlighting
- [ ] Already-typed characters in muted/grey
- [ ] Current cursor position highlighted (larger, different color)
- [ ] Remaining characters in default color
- [ ] Cursor blink animation
- [ ] Shows which letter is expected next
  **Verification:** Cursor position visually correct. Typed chars greyed out.

#### 7.2.8.3 `components/rmhbox/minigames/human-keyboard/KeyAssignment.tsx`

- [ ] Display "Your letters: [B] [F] [J] [Q] [V] [Z]"
- [ ] Each letter as a distinct button/badge
- [ ] Highlight the letter that matches the next expected character (⚡ "It's YOUR turn!")
- [ ] On key press (tap or keyboard): emit `rmhbox:game:input` with `{ action: "HK_PRESS", data: { key } }`
- [ ] Desktop keyboard capture: listen for physical keyboard presses of owned letters
- [ ] Non-owned letters on desktop: show "not your key" feedback on press
  **Verification:** Correct letter highlighted. Tap/keyboard emits event. Keyboard capture works.

#### 7.2.8.4 `components/rmhbox/minigames/human-keyboard/KeyboardLayout.tsx`

- [ ] Visual keyboard showing all 26 letters
- [ ] Owned keys highlighted/bright; unowned keys dimmed
- [ ] Active key (next expected) has prominent highlight
- [ ] Key press visual feedback (brief scale animation)
- [ ] Touch-friendly sizing (min 36px per key)
  **Verification:** Owned vs unowned visually distinct. Active key highlighted.

#### 7.2.8.5 `components/rmhbox/minigames/human-keyboard/ProgressBar.tsx`

- [ ] Horizontal progress bar: fraction of sentence completed
- [ ] Percentage label
- [ ] Animated fill on advance
  **Verification:** Progress matches cursor position.

#### 7.2.8.6 `components/rmhbox/minigames/human-keyboard/ReshuffleWarning.tsx`

- [ ] "Reshuffling in 3... 2... 1..." countdown overlay
- [ ] Appears 3s before each reshuffle
- [ ] Key scramble animation during reshuffle (keys visually shuffle)
- [ ] Auto-dismisses
  **Verification:** Warning appears at correct time. Animation plays.

#### 7.2.8.7 `components/rmhbox/minigames/human-keyboard/HumanKeyboardResults.tsx`

- [ ] Team performance badge: "Outstanding" / "Good" / "Better luck next time"
- [ ] Individual stats table: correct presses, wrong presses, accuracy, MVP indicator
- [ ] Final scores with multiplier applied
- [ ] Sentence completion time (if completed)
  **Verification:** All stats display correctly.

#### 7.2.8.8 Sound Effects

- [ ] Wire up sound effects using `playSound()` for each Human Keyboard event:
  - `HK_SENTENCE_REVEAL` → `playSound('goFanfare')`
  - `HK_KEY_CORRECT` → `playSound('scoreDing')`
  - `HK_KEY_WRONG` → `playSound('buzzer')`
  - `HK_CURSOR_LOCKED` → `playSound('buzzer')`
  - `HK_SPACE_AUTO` → `playSound('click')`
  - `HK_RESHUFFLE_WARNING` → `playSound('countdownBeep')`
  - `HK_RESHUFFLE` → `playSound('swoosh')`
  - `HK_COMPLETE` → `playSound('victoryFanfare')`
  **Verification:** Each event triggers the correct sound exactly once. No overlapping duplicate sounds.

#### 7.2.8.9 Zustand Store Integration

- [ ] Read own key assignments from `privateState`
- [ ] Read sentence and cursor from `publicState`
- [ ] Detect spectator mode → render full keyboard heatmap view showing all key assignments
  **Verification:** Players see own keys + shared sentence/cursor. Spectators see full keyboard heatmap with all assignments.

---

### 7.2.9 Integration Testing

- [ ] End-to-end test: 4 players → start Human Keyboard → type through a sentence
  - [ ] Verify 26 letters distributed evenly (~6-7 each)
  - [ ] Verify only the correct key owner can advance the cursor
  - [ ] Verify wrong-key penalty locks cursor for 500ms
  - [ ] Verify wrong-player press is rejected without penalty
  - [ ] Verify spaces auto-advance after 200ms
  - [ ] Verify reshuffle occurs every 8s with 3s warning
  - [ ] Verify completion triggers HK_COMPLETE and transitions to results
  - [ ] Verify scoring: correct keys + penalties + MVP + completion + time bonus + team multiplier
  **Verification:** All assertions pass.

- [ ] Rate limiting test: Player sends 6 key presses in 1 second → 6th rejected
  **Verification:** Rate limit enforced.

- [ ] Reshuffle stress test: 3 reshuffles occur → each time all 26 letters are assigned, no orphans
  **Verification:** All 26 letters covered after each reshuffle.

- [ ] Disconnect test: Player disconnects → their letters become orphaned → after grace period, letters redistributed
  **Verification:** Redistribution works. All 26 letters covered.

- [ ] Cursor lock test: Wrong key → cursor locked → correct key during lock → rejected → lock expires → correct key → accepted
  **Verification:** Lock timing correct.

### 7.2.10 Game Settings Integration (§12A)

Integrate host-configurable settings using the §12A system.

#### Registry Entry

- [ ] Export `HUMAN_KEYBOARD_SETTINGS: GameSettingsSchema` in `lib/rmhbox/minigame-registry.ts` with 4 entries:
  - `typingDuration` (integer, default `60`, min 30, max 120, step 10)
  - `enableReshuffle` (boolean, default `true`)
  - `reshuffleInterval` (integer, default `20`, min 10, max 45, step 5)
  - `wrongKeyLockMs` (integer, default `500`, min 0, max 2000, step 100)
- [ ] Attach `settingsSchema: HUMAN_KEYBOARD_SETTINGS` to the `human-keyboard` `MinigameDefinition`.
  **Verification:** Registry lookup returns definition with `settingsSchema` containing 4 entries.

#### Handler `getSetting()` Integration

Replace hardcoded constants with `this.getSetting()` calls in the Human Keyboard handler:

| Constant | Setting Key | Replacement |
|---|---|---|
| `HK_TYPING_DURATION` | `typingDuration` | `this.getSetting('typingDuration', HK_TYPING_DURATION)` |
| `HK_ENABLE_RESHUFFLE` | `enableReshuffle` | `this.getSetting('enableReshuffle', HK_ENABLE_RESHUFFLE)` |
| `HK_RESHUFFLE_INTERVAL` | `reshuffleInterval` | `this.getSetting('reshuffleInterval', HK_RESHUFFLE_INTERVAL)` |
| `HK_WRONG_KEY_LOCK_MS` | `wrongKeyLockMs` | `this.getSetting('wrongKeyLockMs', HK_WRONG_KEY_LOCK_MS)` |

- [ ] **Boolean setting logic:** When `enableReshuffle` is `false`, key assignments remain fixed for the entire round. The `reshuffleInterval` setting is ignored when reshuffling is disabled.
  **Verification:** Each constant usage replaced. Handler respects custom settings passed via `MinigameContext.gameSettings`.

---

### 7.2.11 History Display Configuration

Implement the history display config for Human Keyboard as defined in `minigames-3.md §2.16`.

#### 7.2.11.1 Create Detail Component

Create `components/rmhbox/minigames/human-keyboard/HumanKeyboardHistoryDetail.tsx`:
- Render cooperative typing replay with target sentence and typed progress
- Show key assignment map (player → keys visualization)
- Display per-player accuracy statistics and reshuffle timeline markers

#### 7.2.11.2 Register History Display

Add registration in `lib/rmhbox/history-display-registrations.ts` with:
- Searchable fields: `targetSentence` (sentence text), `playerNames` (player names)
- Filterable fields: `accuracy` (range), `completedSentence` (boolean)
- Summary: `"{sentence}"`

#### 7.2.11.3 Tests

- [ ] Verify `getHistoryDisplay('human-keyboard')` returns a valid config
- [ ] Verify searchable fields extract target sentence and player names from a mock game log
- [ ] Verify filterable fields include accuracy (range) and completedSentence (boolean)
- [ ] Verify `getSummary()` returns a meaningful string for a mock game log
- [ ] Verify `DetailComponent` renders without errors when given a valid game log

---

## 7.3 Cursor Curling

**Game ID:** `cursor-curling` | **Category:** `action` | **Icon:** `target`
**Players:** 2–8 | **Duration:** ~120s (3 ends)

---

### 7.3.1 Install NPM Packages

- [x] No external physics engine required
  - The physics is a simplified 2D simulation (~50 lines of code): linear velocity with friction damping, circle-circle elastic collision, and wall bouncing.
  - If future complexity is desired, consider `planck-js` (~40KB gzip), but it is NOT needed for the current spec.
  **Verification:** Confirm no new dependencies needed.

---

### 7.3.2 Add Constants to `lib/rmhbox/constants.ts`

- [x] Add `CU_TOTAL_ENDS = 3` — number of ends (rounds)
- [x] Add `CU_END_START_SECONDS = 2` — end announcement duration
- [x] Add `CU_AIM_DURATION_SECONDS = 3` — time to aim
- [x] Add `CU_POWER_DURATION_SECONDS = 2` — time for power meter
- [x] Add `CU_END_RESULTS_SECONDS = 5` — end results display
- [x] Add `CU_TRANSITION_SECONDS = 2` — transition between ends
- [x] Add `CU_CANVAS_WIDTH = 400` — rink width (px)
- [x] Add `CU_CANVAS_HEIGHT = 600` — rink height (px)
- [x] Add `CU_HOUSE_CENTER = { x: 200, y: 100 }` — house (target) center position
- [x] Add `CU_BULLSEYE_RADIUS = 15` — bullseye zone radius
- [x] Add `CU_INNER_RADIUS = 40` — inner ring radius
- [x] Add `CU_OUTER_RADIUS = 70` — outer ring radius
- [x] Add `CU_HOUSE_RADIUS = 100` — house boundary radius
- [x] Add `CU_STONE_RADIUS = 12` — stone collision radius
- [x] Add `CU_LAUNCH_Y = 550` — y-coordinate of launch zone
- [x] Add `CU_BASE_FRICTION = 0.98` — velocity multiplier per tick (< 1 for deceleration)
- [x] Add `CU_SWEPT_FRICTION = 0.995` — reduced friction when sweeping is active
- [x] Add `CU_MAX_LAUNCH_SPEED = 15` — maximum launch velocity (px/tick)
- [x] Add `CU_SIMULATION_TICK_MS = 33` — physics tick interval (~30Hz)
- [x] Add `CU_STOP_THRESHOLD = 0.1` — velocity magnitude below which stone stops
- [x] Add `CU_RESTITUTION = 0.7` — coefficient of restitution for stone-stone collisions
- [x] Add `CU_SWEEP_ZONE_RADIUS = 60` — sweep detection radius ahead of stone's direction
- [x] Add `CU_SWEEP_WINDOW_MS = 500` — sliding window for sweep frequency detection
- [x] Add `CU_SWEEP_THRESHOLD = 6` — minimum sweep events per window to be effective
- [x] Add `CU_SWEEP_INPUT_RATE_LIMIT = 15` — max sweep inputs per second per player
- [x] Add `CU_BULLSEYE_POINTS = 100` — points for bullseye zone
- [x] Add `CU_INNER_RING_POINTS = 60` — points for inner ring
- [x] Add `CU_OUTER_RING_POINTS = 30` — points for outer ring
- [x] Add `CU_HOUSE_POINTS = 10` — points for in-house but outside outer ring
- [x] Add `CU_CLOSEST_BONUS = 50` — bonus for stone closest to bullseye center
- [x] **Verification:** Import all `CU_*` constants; confirm correct types. Verify `CU_BASE_FRICTION < 1` (deceleration). Verify `CU_SWEPT_FRICTION > CU_BASE_FRICTION` (less deceleration).

---

### 7.3.3 Define Zod Validation Schemas

- [x] Create `lib/rmhbox/cursor-curling/schemas.ts`

- [x] Define `ThrowStoneSchema`:
  ```ts
  const ThrowStoneSchema = z.object({
    angle: z.number().min(-Math.PI / 2).max(Math.PI / 2),
    power: z.number().min(0).max(1),
  });
  ```
  **Verification:** Valid: `{ angle: 0, power: 0.8 }` (straight up). Invalid: `{ angle: Math.PI }` (out of range—can only throw upward).

- [x] Define `SweepSchema`:
  ```ts
  const SweepSchema = z.object({
    x: z.number().min(0).max(CU_CANVAS_WIDTH),
    y: z.number().min(0).max(CU_CANVAS_HEIGHT),
  });
  ```
  **Verification:** Valid: `{ x: 200, y: 300 }`. Invalid: `{ x: 500 }` (out of bounds).

---

### 7.3.4 Implement Server Handler

- [x] Create `server/rmhbox/minigames/cursor-curling.ts`

#### 7.3.4.1 Type Definitions

- [x] Define `CUPhase` type:
  ```ts
  type CUPhase = 'END_START' | 'AIM' | 'POWER' | 'SIMULATION' | 'END_RESULTS' | 'TRANSITION' | 'GAME_OVER';
  ```
  **Verification:** Type has exactly 7 values matching spec.

- [x] Define `CurlingStone` type:
  ```ts
  type CurlingStone = {
    id: string;
    userId: string;
    position: { x: number; y: number };
    isInPlay: boolean;
    color: string;
  };
  ```

- [x] Define `StonePhysics` type:
  ```ts
  type StonePhysics = {
    position: { x: number; y: number };
    velocity: { vx: number; vy: number };
    friction: number;
    isMoving: boolean;
  };
  ```

- [x] Define `SweepState` type:
  ```ts
  type SweepState = {
    userId: string;
    recentInputs: Array<{ x: number; y: number; timestamp: number }>;
    isSweeping: boolean;
  };
  ```

- [x] Define `EndResult` type:
  ```ts
  type EndResult = {
    endNumber: number;
    stonePositions: Array<{
      userId: string; userName: string;
      position: { x: number; y: number };
      distance: number; zone: string; points: number;
    }>;
    closestUserId: string | null;
  };
  ```

- [x] Define `CursorCurlingState` type:
  ```ts
  type CursorCurlingState = {
    currentEnd: number;
    totalEnds: number;
    phase: CUPhase;
    throwOrder: string[];
    currentThrowerIndex: number;
    stones: CurlingStone[];
    activeStoneSim: StonePhysics | null;
    sweepStates: Map<string, SweepState>;
    playerScores: Map<string, number>;
    endResults: EndResult[];
    phaseStartedAt: number;
    phaseEndsAt: number;
  };
  ```
  **Verification:** All types compile. Cross-reference against spec §3.4.

#### 7.3.4.2 Class: `CursorCurlingGame extends BaseMinigame`

- [x] Constructor: call `super(context)`
  **Verification:** Instantiate class; confirm no errors.

#### 7.3.4.3 State Initialization (`start()`)

- [x] Initialize `playerScores` with 0 for all players
- [x] Set `currentEnd = 0`, `totalEnds = CU_TOTAL_ENDS`
- [x] Initialize `stones = []`, `endResults = []`
- [x] Call `startNextEnd()`
  **Verification:** Scores initialized. End starts.

#### 7.3.4.4 Physics Engine Implementation

- [x] Implement `simulateStone(stone: StonePhysics, allStones: CurlingStone[], sweepActive: boolean): void`:
  - Called every `CU_SIMULATION_TICK_MS` (33ms) while stone is moving
  - **Friction damping:**
    - `friction = sweepActive ? CU_SWEPT_FRICTION : CU_BASE_FRICTION`
    - `stone.velocity.vx *= friction`
    - `stone.velocity.vy *= friction`
  - **Position update:**
    - `stone.position.x += stone.velocity.vx`
    - `stone.position.y += stone.velocity.vy`
  - **Wall collision:**
    - If `position.x - CU_STONE_RADIUS < 0`: `position.x = CU_STONE_RADIUS; velocity.vx = -velocity.vx`
    - If `position.x + CU_STONE_RADIUS > CU_CANVAS_WIDTH`: same, other side
    - If `position.y - CU_STONE_RADIUS < 0`: stone slides off the top → mark `isInPlay = false`, stop simulation for this stone
    - If `position.y > CU_LAUNCH_Y + 50`: stone stayed in launch zone → mark `isInPlay = false`
  - **Stone-stone collision detection:**
    - For each existing stone `other` in `allStones` (that is `isInPlay` and not self):
      - Compute distance: `dist = sqrt((x1-x2)² + (y1-y2)²)`
      - If `dist < CU_STONE_RADIUS * 2`: collision detected
      - Apply elastic collision formula:
        - Compute collision normal: `nx = (x2-x1)/dist`, `ny = (y2-y1)/dist`
        - Relative velocity: `dvx = vx1-vx2`, `dvy = vy1-vy2` (other stone is stationary or has low velocity)
        - Impulse: `impulse = (dvx*nx + dvy*ny) * (1 + CU_RESTITUTION) / 2` (equal mass)
        - Apply impulse: moving stone `vx -= impulse*nx`, `vy -= impulse*ny`; hit stone `vx += impulse*nx`, `vy += impulse*ny`
      - Emit `CU_STONE_COLLISION` to all with new positions
      - After collision, the hit stone may also start moving — need to simulate it too (or continue tracking until it stops)
  - **Stop condition:**
    - `speed = sqrt(vx² + vy²)`
    - If `speed < CU_STOP_THRESHOLD`: set `isMoving = false`, zero velocity, round position
  **Verification:** Unit test: stone launched straight up at power 1.0 → decelerates over time, stops. Stone hitting left wall → bounces. Two stones colliding → both velocities updated. Stone going off top → removed from play. Sweeping → travels farther before stopping.

- [x] Implement `runSimulationLoop()`:
  - Use `setInterval` at `CU_SIMULATION_TICK_MS` (managed via BaseMinigame timer tracking)
  - Each tick:
    - Compute sweep effectiveness for each sweeper (check frequency in `CU_SWEEP_WINDOW_MS`)
    - Determine if any sweep meets `CU_SWEEP_THRESHOLD` → `sweepActive = true`
    - Call `simulateStone()` for the active stone
    - Also simulate any other stones set in motion by collisions
    - Broadcast `CU_STONE_POSITION` for each moving stone: `{ stoneId, x, y, vx, vy }`
    - If sweeping is effective, emit `CU_SWEPT_EFFECT`: `{ stoneId, frictionReduced: true }`
    - If all stones have stopped moving:
      - Clear interval
      - Finalize stone positions → update `stones` array
      - Emit `CU_STONE_STOPPED` for each stone that just stopped
      - Call `nextThrowOrEndPhase()`
  **Verification:** Simulation loop runs at 30Hz. Position broadcasts stream to clients. Sweep effects applied. Loop terminates when all stones stop.

#### 7.3.4.5 End Lifecycle

- [x] `startNextEnd()`:
  - Increment `currentEnd`
  - If `currentEnd > totalEnds`, call `endGame()`; return
  - Randomize `throwOrder` (different order each end)
  - Set `currentThrowerIndex = -1`
  - Clear `stones = []` (fresh rink each end)
  - Set `phase = 'END_START'`
  - Emit `CU_END_START` to all: `{ endNumber: currentEnd, throwOrder: PlayerThrowInfo[] }`
  - Schedule `nextThrowOrEndPhase()` after `CU_END_START_SECONDS`
  **Verification:** New end starts. Throw order randomized. Stones cleared.

- [x] `nextThrowOrEndPhase()`:
  - Increment `currentThrowerIndex`
  - If `currentThrowerIndex >= throwOrder.length`:
    - All players have thrown → call `computeEndResults()`
    - Return
  - Set `phase = 'AIM'`
  - Emit `CU_THROWER_ACTIVE` to all: `{ userId, userName, aimDurationSeconds: CU_AIM_DURATION_SECONDS }`
  - Start aim timer; schedule power phase after `CU_AIM_DURATION_SECONDS` (if player doesn't throw earlier)
  **Verification:** Players take turns. After last player, end results computed.

- [x] `startPowerPhase()`:
  - Set `phase = 'POWER'`
  - Emit `CU_POWER_PHASE` to active thrower ONLY: `{ powerDurationSeconds: CU_POWER_DURATION_SECONDS }`
  - Schedule auto-throw (random power) after `CU_POWER_DURATION_SECONDS`
  **Verification:** Power phase started. Auto-throw on timeout.

- [x] `computeEndResults()`:
  - Set `phase = 'END_RESULTS'`
  - For each stone that is `isInPlay`:
    - Compute distance to `CU_HOUSE_CENTER`: `dist = sqrt((x - centerX)² + (y - centerY)²)`
    - Determine zone:
      - `dist <= CU_BULLSEYE_RADIUS` → "bullseye"
      - `dist <= CU_INNER_RADIUS` → "inner"
      - `dist <= CU_OUTER_RADIUS` → "outer"
      - `dist <= CU_HOUSE_RADIUS` → "house"
      - `dist > CU_HOUSE_RADIUS` → "outside" (0 points)
    - Assign points based on zone
  - Determine `closestUserId`: player whose stone has minimum distance to house center (must be within house)
  - Award `CU_CLOSEST_BONUS` to closest player
  - Update `playerScores`
  - Build `EndResult`
  - Emit `CU_END_RESULTS` to all
  - Schedule `startTransition()` after `CU_END_RESULTS_SECONDS`
  **Verification:** Unit test: stone at (200, 100) → distance 0 → bullseye → 100 points. Stone at (200, 130) → distance 30 → inner → 60 points. Closest gets +50 bonus.

- [x] `startTransition()`:
  - Set `phase = 'TRANSITION'`
  - Schedule `startNextEnd()` after `CU_TRANSITION_SECONDS`
  **Verification:** Next end starts after transition.

#### 7.3.4.6 Input Handling — `THROW_STONE`

- [x] Validate phase is `'AIM'` or `'POWER'`; reject if not
- [x] Validate sender is the active thrower (`throwOrder[currentThrowerIndex]`); reject if not
- [x] Parse through `ThrowStoneSchema`
- [x] Create `StonePhysics`:
  - `position = { x: CU_CANVAS_WIDTH / 2, y: CU_LAUNCH_Y }` (center of launch zone)
  - `velocity = { vx: Math.sin(angle) * power * CU_MAX_LAUNCH_SPEED, vy: -Math.cos(angle) * power * CU_MAX_LAUNCH_SPEED }` (negative vy = upward)
  - `friction = CU_BASE_FRICTION`
  - `isMoving = true`
- [x] Create `CurlingStone` and add to `stones` array
- [x] Set `phase = 'SIMULATION'`
- [x] Initialize `sweepStates` for all non-thrower players
- [x] Emit `CU_STONE_LAUNCHED` to all: `{ userId, angle, power }`
- [x] Start `runSimulationLoop()`
  **Verification:** Unit test: throw at angle=0, power=1.0 → stone launches straight up at max speed. Throw at angle=0.5 → launches rightward-up. Simulation starts.

#### 7.3.4.7 Input Handling — `SWEEP`

- [x] Validate phase is `'SIMULATION'`; reject if not
- [x] Validate sender is NOT the active thrower; reject if thrower tries to sweep own stone
- [x] Parse through `SweepSchema`
- [x] Apply rate limit: max `CU_SWEEP_INPUT_RATE_LIMIT` (15) per second per player
- [x] Record sweep input in `sweepStates[userId].recentInputs` with timestamp
- [x] Prune inputs older than `CU_SWEEP_WINDOW_MS` from the window
- [x] Assess sweep effectiveness:
  - Check if sweep position is within `CU_SWEEP_ZONE_RADIUS` ahead of the stone's current position and direction
  - Check if number of recent inputs in window ≥ `CU_SWEEP_THRESHOLD`
  - If both conditions met: set `isSweeping = true`
  - Emit `CU_SWEEP_ACTIVE` to all: `{ userId, userName, isActive: true }`
- [x] If conditions no longer met: `isSweeping = false`, emit `CU_SWEEP_ACTIVE` with `isActive: false`
  **Verification:** Unit test: 6 sweep inputs in 500ms near the stone → sweep active, friction reduced. 3 inputs → below threshold, no effect. Sweep position behind stone → no effect.

#### 7.3.4.8 `getStateForPlayer(userId)`

- [x] During AIM (active thrower): include aim UI data (own aim visible)
- [x] During AIM (non-thrower): see who is throwing, see all existing stones on rink
- [x] During SIMULATION:
  ```ts
  {
    currentEnd, phase, stones: [...], activeStonId,
    canSweep: boolean,      // true if not the thrower
    sweepingPlayers: Array<{ userId, userName }>,
    scores: [...]
  }
  ```
- [x] Aim direction and power meter are HIDDEN from non-throwers during AIM/POWER
- [x] During END_RESULTS: include full results with distances and zones
  **Verification:** Thrower's aim hidden from others. Stone positions visible to all during simulation.

#### 7.3.4.9 `getStateForSpectator()`

- [x] Sees thrower's aim direction and power meter level during AIM/POWER (omniscient)
- [x] Sees all stone positions and sweep activity during SIMULATION
- [x] Full experience
  **Verification:** Spectator sees aim and power.

#### 7.3.4.10 Join-in-Progress Handling

- [x] Policy: `spectate_only`
- [x] Throw order established at game start
- [x] JIP → spectator
  **Verification:** JIP → spectator.

#### 7.3.4.11 Reconnection Handling (`handlePlayerReconnect(userId)`)

- [x] Receive current stone positions, whose turn it is, scores
- [x] If it was their turn and AIM/POWER still active → can complete throw
- [x] If timeout occurred → auto-throw (power=0, angle=0 — dud throw)
  **Verification:** Reconnect during AIM → can throw. After timeout → dud throw.

#### 7.3.4.12 Disconnect Handling (`handlePlayerDisconnect(userId)`)

- [x] If it was their turn → auto-throw after brief wait (dud throw)
- [x] Their existing stones on the rink are preserved
  **Verification:** Dud throw on disconnect. Stones preserved.

#### 7.3.4.13 `computeResults()` and Awards

- [x] Final rankings by cumulative `playerScores` (descending)
- [x] Compute awards:
  - [x] **Bullseye!** — hit the bullseye in any end; icon: `target`
  - [x] **Master Sweeper** — most effective sweeping (most sweep-active time that changed friction); icon: `wind`
  - [x] **Demolition Derby** — knocked the most opponent stones out of play via collisions; icon: `boom`
  - [x] **Gentle Touch** — stone stopped closest to bullseye center (best precision across all ends); icon: `feather`
  - [x] **Off the Rails** — stone went out of bounds the most times; icon: `slash`
- [x] Return `MinigameResults`
  **Verification:** Unit test: each award triggers for appropriate scenarios.

#### 7.3.4.14 `buildGameLog()`

- [x] Maintain an `actionLog: GameLogAction[]` array on the game instance
- [x] Build `GameLog` conforming to core.md §13.3, including `gameSettings` per §12A.11

**`initialState` (from minigames-3.md §3.14):**

```typescript
interface CUInitialState {
  totalEnds: number;
  playerCount: number;
  canvasSize: { width: number; height: number };
  houseCenter: { x: number; y: number };
  bullseyeRadius: number;
  stoneRadius: number;
  throwOrder: string[];
  gameSettings: GameSettingValues;
}
```

**Actions Logged:**

| Action Type | Payload | Recorded When |
|---|---|---|
| `end_start` | `{ end: number; throwOrder: string[] }` | Start of each end |
| `throw` | `{ end: number; userId: string; angle: number; power: number; swept: boolean }` | After each player's throw completes |
| `stone_rest` | `{ end: number; userId: string; position: { x: number; y: number }; distanceToBullseye: number }` | When a stone comes to rest |
| `end_result` | `{ end: number; scores: Record<string, number>; closestUserId: string; stonePositions: Array<{ userId: string; x: number; y: number }> }` | End of each end |
| `game_end` | `{ finalScores: Record<string, number>; placements: Array<{ userId: string; placement: number; score: number }> }` | Game over |

- [x] In `computeResults()`, build `GameLog` with `initialState`, full action log, and `finalResults`
- [x] Return `GameLog` from `buildGameLog()`
  **Verification:** Unit test: 3-end game, 4 players, verify 12 `throw`/`stone_rest` actions and 3 `end_result` actions, `initialState` has house geometry and throw order.

---

### 7.3.5 Register Game in Minigame Registry

- [x] Add entry to `lib/rmhbox/minigame-registry.ts`:
  ```ts
  {
    id: "cursor-curling",
    displayName: "Cursor Curling",
    description: "Flick your stone toward the bullseye! Sweep to reduce friction, or knock opponents away.",
    category: "action",
    icon: "target",
    minPlayers: 2,
    maxPlayers: 8,
    estimatedDurationSeconds: 120,
    supportsTeams: false,
    instructionDurationSeconds: 15,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: "spectate_only",
    tags: ["action", "physics", "precision", "competitive"],
  }
  ```
  **Verification:** Registry lookup correct.

- [x] Add server handler to `MINIGAME_SERVER_REGISTRY` in `server/rmhbox/minigame-server-registry.ts`:
  ```ts
  import { CursorCurlingGame } from './minigames/cursor-curling';
  MINIGAME_SERVER_REGISTRY.set('cursor-curling', CursorCurlingGame);
  ```
  **Verification:** `MINIGAME_SERVER_REGISTRY.get('cursor-curling')` returns `CursorCurlingGame` class.

- [x] Add lazy-loaded component to `MinigameRenderer` map:
  ```ts
  'cursor-curling': lazy(() => import('./minigames/cursor-curling/CursorCurlingGame'))
  ```
  **Verification:** `MinigameRenderer` renders `<Suspense>` fallback, then `CursorCurlingGame` component.

---

### 7.3.6 Build Client Components

#### 7.3.6.1 `components/rmhbox/minigames/cursor-curling/CursorCurlingGame.tsx`

- [x] Phase router — renders based on `phase`
- [x] Subscribe to all `CU_*` and `TIMER_TICK` events
- [x] Maintain local state: end, phase, stones, active simulation, sweep status, scores
- [x] Handle `CU_END_START` → reset rink, show end number
- [x] Handle `CU_THROWER_ACTIVE` → show who's throwing
- [x] Handle `CU_STONE_LAUNCHED` → begin client-side rendering of stone trajectory
- [x] Handle `CU_STONE_POSITION` → update stone position (interpolate between ticks for smooth animation at 60fps)
- [x] Handle `CU_STONE_COLLISION` → collision particle effect
- [x] Handle `CU_SWEEP_ACTIVE` → show sweep indicators
- [x] Handle `CU_SWEPT_EFFECT` → visual indication of friction change
- [x] Handle `CU_STONE_STOPPED` → finalize stone position
- [x] Handle `CU_END_RESULTS` → show scoring
- [x] Conditional rendering:
  - `AIM` (thrower) → `<CurlingCanvas />` + `<AimArrow />`
  - `POWER` (thrower) → `<CurlingCanvas />` + `<PowerMeter />`
  - `SIMULATION` → `<CurlingCanvas />` + `<SweepOverlay />`
  - `END_RESULTS` → `<EndResults />`
  **Verification:** Component renders for each phase. Stone animation smooth.

#### 7.3.6.2 `components/rmhbox/minigames/cursor-curling/CurlingCanvas.tsx`

- [x] HTML5 Canvas (400×600) rendering the rink
- [x] Draw house: concentric circles at `CU_HOUSE_CENTER` with bullseye, inner, outer, house radii
- [x] Draw all stones as colored circles with player initials
- [x] During SIMULATION: interpolate stone positions between server ticks for smooth 60fps animation
  - Receive positions at 30Hz, render at 60fps using linear interpolation
- [x] Draw rink boundaries (walls)
- [x] Responsive scaling for different screen sizes
  **Verification:** House rings render correctly. Stones animate smoothly. Responsive.

#### 7.3.6.3 `components/rmhbox/minigames/cursor-curling/AimArrow.tsx`

- [x] Directional arrow from launch position
- [x] Desktop: follows mouse position relative to launch point; angle computed from cursor position
- [x] Mobile: drag gesture to set angle
- [x] Arrow length indicates direction (not power)
- [x] Limited to upward-facing angles (±90° from vertical)
  **Verification:** Arrow follows cursor/touch. Angle within bounds.

#### 7.3.6.4 `components/rmhbox/minigames/cursor-curling/PowerMeter.tsx`

- [x] Oscillating power bar (fills and depletes in a cycle)
- [x] Tap/click to lock in power level (0.0–1.0)
- [x] Visual: vertical bar with color gradient (green=low, yellow=mid, red=high)
- [x] Oscillation speed increases over time for difficulty
  **Verification:** Power oscillates. Lock-in captures current value. Sent to server.

#### 7.3.6.5 `components/rmhbox/minigames/cursor-curling/SweepOverlay.tsx`

- [x] Sweep zone indicator: translucent area in front of the moving stone
- [x] "Wiggle to sweep!" instruction
- [x] Desktop: detect rapid cursor movement (mouse events at high frequency)
- [x] Mobile: detect rapid touch movement (touch events)
- [x] Send `SWEEP` actions with current touch/cursor position at up to 15Hz
- [x] Visual indicator when sweep is actively effective (icon + glow effect)
  **Verification:** Sweep inputs sent at correct rate. Visual feedback on active sweep.

#### 7.3.6.6 `components/rmhbox/minigames/cursor-curling/StoneSprite.tsx`

- [x] Colored circle with player initial
- [x] Size: `CU_STONE_RADIUS` scaled to display
- [x] Shadow/3D effect for depth
- [x] Trail effect while moving
  **Verification:** Stone renders with correct color and initial.

#### 7.3.6.7 `components/rmhbox/minigames/cursor-curling/EndResults.tsx`

- [x] Stone position overlay showing distance to bullseye for each stone
- [x] Zone labels (bullseye, inner, outer, house, outside)
- [x] Points per stone
- [x] Closest-to-center highlight with bonus
- [x] Cumulative scores
  **Verification:** All info displays correctly.

#### 7.3.6.8 Sound Effects

- [x] Wire up sound effects using `playSound()` for each Cursor Curling event:
  - `CU_END_START` → `playSound('swoosh')`
  - `CU_THROWER_ACTIVE` → `playSound('chime')`
  - `CU_STONE_LAUNCHED` → `playSound('swoosh')`
  - `CU_STONE_COLLISION` → `playSound('click')`
  - `CU_STONE_STOPPED` → `playSound('click')`
  - `CU_END_RESULTS` → `playSound('victoryFanfare')`
  - `CU_GAME_OVER` → `playSound('victoryFanfare')`
  **Verification:** Each event triggers the correct sound exactly once. No overlapping duplicate sounds.

#### 7.3.6.9 Zustand Store Integration

- [x] Read stone positions and phase from `publicState`
- [x] Read aim/power preview from `privateState` (only for active thrower)
- [x] Use `requestAnimationFrame` for 60fps interpolation between 30Hz server updates
- [x] Detect spectator mode → render omniscient view with aim/power overlays
  **Verification:** Players see stones + own aim/power when active. Spectators see all overlays. Interpolation produces smooth 60fps rendering.

---

### 7.3.7 Integration Testing

- [x] End-to-end test: 3 players → 3 ends → each player throws once per end
  - [x] Verify stone physics: launches, decelerates, stops
  - [x] Verify wall bouncing: stone hits left/right wall → bounces
  - [x] Verify out-of-bounds: stone goes off top → out of play
  - [x] Verify scoring by zone proximity
  - [x] Verify closest-to-center bonus
  **Verification:** All physics and scoring assertions pass.

- [x] Stone collision test:
  - [x] Player A's stone is near bullseye; Player B throws and hits it → both stones move
  - [x] Velocity transfer based on collision angle and restitution
  - [x] Both final positions are realistic
  **Verification:** Collision physics correct. Events emitted.

- [x] Sweeping test:
  - [x] Non-thrower sends 6 sweep inputs in 500ms near the stone's path → friction reduced
  - [x] Stone travels farther with sweep vs. without sweep (compare two throws at same power/angle)
  - [x] Sweeping rate limit: 16th input in 1s rejected
  **Verification:** Swept stone travels measurably farther.

- [x] Aim/power masking test:
  - [x] During AIM: non-throwers don't see aim direction
  - [x] During POWER: non-throwers don't see power level
  - [x] Spectators see both
  **Verification:** Masking correct.

- [x] Reconnection test: Player disconnects on their turn → auto-throw (dud) → reconnect → spectator for that throw, next turn normal
  **Verification:** Auto-throw works.

### 7.3.8 Game Settings Integration (§12A)

Integrate host-configurable settings using the §12A system.

#### Registry Entry

- [x] Export `CURSOR_CURLING_SETTINGS: GameSettingsSchema` in `lib/rmhbox/minigame-registry.ts` with 4 entries:
  - `totalEnds` (integer, default `4`, min 2, max 6, step 1)
  - `aimDuration` (integer, default `15`, min 5, max 30, step 5)
  - `powerDuration` (integer, default `5`, min 3, max 10, step 1)
  - `enableSweeping` (boolean, default `true`)
- [x] Attach `settingsSchema: CURSOR_CURLING_SETTINGS` to the `cursor-curling` `MinigameDefinition`.
  **Verification:** Registry lookup returns definition with `settingsSchema` containing 4 entries.

#### Handler `getSetting()` Integration

Replace hardcoded constants with `this.getSetting()` calls in the Cursor Curling handler:

| Constant | Setting Key | Replacement |
|---|---|---|
| `CU_TOTAL_ENDS` | `totalEnds` | `this.getSetting('totalEnds', CU_TOTAL_ENDS)` |
| `CU_AIM_DURATION` | `aimDuration` | `this.getSetting('aimDuration', CU_AIM_DURATION)` |
| `CU_POWER_DURATION` | `powerDuration` | `this.getSetting('powerDuration', CU_POWER_DURATION)` |
| `CU_ENABLE_SWEEPING` | `enableSweeping` | `this.getSetting('enableSweeping', CU_ENABLE_SWEEPING)` |

- [x] **Boolean setting logic:** When `enableSweeping` is `false`, skip the sweeping phase entirely after stone release — the stone travels on its natural trajectory without team intervention.
  **Verification:** Each constant usage replaced. Handler respects custom settings passed via `MinigameContext.gameSettings`.

### 7.3.9 History Display Configuration

Implement the history display config for Cursor Curling as defined in `minigames-3.md §3.15`.

#### 7.3.9.1 Create Detail Component

Create `components/rmhbox/minigames/cursor-curling/CursorCurlingHistoryDetail.tsx`:
- Render per-end scoring summary with stone positions on house visualization
- Show distance-from-center ranking and sweep activity indicators
- Display per-end scoring breakdown (bullseye/inner/outer/house/outside)

#### 7.3.9.2 Register History Display

Add registration in `lib/rmhbox/history-display-registrations.ts` with:
- Searchable fields: `playerNames` (player names)
- Filterable fields: `hitBullseye` (boolean), `endCount` (range), `sweepCount` (range)
- Summary: `{ends} ends — Curling precision`

#### 7.3.9.3 Tests

- [x] Verify `getHistoryDisplay('cursor-curling')` returns a valid config
- [x] Verify searchable fields extract player names from a mock game log
- [x] Verify filterable fields include hitBullseye (boolean), endCount (range), sweepCount (range)
- [x] Verify `getSummary()` returns a meaningful string for a mock game log
- [x] Verify `DetailComponent` renders without errors when given a valid game log

---

## 7.4 Human Tetris

**Game ID:** `human-tetris` | **Category:** `action` | **Icon:** `square-stack`
**Players:** 4–10 | **Duration:** ~120s (8 waves, cooperative)

---

### 7.4.1 Install NPM Packages

- [x] No additional NPM packages required for Human Tetris
  - Pure grid-based movement logic and shape generation.
  **Verification:** Confirm no new dependencies needed.

---

### 7.4.2 Add Constants to `lib/rmhbox/constants.ts`

- [x] Add `HT_TOTAL_WAVES = 8` — number of waves
- [x] Add `HT_GRID_COLS = 8` — grid column count
- [x] Add `HT_GRID_ROWS = 6` — grid row count
- [x] Add `HT_EASY_POSITION_SECONDS = 8` — positioning time for waves 1–3
- [x] Add `HT_MEDIUM_POSITION_SECONDS = 6` — positioning time for waves 4–6
- [x] Add `HT_HARD_POSITION_SECONDS = 4` — positioning time for waves 7–8
- [x] Add `HT_WALL_PREVIEW_SECONDS = 3` — wall preview duration
- [x] Add `HT_WALL_IMPACT_SECONDS = 1` — wall impact animation duration
- [x] Add `HT_WAVE_RESULTS_SECONDS = 2` — wave results display
- [x] Add `HT_EXCLUSION_RATIO = 0.2` — fraction of players that must hide in dead zones (medium/hard waves)
- [x] Add `HT_DEAD_ZONE_MIN_COUNT = 2` — minimum dead zone cells
- [x] Add `HT_MOVE_RATE_LIMIT = 6` — max moves per second per player
- [x] Add `HT_SUCCESS_POINTS = 100` — points per player on team success
- [x] Add `HT_PARTIAL_POINTS = 30` — base points for partial success (multiplied by fill ratio)
- [x] Add `HT_CORRECT_POSITION_POINTS = 50` — points for being in correct position
- [x] Add `HT_HIT_PENALTY = -20` — penalty for being hit by the wall
- [x] Add `HT_PERFECT_WAVE_BONUS = 50` — bonus per player for success with ≥2s remaining
- [x] Add `HT_STREAK_BONUS = 200` — bonus per player for all 8 waves successful
- [x] **Verification:** Import all `HT_*` constants; confirm correct types.

---

### 7.4.3 Create Static Data Files

- [x] Create directory `public/data/rmhbox/human-tetris/`
  **Verification:** Directory exists on disk.

- [x] Create `public/data/rmhbox/human-tetris/shapes.json` — wall shape templates
  - Each entry follows:
    ```ts
    {
      id: string;
      holes: Array<{ col: number; row: number }>;
      requiredPlayers: number;
      difficulty: "easy" | "medium" | "hard";
      description: string;                            // e.g., "L-shape", "T-shape", "Line"
    }
    ```
  - [x] Include at least 40 shape templates
  - [x] Shapes range from 3-hole (easy, small groups) to 8-hole (hard, large groups)
  - [x] All shapes must have connected holes (orthogonally adjacent — no floating islands)
  - [x] Shapes centered within the 8×6 grid (not touching edges to leave room for dead zones)
  - [x] Include variety: lines, L-shapes, T-shapes, squares, zigzags, crosses
  - [x] Difficulty balanced: ≥15 easy, ≥15 medium, ≥10 hard
  **Verification:** Parse JSON; validate all entries; confirm connectivity (flood-fill each shape); confirm ≥40 templates.

---

### 7.4.4 Define Zod Validation Schemas

- [x] Create `lib/rmhbox/human-tetris/schemas.ts`

- [x] Define `HTMoveSchema`:
  ```ts
  const HTMoveSchema = z.object({
    direction: z.enum(['up', 'down', 'left', 'right']),
  });
  ```
  **Verification:** Valid: `{ direction: "up" }`. Invalid: `{ direction: "diagonal" }`.

---

### 7.4.5 Create Data Loader and Shape Generator

- [x] Create `lib/rmhbox/human-tetris/shape-generator.ts`
  - [x] Export `loadShapeTemplates(): ShapeTemplate[]` — reads and parses `shapes.json`, caches as singleton
  - [x] Export `selectShapeForWave(templates: ShapeTemplate[], waveNumber: number, playerCount: number, usedIds: Set<string>): WallShape`:
    - Determine `requiredPlayers` based on wave difficulty:
      - Waves 1–3 (easy): `requiredPlayers = playerCount` (all must fill holes)
      - Waves 4–8 (medium/hard): `requiredPlayers = playerCount - floor(playerCount × HT_EXCLUSION_RATIO)`
    - Find templates with matching `requiredPlayers` count and appropriate difficulty
    - If no exact match: scale a template (add/remove holes) to match required count via connected expansion/contraction
    - Exclude used templates
    - Return `WallShape` with holes, requiredPlayers, and deadZones
  - [x] Export `generateDeadZones(gridCols: number, gridRows: number, holes: GridPosition[], extraPlayers: number): GridPosition[]`:
    - Place dead zones: corners first, then edges
    - Count: `extraPlayers + HT_DEAD_ZONE_MIN_COUNT` (minimum 2, typically `totalPlayers - requiredPlayers + 2`)
    - Dead zones must NOT overlap with hole positions
  - [x] Export `validateConnectedness(holes: GridPosition[]): boolean`:
    - Flood-fill from first hole; confirm all holes reachable
  **Verification:** Unit test: 6 players, wave 1 (easy) → 6 holes. Wave 5 (medium) → 5 holes (6 - floor(6 × 0.2) = 5), 1 player + 2 dead zones. All shapes connected. Dead zones don't overlap holes.

---

### 7.4.6 Implement Server Handler

- [x] Create `server/rmhbox/minigames/human-tetris.ts`

#### 7.4.6.1 Type Definitions

- [x] Define `HTPhase` type:
  ```ts
  type HTPhase = 'WALL_PREVIEW' | 'POSITIONING' | 'WALL_IMPACT' | 'WAVE_RESULTS' | 'GAME_OVER';
  ```
  **Verification:** Type has exactly 5 values.

- [x] Define `GridPosition` type:
  ```ts
  type GridPosition = { col: number; row: number };
  ```

- [x] Define `WallShape` type:
  ```ts
  type WallShape = {
    holes: GridPosition[];
    requiredPlayers: number;
    deadZones: GridPosition[];
    difficulty: 'easy' | 'medium' | 'hard';
  };
  ```

- [x] Define `WaveResult` type:
  ```ts
  type WaveResult = {
    waveNumber: number;
    success: boolean;
    filledHoles: number;
    totalHoles: number;
    playersInCorrectPosition: string[];
    playersHitByWall: string[];
    teamScore: number;
  };
  ```

- [x] Define `HumanTetrisState` type:
  ```ts
  type HumanTetrisState = {
    currentWave: number;
    totalWaves: number;
    phase: HTPhase;
    gridCols: number;
    gridRows: number;
    currentWall: WallShape | null;
    playerPositions: Map<string, GridPosition>;
    waveResults: WaveResult[];
    consecutiveSuccesses: number;
    playerScores: Map<string, number>;
    phaseStartedAt: number;
    phaseEndsAt: number;
  };
  ```
  **Verification:** All types compile. Cross-reference against spec §4.4.

#### 7.4.6.2 Class: `HumanTetrisGame extends BaseMinigame`

- [x] Constructor: call `super(context)`; load shape templates
  **Verification:** Instantiate class; confirm no errors.

#### 7.4.6.3 State Initialization (`start()`)

- [x] Initialize `playerScores` with 0 for all players
- [x] Initialize `playerPositions` — random starting positions on the grid (no overlaps)
- [x] Set `currentWave = 0`, `totalWaves = HT_TOTAL_WAVES`
- [x] Set `consecutiveSuccesses = 0`, `waveResults = []`
- [x] Call `startNextWave()`
  **Verification:** All players placed. No overlapping starting positions.

#### 7.4.6.4 Wave Lifecycle

- [x] `startNextWave()`:
  - Increment `currentWave`
  - If `currentWave > totalWaves`, call `endGame()`; return
  - Select shape via `selectShapeForWave()` based on wave number, player count
  - Generate dead zones via `generateDeadZones()`
  - Set `currentWall` with holes and dead zones
  - Set `phase = 'WALL_PREVIEW'`
  - Emit `HT_WAVE_START` to all:
    ```ts
    { waveNumber: currentWave, wall: WallShapeView, positioningSeconds, deadZones, requiredPlayers }
    ```
    - `positioningSeconds` based on difficulty: waves 1-3 = 8s, 4-6 = 6s, 7-8 = 4s
  - Start `TIMER_TICK` interval
  - Schedule `startPositioning()` after `HT_WALL_PREVIEW_SECONDS`
  **Verification:** Shape generated. Event emitted with correct duration.

- [x] `startPositioning()`:
  - Set `phase = 'POSITIONING'`
  - Determine positioning duration based on wave difficulty
  - Schedule `wallImpact()` after positioning duration
  **Verification:** Phase transitions. Timer runs.

- [x] `wallImpact()`:
  - Stop timer
  - Set `phase = 'WALL_IMPACT'`
  - Evaluate each player's position:
    - Build set of hole positions and dead zone positions
    - For each player:
      - If position is in `holes` → status `'IN_HOLE'`
      - If position is in `deadZones` → status `'IN_DEAD_ZONE'`
      - Else → status `'HIT_BY_WALL'`
  - Compute `filledHoles`: count of hole positions occupied by at least one player
  - Compute `allHolesFilled = (filledHoles === currentWall.holes.length)`
  - Compute `allPlayersSafe = (no player has status 'HIT_BY_WALL')`
  - `success = allHolesFilled && allPlayersSafe`
  - Emit `HT_WALL_IMPACT` to all with `WallImpactResult`
  - Call `computeWaveScore()`
  **Verification:** Unit test: 5 players, 4 holes, 2 dead zones → all in correct positions → success. 1 player on regular cell → hit → partial.

- [x] `computeWaveScore()`:
  - If `success`:
    - Each player: `+HT_SUCCESS_POINTS` (100)
    - If time remaining ≥ 2s: `+HT_PERFECT_WAVE_BONUS` (50) per player
    - Increment `consecutiveSuccesses`
    - If `consecutiveSuccesses === HT_TOTAL_WAVES`: `+HT_STREAK_BONUS` (200) per player
  - If partial (some holes filled but not all):
    - `partialScore = HT_PARTIAL_POINTS × (filledHoles / totalHoles)`
    - Players in correct positions: `+HT_CORRECT_POSITION_POINTS` (50)
    - Players hit by wall: `+HT_HIT_PENALTY` (-20)
    - Reset `consecutiveSuccesses = 0`
  - If failure (no holes filled):
    - Players hit by wall: `+HT_HIT_PENALTY` (-20)
    - Reset `consecutiveSuccesses = 0`
  - Update `playerScores`
  - Build `WaveResult`
  - Set `phase = 'WAVE_RESULTS'`
  - Emit `HT_WAVE_RESULTS` to all
  - Schedule `startNextWave()` after `HT_WAVE_RESULTS_SECONDS`
  **Verification:** Full success → 100 + optional 50 per player. Partial → proportional scoring. Streak tracks consecutive successes.

#### 7.4.6.5 Input Handling — `HT_MOVE`

- [x] Validate phase is `'POSITIONING'`; reject if not
- [x] Parse through `HTMoveSchema`
- [x] Apply rate limit: max `HT_MOVE_RATE_LIMIT` (6) moves/second per player; reject if exceeded
- [x] Compute new position based on direction:
  - `up`: `row - 1`; `down`: `row + 1`; `left`: `col - 1`; `right`: `col + 1`
- [x] Validate new position:
  - Within bounds: `0 <= col < HT_GRID_COLS`, `0 <= row < HT_GRID_ROWS`
  - Cell not occupied by another player UNLESS it's a dead zone (dead zones allow multiple occupants)
- [x] If valid:
  - Update `playerPositions[userId]` to new position
  - Emit `HT_PLAYER_MOVED` to ALL: `{ userId, userName, col, row }`
- [x] If invalid:
  - Emit `HT_MOVE_REJECTED` to mover ONLY: `{ reason: 'OUT_OF_BOUNDS' | 'CELL_OCCUPIED' | 'RATE_LIMITED' }`
  **Verification:** Unit test: valid move → position updates, event broadcast. Out of bounds → rejected. Occupied non-dead-zone cell → rejected. Dead zone cell with another player → allowed.

#### 7.4.6.6 `getStateForPlayer(userId)`

- [x] During POSITIONING:
  ```ts
  {
    waveNumber, totalWaves, phase, gridCols, gridRows,
    wall: WallShapeView,
    deadZones: GridPosition[],
    requiredPlayers: number,
    timeRemaining: number,
    playerPositions: Array<{ userId, userName, col, row, isMe }>,
    filledHoles: GridPosition[],         // which holes currently have a player
    unfilledHoles: GridPosition[],       // which holes are still empty
    scores: [...],
    consecutiveSuccesses: number,
  }
  ```
  - All player positions visible (cooperative — need to see everyone to coordinate)
  **Verification:** All positions visible. Filled/unfilled holes computed from current positions.

#### 7.4.6.7 `getStateForSpectator()`

- [x] Same as player view (minimal masking — cooperative game)
  **Verification:** Spectator sees everything players see.

#### 7.4.6.8 Join-in-Progress Handling

- [x] Policy: `spectate_only`
- [x] Wall shapes pre-generated for current player count
- [x] JIP → spectator
  **Verification:** JIP → spectator.

#### 7.4.6.9 Reconnection Handling (`handlePlayerReconnect(userId)`)

- [x] Send current wall shape, all player positions, dead zones, timer
- [x] Avatar position preserved (wherever they were)
- [x] Can immediately start moving
  **Verification:** Position preserved. Can move immediately.

#### 7.4.6.10 Disconnect Handling (`handlePlayerDisconnect(userId)`)

- [x] Avatar stays in last position (frozen)
- [x] May cause wave failure if needed in a hole
- [x] If remaining players < `minPlayers` (4), force-end
  **Verification:** Frozen avatar. Force-end below min.

#### 7.4.6.11 `computeResults()` and Awards

- [x] Final rankings by `playerScores` (descending)
- [x] Compute awards:
  - [x] **Perfect Team** — all 8 waves successful (team award, given to all); icon: `trophy`
  - [x] **Dead Zone Expert** — successfully hid in dead zones the most times; icon: `ghost`
  - [x] **Shape Filler** — was in a hole cell correctly the most times; icon: `puzzle`
  - [x] **Wall Magnet** — got hit by the wall the most times; icon: `zap`
  - [x] **Speed Mover** — reached correct position with the most time remaining (averaged); icon: `rabbit`
- [x] Return `MinigameResults`
  **Verification:** Each award triggers correctly.

#### 7.4.6.12 `buildGameLog()`

- [x] Maintain an `actionLog: GameLogAction[]` array on the game instance
- [x] Build `GameLog` conforming to core.md §13.3, including `gameSettings` per §12A.11

**`initialState` (from minigames-3.md §4.16):**

```typescript
interface HTInitialState {
  playerCount: number;
  arenaSize: { width: number; height: number };
  wallSpeedInitial: number;
  totalWaves: number;
  gapTolerance: number;
  movementSpeed: number;
  gameSettings: GameSettingValues;
}
```

**Actions Logged:**

| Action Type | Payload | Recorded When |
|---|---|---|
| `wave_start` | `{ wave: number; wallShape: Array<{ x: number; y: number; width: number; height: number }>; requiredPlayers: number; wallSpeed: number }` | Start of each wave |
| `wave_impact` | `{ wave: number; playerPositions: Array<{ userId: string; x: number; y: number }>; success: boolean; playersHit: string[] }` | Moment of wall impact |
| `wave_result` | `{ wave: number; passed: boolean; teamScore: number; streak: number }` | After wave evaluation |
| `game_end` | `{ wavesCompleted: number; totalWaves: number; finalScore: number; perfectWaves: number; longestStreak: number }` | Game over |

- [x] In `computeResults()`, build `GameLog` with `initialState`, full action log, and `finalResults`
- [x] Return `GameLog` from `buildGameLog()`
  **Verification:** Unit test: 8-wave game, verify 8 `wave_start` and 8 `wave_result` actions, `wave_impact` with player positions, `game_end` with streak data, `initialState` has arena config and wave parameters.

---

### 7.4.7 Register Game in Minigame Registry

- [x] Add entry to `lib/rmhbox/minigame-registry.ts`:
  ```ts
  {
    id: "human-tetris",
    displayName: "Human Tetris",
    description: "Position your team to fill the holes in the wall! Extra players must hide in dead zones.",
    category: "action",
    icon: "square-stack",
    minPlayers: 4,
    maxPlayers: 10,
    estimatedDurationSeconds: 120,
    supportsTeams: true,
    instructionDurationSeconds: 15,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: "spectate_only",
    tags: ["action", "coordination", "cooperative", "spatial"],
  }
  ```
  **Verification:** Registry lookup correct.

- [x] Add server handler to `MINIGAME_SERVER_REGISTRY` in `server/rmhbox/minigame-server-registry.ts`:
  ```ts
  import { HumanTetrisGame } from './minigames/human-tetris';
  MINIGAME_SERVER_REGISTRY.set('human-tetris', HumanTetrisGame);
  ```
  **Verification:** `MINIGAME_SERVER_REGISTRY.get('human-tetris')` returns `HumanTetrisGame` class.

- [x] Add lazy-loaded component to `MinigameRenderer` map:
  ```ts
  'human-tetris': lazy(() => import('./minigames/human-tetris/HumanTetrisGame'))
  ```
  **Verification:** `MinigameRenderer` renders `<Suspense>` fallback, then `HumanTetrisGame` component.

---

### 7.4.8 Build Client Components

#### 7.4.8.1 `components/rmhbox/minigames/human-tetris/HumanTetrisGame.tsx`

- [x] Phase router — renders based on `phase`
- [x] Subscribe to all `HT_*` and `TIMER_TICK` events
- [x] Maintain local state: wave, phase, wall, positions, results, streak
- [x] Handle `HT_WAVE_START` → store wall shape, dead zones, show preview
- [x] Handle `HT_PLAYER_MOVED` → update position on grid
- [x] Handle `HT_MOVE_REJECTED` → show rejection feedback
- [x] Handle `HT_WALL_IMPACT` → trigger wall animation, show results
- [x] Handle `HT_WAVE_RESULTS` → display success/failure
- [x] Handle `HT_GAME_OVER` → show final results
- [x] Conditional rendering:
  - `WALL_PREVIEW` → `<WallPreview />`
  - `POSITIONING` → `<WallCanvas />` + `<SwipeDetector />`
  - `WALL_IMPACT` → `<WallAnimation />`
  - `WAVE_RESULTS` → `<WaveResults />`
  **Verification:** Renders for each phase. Events handled correctly.

#### 7.4.8.2 `components/rmhbox/minigames/human-tetris/WallCanvas.tsx`

- [x] 8×6 grid renderer using CSS Grid or Canvas
- [x] Cell types with distinct visuals:
  - **Hole cells**: marked with distinctive color/pattern (transparent or highlighted border)
  - **Dead zones**: skull icon (💀) or different background
  - **Wall cells**: solid dark color
  - **Regular cells**: neutral background
- [x] Player avatars rendered on their cells (colored circle with initial)
- [x] Real-time position updates as players move
- [x] Visual indicators:
  - Filled hole: green highlight
  - Unfilled hole: pulsing/red highlight
  - Player on wrong cell: subtle warning indicator
- [x] Responsive sizing (cells scale with screen)
  **Verification:** Grid renders correctly. All cell types visually distinct. Positions update in real-time.

#### 7.4.8.3 `components/rmhbox/minigames/human-tetris/GridCell.tsx`

- [x] Individual cell component with state-driven styling
- [x] States: `wall`, `hole` (empty), `hole-filled`, `dead-zone`, `regular`
- [x] Player avatar overlay when occupied
  **Verification:** All states render correctly.

#### 7.4.8.4 `components/rmhbox/minigames/human-tetris/PlayerAvatar.tsx`

- [x] Small colored circle with player initial/name
- [x] Smooth CSS transition when moving between cells
- [x] "You" label for own avatar
- [x] Glow effect when in correct position (hole or dead zone)
  **Verification:** Avatar moves smoothly. Own avatar identified.

#### 7.4.8.5 `components/rmhbox/minigames/human-tetris/WallPreview.tsx`

- [x] Shows incoming wall shape before positioning begins
- [x] Required player count: "Fill 5 holes! (2 players must hide)"
- [x] Dead zone locations marked
- [x] Entrance animation (wall slides in from side)
  **Verification:** Shape displayed. Player count info correct.

#### 7.4.8.6 `components/rmhbox/minigames/human-tetris/WallAnimation.tsx`

- [x] Wall "moves through" animation when timer expires
- [x] Safe players shown in green; hit players in red with impact effect
- [x] Brief dramatic pause before results
  **Verification:** Animation plays. Hit/safe visuals correct.

#### 7.4.8.7 `components/rmhbox/minigames/human-tetris/SwipeDetector.tsx`

- [x] Mobile swipe detection for movement (up/down/left/right)
- [x] Desktop arrow key listener
- [x] Rate-limited to `HT_MOVE_RATE_LIMIT` on client side (server also enforces)
- [x] Emits `rmhbox:game:input` with `{ action: "HT_MOVE", data: { direction } }`
- [x] Prevent page scroll during swipe
  **Verification:** Swipe detects direction. Keyboard arrows work. Rate limited.

#### 7.4.8.8 `components/rmhbox/minigames/human-tetris/WaveResults.tsx`

- [x] Success/failure banner with Framer Motion animation
- [x] "Wave 5 Complete! ✅" or "Wave 5 Failed ❌"
- [x] Player-by-player results: in hole ✅, in dead zone ✅, hit by wall ❌
- [x] Team score for the wave
- [x] Streak counter: "🔥 4 in a row!"
  **Verification:** All info displays. Streak counter accurate.

#### 7.4.8.9 Sound Effects

- [x] Wire up sound effects using `playSound()` for each Human Tetris event:
  - `HT_WAVE_START` → `playSound('swoosh')`
  - `HT_PLAYER_MOVED` (own) → `playSound('click')`
  - `HT_MOVE_REJECTED` → `playSound('buzzer')`
  - `HT_WALL_IMPACT` (all safe) → `playSound('victoryFanfare')`
  - `HT_WALL_IMPACT` (hit) → `playSound('buzzer')`
  - `HT_GAME_OVER` → `playSound('victoryFanfare')`
  **Verification:** Each event triggers the correct sound exactly once. No overlapping duplicate sounds.

#### 7.4.8.10 Zustand Store Integration

- [x] Read all player positions, wall shape, and dead zones from `publicState` (cooperative game — all positions visible)
- [x] Detect spectator mode → disable `SwipeDetector` / movement input
  **Verification:** All players see full board state. Spectators see full board but cannot send movement inputs.

---

### 7.4.9 Integration Testing

- [x] End-to-end test: 6 players → 8 waves
  - [x] Verify wave 1-3 (easy): all 6 must fill holes, positioning time = 8s
  - [x] Verify wave 4-6 (medium): 5 must fill holes, 1 must hide, positioning time = 6s
  - [x] Verify wave 7-8 (hard): 5 must fill holes, 1 must hide, positioning time = 4s
  - [x] Verify wall shapes are connected (no floating islands)
  - [x] Verify dead zones don't overlap with holes
  - [x] Verify collision: two players can't occupy same non-dead-zone cell
  - [x] Verify dead zones: multiple players CAN occupy same dead zone cell
  - [x] Verify scoring: success 100pts, partial proportional, hit -20, perfect wave +50, streak +200
  **Verification:** All assertions pass.

- [x] Movement test:
  - [x] Move up from row 0 → rejected (out of bounds)
  - [x] Move right from col 7 → rejected (out of bounds)
  - [x] Move into occupied regular cell → rejected
  - [x] Move into dead zone with another player → accepted
  - [x] 7 moves in 1 second → 7th rejected (rate limit)
  **Verification:** Boundary, collision, and rate limit all work.

- [x] Shape scaling test: 4 players → shapes have 4 holes (easy) or 3 holes + 1 dead zone (medium). 10 players → shapes scale up.
  **Verification:** Shapes match player count.

- [x] Disconnect test: Player disconnects → avatar frozen → may cause wave failure if in wrong position
  **Verification:** Frozen avatar persists. Wave evaluation handles it.

- [x] Streak test: 8 consecutive successes → `HT_STREAK_BONUS` awarded to all
  **Verification:** Streak bonus triggers.

### 7.4.10 Game Settings Integration (§12A)

Integrate host-configurable settings using the §12A system.

#### Registry Entry

- [x] Export `HUMAN_TETRIS_SETTINGS: GameSettingsSchema` in `lib/rmhbox/minigame-registry.ts` with 4 entries:
  - `totalWaves` (integer, default `8`, min 4, max 12, step 1)
  - `wallPreviewDuration` (integer, default `5`, min 2, max 10, step 1)
  - `startingPositionTime` (integer, default `8`, min 4, max 15, step 1)
  - `enableDeadZones` (boolean, default `false`)
- [x] Attach `settingsSchema: HUMAN_TETRIS_SETTINGS` to the `human-tetris` `MinigameDefinition`.
  **Verification:** Registry lookup returns definition with `settingsSchema` containing 4 entries.

#### Handler `getSetting()` Integration

Replace hardcoded constants with `this.getSetting()` calls in the Human Tetris handler:

| Constant | Setting Key | Replacement |
|---|---|---|
| `HT_TOTAL_WAVES` | `totalWaves` | `this.getSetting('totalWaves', HT_TOTAL_WAVES)` |
| `HT_WALL_PREVIEW_DURATION` | `wallPreviewDuration` | `this.getSetting('wallPreviewDuration', HT_WALL_PREVIEW_DURATION)` |
| `HT_STARTING_POSITION_TIME` | `startingPositionTime` | `this.getSetting('startingPositionTime', HT_STARTING_POSITION_TIME)` |
| `HT_ENABLE_DEAD_ZONES` | `enableDeadZones` | `this.getSetting('enableDeadZones', HT_ENABLE_DEAD_ZONES)` |

- [x] **Boolean setting logic:** When `enableDeadZones` is `true`, the handler spawns dead-zone grid cells that eliminate players on contact. Default is `false` — enabling this is an advanced difficulty modifier.
  **Verification:** Each constant usage replaced. Handler respects custom settings passed via `MinigameContext.gameSettings`.

### 7.4.11 History Display Configuration

Implement the history display config for Human Tetris as defined in `minigames-3.md §4.17`.

#### 7.4.11.1 Create Detail Component

Create `components/rmhbox/minigames/human-tetris/HumanTetrisHistoryDetail.tsx`:
- Render block-by-block summary with block shapes and placement positions
- Show line clear events, voting results for rotation decisions
- Display team coordination score and game-over condition

#### 7.4.11.2 Register History Display

Add registration in `lib/rmhbox/history-display-registrations.ts` with:
- Searchable fields: `playerNames` (player names)
- Filterable fields: `linesCleared` (range), `blocksPlaced` (range)
- Summary: `{blocks} blocks, {clears} lines cleared`

#### 7.4.11.3 Tests

- [x] Verify `getHistoryDisplay('human-tetris')` returns a valid config
- [x] Verify searchable fields extract player names from a mock game log
- [x] Verify filterable fields include linesCleared (range) and blocksPlaced (range)
- [x] Verify `getSummary()` returns a meaningful string for a mock game log
- [x] Verify `DetailComponent` renders without errors when given a valid game log

---

## 7.5 Cross-Game Integration Testing

### 7.5.1 Registry Verification

- [ ] Verify all 4 Phase 7 games registered in the minigame registry
- [ ] Call registry lookup for each: `"sequence-sam"`, `"human-keyboard"`, `"cursor-curling"`, `"human-tetris"`
- [ ] Confirm all metadata fields correct
- [ ] Confirm each handler instantiates with valid context
  **Verification:** All 4 games registered and instantiable.

### 7.5.2 Random Selection Test

- [x] Phase 7 games appear in random selection pool
- [x] Player count filtering: 2-player lobby excludes `"human-keyboard"` (min 3), `"human-tetris"` (min 4)
- [x] 3-player lobby excludes `"human-tetris"` (min 4) but includes `"human-keyboard"`
  **Verification:** Filtering by min players works correctly.

### 7.5.3 Lifecycle Integration Test

- [ ] For each Phase 7 game: full lifecycle through state machine
- [ ] Scoring integrates with lobby LeaderboardManager
- [ ] Awards appear in post-game display
- [ ] Cooperative games (`human-keyboard`, `human-tetris`) track team performance correctly alongside individual scores
  **Verification:** Lifecycle, scoring, and awards all work.

### 7.5.4 Sequential Game Test

- [ ] Play Sequence Sam → Human Keyboard → Cursor Curling → Human Tetris in same lobby
- [ ] No state leakage between games
- [ ] Cumulative lobby scores correct
  **Verification:** Clean state between games.

### 7.5.5 Concurrent Lobby Test

- [x] Two lobbies: one playing Cursor Curling, one playing Human Tetris simultaneously
- [x] No state contamination
- [x] Physics simulation in Cursor Curling doesn't affect other lobby's game
  **Verification:** Independent lobbies. Physics isolated.

### 7.5.6 Spectator Mode Test

- [ ] Spectate each Phase 7 game:
  - SS: see each player's tap progress (inputIndex), pattern displayed same as player
  - HK: see all key assignments, real-time stats, which player's turn it is
  - CC: see thrower's aim/power, all stone positions, sweep activity
  - HT: same as player (cooperative, minimal masking)
- [x] Spectators cannot send game inputs
  **Verification:** Spectator states correct. No input accepted.

### 7.5.7 Physics Simulation Stress Test (Cursor Curling)

- [x] 8 players throwing stones (8 stones on rink per end)
- [x] Multiple simultaneous collisions handled correctly
- [x] Simulation loop terminates when all stones stop (no infinite loops)
- [x] Position broadcasts at ~30Hz without dropping frames
- [x] Server CPU usage remains reasonable during simulation
  **Verification:** Physics handles 8 stones. No infinite loops. Acceptable performance.

### 7.5.8 Phase 5 + Phase 7 Coexistence Test

- [x] Verify Phase 5 games (Rhyme Time, Undercover Agent, Category Crash, Wiki-Race) still function correctly after Phase 7 deployment
- [x] Play a mixed session: Phase 5 game → Phase 7 game → Phase 5 game
- [x] Verify registry correctly contains all 8 games (Phase 5 + Phase 7)
- [x] Verify no naming collisions between Phase 5 and Phase 7 constants, event types, or component paths
  **Verification:** No regressions. All 8 games playable in any order.

### 7.5.9 Game History Integration Test

- [ ] For each Phase 7 game: verify `buildGameLog()` produces a valid `GameLog` object
- [ ] Verify game log is passed to `persistMatchResults()` and stored in the database
- [ ] Verify `GET /api/rmhbox/history?matchId=...` returns the game log in `MatchDetailResponse`
- [ ] Verify game-specific action types are present in the log for each game:
  - Sequence Sam: `round_start`, `round_result`, `player_eliminated`
  - Human Keyboard: `game_start`, `reshuffle`, `milestone`, `keystroke_summary`, `game_complete`
  - Cursor Curling: `end_start`, `throw`, `stone_rest`, `end_result`
  - Human Tetris: `wave_start`, `wave_result`, `game_end`
  **Verification:** Game logs persist and are retrievable via API. Action types match spec.
- [ ] Verify `getHistoryDisplay()` returns a valid config for each Phase 7 game
- [ ] Verify each game's history display has non-empty searchable and filterable fields
- [ ] Verify each game's `getSummary()` returns a non-empty string for a valid game log
- [ ] Verify each game's `DetailComponent` can be instantiated

### 7.5.10 MinigameRenderer Code-Splitting Test

- [ ] **MinigameRenderer code-splitting:** verify each Phase 7 game loads as a separate chunk
  - [ ] Start each game → verify chunk loaded on demand
  - [ ] Verify `<Suspense>` fallback renders during load
  **Verification:** Network tab shows separate chunk files. Main bundle unaffected.

### 7.5.11 Sound Effect Integration Test

- [ ] **Sound effect integration test:** verify all 4 Phase 7 games trigger sounds at correct moments
  - [ ] Sequence Sam: pattern step clicks, strike buzzer, victory fanfare
  - [ ] Human Keyboard: key correct ding, key wrong buzzer, reshuffle swoosh
  - [ ] Cursor Curling: stone launch swoosh, collision click, end results fanfare
  - [ ] Human Tetris: wave start swoosh, move click, impact results
  **Verification:** Sounds fire once per event. Volume settings respected.

### 7.5.12 MINIGAME_SERVER_REGISTRY Completeness Test

- [ ] **MINIGAME_SERVER_REGISTRY completeness:** verify all 4 Phase 7 handlers registered
  - [ ] `MINIGAME_SERVER_REGISTRY.get('sequence-sam')` → `SequenceSamGame`
  - [ ] `MINIGAME_SERVER_REGISTRY.get('human-keyboard')` → `HumanKeyboardGame`
  - [x] `MINIGAME_SERVER_REGISTRY.get('cursor-curling')` → `CursorCurlingGame`
  - [x] `MINIGAME_SERVER_REGISTRY.get('human-tetris')` → `HumanTetrisGame`
  **Verification:** All 4 handlers instantiate and implement `BaseMinigame` interface.

> **Note on parallel development:** Phase 7 can be implemented fully in parallel with Phase 6 and Phase 8 after Phase 5 is complete. The coexistence test above (7.5.8) validates Phase 7 against Phase 5. If other phases are also complete, run an expanded coexistence test covering all deployed phases to verify the full registry (up to 16 games).

---

## 7.6 Game Settings Test Plan (§12A)

All tests go in `testing/rmhbox/phase-7/game-settings.test.ts` (or integrated into the phase-7 test suite). Follow the Phase 5 test patterns in `testing/rmhbox/phase-5/6-game-settings.test.ts`.

### 7.6.1 Schema Completeness Tests

- [x] Each of the 4 exported settings arrays has the expected number of entries (SS: 5, HK: 4, CU: 4, HT: 4).
- [x] Every setting has `key`, `type`, `label`, `default` defined.
- [x] Integer settings have `min`, `max`, `step` defined.
- [x] Boolean settings have no `min`/`max`/`step`.
- [x] Default values fall within declared constraints.

### 7.6.2 Sequence Sam Settings Tests

| Test Case | Description |
|---|---|
| `default maxRounds` | With no custom settings, handler uses `SS_MAX_ROUNDS` (5) |
| `custom maxRounds = 8` | Handler plays 8 sequence rounds |
| `custom startingLength = 5` | First sequence has 5 elements |
| `custom maxStrikes = 1` | One wrong answer eliminates the player |
| `enableChaosRounds = false` | No chaos rounds occur; all rounds are standard |
| `enableChaosRounds = true (default)` | Chaos rounds trigger every `chaosInterval` rounds |
| `custom chaosInterval = 2` | Chaos round every 2 rounds |
| `chaosInterval ignored when chaos disabled` | Setting `chaosInterval` has no effect when `enableChaosRounds = false` |

### 7.6.3 Human Keyboard Settings Tests

| Test Case | Description |
|---|---|
| `default typingDuration` | Uses `HK_TYPING_DURATION` (60s) |
| `custom typingDuration = 90` | Typing timer is 90s |
| `enableReshuffle = false` | Key assignments stay fixed for the entire round |
| `enableReshuffle = true (default)` | Keys reshuffle every `reshuffleInterval` seconds |
| `custom reshuffleInterval = 10` | Reshuffle occurs every 10s |
| `reshuffleInterval ignored when reshuffle disabled` | Setting has no effect when `enableReshuffle = false` |
| `custom wrongKeyLockMs = 0` | No lockout on wrong key press |
| `custom wrongKeyLockMs = 2000` | 2s lockout on wrong key press |

### 7.6.4 Cursor Curling Settings Tests

| Test Case | Description |
|---|---|
| `default totalEnds` | Uses `CU_TOTAL_ENDS` (4) |
| `custom totalEnds = 6` | Handler plays 6 ends |
| `custom aimDuration = 25` | Aim phase timer is 25s |
| `custom powerDuration = 8` | Power phase timer is 8s |
| `enableSweeping = false` | No sweeping phase after stone release |
| `enableSweeping = true (default)` | Sweeping phase is active |

### 7.6.5 Human Tetris Settings Tests

| Test Case | Description |
|---|---|
| `default totalWaves` | Uses `HT_TOTAL_WAVES` (8) |
| `custom totalWaves = 12` | Handler plays 12 waves |
| `custom wallPreviewDuration = 3` | Wall preview is 3s |
| `custom startingPositionTime = 12` | Position time is 12s |
| `enableDeadZones = true` | Dead zones appear on the grid |
| `enableDeadZones = false (default)` | No dead zones |

### 7.6.6 getSetting() Fallback Tests

- [x] Calling `getSetting('maxRounds', SS_MAX_ROUNDS)` with empty `gameSettings` returns the fallback.
- [x] Calling `getSetting('maxRounds', SS_MAX_ROUNDS)` with `gameSettings: { maxRounds: 7 }` returns `7`.
- [x] Calling `getSetting('unknownKey', 42)` returns `42`.
