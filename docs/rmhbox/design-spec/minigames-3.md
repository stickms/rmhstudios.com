# RMHbox — Minigame Design Specifications (Part 3)

> **Version:** 1.0  
> **Last Updated:** 2026-02-22  
> **Status:** Draft  
> **Games Covered:** Sequence Sam, Human Keyboard, Cursor Curling, Human Tetris  
> **Parent Document:** [design-spec-core.md](./design-spec-core.md)

---

## Table of Contents

1. [Sequence Sam](#1-sequence-sam)
   - 1.14 [MinigameRenderer & Client-Server Wiring](#114-minigamerenderer--client-server-wiring)
2. [Human Keyboard](#2-human-keyboard)
   - 2.15 [MinigameRenderer & Client-Server Wiring](#215-minigamerenderer--client-server-wiring)
3. [Cursor Curling](#3-cursor-curling)
   - 3.14 [MinigameRenderer & Client-Server Wiring](#314-minigamerenderer--client-server-wiring)
4. [Human Tetris](#4-human-tetris)
   - 4.16 [MinigameRenderer & Client-Server Wiring](#416-minigamerenderer--client-server-wiring)

---

## 1. Sequence Sam

### 1.1 Overview

| Field | Value |
|---|---|
| **ID** | `sequence-sam` |
| **Display Name** | Sequence Sam |
| **Category** | `action` |
| **Icon** | `grid-3x3` (Lucide) |
| **Min Players** | 2 |
| **Max Players** | 16 |
| **Estimated Duration** | 120 seconds |
| **Supports Teams** | No |
| **Join-in-Progress** | `spectate_only` |
| **Tags** | `['action', 'memory', 'speed', 'competitive']` |

### 1.2 Game Concept

A "Simon Says" memory challenge that scales in complexity. A 3×3 grid flashes a sequence of tiles. Players must repeat the sequence perfectly. Each round adds one more step to the pattern. **Chaos Rounds** rotate the grid 90° after showing the pattern, forcing spatial reasoning. Players are eliminated on incorrect input; last player standing wins.

### 1.3 Detailed Mechanics

#### 1.3.1 Round Structure

The game consists of escalating rounds until all players are eliminated or `SS_MAX_ROUNDS` (default: **20**) is reached.

| Phase | Duration | Description |
|---|---|---|
| Pattern Display | Variable (depends on sequence length) | Grid tiles flash in sequence |
| Input Phase | Variable (sequence length × `SS_INPUT_TIME_PER_STEP`) | Players repeat the pattern |
| Round Results | 2s | Show who got it right/wrong, eliminations |
| Next Round Transition | 1s | Grid resets, next pattern prepares |

**Pattern display timing:**
- Each tile lights up for `SS_TILE_FLASH_DURATION` (default: **500ms**).
- Gap between flashes: `SS_TILE_GAP` (default: **200ms**).
- Total display time for a sequence of length N: `N × (500 + 200)` = `N × 700ms`.

**Input phase timing:**
- Players have `SS_INPUT_TIME_PER_STEP` (default: **1500ms**) per step in the sequence.
- Total input time for sequence length N: `N × 1500ms`.
- A countdown timer is visible during input.

#### 1.3.2 Sequence Generation

The server generates the pattern:

1. **Round 1:** Sequence length = `SS_STARTING_LENGTH` (default: **3**). Three random tile positions (0–8) are chosen.
2. **Each subsequent round:** The previous sequence is extended by 1 additional step. The new step is a random tile position that is NOT the same as the immediately preceding step (to avoid confusing double-taps).
3. The sequence continues to grow as an **extension** (not a new sequence) — the pattern from round N is the first N+2 steps of the round N+1 pattern. This tests cumulative memory.

```typescript
// Example progression:
// Round 1: [4, 2, 7]         (length 3)
// Round 2: [4, 2, 7, 0]      (length 4, extends round 1)
// Round 3: [4, 2, 7, 0, 5]   (length 5, extends round 2)
```

#### 1.3.3 Chaos Rounds

Every `SS_CHAOS_INTERVAL` rounds (default: every **4th** round: rounds 4, 8, 12, 16, 20), the round is a **Chaos Round**:

1. The pattern is displayed normally on the grid.
2. After the pattern finishes displaying, the grid **rotates 90° clockwise** before the input phase begins.
3. Players must mentally rotate the pattern and click the tiles in their **new rotated positions**.

**Rotation mapping (90° clockwise):**

```
Original:    Rotated 90° CW:
0 1 2        6 3 0
3 4 5   →    7 4 1
6 7 8        8 5 2
```

```typescript
const ROTATION_MAP_CW: Record<number, number> = {
  0: 2, 1: 5, 2: 8,
  3: 1, 4: 4, 5: 7,  // center stays
  6: 0, 7: 3, 8: 6,
};
```

The server stores the original pattern AND the rotated version. Input validation during chaos rounds uses the rotated sequence.

#### 1.3.4 Input Validation

As the player clicks tiles:
1. The client sends each tap as an `SS_TAP` action with the tile position.
2. The server checks if the tapped position matches the expected position in the sequence (considering rotation for chaos rounds).
3. **On correct tap:** The server acknowledges and waits for the next tap in the sequence.
4. **On incorrect tap:** The player is immediately marked as **failed** for this round. They are NOT eliminated on the first failure — elimination rules are below.
5. **On timeout:** If the input phase timer expires before the player completes the sequence, they fail the round.

#### 1.3.5 Elimination Rules

- **Strike system:** Each player has `SS_MAX_STRIKES` (default: **3**) strikes.
- Failing a round (wrong tap or timeout) costs 1 strike.
- When a player reaches 0 remaining strikes, they are **eliminated**.
- Eliminated players become spectators for the rest of the game.
- **Last player standing wins.** If multiple players are eliminated on the same round (both reached 0 strikes), they share the final rank.
- If ALL remaining players fail a round, none are eliminated (a "grace" rule to prevent the game ending anticlimactically).

#### 1.3.6 Scoring

| Event | Points |
|---|---|
| Surviving a round | `SS_SURVIVE` (default: **50**) |
| Perfect round (no wrong taps before correct completion) | `SS_PERFECT_ROUND_BONUS` (default: **25** bonus) |
| Surviving a Chaos Round | `SS_CHAOS_SURVIVE_BONUS` (default: **50** bonus, on top of base survive) |
| Speed bonus | `SS_SPEED_BONUS_PER` (default: **0.05** per ms under the time limit) |
| Last player standing | `SS_WINNER_BONUS` (default: **200**) |
| Elimination placement bonus | `SS_PLACEMENT` × (totalPlayers − rank + 1) (default: **20** × placement) |

### 1.4 Server-Side State Schema

```typescript
interface SequenceSamState {
  currentRound: number;                           // 1-indexed
  maxRounds: number;
  sequence: number[];                              // growing tile sequence (original positions)
  rotatedSequence: number[] | null;                // computed for chaos rounds
  isChaosRound: boolean;
  phase: SSPhase;
  
  // Per-player state
  playerStates: Map<string, SSPlayerState>;
  eliminatedPlayers: string[];                     // userIds in elimination order
  activePlayers: string[];                         // userIds still in the game
  
  // Timer
  phaseStartedAt: number;
  phaseEndsAt: number;
  
  // Display tracking
  currentDisplayStep: number;                      // which step in the pattern is being shown (-1 if not displaying)
}

type SSPhase = 'PATTERN_DISPLAY' | 'INPUT' | 'ROUND_RESULTS' | 'TRANSITION' | 'GAME_OVER';

interface SSPlayerState {
  userId: string;
  strikesRemaining: number;
  isEliminated: boolean;
  eliminatedOnRound: number | null;
  
  // Current round input tracking
  currentInputIndex: number;                       // how far they are in the sequence
  hasCompletedSequence: boolean;
  hasFailed: boolean;
  failedAtIndex: number | null;
  inputStartedAt: number | null;
  completedAt: number | null;
  
  // Scoring
  totalScore: number;
  roundScore: number;
}
```

### 1.5 WebSocket Event Map

#### Client → Server

| Action | Payload | Description |
|---|---|---|
| `SS_TAP` | `{ position: number }` | Tap a grid tile (0–8) |

**Zod schema:**

```typescript
const SSTapSchema = z.object({
  position: z.number().int().min(0).max(8),
});
```

#### Server → Client (Game Actions)

| Action Type | Payload | Sent To | Description |
|---|---|---|---|
| `SS_ROUND_START` | `{ round: number, sequenceLength: number, isChaosRound: boolean }` | All (lobby) | New round begins |
| `SS_PATTERN_STEP` | `{ step: number, position: number, totalSteps: number }` | All (lobby) | A tile flashes in the pattern (sent one at a time with timing) |
| `SS_PATTERN_COMPLETE` | `{ rotated: boolean }` | All (lobby) | Pattern display finished; input phase begins |
| `SS_GRID_ROTATE` | `{ degrees: 90 }` | All (lobby) | Chaos round: grid rotates (animation trigger) |
| `SS_TAP_RESULT` | `{ position: number, correct: boolean, currentIndex: number, sequenceLength: number }` | Tapping player only | Feedback on their tap |
| `SS_PLAYER_COMPLETE` | `{ userId: string, userName: string, timeMs: number }` | All (lobby) | A player completed the sequence |
| `SS_PLAYER_FAILED` | `{ userId: string, userName: string, failedAtIndex: number }` | All (lobby) | A player failed |
| `SS_ROUND_RESULTS` | `{ survivors: SSRoundSurvivor[], eliminated: SSRoundEliminated[], roundNumber: number }` | All (lobby) | Round results |
| `SS_ELIMINATION` | `{ userId: string, userName: string, finalRank: number }` | All (lobby) | A player is eliminated |
| `SS_GAME_OVER` | `{ winner: string \| null, finalRankings: SSFinalRanking[] }` | All (lobby) | Game complete |
| `TIMER_START` | `{ totalDuration: number, timeRemaining: number }` | All (lobby) | Emitted at the start of each timed phase (PATTERN_DISPLAY, INPUT) via `broadcastAction` |
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer (every 1s during all timed phases) via `broadcastAction` |
| `MINIGAME_ROUND` | `{ current: number, total: number }` | All (lobby) | Sub-round counter update via `broadcastAction` |

**Supporting types:**

```typescript
interface SSRoundSurvivor {
  userId: string;
  userName: string;
  timeMs: number;
  isPerfect: boolean;
  strikesRemaining: number;
  roundScore: number;
}

interface SSRoundEliminated {
  userId: string;
  userName: string;
  failedAtIndex: number;
  strikesRemaining: number;     // will be 0
  finalRank: number;
}

interface SSFinalRanking {
  userId: string;
  userName: string;
  rank: number;
  totalScore: number;
  roundsSurvived: number;
  perfectRounds: number;
  chaosRoundsSurvived: number;
}
```

### 1.6 Information Masking

| Data | Player View | Spectator View |
|---|---|---|
| Pattern sequence (during display) | Visible (tile flashes) | Visible |
| Pattern sequence (raw data) | **HIDDEN** (only see visual flashes) | **HIDDEN** (same as players) |
| Own input progress | Visible (highlighted tiles) | N/A |
| Other players' input progress | **HIDDEN** (only see completed/failed status) | **VISIBLE** (see each player's taps in real-time) |
| Strikes remaining (own) | Visible | N/A |
| Strikes remaining (others) | Visible | Visible |
| Chaos round rotation | Visible (animated) | Visible |

**`getStateForPlayer(userId)` during INPUT phase:**

```typescript
interface SSPlayerInputState {
  currentRound: number;
  isChaosRound: boolean;
  sequenceLength: number;
  phase: 'INPUT';
  timeRemaining: number;
  
  // My state
  myInputIndex: number;
  myHasCompleted: boolean;
  myHasFailed: boolean;
  myStrikesRemaining: number;
  
  // Other players (masked)
  otherPlayers: Array<{
    userId: string;
    userName: string;
    hasCompleted: boolean;
    hasFailed: boolean;
    strikesRemaining: number;
    isEliminated: boolean;
  }>;
  
  scores: Array<{ userId: string; userName: string; totalScore: number }>;
}
```

**Critical:** The raw `sequence` array is NEVER sent to any client. Players only see the tiles flash one at a time via `SS_PATTERN_STEP` events. The server controls the display timing. This prevents cheating by inspecting the game state to see the pattern.

**`getStateForSpectator()` returns:**  
Same as player but with additional data: each player's current `inputIndex` and which tiles they've tapped, enabling spectators to watch everyone's attempts in real-time.

### 1.7 Join-in-Progress Logic

**Policy:** `spectate_only`

The sequence is cumulative and grows each round. A player joining in round 5 has no context for the first 4 steps and would be at a severe disadvantage. They spectate until the next game session.

### 1.8 Reconnection Behavior

On reconnect:
1. If the pattern is still being displayed, the player re-sees the pattern from the current step onward (they miss earlier steps — this is a natural penalty for disconnecting).
2. If in INPUT phase, they can continue from wherever they left off in the sequence.
3. Their strike count and elimination status are preserved.
4. If they were eliminated, they reconnect as a spectator for this game.

### 1.9 Awards

| Award | Condition | Icon |
|---|---|---|
| Memory Master | Last player standing (winner) | `brain` |
| Perfect Memory | Most perfect (no-mistake) rounds | `check-circle` |
| Chaos Survivor | Survived the most chaos rounds | `rotate-ccw` |
| Speed Demon | Fastest average completion time across survived rounds | `zap` |
| Iron Will | Survived a round with 1 strike remaining | `shield` |

### 1.10 NPM Package Suggestions

No additional packages. The game logic is pure algorithmic (sequence generation, rotation mapping, input validation). The 3×3 grid UI is straightforward CSS Grid.

### 1.11 Client Component Structure

```
components/rmhbox/minigames/sequence-sam/
  SequenceSamGame.tsx            # Main game component, phase router
  GridDisplay.tsx                # 3×3 grid with tile flash animations
  GridTile.tsx                   # Individual tile (flash, tap, correct/wrong states)
  StrikeIndicator.tsx            # ❤️❤️❤️ strike display
  ChaosOverlay.tsx               # "CHAOS ROUND!" announcement + rotation animation
  EliminationBanner.tsx          # "You've been eliminated" overlay
  SequenceSamResults.tsx         # Final rankings with round stats
```

**Mobile UI layout (INPUT phase):**

```
┌──────────────────────────────┐
│ Sequence Sam  Round 7  ⏱ 8s  │
├──────────────────────────────┤
│    🌀 Chaos Round!           │  ← Only on chaos rounds
├──────────────────────────────┤
│                              │
│     ┌─────┬─────┬─────┐     │
│     │     │  ●  │     │     │  ← 3×3 grid, tap tiles
│     ├─────┼─────┼─────┤     │    ● = already tapped (correct)
│     │     │     │     │     │
│     ├─────┼─────┼─────┤     │
│     │     │     │     │     │
│     └─────┴─────┴─────┘     │
│                              │
│      Progress: 3/9           │
├──────────────────────────────┤
│ ❤️❤️🖤  │  Score: 425       │  ← Strikes + Score
│ Alive: 4/8  │  Eliminated: 4│
└──────────────────────────────┘
```

### 1.12 Constants

```typescript
export const SS_MAX_ROUNDS = 20;
export const SS_STARTING_LENGTH = 3;
export const SS_MAX_STRIKES = 3;
export const SS_CHAOS_INTERVAL = 4;              // every 4th round

export const SS_TILE_FLASH_DURATION = 500;
export const SS_TILE_GAP = 200;
export const SS_INPUT_TIME_PER_STEP = 1500;
export const SS_ROUND_RESULTS = 2;
export const SS_TRANSITION = 1;

export const SS_SURVIVE = 50;
export const SS_PERFECT_ROUND_BONUS = 25;
export const SS_CHAOS_SURVIVE_BONUS = 50;
export const SS_SPEED_BONUS_PER = 0.05;
export const SS_WINNER_BONUS = 200;
export const SS_PLACEMENT = 20;

export const SS_GRID_SIZE = 9;                   // 3×3
export const SS_GRID_COLS = 3;
```

### 1.13 Game History

**Game History Level:** Minimal Log

Sequence Sam is a memory/elimination game where the main narrative is the progression of eliminations. There is no complex per-tick state to capture — just the sequences shown, who survived each round, and the final standings.

**`initialState`**

```typescript
interface SSInitialState {
  gridSize: number;
  maxStrikes: number;
  chaosInterval: number;
  playerCount: number;
  tileFlashDurationMs: number;
  inputTimePerStepMs: number;
}
```

**Actions Logged**

| Action Type | Payload | Recorded |
|---|---|---|
| `round_start` | `{ round: number; sequenceLength: number; sequence: number[] }` | Start of each round |
| `chaos_rotation` | `{ round: number; rotationType: string; mapping: Record<number, number> }` | When a chaos round triggers a tile remap |
| `round_result` | `{ round: number; correct: string[]; failed: string[]; strikes: Record<string, number> }` | After all inputs are evaluated |
| `elimination` | `{ userId: string; round: number; placement: number }` | When a player is eliminated |
| `game_end` | `{ winner: string; finalPlacements: Array<{ userId: string; placement: number; score: number }> }` | Game over |

**Replay Value:** The fun of reviewing a Sequence Sam log is seeing the elimination order — who survived the longest, which chaos rounds caused the most failures, and how the sequence length ramped up over time.

### 1.14 MinigameRenderer & Client-Server Wiring

#### MinigameRenderer Registration

```typescript
// In MinigameRenderer lazy-import map
'sequence-sam': lazy(() => import('./minigames/sequence-sam/SequenceSamGame'))
```

#### Client-Side Store Integration

The client listens for the following server-dispatched action types and merges them into the minigame slice of the room store:

`SS_ROUND_START`, `SS_PATTERN_STEP`, `SS_PATTERN_COMPLETE`, `SS_GRID_ROTATE`, `SS_TAP_RESULT`, `SS_PLAYER_COMPLETE`, `SS_PLAYER_FAILED`, `SS_ROUND_RESULTS`, `SS_ELIMINATION`, `SS_GAME_OVER`, `TIMER_TICK`

```typescript
useEffect(() => {
  const handlers = [
    'SS_ROUND_START', 'SS_PATTERN_STEP', 'SS_PATTERN_COMPLETE',
    'SS_GRID_ROTATE', 'SS_TAP_RESULT', 'SS_PLAYER_COMPLETE',
    'SS_PLAYER_FAILED', 'SS_ROUND_RESULTS', 'SS_ELIMINATION',
    'SS_GAME_OVER', 'TIMER_TICK',
  ];
  handlers.forEach((type) =>
    socket.on(type, (payload) => dispatch({ type, payload }))
  );
  return () => handlers.forEach((type) => socket.off(type));
}, [socket, dispatch]);
```

#### Client-Side Input Dispatch

Players tap a grid cell to reproduce the pattern. The only client-to-server message is:

- **`SS_TAP`** — `{ position }` where `position` is a 0–8 grid index.

```typescript
const handleTap = (index: number) => {
  socket.emit('SS_TAP', { position: index });
};
```

> **Security note:** The raw sequence is NEVER sent to the client. The pattern is displayed one step at a time via `SS_PATTERN_STEP` events. The server validates each tap against the expected sequence position.

#### Server-Side Handler Registration

```typescript
// server/rmhbox/minigames/sequence-sam/SequenceSamGame.ts
export class SequenceSamGame { /* … */ }

// server/rmhbox/game-coordinator.ts
MINIGAME_SERVER_REGISTRY.set('sequence-sam', SequenceSamGame);
```

#### Sound Effect Integration

| Event | Sound | Notes |
|---|---|---|
| Round start | `goFanfare` | New round begins |
| Pattern step flash | `click` | Each tile lights up during pattern display |
| Pattern complete | `swoosh` | All steps shown, input phase begins |
| Grid rotate (chaos) | `swoosh` | Chaos round tile remap |
| Correct tap | `scoreDing` | Player tapped the right cell |
| Wrong tap / strike | `buzzer` | Incorrect cell tapped |
| Player eliminated | `buzzer` | Player exceeded max strikes |
| Round results | `victoryFanfare` | Summary after each round |
| Game over | `victoryFanfare` | Final standings revealed |

#### Spectator Rendering

Spectators see pattern steps, all players' progress (completion status), and elimination events. The component renders a read-only grid without tap handlers.

---

## 2. Human Keyboard

### 2.1 Overview

| Field | Value |
|---|---|
| **ID** | `human-keyboard` |
| **Display Name** | Human Keyboard |
| **Category** | `action` |
| **Icon** | `keyboard` (Lucide) |
| **Min Players** | 3 |
| **Max Players** | 10 |
| **Estimated Duration** | 120 seconds |
| **Supports Teams** | Yes (entire group is one team) |
| **Join-in-Progress** | `spectate_only` |
| **Tags** | `['action', 'coordination', 'cooperative', 'speed', 'chaos']` |

### 2.2 Game Concept

Chaotic cooperative spelling through distributed responsibility. A target sentence appears. The 26 letters of the alphabet are divided among the players — each player is responsible for a subset of keys. The group must collaboratively type the sentence in order, character by character. Every `HK_RESHUFFLE_INTERVAL` (default: **8 seconds**), the keyboard is reshuffled and assignments change.

### 2.3 Detailed Mechanics

#### 2.3.1 Game Flow

| Phase | Duration | Description |
|---|---|---|
| Sentence Reveal | 3s | Target sentence shown |
| Typing Phase | 90s (or until sentence complete) | Players type collaboratively |
| Results | 5s | Show time, accuracy, MVP |

**Total game time:** max ~98s.

#### 2.3.2 Sentence Selection

Sentences come from `data/rmhbox/human-keyboard/sentences.json`:

```typescript
interface TargetSentence {
  id: string;
  text: string;                         // e.g., "the quick brown fox jumps"
  normalizedText: string;               // lowercase, only a-z and spaces
  letterCount: number;                  // excluding spaces
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;                     // "Pangram", "Quote", "Random"
}
```

- Sentences are normalized: lowercase letters and spaces only (no punctuation, no numbers).
- Length: 20–60 characters (configurable by difficulty).
- The server picks a sentence appropriate for the player count (shorter for more players = faster typing, longer for fewer = more coverage per person).

#### 2.3.3 Key Assignment

The 26 letters (a–z) are distributed evenly among players:

```typescript
function assignKeys(playerIds: string[]): Map<string, string[]> {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const shuffled = shuffleArray(alphabet);
  const assignments = new Map<string, string[]>();
  
  for (const id of playerIds) assignments.set(id, []);
  
  shuffled.forEach((letter, i) => {
    const playerId = playerIds[i % playerIds.length];
    assignments.get(playerId)!.push(letter);
  });
  
  // Sort each player's letters alphabetically for UI
  for (const letters of assignments.values()) letters.sort();
  
  return assignments;
}
```

For 5 players, each gets ~5 letters. For 3 players, each gets ~8–9 letters.

**Spaces** are handled automatically — no player "owns" the space key. When the next character in the sentence is a space, the server auto-advances to the next letter after a short delay (`HK_SPACE_DELAY`, default: **200ms**), simulating an automatic space.

#### 2.3.4 Key Reshuffling

Every `HK_RESHUFFLE_INTERVAL` (default: **8s**), the server:

1. Re-randomizes key assignments using the same algorithm.
2. Broadcasts `HK_RESHUFFLE` with the new assignments.
3. A brief visual flourish plays (keys scramble animation, ~500ms).
4. The new assignments take effect immediately after the animation.
5. The current position in the sentence does NOT change — only which player is responsible for which letters.

Players must constantly check their UI to see which letters they currently own.

#### 2.3.5 Input Handling

1. The sentence has a **cursor** pointing to the next expected character.
2. When a player presses a key:
   - The server checks if the key matches the expected character at the cursor position.
   - The server checks if the player is the one assigned to that key.
   - **Correct key by correct player:** Cursor advances. `HK_KEY_CORRECT` broadcast.
   - **Correct key by WRONG player:** The press is **rejected** (they don't own that letter right now). `HK_KEY_WRONG_PLAYER` sent to the pressing player only.
   - **Wrong key entirely:** `HK_KEY_WRONG` sent to the pressing player. A small time penalty of `HK_WRONG_KEY_LOCK` (default: **500ms**) is added — the cursor is locked for that duration, and nobody can type. This discourages random key-mashing.

**Input rate limit:** Each player can send at most `HK_INPUT_RATE_LIMIT` (default: **5**) key presses per second per player. This prevents rapid-fire guessing.

#### 2.3.6 Scoring

This game is **cooperative** — the group works together. However, individual contributions are tracked for scoring:

| Metric | Points |
|---|---|
| Each correct key press | `HK_CORRECT_KEY` (default: **20**) |
| No incorrect presses (personal accuracy = 100%) | `HK_PERFECT_ACCURACY_BONUS` (default: **200**) |
| Team completes sentence | `HK_COMPLETION_BONUS` (default: **100** to each player) |
| Time bonus (if completed) | `HK_TIME_BONUS_PER_SECOND` (default: **5**) × seconds remaining |
| MVP bonus (most correct key presses) | `HK_MVP_BONUS` (default: **100**) |
| Wrong key press | `HK_WRONG_KEY_PENALTY` (default: **-5**) |

**Group performance is ranked against a time/accuracy curve.** The team's performance is compared to an expected completion curve to derive overall quality:
- If time ≤ 50% of limit → "Outstanding" (1.5× multiplier on all individual scores)
- If time ≤ 75% of limit → "Good" (1.0× multiplier)
- If incomplete → "Better luck next time" (0.5× multiplier)

### 2.4 Server-Side State Schema

```typescript
interface HumanKeyboardState {
  targetSentence: TargetSentence;
  normalizedText: string;                           // the text being typed (no spaces, lowercased)
  cursorPosition: number;                            // index into normalizedText (skipping spaces)
  displayCursorPosition: number;                     // index into original sentence (including spaces)
  phase: HKPhase;
  isComplete: boolean;
  
  // Key assignments (current)
  keyAssignments: Map<string, string[]>;             // userId → letters[]
  letterToPlayer: Map<string, string>;               // letter → userId (reverse lookup)
  nextReshuffleAt: number;                           // timestamp
  reshuffleCount: number;
  
  // Per-player tracking
  playerStats: Map<string, HKPlayerStats>;
  
  // Penalties
  lockUntil: number | null;                          // cursor locked timestamp (from wrong key penalty)
  
  // Timer
  phaseStartedAt: number;
  phaseEndsAt: number;
  startedAt: number;
  completedAt: number | null;
}

type HKPhase = 'SENTENCE_REVEAL' | 'TYPING' | 'RESULTS';

interface HKPlayerStats {
  userId: string;
  correctPresses: number;
  wrongPresses: number;
  wrongPlayerPresses: number;                        // times they pressed a key they don't own
  accuracy: number;                                  // correctPresses / (correctPresses + wrongPresses)
  totalScore: number;
  currentKeys: string[];                             // their current letter assignment
}
```

### 2.5 WebSocket Event Map

#### Client → Server

| Action | Payload | Description |
|---|---|---|
| `HK_PRESS` | `{ key: string }` | Press a key (single lowercase letter a-z) |

**Zod schema:**

```typescript
const HKPressSchema = z.object({
  key: z.string().length(1).regex(/^[a-z]$/),
});
```

#### Server → Client (Game Actions)

| Action Type | Payload | Sent To | Description |
|---|---|---|---|
| `HK_SENTENCE_REVEAL` | `{ sentence: string, normalizedLength: number, typingDurationSeconds: number }` | All (lobby) | Target sentence revealed |
| `HK_KEY_ASSIGNMENT` | `{ assignments: Record<string, string[]>, myKeys: string[] }` | Each player individually | Initial or reshuffled key assignments |
| `HK_KEY_CORRECT` | `{ key: string, userId: string, userName: string, cursorPosition: number, displayCursorPosition: number }` | All (lobby) | Correct key pressed, cursor advances |
| `HK_KEY_WRONG` | `{ key: string, penaltyMs: number }` | Pressing player only | Wrong key — penalty |
| `HK_KEY_WRONG_PLAYER` | `{ key: string, correctOwner: string }` | Pressing player only | Right letter but you don't own it |
| `HK_CURSOR_LOCKED` | `{ lockDurationMs: number, reason: string }` | All (lobby) | Cursor locked due to penalty |
| `HK_SPACE_AUTO` | `{ newCursorPosition: number, newDisplayCursorPosition: number }` | All (lobby) | Space auto-advanced |
| `HK_RESHUFFLE` | `{ assignments: Record<string, string[]>, reshuffleNumber: number }` | All (lobby) | Keys reassigned. Each player's `myKeys` is included per-player in individual sends. |
| `HK_RESHUFFLE_WARNING` | `{ secondsUntilReshuffle: number }` | All (lobby) | 3-second warning before reshuffle |
| `HK_COMPLETE` | `{ totalTimeMs: number, totalKeyPresses: number, accuracy: number }` | All (lobby) | Sentence completed! |
| `HK_RESULTS` | `{ playerResults: HKPlayerResult[], teamPerformance: string, timeBonus: number, completed: boolean }` | All (lobby) | Final results |
| `TIMER_START` | `{ totalDuration: number, timeRemaining: number }` | All (lobby) | Emitted at the start of the TYPING phase via `broadcastAction` |
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer (every 1s during all timed phases) via `broadcastAction` |

**Supporting types:**

```typescript
interface HKPlayerResult {
  userId: string;
  userName: string;
  correctPresses: number;
  wrongPresses: number;
  accuracy: number;
  isMVP: boolean;
  totalScore: number;
  currentKeys: string[];
}
```

### 2.6 Information Masking

| Data | Player View | Spectator View |
|---|---|---|
| Target sentence | Visible | Visible |
| Cursor position | Visible (real-time) | Visible |
| Own key assignment | Visible | N/A |
| Other players' key assignments | **HIDDEN** | **VISIBLE** |
| Own stats (correct/wrong counts) | Visible | N/A |
| Other players' stats | **HIDDEN** until results | **VISIBLE** in real-time |
| Expected next letter | Visible (everyone sees the cursor on the sentence) | Visible |
| Which player needs to type next | **Derived** (player can see if the highlighted letter is in their set) | **VISIBLE** (highlighted which player "owns" the next letter) |

**`getStateForPlayer(userId)` during TYPING:**

```typescript
interface HKPlayerTypingState {
  sentence: string;
  cursorPosition: number;
  displayCursorPosition: number;
  phase: 'TYPING';
  timeRemaining: number;
  myKeys: string[];
  nextExpectedLetter: string;
  isMyTurn: boolean;                // true if nextExpectedLetter is in myKeys
  myStats: { correctPresses: number; wrongPresses: number; accuracy: number };
  progress: number;                  // 0.0–1.0, fraction of sentence completed
  isLocked: boolean;                 // true if cursor is penalty-locked
  nextReshuffleIn: number;           // seconds until next reshuffle
}
```

**`getStateForSpectator()` returns:**  
Full state including all players' key assignments and real-time stats. Spectators see which player "owns" the next required letter, creating dramatic tension ("it's Player 3's turn to type 'q'!").

### 2.7 Join-in-Progress Logic

**Policy:** `spectate_only`

Key assignments are balanced at game start. Adding a player mid-game would require redistributing keys, which would disrupt the flow and confuse existing players.

### 2.8 Reconnection Behavior

On reconnect:
1. Player receives their current key assignment, cursor position, and sentence state.
2. Their key pressees continue to be tracked.
3. If a reshuffle occurred while they were disconnected, they receive the latest assignment.

### 2.9 Player Disconnect Mid-Game

If a player disconnects, the letters assigned to them become **orphaned** — no one can type those letters. This creates urgency for reconnection.

After the grace period:
- If the player doesn't reconnect, the server redistributes their orphaned letters among remaining players and broadcasts `HK_RESHUFFLE`.
- A system chat message explains the redistribution.

### 2.10 Awards

| Award | Condition | Icon |
|---|---|---|
| MVP Typist | Most correct key presses | `crown` |
| Perfect Fingers | 100% accuracy (no wrong presses) | `check-circle` |
| Butterfingers | Most wrong key presses | `x-circle` |
| Not My Job | Most "wrong player" presses (kept pressing keys they didn't own) | `user-x` |
| Team Spirit | The team completed the sentence (awarded to all) | `users` |

### 2.11 NPM Package Suggestions

No additional packages. The game is purely input-validation logic and UI rendering with a simple keyboard-style layout.

### 2.12 Client Component Structure

```
components/rmhbox/minigames/human-keyboard/
  HumanKeyboardGame.tsx          # Main game component, phase router
  KeyAssignment.tsx              # Display of "Your letters: [A] [F] [K] [R] [X]"
  SentenceDisplay.tsx            # Target sentence with cursor highlight
  KeyboardLayout.tsx             # Visual keyboard showing owned keys (highlighted) vs. others (dimmed)
  ProgressBar.tsx                # Sentence completion progress
  ReshuffleWarning.tsx           # "Reshuffling in 3... 2... 1..." overlay
  HumanKeyboardResults.tsx       # Team performance + individual stats
```

**Mobile UI layout (TYPING phase):**

```
┌──────────────────────────────┐
│ Human Keyboard  ⏱ 0:52       │
├──────────────────────────────┤
│ "the quick brown fox jumps"  │  ← Target sentence
│       ▲                      │  ← Cursor under 'q'
│ [t][h][e][ ][_][u][i][c][k] │  ← Typed so far (greyed) + cursor
├──────────────────────────────┤
│ 🔄 Reshuffle in: 4s          │
├──────────────────────────────┤
│ Your letters:                │
│ ┌───┬───┬───┬───┬───┬───┐   │
│ │ B │ F │ J │ Q │ V │ Z │   │  ← Tap-friendly key buttons
│ └───┴───┴───┴───┴───┴───┘   │
│  ⚡ It's YOUR turn! (Q)      │  ← Highlighted when next letter is yours
├──────────────────────────────┤
│ ✓ 8  ✗ 1  │  Progress: 35%  │
└──────────────────────────────┘
```

### 2.13 Constants

```typescript
export const HK_TYPING_DURATION = 90;
export const HK_SENTENCE_REVEAL = 3;
export const HK_RESULTS = 5;

export const HK_RESHUFFLE_INTERVAL = 8;
export const HK_RESHUFFLE_WARNING = 3;
export const HK_SPACE_DELAY = 200;
export const HK_WRONG_KEY_LOCK = 500;
export const HK_INPUT_RATE_LIMIT = 5;             // max presses per second per player

export const HK_CORRECT_KEY = 20;
export const HK_WRONG_KEY_PENALTY = -5;
export const HK_PERFECT_ACCURACY_BONUS = 200;
export const HK_COMPLETION_BONUS = 100;
export const HK_TIME_BONUS_PER_SECOND = 5;
export const HK_MVP_BONUS = 100;
```

### 2.14 Game History

**Game History Level:** Summary Log

Human Keyboard is a cooperative typing game where the team works together to complete a sentence. The log captures team performance milestones, reshuffle events, and per-player contribution stats — enough to see who carried the team and how reshuffles disrupted momentum.

**`initialState`**

```typescript
interface HKInitialState {
  sentence: string;
  sentenceLength: number;
  typingDurationSeconds: number;
  reshuffleIntervalSeconds: number;
  playerCount: number;
  initialKeyAssignments: Record<string, string[]>;  // userId → assigned keys
}
```

**Actions Logged**

| Action Type | Payload | Recorded |
|---|---|---|
| `reshuffle` | `{ period: number; newAssignments: Record<string, string[]>; progressAtReshuffle: number }` | Each key reshuffle |
| `progress_milestone` | `{ milestone: 25 \| 50 \| 75 \| 100; elapsedMs: number; currentChar: number }` | At 25%, 50%, 75%, 100% completion |
| `player_summary` | `{ userId: string; correctKeys: number; wrongKeys: number; accuracy: number }` | End of game, per player |
| `game_end` | `{ completed: boolean; finalProgress: number; elapsedMs: number; mvpUserId: string; totalCorrectKeys: number; totalWrongKeys: number }` | Game over |

**Replay Value:** Reviewing a Human Keyboard log reveals which players carried the team, how reshuffles affected typing momentum, and whether the team completed the sentence — or how close they got.

### 2.15 MinigameRenderer & Client-Server Wiring

#### MinigameRenderer Registration

```typescript
// In MinigameRenderer lazy-import map
'human-keyboard': lazy(() => import('./minigames/human-keyboard/HumanKeyboardGame'))
```

#### Client-Side Store Integration

The client listens for the following server-dispatched action types and merges them into the minigame slice of the room store:

`HK_SENTENCE_REVEAL`, `HK_KEY_ASSIGNMENT`, `HK_KEY_CORRECT`, `HK_KEY_WRONG`, `HK_KEY_WRONG_PLAYER`, `HK_CURSOR_LOCKED`, `HK_SPACE_AUTO`, `HK_RESHUFFLE`, `HK_RESHUFFLE_WARNING`, `HK_COMPLETE`, `HK_RESULTS`, `TIMER_TICK`

```typescript
useEffect(() => {
  const handlers = [
    'HK_SENTENCE_REVEAL', 'HK_KEY_ASSIGNMENT', 'HK_KEY_CORRECT',
    'HK_KEY_WRONG', 'HK_KEY_WRONG_PLAYER', 'HK_CURSOR_LOCKED',
    'HK_SPACE_AUTO', 'HK_RESHUFFLE', 'HK_RESHUFFLE_WARNING',
    'HK_COMPLETE', 'HK_RESULTS', 'TIMER_TICK',
  ];
  handlers.forEach((type) =>
    socket.on(type, (payload) => dispatch({ type, payload }))
  );
  return () => handlers.forEach((type) => socket.off(type));
}, [socket, dispatch]);
```

#### Client-Side Input Dispatch

Each player presses the key they are assigned. The only client-to-server message is:

- **`HK_PRESS`** — `{ key }` where `key` is a single lowercase letter a–z.

```typescript
const handleKeyPress = (key: string) => {
  socket.emit('HK_PRESS', { key: key.toLowerCase() });
};
```

#### Server-Side Handler Registration

```typescript
// server/rmhbox/minigames/human-keyboard/HumanKeyboardGame.ts
export class HumanKeyboardGame { /* … */ }

// server/rmhbox/game-coordinator.ts
MINIGAME_SERVER_REGISTRY.set('human-keyboard', HumanKeyboardGame);
```

#### Sound Effect Integration

| Event | Sound | Notes |
|---|---|---|
| Sentence revealed | `goFanfare` | Sentence appears on screen |
| Key correct | `scoreDing` | Correct key pressed by assigned player |
| Key wrong | `buzzer` | Wrong key pressed |
| Wrong player pressed | *(silent)* | Silent to the pressing player |
| Cursor locked | `buzzer` | Cursor is temporarily locked |
| Space auto-advance | `click` | Automatic space insertion |
| Reshuffle warning | `countdownBeep` | Warning before key reassignment |
| Reshuffle | `swoosh` | Keys are reassigned |
| Sentence complete | `victoryFanfare` | Team finished the sentence |
| Results | `victoryFanfare` | Final scores displayed |

#### Spectator Rendering

Spectators see all key assignments for all players, the sentence with cursor position, and every correct/wrong keypress. The component renders a full keyboard heatmap showing which player owns which keys.

---

## 3. Cursor Curling

### 3.1 Overview

| Field | Value |
|---|---|
| **ID** | `cursor-curling` |
| **Display Name** | Cursor Curling |
| **Category** | `action` |
| **Icon** | `target` (Lucide) |
| **Min Players** | 2 |
| **Max Players** | 8 |
| **Estimated Duration** | 120 seconds |
| **Supports Teams** | No |
| **Join-in-Progress** | `spectate_only` |
| **Tags** | `['action', 'physics', 'precision', 'competitive']` |

### 3.2 Game Concept

A momentum-based accuracy game inspired by curling. Players "flick" their cursor/finger to launch a stone toward a target zone (the "House"). While the stone slides, other players can "sweep" — wiggling their cursor rapidly in front of the stone to reduce friction, extending its travel distance. The stone closest to the bullseye scores the most points.

### 3.3 Detailed Mechanics

#### 3.3.1 Game Flow

The game consists of `CU_TOTAL_ENDS` (default: **3**) "ends" (curling terminology for rounds). In each end, every player launches one stone.

| Phase | Duration | Description |
|---|---|---|
| End Start | 2s | Announce end number, show rink |
| Throw Phase (per player) | ~8s per player | Active player aims and throws; others sweep |
| End Results | 5s | Show stone positions, closest to center |
| Next End Transition | 2s | Clear stones, reset rink |

**Total game time per end:** ~2s + (players × 8s) + 5s + 2s. For 6 players: ~57s per end. 3 ends = ~171s ≈ 2.8 minutes.

#### 3.3.2 The Rink (Game Field)

The playing field is a **vertical rink** (long and narrow):

```
┌────────────────────────┐
│                        │  ← Launch zone (bottom)
│                        │
│     ─── ─── ─── ───   │  ← Ice (middle)
│                        │
│        ┌──────┐        │
│        │ ◎    │        │  ← House (target, top area)
│        │  ○   │        │     ◎ = bullseye (center)
│        │   ○  │        │     concentric rings
│        └──────┘        │
│                        │
└────────────────────────┘
```

**Coordinate system:**
- Canvas: 400 × 600 logical pixels.
- Launch zone: y = 500–600 (bottom 100px).
- House center: `{ x: 200, y: 100 }`.
- House rings (for scoring):
  - Bullseye: radius `CU_BULLSEYE_RADIUS` (default: **15px**)
  - Inner ring: radius `CU_INNER_RADIUS` (default: **40px**)
  - Outer ring: radius `CU_OUTER_RADIUS` (default: **70px**)
  - House boundary: radius `CU_HOUSE_RADIUS` (default: **100px**)

#### 3.3.3 Throwing Mechanic

The active player throws their stone:

1. **Aim Phase** (3s): The player sees a directional arrow from the launch position. On desktop, cursor position relative to the stone determines the aim angle. On mobile, the player drags to set the angle.
2. **Power Phase** (2s): A power meter fills and oscillates (like a golf game power bar). The player taps/clicks to lock in the power level.
3. **Release:** The stone launches along the aimed vector with the selected power.

**Client → Server on throw:**

```typescript
interface ThrowData {
  angle: number;              // radians, 0 = straight up, positive = right
  power: number;              // 0.0–1.0 (from power meter)
}
```

The client sends `THROW_STONE` with the angle and power. The **server computes the physics** — the client does NOT compute the trajectory. The server simulates the stone's motion and broadcasts position updates.

#### 3.3.4 Physics Simulation (Server-Side)

The server uses a simplified 2D physics model (no external physics engine needed):

```typescript
interface StonePhysics {
  position: { x: number; y: number };
  velocity: { vx: number; vy: number };     // pixels per tick
  friction: number;                          // deceleration per tick
  isMoving: boolean;
}
```

**Simulation parameters:**
- `CU_BASE_FRICTION` (default: **0.98** — velocity multiplier per tick, < 1 so it slows down).
- `CU_MAX_LAUNCH_SPEED` (default: **15** pixels/tick).
- `CU_SIMULATION_TICK` (default: **33ms**, ~30 ticks/second).
- Launch velocity: `power × CU_MAX_LAUNCH_SPEED`, directed along `angle`.
- Each tick: `velocity *= friction`, `position += velocity`.
- Stone stops when `|velocity| < CU_STOP_THRESHOLD` (default: **0.1**).

**Collision with other stones:**
- Stones from previous throws in the same end are obstacles.
- If a new stone hits an existing stone, both are affected by an elastic collision:
  - Velocity transfer based on collision angle.
  - Coefficient of restitution: `CU_RESTITUTION` (default: **0.7**).
- This means a well-aimed throw can knock an opponent's stone away from the center.

**Wall bouncing:**
- If a stone hits the left/right walls (x < 0 or x > 400), its `vx` is negated (bounce).
- If a stone goes past the top boundary (y < 0), it slides off the rink and is out of play.
- If a stone stays in the launch zone (y > 500) when it stops, it's also out of play.

The server broadcasts `CU_STONE_POSITION` updates at 30 ticks/second while any stone is moving.

#### 3.3.5 Sweeping Mechanic

While a stone is in motion, OTHER players (not the thrower) can "sweep" to reduce friction:

1. Players wiggle their cursor/finger rapidly in the area **in front of** the stone (within `CU_SWEEP_ZONE_RADIUS` (default: **60px**) ahead of the stone's direction).
2. The server detects sweeping by measuring the frequency of `SWEEP_INPUT` events from a player.
3. Sweep effectiveness is calculated as: number of valid sweep events received in the last `CU_SWEEP_WINDOW` (default: **500ms**).
4. If sweep frequency ≥ `CU_SWEEP_THRESHOLD` (default: **6** events per window), the stone's friction is temporarily reduced to `CU_SWEPT_FRICTION` (default: **0.995** — much less deceleration).
5. The swept friction only applies while sweeping is active. Once sweeping stops, friction returns to `CU_BASE_FRICTION`.

**Sweep input from client:**

```typescript
interface SweepInput {
  x: number;
  y: number;
  timestamp: number;
}
```

The client sends `SWEEP` actions at up to 15 Hz (15 per second, rate-limited). The server computes the sweep zone check and frequency.

**Why sweeping matters:** In real curling, sweeping reduces friction on the ice, letting the stone travel farther and straighter. Here, it lets other players influence a throw's outcome — cooperative/competitive depending on who's sweeping. Anyone can sweep any stone, so players can strategically sweep opponent throws OFF the house or help friends get closer.

#### 3.3.6 Scoring

After all players throw in an end, stones are scored by proximity to bullseye:

| Zone | Points |
|---|---|
| Bullseye (within `CU_BULLSEYE_RADIUS`) | `CU_BULLSEYE` (default: **100**) |
| Inner ring | `CU_INNER_RING` (default: **60**) |
| Outer ring | `CU_OUTER_RING` (default: **30**) |
| In the House (outside outer ring but within House boundary) | `CU_HOUSE` (default: **10**) |
| Out of House / out of play | **0** |

**Closest-to-center bonus:** The player whose stone is closest to the bullseye center (by Euclidean distance) gets `CU_CLOSEST_BONUS` (default: **50**) extra points for that end.

### 3.4 Server-Side State Schema

```typescript
interface CursorCurlingState {
  currentEnd: number;                              // 1-indexed
  totalEnds: number;
  phase: CUPhase;
  
  // Throw order
  throwOrder: string[];                             // userIds (randomized, different each end)
  currentThrowerIndex: number;
  
  // Stones on the rink (persisted within an end)
  stones: CurlingStone[];
  
  // Active simulation
  activeStoneSim: StonePhysics | null;              // currently moving stone
  sweepStates: Map<string, SweepState>;             // userId → sweep data
  
  // Cumulative
  playerScores: Map<string, number>;
  endResults: EndResult[];
  
  // Timer
  phaseStartedAt: number;
  phaseEndsAt: number;
}

type CUPhase = 'END_START' | 'AIM' | 'POWER' | 'SIMULATION' | 'END_RESULTS' | 'TRANSITION' | 'GAME_OVER';

interface CurlingStone {
  id: string;
  userId: string;
  position: { x: number; y: number };
  isInPlay: boolean;                                 // false if slid off rink
  color: string;                                     // player color
}

interface SweepState {
  userId: string;
  recentInputs: Array<{ x: number; y: number; timestamp: number }>;
  isSweeping: boolean;                               // meets frequency threshold
}

interface EndResult {
  endNumber: number;
  stonePositions: Array<{ userId: string; userName: string; position: { x: number; y: number }; distance: number; zone: string; points: number }>;
  closestUserId: string | null;
}
```

### 3.5 WebSocket Event Map

#### Client → Server

| Action | Payload | Who Can Send | Description |
|---|---|---|---|
| `THROW_STONE` | `{ angle: number, power: number }` | Active thrower only | Launch the stone |
| `SWEEP` | `{ x: number, y: number }` | Non-throwers while a stone is moving | Sweep input position |

**Zod schemas:**

```typescript
const ThrowStoneSchema = z.object({
  angle: z.number().min(-Math.PI / 2).max(Math.PI / 2),  // can only throw "upward"
  power: z.number().min(0).max(1),
});

const SweepSchema = z.object({
  x: z.number().min(0).max(400),
  y: z.number().min(0).max(600),
});
```

#### Server → Client (Game Actions)

| Action Type | Payload | Sent To | Description |
|---|---|---|---|
| `CU_END_START` | `{ endNumber: number, throwOrder: PlayerThrowInfo[] }` | All (lobby) | New end begins |
| `CU_THROWER_ACTIVE` | `{ userId: string, userName: string, aimDurationSeconds: number }` | All (lobby) | It's this player's turn to throw |
| `CU_AIM_PREVIEW` | `{ angle: number }` | Active thrower only | Aim preview (client-sent back for visual feedback to others if desired, or kept private) |
| `CU_POWER_PHASE` | `{ powerDurationSeconds: number }` | Active thrower only | Power meter begins oscillating |
| `CU_STONE_LAUNCHED` | `{ userId: string, angle: number, power: number }` | All (lobby) | Stone has been launched (others see launch params) |
| `CU_STONE_POSITION` | `{ stoneId: string, x: number, y: number, vx: number, vy: number }` | All (lobby) | Stone position update (30Hz during simulation) |
| `CU_STONE_COLLISION` | `{ movingStoneId: string, hitStoneId: string, newPositions: Array<{ id: string, x: number, y: number }> }` | All (lobby) | Two stones collided |
| `CU_SWEEP_ACTIVE` | `{ userId: string, userName: string, isActive: boolean }` | All (lobby) | A player started/stopped sweeping visually |
| `CU_SWEPT_EFFECT` | `{ stoneId: string, frictionReduced: boolean }` | All (lobby) | Sweeping is affecting a stone's friction |
| `CU_STONE_STOPPED` | `{ stoneId: string, finalPosition: { x: number, y: number }, inPlay: boolean, zone: string \| null }` | All (lobby) | Stone has come to rest |
| `CU_END_RESULTS` | `EndResult` | All (lobby) | End scoring |
| `CU_GAME_OVER` | `{ finalRankings: CUFinalRanking[] }` | All (lobby) | Game over |
| `TIMER_START` | `{ totalDuration: number, timeRemaining: number }` | All (lobby) | Emitted at the start of each timed phase (AIM, POWER) via `broadcastAction` |
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer (every 1s during all timed phases) via `broadcastAction` |
| `MINIGAME_ROUND` | `{ current: number, total: number }` | All (lobby) | Sub-round counter update (e.g. "End 2/3") via `broadcastAction` |

### 3.6 Information Masking

| Data | Player View | Spectator View |
|---|---|---|
| Rink + stone positions | Visible (full rink view) | Visible |
| Active thrower's aim (during AIM) | **HIDDEN** from others (only thrower sees their aim arrow) | **VISIBLE** (spectators see aim) |
| Power meter level | **HIDDEN** from others (only thrower sees) | **VISIBLE** |
| Stone physics (position updates) | Visible (broadcast to all) | Visible |
| Sweep activity | Visible (who is sweeping) | Visible |
| Scores | Visible after each end | Visible |

The game has minimal masking needs — it's mostly a real-time physics game where everyone sees the same rink. The only private information is the thrower's aim and power before release.

**`getStateForPlayer(userId)` during SIMULATION:**

```typescript
interface CUSimulationState {
  currentEnd: number;
  phase: 'SIMULATION';
  stones: Array<{ id: string; userId: string; x: number; y: number; isInPlay: boolean; color: string }>;
  activeStonId: string;                // currently moving stone
  canSweep: boolean;                   // true if it's not my stone
  sweepingPlayers: Array<{ userId: string; userName: string }>;
  scores: Array<{ userId: string; userName: string; totalScore: number }>;
}
```

### 3.7 Join-in-Progress Logic

**Policy:** `spectate_only`

Throw order is established at game start. Adding a player mid-end would require inserting them into the throw order and giving them a stone, which could unfairly advantage or disadvantage them. They spectate until the next game session.

### 3.8 Reconnection Behavior

On reconnect:
1. Player receives current stone positions, whose turn it is, and scores.
2. If it was their turn to throw and the AIM/POWER phase is still active, they can complete their throw.
3. If their throw was already auto-completed (timeout), they receive `{ power: 0, angle: 0 }` (a dud throw — natural penalty for disconnecting).

### 3.9 Awards

| Award | Condition | Icon |
|---|---|---|
| Bullseye! | Hit the bullseye in any end | `target` |
| Master Sweeper | Most effective sweeping (most sweep-seconds that changed friction) | `wind` |
| Demolition Derby | Knocked the most opponent stones out of play via collisions | `boom` |
| Gentle Touch | Stone stopped closest to the bullseye center (best precision) | `feather` |
| Off the Rails | Stone went out of bounds the most times | `slash` |

### 3.10 NPM Package Suggestions

No external physics engine needed. The physics is a simplified 2D simulation:
- Linear velocity with friction damping per tick.
- Circle-circle elastic collision (standard 2D collision formula).
- Wall bouncing (velocity component negation).

This is ~50 lines of physics code. Using `matter-js` would be overkill and add ~100KB to the server bundle for a trivial simulation.

If more complex curling physics (spin, curl, weight decay) are desired in the future, consider:

| Package | Purpose | Notes |
|---|---|---|
| `planck-js` | 2D rigid body physics (Box2D port) | Lighter than matter-js (~40KB gzip). Well-suited for server-side simulation. Only consider if physics complexity grows beyond basic friction/collision. |

### 3.11 Client Component Structure

```
components/rmhbox/minigames/cursor-curling/
  CursorCurlingGame.tsx          # Main game component, phase router
  CurlingCanvas.tsx              # HTML5 Canvas rink renderer (stones, house, trajectory)
  AimArrow.tsx                   # Directional aim indicator (during AIM phase)
  PowerMeter.tsx                 # Oscillating power bar
  SweepOverlay.tsx               # Sweep zone indicator + sweep animation
  StoneSprite.tsx                # Rendered curling stone (colored circle with player initial)
  EndResults.tsx                 # End scoring with distance display
```

**Mobile UI layout (SIMULATION phase):**

```
┌──────────────────────────────┐
│ Cursor Curling   End 2/3     │
├──────────────────────────────┤
│                              │
│        ┌──────┐              │
│        │ ◎    │              │  ← House with concentric rings
│        │ 🔴○  │              │     🔴 = Player 1's stone
│        │   ○  │              │     (at rest)
│        └──────┘              │
│                              │
│    ● ← ← ← ← ← ← ← ←      │  ← Stone in motion (animated)
│   (Bob's stone sliding)      │
│                              │
│     ~~~~ sweep! ~~~~         │  ← Sweep indicators
│                              │
│                              │
│     🟢 (your stone, at rest) │
│                              │
├──────────────────────────────┤
│ 👆 Wiggle to sweep!          │
│ Bob: 0  │  You: 60  │  Alice: 30│
└──────────────────────────────┘
```

### 3.12 Constants

```typescript
export const CU_TOTAL_ENDS = 3;
export const CU_END_START = 2;
export const CU_AIM_DURATION = 3;
export const CU_POWER_DURATION = 2;
export const CU_END_RESULTS = 5;
export const CU_TRANSITION = 2;

export const CU_CANVAS_WIDTH = 400;
export const CU_CANVAS_HEIGHT = 600;
export const CU_HOUSE_CENTER = { x: 200, y: 100 };
export const CU_BULLSEYE_RADIUS = 15;
export const CU_INNER_RADIUS = 40;
export const CU_OUTER_RADIUS = 70;
export const CU_HOUSE_RADIUS = 100;
export const CU_STONE_RADIUS = 12;
export const CU_LAUNCH_Y = 550;

export const CU_BASE_FRICTION = 0.98;
export const CU_SWEPT_FRICTION = 0.995;
export const CU_MAX_LAUNCH_SPEED = 15;
export const CU_SIMULATION_TICK = 33;
export const CU_STOP_THRESHOLD = 0.1;
export const CU_RESTITUTION = 0.7;

export const CU_SWEEP_ZONE_RADIUS = 60;
export const CU_SWEEP_WINDOW = 500;
export const CU_SWEEP_THRESHOLD = 6;
export const CU_SWEEP_INPUT_RATE_LIMIT = 15;      // max inputs per second

export const CU_BULLSEYE = 100;
export const CU_INNER_RING = 60;
export const CU_OUTER_RING = 30;
export const CU_HOUSE = 10;
export const CU_CLOSEST_BONUS = 50;
```

### 3.13 Game History

**Game History Level:** Summary Log

Cursor Curling is a physics-heavy game where logging every simulation tick would be excessive. Instead, the log captures the throw inputs (angle, power) and final resting positions — enough to compare strategies and reconstruct the key moments of each end.

**`initialState`**

```typescript
interface CUInitialState {
  totalEnds: number;
  playerCount: number;
  canvasSize: { width: number; height: number };
  houseCenter: { x: number; y: number };
  bullseyeRadius: number;
  stoneRadius: number;
  throwOrder: string[];  // userId order
}
```

**Actions Logged**

| Action Type | Payload | Recorded |
|---|---|---|
| `end_start` | `{ end: number; throwOrder: string[] }` | Start of each end |
| `throw` | `{ end: number; userId: string; angle: number; power: number; swept: boolean }` | After each player's throw completes |
| `stone_rest` | `{ end: number; userId: string; position: { x: number; y: number }; distanceToBullseye: number }` | When a stone comes to rest |
| `end_result` | `{ end: number; scores: Record<string, number>; closestUserId: string; stonePositions: Array<{ userId: string; x: number; y: number }> }` | End of each end |
| `game_end` | `{ finalScores: Record<string, number>; placements: Array<{ userId: string; placement: number; score: number }> }` | Game over |

**Replay Value:** Comparing throw angles and power levels across players reveals different strategies — cautious vs. aggressive throws, effective sweeping, and how stone collisions changed the outcome of each end.

### 3.14 MinigameRenderer & Client-Server Wiring

#### MinigameRenderer Registration

```typescript
// In MinigameRenderer lazy-import map
'cursor-curling': lazy(() => import('./minigames/cursor-curling/CursorCurlingGame'))
```

#### Client-Side Store Integration

The client listens for the following server-dispatched action types and merges them into the minigame slice of the room store:

`CU_END_START`, `CU_THROWER_ACTIVE`, `CU_AIM_PREVIEW`, `CU_POWER_PHASE`, `CU_STONE_LAUNCHED`, `CU_STONE_POSITION`, `CU_STONE_COLLISION`, `CU_SWEEP_ACTIVE`, `CU_SWEPT_EFFECT`, `CU_STONE_STOPPED`, `CU_END_RESULTS`, `CU_GAME_OVER`, `TIMER_TICK`

```typescript
useEffect(() => {
  const handlers = [
    'CU_END_START', 'CU_THROWER_ACTIVE', 'CU_AIM_PREVIEW',
    'CU_POWER_PHASE', 'CU_STONE_LAUNCHED', 'CU_STONE_POSITION',
    'CU_STONE_COLLISION', 'CU_SWEEP_ACTIVE', 'CU_SWEPT_EFFECT',
    'CU_STONE_STOPPED', 'CU_END_RESULTS', 'CU_GAME_OVER',
    'TIMER_TICK',
  ];
  handlers.forEach((type) =>
    socket.on(type, (payload) => dispatch({ type, payload }))
  );
  return () => handlers.forEach((type) => socket.off(type));
}, [socket, dispatch]);
```

#### Client-Side Input Dispatch

Two client-to-server messages exist, depending on the player's role:

- **`THROW_STONE`** — `{ angle, power }` (thrower only, during aiming/power phase).
- **`SWEEP`** — `{ x, y }` (non-throwers during stone simulation, rate-limited to 15 Hz).

```typescript
const handleThrow = (angle: number, power: number) => {
  socket.emit('THROW_STONE', { angle, power });
};

const handleSweep = (x: number, y: number) => {
  socket.emit('SWEEP', { x, y });
};
```

> **Performance note:** Stone positions are broadcast at 30 Hz during simulation. The client renders interpolated positions between server updates using `requestAnimationFrame` for smooth motion.

#### Server-Side Handler Registration

```typescript
// server/rmhbox/minigames/cursor-curling/CursorCurlingGame.ts
export class CursorCurlingGame { /* … */ }

// server/rmhbox/game-coordinator.ts
MINIGAME_SERVER_REGISTRY.set('cursor-curling', CursorCurlingGame);
```

#### Sound Effect Integration

| Event | Sound | Notes |
|---|---|---|
| End start | `swoosh` | New end begins |
| Thrower active | `chime` | Active thrower is announced |
| Stone launched | `swoosh` | Stone released onto the sheet |
| Stone collision | `click` | Two stones collide |
| Stone stopped | `click` | Stone comes to rest |
| Sweep detected | `click` | Sweep action registered |
| End results | `victoryFanfare` | Scores for the end displayed |
| Game over | `victoryFanfare` | Final standings revealed |

#### Spectator Rendering

Spectators have an omniscient view — they see aim arrow direction, power meter, all stone positions, and sweep indicators. The component renders the full `CurlingCanvas` with all overlays enabled.

---

## 4. Human Tetris

### 4.1 Overview

| Field | Value |
|---|---|
| **ID** | `human-tetris` |
| **Display Name** | Human Tetris |
| **Category** | `action` |
| **Icon** | `square-stack` (Lucide) |
| **Min Players** | 4 |
| **Max Players** | 10 |
| **Estimated Duration** | 120 seconds |
| **Supports Teams** | Yes (entire group is one team) |
| **Join-in-Progress** | `spectate_only` |
| **Tags** | `['action', 'coordination', 'cooperative', 'spatial']` |

### 4.2 Game Concept

Spatial awareness and real-time team positioning. A wall with a specific hole shape moves toward the players' avatars on a 2D grid. Players must position their avatars to collectively form the exact shape of the hole in the wall. Extra players must hide in designated "Dead Zones" or the whole team fails the round. It's the game show "Hole in the Wall" as a multiplayer browser game.

### 4.3 Detailed Mechanics

#### 4.3.1 Round Structure

The game consists of `HT_TOTAL_WAVES` (default: **8**) waves of escalating difficulty.

| Phase | Duration | Description |
|---|---|---|
| Wall Preview | 3s | Show the incoming wall shape + required player count |
| Positioning Phase | Variable (depends on difficulty) | Players move avatars to match the shape |
| Wall Impact | 1s | Wall passes through; check positions |
| Wave Results | 2s | Show success/failure, highlight correct/incorrect players |

**Positioning phase duration:**
- Waves 1–3: `HT_EASY_POSITION` (default: **8s**)
- Waves 4–6: `HT_MEDIUM_POSITION` (default: **6s**)
- Waves 7–8: `HT_HARD_POSITION` (default: **4s**)

**Total game time:** ~8 × 14s avg = ~112s ≈ 2 minutes.

#### 4.3.2 The Grid

The playing field is a **grid** of `HT_GRID_COLS` × `HT_GRID_ROWS` (default: **8 × 6**, 48 cells).

```
┌───┬───┬───┬───┬───┬───┬───┬───┐
│   │   │   │   │   │   │   │   │  Row 0
├───┼───┼───┼───┼───┼───┼───┼───┤
│   │   │   │ ■ │ ■ │   │   │   │  Row 1  ← Wall shape (holes marked ■)
├───┼───┼───┼───┼───┼───┼───┼───┤
│   │   │ ■ │ ■ │ ■ │ ■ │   │   │  Row 2
├───┼───┼───┼───┼───┼───┼───┼───┤
│   │   │   │ ■ │ ■ │   │   │   │  Row 3
├───┼───┼───┼───┼───┼───┼───┼───┤
│   │   │   │   │   │   │   │   │  Row 4
├───┼───┼───┼───┼───┼───┼───┼───┤
│💀 │   │   │   │   │   │   │💀 │  Row 5  ← Dead Zones (corners)
└───┴───┴───┴───┴───┴───┴───┴───┘
```

Players occupy one cell each. They move by swiping (mobile) or arrow keys (desktop).

#### 4.3.3 Wall Shape Generation

Each wave's wall is generated by the server:

1. The wall occupies the full grid width and height.
2. The "hole" is a connected shape made of `N` cells, where `N` = number of players who need to fill it.
3. The shape is randomly generated from a set of templates (`data/rmhbox/human-tetris/shapes.json`) or procedurally generated with constraints:
   - All hole cells must be **connected** (orthogonally adjacent — no floating islands).
   - The shape must be centered (not touching edges, leaving room for dead zones).
   - Shape complexity increases with wave number.

```typescript
interface WallShape {
  holes: Array<{ col: number; row: number }>;         // grid positions that are "holes"
  requiredPlayers: number;                             // how many players must fill holes
  deadZones: Array<{ col: number; row: number }>;     // safe cells for extra players
  difficulty: 'easy' | 'medium' | 'hard';
}
```

**Required players vs. actual players:**
- `requiredPlayers` is always **≤** total player count.
- For easy waves: `requiredPlayers = totalPlayers` (everyone must be in the shape).
- For medium/hard waves: `requiredPlayers = totalPlayers - floor(totalPlayers × HT_EXCLUSION_RATIO)` (default: **0.2**, so ~80% of players are in the shape, 20% must find dead zones).
- If `totalPlayers - requiredPlayers > 0`, extra players MUST be in Dead Zones.

#### 4.3.4 Dead Zones

Dead Zones are specific cells on the grid where players can safely stand when they are NOT needed for the wall shape. Dead Zones are:
- Visually marked (skull icon 💀 or different background color).
- Typically in the corners or edges.
- Each wave generates `HT_DEAD_ZONE_COUNT` (default: `totalPlayers - requiredPlayers + 2`, minimum 2) dead zone cells.
- Multiple players can occupy the same dead zone cell.

#### 4.3.5 Movement

Players move their avatar one cell at a time:
- Input: Arrow keys (desktop) or swipe (mobile).
- Movement is immediate (no animation delay for the authoritative position).
- The client sends `MOVE` with a direction; the server validates (within bounds, no conflicting occupancy for non-dead-zone cells) and broadcasts the new position.
- **Movement rate limit:** `HT_MOVE_RATE_LIMIT` (default: **6** moves per second per player). This prevents teleportation exploits and keeps movement natural.
- **Collision:** Two players cannot occupy the same non-dead-zone cell. If a player tries to move into an occupied cell, the move is rejected. Dead zone cells allow multiple occupants.

#### 4.3.6 Wall Impact & Scoring

When the positioning timer expires:

1. The wall "moves through" (animation of wall passing over the grid).
2. The server checks each player's position:
   - **In a hole cell:** ✅ This player is "safe." They contributed to the shape.
   - **In a dead zone cell:** ✅ This player is safe. They correctly hid.
   - **NOT in a hole cell AND NOT in a dead zone:** ❌ This player is "hit" by the wall.
3. **Team success:** The wave is successful if:
   - ALL hole cells are occupied by exactly one player.
   - ALL surplus players are in dead zone cells.
   - No player is left on a regular (non-hole, non-dead-zone) cell.
4. **Partial credit:** If some but not all conditions are met, the team gets partial points.

**Scoring:**

| Outcome | Points (per player) |
|---|---|
| Team success (all conditions met) | `HT_SUCCESS` (default: **100** per player) |
| Partial success (some holes filled but not all) | `HT_PARTIAL` (default: **30**) × (filled holes / required holes) |
| Player correctly in hole or dead zone | `HT_CORRECT_POSITION` (default: **50**) |
| Player hit by wall (wrong position) | `HT_HIT_PENALTY` (default: **-20**) |
| Perfect wave (team success with ≥ 2s remaining) | `HT_PERFECT_WAVE_BONUS` (default: **50** per player) |
| All 8 waves successful in a row | `HT_STREAK_BONUS` (default: **200** per player) |

#### 4.3.7 Escalation

As waves progress:
- Shapes become larger and more complex.
- Positioning time decreases.
- More players may need to go to dead zones (harder coordination).
- Shapes may require specific formations (lines, L-shapes, T-shapes) that require communication.

### 4.4 Server-Side State Schema

```typescript
interface HumanTetrisState {
  currentWave: number;                             // 1-indexed
  totalWaves: number;
  phase: HTPhase;
  
  // Grid
  gridCols: number;
  gridRows: number;
  
  // Current wall
  currentWall: WallShape | null;
  
  // Player positions
  playerPositions: Map<string, GridPosition>;      // userId → {col, row}
  
  // Wave results
  waveResults: WaveResult[];
  consecutiveSuccesses: number;
  
  // Scoring
  playerScores: Map<string, number>;
  
  // Timer
  phaseStartedAt: number;
  phaseEndsAt: number;
}

type HTPhase = 'WALL_PREVIEW' | 'POSITIONING' | 'WALL_IMPACT' | 'WAVE_RESULTS' | 'GAME_OVER';

interface GridPosition {
  col: number;
  row: number;
}

interface WaveResult {
  waveNumber: number;
  success: boolean;
  filledHoles: number;
  totalHoles: number;
  playersInCorrectPosition: string[];
  playersHitByWall: string[];
  teamScore: number;
}
```

### 4.5 WebSocket Event Map

#### Client → Server

| Action | Payload | Description |
|---|---|---|
| `HT_MOVE` | `{ direction: 'up' \| 'down' \| 'left' \| 'right' }` | Move avatar one cell |

**Zod schema:**

```typescript
const HTMoveSchema = z.object({
  direction: z.enum(['up', 'down', 'left', 'right']),
});
```

#### Server → Client (Game Actions)

| Action Type | Payload | Sent To | Description |
|---|---|---|---|
| `HT_WAVE_START` | `{ waveNumber: number, wall: WallShapeView, positioningSeconds: number, deadZones: GridPosition[], requiredPlayers: number }` | All (lobby) | New wave begins |
| `HT_PLAYER_MOVED` | `{ userId: string, userName: string, col: number, row: number }` | All (lobby) | A player moved |
| `HT_MOVE_REJECTED` | `{ reason: 'OUT_OF_BOUNDS' \| 'CELL_OCCUPIED' \| 'RATE_LIMITED' }` | Moving player only | Move rejected |
| `HT_WALL_IMPACT` | `{ results: WallImpactResult }` | All (lobby) | Wall passes through |
| `HT_WAVE_RESULTS` | `{ waveNumber: number, success: boolean, filledHoles: number, totalHoles: number, correctPlayers: string[], hitPlayers: string[], teamScore: number }` | All (lobby) | Wave scored |
| `HT_GAME_OVER` | `{ finalRankings: HTFinalRanking[], wavesCompleted: number, perfectWaves: number }` | All (lobby) | Game over |
| `TIMER_START` | `{ totalDuration: number, timeRemaining: number }` | All (lobby) | Emitted at the start of each POSITIONING phase via `broadcastAction` |
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer (every 1s during all timed phases) via `broadcastAction` |
| `MINIGAME_ROUND` | `{ current: number, total: number }` | All (lobby) | Sub-round counter update (e.g. "Wave 3/8") via `broadcastAction` |

**Supporting types:**

```typescript
interface WallShapeView {
  holes: GridPosition[];
  wallCells: GridPosition[];           // non-hole cells (the "wall" itself — visual)
}

interface WallImpactResult {
  playerResults: Array<{
    userId: string;
    userName: string;
    position: GridPosition;
    status: 'IN_HOLE' | 'IN_DEAD_ZONE' | 'HIT_BY_WALL';
  }>;
  allHolesFilled: boolean;
  allPlayersSafe: boolean;
  success: boolean;
}

interface HTFinalRanking {
  userId: string;
  userName: string;
  totalScore: number;
  correctPositions: number;
  timesHitByWall: number;
  rank: number;
}
```

### 4.6 Information Masking

This game has **minimal masking** — it's a cooperative game where everyone needs to see everyone else's position to coordinate.

| Data | Player View | Spectator View |
|---|---|---|
| Wall shape (holes) | Visible | Visible |
| Dead zone locations | Visible | Visible |
| All player positions | **Visible** (real-time) | Visible |
| Required player count | Visible | Visible |
| Own position | Visible (highlighted) | N/A |
| Scores | Visible | Visible |

**`getStateForPlayer(userId)` during POSITIONING:**

```typescript
interface HTPlayerPositioningState {
  waveNumber: number;
  totalWaves: number;
  phase: 'POSITIONING';
  gridCols: number;
  gridRows: number;
  wall: WallShapeView;
  deadZones: GridPosition[];
  requiredPlayers: number;
  timeRemaining: number;
  
  // All player positions (everyone needs to see this to coordinate)
  playerPositions: Array<{ userId: string; userName: string; col: number; row: number; isMe: boolean }>;
  
  // Which holes are filled
  filledHoles: GridPosition[];
  unfilledHoles: GridPosition[];
  
  scores: Array<{ userId: string; userName: string; totalScore: number }>;
  consecutiveSuccesses: number;
}
```

### 4.7 Join-in-Progress Logic

**Policy:** `spectate_only`

Wall shapes are generated based on the player count at game start. Adding a player would require recalculating the `requiredPlayers` for each subsequent wave, potentially invalidating pre-generated shapes. Late joiners spectate.

### 4.8 Reconnection Behavior

On reconnect:
1. Player receives the current wall shape, all player positions, dead zone locations, and timer.
2. Their avatar position is preserved at whatever cell they were in when they disconnected.
3. They can immediately start moving.
4. If they were in an incorrect position during a wall impact while disconnected, they're counted as "hit."

### 4.9 Player Disconnect Mid-Game

- Disconnected player's avatar stays in its last position (frozen).
- This can cause a wave failure if their avatar is needed in a hole cell and it's stuck elsewhere.
- If multiple players disconnect, the game may become unwinnable. After the grace period, if remaining players < `minPlayers` (4), the game force-ends.
- If the disconnected player reconnects, they resume with their avatar's last position.

### 4.10 Awards

| Award | Condition | Icon |
|---|---|---|
| Perfect Team | All 8 waves successful (team award) | `trophy` |
| Dead Zone Expert | Successfully hid in dead zones the most times | `ghost` |
| Shape Filler | Was in a hole cell correctly the most times | `puzzle` |
| Wall Magnet | Got hit by the wall the most times | `zap` |
| Speed Mover | Reached correct position with the most time remaining (averaged) | `rabbit` |

### 4.11 NPM Package Suggestions

No additional packages. The game is grid-based movement and shape matching — pure algorithmic logic. Shape generation can use a simple flood-fill or template-based approach.

### 4.12 Client Component Structure

```
components/rmhbox/minigames/human-tetris/
  HumanTetrisGame.tsx            # Main game component, phase router
  WallCanvas.tsx                 # Grid renderer with wall, holes, dead zones, players
  GridCell.tsx                   # Individual cell (hole/wall/dead-zone states)
  PlayerAvatar.tsx               # Player circle on the grid with label
  WallPreview.tsx                # Wall shape preview with required count
  WallAnimation.tsx              # Wall-moving-through animation
  SwipeDetector.tsx              # Mobile swipe-to-move handler
  WaveResults.tsx                # Success/failure display per wave
```

**Mobile UI layout (POSITIONING phase):**

```
┌──────────────────────────────┐
│ Human Tetris  Wave 5/8 ⏱ 4s  │
├──────────────────────────────┤
│ Fill the 5 holes! (2 hide)   │
├──────────────────────────────┤
│ ┌──┬──┬──┬──┬──┬──┬──┬──┐   │
│ │  │  │  │  │  │  │  │  │   │
│ ├──┼──┼──┼──┼──┼──┼──┼──┤   │
│ │  │  │  │■ │■ │  │  │  │   │  ← ■ = hole (needs player)
│ ├──┼──┼──┼──┼──┼──┼──┼──┤   │
│ │  │  │■ │■🔴│■ │  │  │  │   │  ← 🔴 = you (in a hole ✓)
│ ├──┼──┼──┼──┼──┼──┼──┼──┤   │
│ │  │🟢│  │  │  │🟡│  │  │   │  ← Other players
│ ├──┼──┼──┼──┼──┼──┼──┼──┤   │
│ │  │  │  │  │  │  │  │  │   │
│ ├──┼──┼──┼──┼──┼──┼──┼──┤   │
│ │💀│  │  │🔵│  │  │  │💀│   │  ← 💀 = dead zones
│ └──┴──┴──┴──┴──┴──┴──┴──┘   │
│ ← Swipe to move →            │
├──────────────────────────────┤
│ Streak: 4 🔥  │  Score: 320  │
└──────────────────────────────┘
```

### 4.13 Constants

```typescript
export const HT_TOTAL_WAVES = 8;
export const HT_GRID_COLS = 8;
export const HT_GRID_ROWS = 6;

export const HT_EASY_POSITION = 8;
export const HT_MEDIUM_POSITION = 6;
export const HT_HARD_POSITION = 4;
export const HT_WALL_PREVIEW = 3;
export const HT_WALL_IMPACT = 1;
export const HT_WAVE_RESULTS = 2;

export const HT_EXCLUSION_RATIO = 0.2;            // 20% of players must hide in dead zones (on harder waves)
export const HT_DEAD_ZONE_MIN_COUNT = 2;
export const HT_MOVE_RATE_LIMIT = 6;               // moves/sec/player

export const HT_SUCCESS = 100;
export const HT_PARTIAL = 30;
export const HT_CORRECT_POSITION = 50;
export const HT_HIT_PENALTY = -20;
export const HT_PERFECT_WAVE_BONUS = 50;
export const HT_STREAK_BONUS = 200;
```

### 4.14 Anti-Cheat Notes

- Player positions are server-authoritative. The client sends directional movement commands, not positions. The server computes new positions and validates bounds/collisions.
- Movement rate limiting prevents teleportation via rapid input.
- The server checks all positions at the moment of wall impact — no client-side evaluation.
- Dead zone occupancy is allowed for multiple players (no exploit from stacking in dead zones since it's cooperative).

### 4.15 Game History

**Game History Level:** Minimal Log

Human Tetris is a cooperative game where the moment-to-moment player movement isn't very interesting after the fact. The log captures each wave's wall shape, the player positions at the moment of impact, and whether the team passed or failed — showing team coordination trends over time.

**`initialState`**

```typescript
interface HTInitialState {
  playerCount: number;
  arenaSize: { width: number; height: number };
  wallSpeedInitial: number;
  totalWaves: number;
  gapTolerance: number;
  movementSpeed: number;
}
```

**Actions Logged**

| Action Type | Payload | Recorded |
|---|---|---|
| `wave_start` | `{ wave: number; wallShape: Array<{ x: number; y: number; width: number; height: number }>; requiredPlayers: number; wallSpeed: number }` | Start of each wave |
| `wave_impact` | `{ wave: number; playerPositions: Array<{ userId: string; x: number; y: number }>; success: boolean; playersHit: string[] }` | Moment of wall impact |
| `wave_result` | `{ wave: number; passed: boolean; teamScore: number; streak: number }` | After wave evaluation |
| `game_end` | `{ wavesCompleted: number; totalWaves: number; finalScore: number; perfectWaves: number; longestStreak: number }` | Game over |

**Replay Value:** The log shows how team coordination evolved across waves — whether the group improved with practice, which wall shapes caused the most failures, and how long their success streaks lasted.

### 4.16 MinigameRenderer & Client-Server Wiring

#### MinigameRenderer Registration

```typescript
// In MinigameRenderer lazy-import map
'human-tetris': lazy(() => import('./minigames/human-tetris/HumanTetrisGame'))
```

#### Client-Side Store Integration

The client listens for the following server-dispatched action types and merges them into the minigame slice of the room store:

`HT_WAVE_START`, `HT_PLAYER_MOVED`, `HT_MOVE_REJECTED`, `HT_WALL_IMPACT`, `HT_WAVE_RESULTS`, `HT_GAME_OVER`, `TIMER_TICK`

```typescript
useEffect(() => {
  const handlers = [
    'HT_WAVE_START', 'HT_PLAYER_MOVED', 'HT_MOVE_REJECTED',
    'HT_WALL_IMPACT', 'HT_WAVE_RESULTS', 'HT_GAME_OVER',
    'TIMER_TICK',
  ];
  handlers.forEach((type) =>
    socket.on(type, (payload) => dispatch({ type, payload }))
  );
  return () => handlers.forEach((type) => socket.off(type));
}, [socket, dispatch]);
```

#### Client-Side Input Dispatch

Players move their avatar to fit through the approaching wall. The only client-to-server message is:

- **`HT_MOVE`** — `{ direction }` where `direction` is `'up' | 'down' | 'left' | 'right'`.

On mobile, swipe gestures are supported via `SwipeDetector`.

```typescript
const handleMove = (direction: 'up' | 'down' | 'left' | 'right') => {
  socket.emit('HT_MOVE', { direction });
};
```

#### Server-Side Handler Registration

```typescript
// server/rmhbox/minigames/human-tetris/HumanTetrisGame.ts
export class HumanTetrisGame { /* … */ }

// server/rmhbox/game-coordinator.ts
MINIGAME_SERVER_REGISTRY.set('human-tetris', HumanTetrisGame);
```

#### Sound Effect Integration

| Event | Sound | Notes |
|---|---|---|
| Wave start / wall preview | `swoosh` | New wave begins, wall shape revealed |
| Player moved (own) | `click` | Player's own avatar moved |
| Move rejected | `buzzer` | Movement blocked (out of bounds, etc.) |
| Wall impact (all safe) | `victoryFanfare` | Everyone fit through the wall |
| Wall impact (hit) | `buzzer` | One or more players collided |
| Wave results (perfect) | `scoreDing` | Perfect wave bonus |
| Game over | `victoryFanfare` | Final score revealed |

#### Spectator Rendering

Spectators see the same view as players (cooperative game — all positions are visible). The component renders the `WallCanvas` with all player avatars and wall shapes. Spectators cannot send `HT_MOVE` inputs.

---

*End of Minigame Specifications Part 3*
