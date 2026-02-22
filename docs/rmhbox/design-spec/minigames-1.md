# RMHbox — Minigame Design Specifications (Part 1)

> **Version:** 1.0  
> **Last Updated:** 2026-02-22  
> **Status:** Draft  
> **Games Covered:** Rhyme Time, Undercover Agent, Category Crash, Wiki-Race  
> **Parent Document:** [design-spec-core.md](./design-spec-core.md)

---

## Table of Contents

1. [Rhyme Time](#1-rhyme-time)
2. [Undercover Agent](#2-undercover-agent)
3. [Category Crash](#3-category-crash)
4. [Wiki-Race](#4-wiki-race)

---

## 1. Rhyme Time

### 1.1 Overview

| Field | Value |
|---|---|
| **ID** | `rhyme-time` |
| **Display Name** | Rhyme Time |
| **Category** | `word` |
| **Icon** | `mic-vocal` (Lucide) |
| **Min Players** | 2 |
| **Max Players** | 16 |
| **Estimated Duration** | 60 seconds |
| **Supports Teams** | No |
| **Join-in-Progress** | `spectate_only` |
| **Tags** | `['word', 'speed', 'competitive', 'vocabulary']` |

### 1.2 Game Concept

A high-speed vocabulary sprint. The server reveals a **Root Word** and players race to type as many valid rhymes as possible within a 45-second timer. Common rhymes score low; rare discoveries score big. Multi-syllable matches trigger combo multipliers that reward linguistic depth over brute-force speed.

### 1.3 Detailed Mechanics

#### 1.3.1 Round Structure

The game consists of **3 rounds**, each with a different Root Word. Between rounds there is a **5-second intermission** showing the round's top scorer.

| Phase | Duration | Description |
|---|---|---|
| Round Start | 2s | Root word reveal animation (bounces in, scales up) |
| Input Phase | 45s | Players type and submit rhymes |
| Scoring Phase | 5s | Server tallies, deduplicates, and broadcasts round results |
| Intermission | 5s | Round MVP display + next round preview |

**Total game time:** ~3 rounds × 57s = ~171s ≈ 3 minutes.

#### 1.3.2 Root Word Selection

The server selects Root Words from the preloaded word list (`/public/data/rmhbox/rhyme-time/root-words.json`). Selection criteria:

1. The word must have **at least 15 known rhymes** in the dictionary (to ensure fair gameplay).
2. The word should be a common English word (frequency rank ≤ 5,000 in a word frequency corpus).
3. Words used in previous rounds within the same session are excluded.
4. The server shuffles eligible words and picks the first 3 for the 3 rounds at game start.

Root Word data structure:

```typescript
interface RootWord {
  word: string;              // e.g., "power"
  phonetic: string;          // IPA pronunciation, e.g., "/ˈpaʊər/"
  syllableCount: number;     // 2
  rhymeEndSound: string;     // the phonetic ending used for rhyme matching, e.g., "aʊər"
  knownRhymeCount: number;   // total known rhymes in the dictionary
  difficulty: 'easy' | 'medium' | 'hard'; // based on knownRhymeCount ranges
}
```

#### 1.3.3 Rhyme Validation

All validation is **server-side only**. The client never receives the rhyme dictionary.

A submission is a valid rhyme if:

1. **Phonetic match:** The word's ending phoneme(s) match the Root Word's `rhymeEndSound`. This is determined by a precomputed rhyme lookup table keyed by phonetic endings.
2. **Real word:** The submission exists in the validation dictionary (a curated English word list, ~50,000 entries).
3. **Not the root word itself.**
4. **Not already submitted by this player** (duplicate detection per-player).
5. **Minimum length:** At least 2 characters.
6. **Maximum length:** At most 30 characters.

The rhyme lookup table is structured as:

```typescript
// Pre-loaded on server startup from /public/data/rmhbox/rhyme-time/rhyme-dictionary.json
interface RhymeDictionary {
  [rhymeEndSound: string]: RhymeEntry[];
}

interface RhymeEntry {
  word: string;
  syllableCount: number;
  frequencyRank: number;     // lower = more common (1 = most common word)
  isMultiSyllableRhyme: boolean; // true if 2+ syllables match the root's ending
}
```

#### 1.3.4 Scoring System

Scoring is computed **after** the 45-second input phase ends, not in real-time. This prevents information leakage about what other players have submitted.

| Score Type | Condition | Points |
|---|---|---|
| Common Rhyme | Submitted by ≥ 3 players | Configurable: `COMMON_RHYME_POINTS` (default: **1**) |
| Uncommon Rhyme | Submitted by exactly 2 players | Configurable: `UNCOMMON_RHYME_POINTS` (default: **3**) |
| Rare Rhyme | Submitted by exactly 1 player | Configurable: `RARE_RHYME_POINTS` (default: **5**) |
| Multi-Syllable Bonus | Word has `syllableCount >= rootWord.syllableCount + 1` | Configurable: `MULTI_SYLLABLE_MULTIPLIER` (default: **×2** applied to base points) |
| Speed Bonus | First player to submit a valid rare rhyme | Configurable: `SPEED_BONUS_POINTS` (default: **2** bonus) |
| Invalid Penalty | Submitted a non-rhyming or non-existent word | Configurable: `INVALID_PENALTY_POINTS` (default: **-1**) |

Rarity classification is computed across ALL players' submissions for the round. A word submitted by 1 player is "rare"; by 2 is "uncommon"; by 3+ is "common".

**Multi-syllable example:** Root word "power" (2 syllables, ending "aʊər"). Submission "sunflower" (3 syllables, rhymes on "aʊər") → `isMultiSyllableRhyme = true` → base 5 (rare) × 2 (multi-syllable) = **10 points**.

#### 1.3.5 Input Rules

- Players can submit one word at a time by pressing Enter or tapping Submit.
- Each submission is immediately acknowledged with a UI indicator (pending → valid ✓ or invalid ✗), but the actual score is withheld until the scoring phase.
- The server responds to each submission with `RHYME_SUBMITTED` (valid or invalid status), but does NOT reveal rarity (since other players haven't finished yet).
- Maximum submissions per player per round: `MAX_SUBMISSIONS_PER_ROUND` (default: **30**). After this, further submissions are silently dropped.
- Input is case-insensitive. Trimmed and lowercased before validation.

### 1.4 Server-Side State Schema

```typescript
// server/rmhbox/minigames/rhyme-time.ts

interface RhymeTimeState {
  currentRound: number;                       // 1-indexed, 1–3
  totalRounds: number;                        // from constants: RHYME_TIME_TOTAL_ROUNDS (default 3)
  rootWords: RootWord[];                      // pre-selected for all rounds
  phase: RhymeTimePhase;
  
  // Per-round data
  roundStartedAt: number;                     // timestamp
  roundEndsAt: number;                        // timestamp
  submissions: Map<string, PlayerSubmissions>; // keyed by userId
  
  // Scoring (populated after input phase)
  roundResults: RoundRhymeResults | null;
  
  // Cumulative
  playerScores: Map<string, number>;          // userId → total score across all rounds
}

type RhymeTimePhase = 'ROUND_START' | 'INPUT' | 'SCORING' | 'INTERMISSION';

interface PlayerSubmissions {
  userId: string;
  words: SubmittedWord[];
}

interface SubmittedWord {
  word: string;
  submittedAt: number;         // timestamp
  isValid: boolean;            // server-validated
  invalidReason?: 'NOT_A_WORD' | 'NOT_A_RHYME' | 'DUPLICATE' | 'TOO_SHORT' | 'TOO_LONG' | 'IS_ROOT_WORD';
}

interface RoundRhymeResults {
  rootWord: string;
  wordFrequencies: Map<string, number>;         // word → how many players submitted it
  playerRoundScores: Map<string, PlayerRoundScore>;
}

interface PlayerRoundScore {
  userId: string;
  validCount: number;
  invalidCount: number;
  rareCount: number;
  uncommonCount: number;
  commonCount: number;
  multiSyllableCount: number;
  speedBonuses: number;
  roundScore: number;
  wordBreakdown: WordScoreBreakdown[];
}

interface WordScoreBreakdown {
  word: string;
  rarity: 'common' | 'uncommon' | 'rare';
  basePoints: number;
  multiSyllableMultiplied: boolean;
  speedBonus: boolean;
  totalPoints: number;
}
```

### 1.5 WebSocket Event Map

#### Client → Server

| Action | Payload | Description |
|---|---|---|
| `SUBMIT_RHYME` | `{ word: string }` | Submit a rhyming word |

Sent via the standard `rmhbox:game:input` event with `action: 'SUBMIT_RHYME'`.

**Zod schema:**

```typescript
const SubmitRhymeSchema = z.object({
  word: z.string().min(2).max(30).transform(s => s.trim().toLowerCase()),
});
```

#### Server → Client (Game Actions)

| Action Type | Payload | Sent To | Description |
|---|---|---|---|
| `RT_ROUND_START` | `{ round: number, totalRounds: number, rootWord: RootWord, inputDurationSeconds: number, endsAt: number }` | All (lobby) | A new round begins |
| `RT_RHYME_SUBMITTED` | `{ word: string, isValid: boolean, invalidReason?: string, totalSubmitted: number }` | Submitting player only | Acknowledge a submission |
| `RT_SUBMISSION_COUNT` | `{ userId: string, count: number }` | All (lobby) | Broadcast player's submission count (not the words — just the count for competitive pressure) |
| `RT_ROUND_RESULTS` | `{ rootWord: string, playerResults: PlayerRoundScore[], allWords: AllWordsBreakdown[] }` | All (lobby) | Round scoring complete |
| `RT_INTERMISSION` | `{ nextRound: number, nextRootWordPreview: { difficulty: string }, mvpUserId: string, mvpScore: number }` | All (lobby) | Brief break between rounds |
| `RT_GAME_OVER` | _(none — handled by base `computeResults()`)_ | — | End of all rounds |
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer tick (every 1s during INPUT phase) |

**`AllWordsBreakdown`** (shown during results):

```typescript
interface AllWordsBreakdown {
  word: string;
  rarity: 'common' | 'uncommon' | 'rare';
  submittedBy: string[];      // userNames (not IDs) who submitted this word
  syllableCount: number;
  points: number;              // base points for this rarity
}
```

### 1.6 Information Masking

| Data | Player View | Spectator View |
|---|---|---|
| Root Word | Visible | Visible |
| Own submissions (words + validity) | Visible in real-time | N/A |
| Other players' submissions (words) | **HIDDEN** until scoring phase | **HIDDEN** until scoring phase |
| Other players' submission count | Visible (number only) | Visible (number only) |
| Rarity classification | **HIDDEN** until scoring phase | **HIDDEN** until scoring phase |
| Final round scores | Visible after scoring | Visible after scoring |
| Rhyme dictionary | **NEVER** sent to any client | **NEVER** sent to any client |

**`getStateForPlayer(userId)` returns:**

```typescript
interface RhymeTimePlayerState {
  currentRound: number;
  totalRounds: number;
  rootWord: RootWord;        // current round's root word (public info)
  phase: RhymeTimePhase;
  timeRemaining: number;
  mySubmissions: SubmittedWord[];  // only this player's words
  submissionCounts: Array<{ userId: string; userName: string; count: number }>; // everyone's count
  playerScores: Array<{ userId: string; userName: string; totalScore: number }>; // cumulative
  roundResults: PlayerRoundScore[] | null;   // null during INPUT phase
  allWordsBreakdown: AllWordsBreakdown[] | null; // null during INPUT phase
}
```

**`getStateForSpectator()` returns:**  
Same as player state but `mySubmissions` is empty `[]`. Spectators see the same masked data as players — no privileged view since there's no hidden information to reveal (words are hidden from everyone until scoring).

### 1.7 Join-in-Progress Logic

**Policy:** `spectate_only`

Players who join mid-game become spectators. They see the current round's root word, submission counts, and timer, but cannot submit rhymes. They are eligible for the next full game session.

### 1.8 Reconnection Behavior

On reconnect:
1. Player receives full state via `getStateForPlayer(userId)`.
2. Their previous submissions are preserved (server-side `submissions` Map keyed by `userId`).
3. They can continue submitting for the current round (if still in INPUT phase).
4. If they missed an entire round, they score 0 for that round but can participate in subsequent rounds.

### 1.9 Awards

| Award | Condition | Icon |
|---|---|---|
| Wordsmith | Most total valid submissions across all rounds | `pen-tool` |
| Diamond in the Rough | Most rare rhymes found | `gem` |
| Syllable Surfer | Most multi-syllable rhymes | `waves` |
| Quick Draw | Most speed bonuses earned | `zap` |
| Overachiever | Hit max submission count in any round | `trophy` |

### 1.10 NPM Package Suggestions

| Package | Purpose | Notes |
|---|---|---|
| `cmu-pronouncing-dictionary` | Carnegie Mellon University pronouncing dictionary — maps English words to ARPAbet phonetic transcriptions | Use this to build the rhyme lookup table at build time. ~134,000 entries. MIT license. |
| `syllable` | Count syllables in English words | Lightweight (~2KB), fast, well-maintained. Used for multi-syllable bonus calculation. |

**Build-time data pipeline:** Use `cmu-pronouncing-dictionary` + `syllable` to pre-generate two JSON files at build time:

1. `root-words.json` — Curated list of ~500 root words with metadata.
2. `rhyme-dictionary.json` — Map of phonetic endings → arrays of rhyming words.

These are loaded into server memory on startup (not served to clients). Approximate size: ~2–4 MB in-memory.

### 1.11 Client Component Structure

```
components/rmhbox/minigames/rhyme-time/
  RhymeTimeGame.tsx           # Main game component, phase router
  RhymeTimeInput.tsx          # Text input + submit button + submission list
  RhymeTimeResults.tsx        # Round results with word breakdown table
  RhymeTimeScoreboard.tsx     # Running scores across rounds
  SubmissionPill.tsx           # Individual word pill (valid/invalid/pending states)
```

**Mobile UI layout (INPUT phase):**

```
┌─────────────────────────────┐
│  Round 2/3   ⏱ 0:32         │  ← Header bar
├─────────────────────────────┤
│                             │
│       ✨ P O W E R ✨       │  ← Root word, large, centered
│                             │
├─────────────────────────────┤
│ tower ✓  flower ✓  sour ✓  │  ← Scrollable pill list of submissions
│ mower ✓  xyz ✗              │
├─────────────────────────────┤
│ ┌─────────────────────┬───┐ │
│ │ Type a rhyme...     │ → │ │  ← Input field + submit button
│ └─────────────────────┴───┘ │
│  Score: 1,250  │  5 of 6    │  ← Footer: score + submission count
└─────────────────────────────┘
```

### 1.12 Constants

```typescript
// Defined in lib/rmhbox/constants.ts under a RHYME_TIME namespace/prefix

export const RHYME_TIME_TOTAL_ROUNDS = 3;
export const RHYME_TIME_INPUT_DURATION_SECONDS = 45;
export const RHYME_TIME_SCORING_DURATION_SECONDS = 5;
export const RHYME_TIME_INTERMISSION_DURATION_SECONDS = 5;
export const RHYME_TIME_ROUND_START_DURATION_SECONDS = 2;
export const RHYME_TIME_MAX_SUBMISSIONS_PER_ROUND = 30;

export const RHYME_TIME_COMMON_RHYME_POINTS = 1;
export const RHYME_TIME_UNCOMMON_RHYME_POINTS = 3;
export const RHYME_TIME_RARE_RHYME_POINTS = 5;
export const RHYME_TIME_MULTI_SYLLABLE_MULTIPLIER = 2;
export const RHYME_TIME_SPEED_BONUS_POINTS = 2;
export const RHYME_TIME_INVALID_PENALTY_POINTS = -1;

export const RHYME_TIME_MIN_RHYMES_FOR_ROOT_WORD = 15;
export const RHYME_TIME_MAX_FREQUENCY_RANK = 5000;
export const RHYME_TIME_MIN_WORD_LENGTH = 2;
export const RHYME_TIME_MAX_WORD_LENGTH = 30;
```

### 1.13 Anti-Cheat Notes

- The rhyme dictionary is never sent to any client. All validation is server-side.
- Submission rate is inherently capped by `MAX_SUBMISSIONS_PER_ROUND`. The `rmhbox:game:input` socket rate limit (100/10s) also applies.
- Bot detection heuristic (optional, future): flag players whose median time between submissions is < 500ms over 10+ submissions — humans typically can't type-think-submit faster than ~1.5s per word.

---

## 2. Undercover Agent

### 2.1 Overview

| Field | Value |
|---|---|
| **ID** | `undercover-agent` |
| **Display Name** | Undercover Agent |
| **Category** | `word` |
| **Icon** | `shield-check` (Lucide) |
| **Min Players** | 4 |
| **Max Players** | 16 |
| **Estimated Duration** | 180 seconds |
| **Supports Teams** | Yes (2 teams + assassin neutral) |
| **Join-in-Progress** | `spectate_only` |
| **Tags** | `['word', 'teams', 'strategy', 'deduction']` |

### 2.2 Game Concept

A team-based word-association game inspired by *Codenames*. A 5×5 grid of words is displayed. Each team has a **Spymaster** who sees a color-coded **Key Card** revealing which words belong to which team. Spymasters give single-word clues with a number hint. Their team's **Operatives** must deduce and click the correct tiles. Hitting the **Assassin** tile is an instant loss.

### 2.3 Detailed Mechanics

#### 2.3.1 Setup Phase

When the game starts:

1. **Team Assignment:** Players are divided into two teams (Red and Blue). The server assigns teams using round-robin by join order, ensuring balanced team sizes (difference ≤ 1). If an odd number of players, Red team gets the extra player (and goes first).
2. **Spymaster Selection:** One player per team is randomly designated as the **Spymaster**. The remaining players are **Operatives**.
3. **Grid Generation:** 25 words are randomly selected from the word pool (`/public/data/rmhbox/undercover-agent/word-pool.json`, ~400 words, all common English nouns).
4. **Key Card Generation:** The 25 grid positions are assigned:
   - **Red Agents:** `KEY_CARD_FIRST_TEAM_COUNT` (default: 9) — the team that goes first gets one extra
   - **Blue Agents:** `KEY_CARD_SECOND_TEAM_COUNT` (default: 8)
   - **Assassin:** `KEY_CARD_ASSASSIN_COUNT` (default: 1)
   - **Bystanders:** Remaining (default: 7)
5. **Turn Order:** The team with more agents (Red, 9 agents) goes first.

#### 2.3.2 Turn Structure

Each turn follows:

1. **Clue Phase** (Spymaster's turn):
   - The active Spymaster types a one-word clue and a number (how many grid words relate to the clue).
   - Clue validation:
     - Must be exactly one word (no spaces, hyphens allowed for compound words).
     - Cannot be any word currently visible on the grid (case-insensitive substring check).
     - Maximum 30 characters.
     - Number must be 0–9, or "∞" (unlimited guesses).
   - Time limit: `SPYMASTER_CLUE_TIMEOUT_SECONDS` (default: **90 seconds**). If exceeded, the turn is auto-passed (0 guesses).

2. **Guess Phase** (Operatives' turn):
   - The team's Operatives discuss (via chat) and click tiles.
   - Number of guesses allowed: **clue number + 1** (to allow catching up on previous clues).
   - If clue number is "∞", max guesses is `MAX_UNLIMITED_GUESSES` (default: **25**, effectively unlimited).
   - Each guess is server-validated and results in one of:
     - ✅ **Correct (own team's agent):** Tile is revealed with team color. Operatives may continue guessing.
     - ❌ **Opponent's agent:** Tile revealed with opponent's color. Turn ends immediately.
     - ⬜ **Bystander:** Tile revealed as neutral. Turn ends immediately.
     - 💀 **Assassin:** Tile revealed. **Game over — the guessing team loses instantly.**
   - Operatives can voluntarily end their turn early by clicking "End Turn".
   - Time limit per guess phase: `OPERATIVE_GUESS_TIMEOUT_SECONDS` (default: **120 seconds** total for all guesses). Timer resets on each correct guess.

#### 2.3.3 Win Conditions

| Condition | Winner |
|---|---|
| A team reveals all of their agents | That team wins |
| A team clicks the Assassin tile | The other team wins |
| All turns exhausted (both teams pass 3 consecutive turns with no correct guesses) | The team with more revealed agents wins; tie = draw |

#### 2.3.4 Grid Tile States

```typescript
type TileState = 'HIDDEN' | 'REVEALED';

interface GridTile {
  position: number;           // 0–24 (row-major: row * 5 + col)
  word: string;
  type: TileType;             // ONLY known to server + spymasters
  state: TileState;
  revealedBy: string | null;  // userId of the player who clicked it (null if hidden)
}

type TileType = 'RED_AGENT' | 'BLUE_AGENT' | 'BYSTANDER' | 'ASSASSIN';
```

### 2.4 Server-Side State Schema

```typescript
interface UndercoverAgentState {
  grid: GridTile[];                    // 25 tiles
  keyCard: TileType[];                 // 25 entries, index = position
  teams: {
    red: TeamState;
    blue: TeamState;
  };
  currentTeam: 'red' | 'blue';
  phase: UAPhase;
  currentClue: ActiveClue | null;
  guessesRemaining: number;
  turnNumber: number;
  consecutivePasses: number;           // for stalemate detection
  winner: 'red' | 'blue' | 'draw' | null;
  winReason: 'ALL_AGENTS_FOUND' | 'ASSASSIN_HIT' | 'STALEMATE' | null;
  
  // Timer
  phaseStartedAt: number;
  phaseEndsAt: number;
}

type UAPhase = 'SETUP' | 'CLUE' | 'GUESS' | 'TURN_TRANSITION' | 'GAME_OVER';

interface TeamState {
  teamId: 'red' | 'blue';
  spymasterId: string;                 // userId
  operativeIds: string[];              // userIds
  agentsTotal: number;                 // 8 or 9
  agentsRevealed: number;
  color: string;                       // hex color for UI
}

interface ActiveClue {
  teamId: 'red' | 'blue';
  spymasterId: string;
  word: string;
  number: number | 'unlimited';
  givenAt: number;                     // timestamp
}
```

### 2.5 WebSocket Event Map

#### Client → Server

| Action | Payload | Who Can Send | Description |
|---|---|---|---|
| `GIVE_CLUE` | `{ word: string, number: number \| 'unlimited' }` | Active team's Spymaster only | Submit a clue |
| `GUESS_TILE` | `{ position: number }` | Active team's Operatives only | Click a grid tile |
| `END_TURN` | `{}` | Active team's Operatives only | Voluntarily end the guess phase |

**Zod schemas:**

```typescript
const GiveClueSchema = z.object({
  word: z.string().min(1).max(30).regex(/^\S+$/), // no spaces
  number: z.union([
    z.number().int().min(0).max(9),
    z.literal('unlimited'),
  ]),
});

const GuessTileSchema = z.object({
  position: z.number().int().min(0).max(24),
});
```

#### Server → Client (Game Actions)

| Action Type | Payload | Sent To | Description |
|---|---|---|---|
| `UA_SETUP` | `{ grid: GridWord[], teams: TeamsInfo, currentTeam: string }` | All (lobby) | Initial game state |
| `UA_KEY_CARD` | `{ keyCard: TileType[] }` | Each Spymaster, privately | Key card data (which tiles are which) |
| `UA_CLUE_PHASE` | `{ teamId: string, spymasterName: string, timeoutSeconds: number }` | All (lobby) | Spymaster's turn to give a clue |
| `UA_CLUE_GIVEN` | `{ teamId: string, word: string, number: number \| 'unlimited' }` | All (lobby) | Clue revealed |
| `UA_GUESS_PHASE` | `{ teamId: string, guessesAllowed: number, timeoutSeconds: number }` | All (lobby) | Operatives' guess phase begins |
| `UA_TILE_REVEALED` | `{ position: number, tileType: TileType, revealedBy: string, correct: boolean }` | All (lobby) | A tile was clicked and revealed |
| `UA_TURN_END` | `{ reason: 'WRONG_GUESS' \| 'BYSTANDER' \| 'NO_GUESSES' \| 'VOLUNTARY' \| 'TIMEOUT', nextTeam: string }` | All (lobby) | Turn ended, switching teams |
| `UA_GAME_OVER` | `{ winner: string, winReason: string, keyCard: TileType[] }` | All (lobby) | Game over — full key card revealed to everyone |
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Phase timer |

### 2.6 Information Masking

This game has **critical information masking requirements.**

| Data | Operative View | Spymaster View | Spectator View |
|---|---|---|---|
| Grid words | All 25 visible | All 25 visible | All 25 visible |
| Key card (tile types) | **HIDDEN** for unrevealed tiles | **FULLY VISIBLE** (color overlay) | **FULLY VISIBLE** (color overlay) |
| Current clue | Visible after given | Visible after given | Visible after given |
| Own team's operatives' discussion (chat) | Visible (team chat) | Visible | Visible (spectators see all chat) |
| Opponent spymaster's key card | **HIDDEN** | **HIDDEN** (each spymaster sees the same key card, but obviously from their team's perspective) | **FULLY VISIBLE** |

**`getStateForPlayer(userId)` returns:**

```typescript
interface UAPlayerState {
  grid: Array<{
    position: number;
    word: string;
    state: TileState;
    tileType: TileType | null;    // null if HIDDEN and player is NOT a spymaster; populated if REVEALED or if player is spymaster
  }>;
  teams: { red: ClientTeamInfo; blue: ClientTeamInfo };
  currentTeam: 'red' | 'blue';
  phase: UAPhase;
  currentClue: ActiveClue | null;
  guessesRemaining: number;
  myTeam: 'red' | 'blue';
  myRole: 'spymaster' | 'operative';
  timeRemaining: number;
  winner: string | null;
  winReason: string | null;
}
```

Key masking logic:

```typescript
// In getStateForPlayer:
grid: this.gameState.grid.map(tile => ({
  position: tile.position,
  word: tile.word,
  state: tile.state,
  tileType: tile.state === 'REVEALED'
    ? tile.type                           // always show type if revealed
    : (isSpymaster(userId) ? tile.type : null),  // spymasters see all; operatives see null
})),
```

**`getStateForSpectator()` returns:**  
Same as spymaster view — spectators see the full key card. This is the "Jackbox couch" experience where people watching on a TV can see everything.

> **WARNING:** Spectators' view must be broadcast ONLY to `lobby:{lobbyId}:spectators` room, NEVER to the main `lobby:{lobbyId}` room, or operatives would receive the key card.

### 2.7 Join-in-Progress Logic

**Policy:** `spectate_only`

Team assignments, spymaster roles, and the grid are all fixed at game start. New players become spectators and see the spectator (full key card) view. They participate in the next game session.

### 2.8 Reconnection Behavior

On reconnect:
1. Player receives `getStateForPlayer(userId)` which includes their team, role, and the correctly masked grid.
2. Spymasters reconnecting re-receive the key card.
3. The active turn continues — if it was the reconnected player's team's turn and they were the spymaster, they can still give a clue.
4. Timer is NOT paused for disconnections.

### 2.9 Player Disconnect Mid-Game

- **If a Spymaster disconnects** during their clue phase: After the disconnect grace period (120s from core spec §9.3), the turn auto-passes with 0 guesses. If they reconnect within grace period, they resume.
- **If an Operative disconnects:** The team continues with remaining operatives. They can still guess.
- **If a team is reduced to 0 connected players (all disconnected):** The other team auto-wins after the grace period expires.

### 2.10 Scoring

Scoring in Undercover Agent is team-based but distributed individually:

| Achievement | Points |
|---|---|
| Winning team (each player) | `UA_WIN_POINTS` (default: **500**) |
| Losing team (each player) | `UA_LOSE_POINTS` (default: **100**) |
| Spymaster clue efficiency bonus | `UA_CLUE_EFFICIENCY_BONUS` × (agents found from one clue) (default: **50** per agent) |
| Operative correct guess | `UA_CORRECT_GUESS_POINTS` (default: **75** per correct tile) |
| Assassin penalty (triggering player) | `UA_ASSASSIN_PENALTY` (default: **-200**) |

### 2.11 Awards

| Award | Condition | Icon |
|---|---|---|
| Mastermind | Spymaster whose single clue led to 3+ correct guesses | `brain` |
| Sharpshooter | Operative with the most correct guesses | `crosshair` |
| Oops | Player who triggered the Assassin | `skull` |
| Speedrunner | Winning team cleared all agents in ≤ 5 turns | `timer` |
| Linguist | Spymaster who used the longest valid clue word | `book-open` |

### 2.12 NPM Package Suggestions

No additional packages required beyond what's in the core spec. The word pool is a static JSON file. Team assignment and grid generation are straightforward algorithmic logic.

### 2.13 Client Component Structure

```
components/rmhbox/minigames/undercover-agent/
  UndercoverAgentGame.tsx     # Main game component, phase router
  GridBoard.tsx               # 5×5 clickable grid (responsive, mobile-friendly)
  SpymasterKey.tsx             # Key card overlay (transparent colored cells)
  ClueInput.tsx                # Spymaster clue input (word + number)
  ClueDisplay.tsx              # Shows the active clue to operatives
  TeamPanel.tsx                # Team roster with roles, reusable for both sides
  TurnIndicator.tsx            # Shows whose turn it is
```

**Mobile UI layout (GUESS phase, Operative view):**

```
┌──────────────────────────────┐
│ Undercover Agent  ⏱ 1:30     │
├──────────────────────────────┤
│ 🔴 Red's Turn — Clue: "Animal: 3"│
├──────────────────────────────┤
│ ┌────┬────┬────┬────┬────┐  │
│ │Milk│Tree│🟥  │Fox │Dog │  │  ← 5×5 grid, tap to guess
│ ├────┼────┼────┼────┼────┤  │    🟥 = revealed red agent
│ │Moon│    │Book│Star│    │  │    Colors overlay revealed tiles
│ ├────┼────┼────┼────┼────┤  │
│ │    │Run │    │    │Cup │  │
│ ├────┼────┼────┼────┼────┤  │
│ │    │    │🟦  │    │    │  │
│ ├────┼────┼────┼────┼────┤  │
│ │    │Key │    │Car │    │  │
│ └────┴────┴────┴────┴────┘  │
├──────────────────────────────┤
│ Guesses: 2/4  [End Turn]     │
│ 🟥 Red 3/9   🟦 Blue 1/8    │  ← Agent progress
└──────────────────────────────┘
```

### 2.14 Constants

```typescript
export const UA_GRID_SIZE = 25;                          // 5×5
export const UA_GRID_COLS = 5;
export const UA_FIRST_TEAM_AGENT_COUNT = 9;
export const UA_SECOND_TEAM_AGENT_COUNT = 8;
export const UA_ASSASSIN_COUNT = 1;
export const UA_BYSTANDER_COUNT = 7;                     // 25 - 9 - 8 - 1
export const UA_SPYMASTER_CLUE_TIMEOUT_SECONDS = 90;
export const UA_OPERATIVE_GUESS_TIMEOUT_SECONDS = 120;
export const UA_TURN_TRANSITION_SECONDS = 3;
export const UA_MAX_UNLIMITED_GUESSES = 25;
export const UA_MAX_CONSECUTIVE_PASSES = 6;              // 3 per team = stalemate

export const UA_WIN_POINTS = 500;
export const UA_LOSE_POINTS = 100;
export const UA_CLUE_EFFICIENCY_BONUS = 50;
export const UA_CORRECT_GUESS_POINTS = 75;
export const UA_ASSASSIN_PENALTY = -200;
```

---

## 3. Category Crash

### 3.1 Overview

| Field | Value |
|---|---|
| **ID** | `category-crash` |
| **Display Name** | Category Crash |
| **Category** | `word` |
| **Icon** | `list-collapse` (Lucide) |
| **Min Players** | 3 |
| **Max Players** | 16 |
| **Estimated Duration** | 150 seconds |
| **Supports Teams** | No |
| **Join-in-Progress** | `join_next_subround` |
| **Tags** | `['word', 'brainstorm', 'speed', 'competitive', 'social']` |

### 3.2 Game Concept

A fast-paced brainstorming game. A random letter and 5 categories are revealed. Players have 60 seconds to fill in answers for all 5 categories starting with that letter. After submissions close, a **Peer Review** phase lets players challenge ("Crash") dubious answers. The most unique, unchallenged answers win.

### 3.3 Detailed Mechanics

#### 3.3.1 Round Structure

The game consists of **2 rounds**, each with a different letter and different categories.

| Phase | Duration | Description |
|---|---|---|
| Reveal | 3s | Letter + categories animate in |
| Input Phase | 60s | Players type answers for each category |
| Peer Review | 30s | Players see all answers and can "Crash" (challenge) others |
| Crash Resolution | 5s | Server tallies crashes and validates |
| Round Results | 8s | Show who scored what and which answers were crashed |

**Total game time:** ~2 rounds × 106s = ~212s ≈ 3.5 minutes.

#### 3.3.2 Letter & Category Selection

**Letter selection:**  
The server picks a random letter from a weighted pool. Letters like Q, X, Z have lower weight (harder to find answers). The pool excludes letters used in previous rounds in the same session.

```typescript
interface LetterWeight {
  letter: string;
  weight: number; // higher = more likely to be selected
}

// Example weights:
// A:10, B:8, C:10, D:8, E:7, F:7, G:6, H:6, I:5, J:3, K:4, L:7,
// M:8, N:6, O:5, P:8, Q:1, R:8, S:10, T:9, U:3, V:3, W:5, X:1, Y:2, Z:1
```

**Category selection:**  
Categories are drawn from a curated pool (`/public/data/rmhbox/category-crash/categories.json`, ~200 categories). Each round selects 5 non-repeating categories. Categories are grouped by difficulty:

```typescript
interface Category {
  id: string;
  name: string;                   // e.g., "Pizza Topping"
  difficulty: 'easy' | 'medium' | 'hard';
  examples: string[];             // for validation hints (not shown to players)
}
```

Each round selects: 2 easy, 2 medium, 1 hard.

#### 3.3.3 Answer Submission

- Players see 5 text fields, one per category.
- They can fill them in any order.
- Answers auto-save on blur / every keystroke (debounced 500ms) via a `SAVE_ANSWERS` action — but the server does NOT lock answers until the timer expires or the player explicitly submits.
- **Final submission:** When the timer hits 0, whatever is in the server's `savedAnswers` for that player is locked as their final submission.
- Players can also click "Submit All" early to lock in answers before the timer.
- Answers are trimmed, lowercased, and limited to 50 characters.
- Empty answers are valid (player chose to skip that category — scores 0 for it).

#### 3.3.4 Peer Review Phase

After all answers are locked:

1. The server broadcasts ALL answers (anonymized by player number, not name, to reduce bias) for each category.
2. Each player can **Crash** up to `MAX_CRASHES_PER_ROUND` (default: **5**) answers total across all categories.
3. A "Crash" is a challenge claiming the answer is invalid (doesn't match the category, doesn't start with the letter, or is nonsensical).
4. Players cannot crash their own answers.
5. An answer is **crashed** (invalidated) if it receives crashes from ≥ `CRASH_THRESHOLD_PERCENT` (default: **50%**) of OTHER players (rounded up). Example: 6 players, threshold = 50% of 5 others = 3 crashes needed.

#### 3.3.5 Server-Side Validation (Augmented)

In addition to peer review, the server performs light validation:

1. **Letter check:** The answer must start with the round's letter (case-insensitive). If not, it's automatically invalid (no crash needed).
2. **Duplicate check:** If two or more players submit the **exact same answer** (after normalization) for the same category, all duplicates are worth fewer points (see scoring).
3. **Fuzzy duplicate detection:** Using `fuse.js` (from core spec §2.2), answers are fuzzy-matched with a threshold of `FUZZY_MATCH_THRESHOLD` (default: **0.85** similarity). Matches are flagged as potential duplicates for scoring purposes but not auto-invalidated. Example: "pepperoni" and "peperoni" would fuzzy-match.

#### 3.3.6 Scoring System

| Score Type | Condition | Points |
|---|---|---|
| Valid, unique answer | Answer is valid, not crashed, and no one else submitted it | `CC_UNIQUE_ANSWER_POINTS` (default: **10**) |
| Valid, shared answer | Answer is valid, not crashed, but another player also submitted it (exact or fuzzy match) | `CC_SHARED_ANSWER_POINTS` (default: **5**) |
| Crashed answer | Answer received enough crashes to be invalidated | **0** |
| Auto-invalid | Doesn't start with the correct letter | **0** |
| Empty | No answer provided | **0** |
| Successful crash bonus | Player crashed an answer that was ultimately invalidated | `CC_SUCCESSFUL_CRASH_BONUS` (default: **2**) |
| Failed crash penalty | Player crashed an answer that was NOT invalidated | `CC_FAILED_CRASH_PENALTY` (default: **-1**) |

**Total round score** = sum of answer scores across 5 categories + crash bonuses/penalties.

### 3.4 Server-Side State Schema

```typescript
interface CategoryCrashState {
  currentRound: number;
  totalRounds: number;
  phase: CCPhase;
  letter: string;
  categories: Category[];                      // 5 categories for this round
  
  // Answers (built up during INPUT phase)
  savedAnswers: Map<string, PlayerAnswers>;    // userId → answers
  lockedAnswers: Map<string, PlayerAnswers>;   // userId → final answers (after submit/timer)
  
  // Peer Review
  crashes: Map<string, CrashRecord[]>;         // crashKey → crashes (crashKey = `${userId}:${categoryIndex}`)
  
  // Results
  roundResults: CCRoundResults | null;
  
  // Cumulative
  playerScores: Map<string, number>;
  
  // Timers
  phaseStartedAt: number;
  phaseEndsAt: number;
  
  // Letters used this session (to avoid repeats)
  usedLetters: string[];
}

type CCPhase = 'REVEAL' | 'INPUT' | 'PEER_REVIEW' | 'CRASH_RESOLUTION' | 'ROUND_RESULTS';

interface PlayerAnswers {
  userId: string;
  answers: (string | null)[];   // index matches categories array; null = skipped
  submittedAt: number | null;   // null if auto-submitted at timer end
}

interface CrashRecord {
  crashedByUserId: string;
  targetUserId: string;
  categoryIndex: number;
  timestamp: number;
}

interface CCRoundResults {
  letter: string;
  categories: Category[];
  playerResults: CCPlayerResult[];
  answerBreakdowns: CCAnswerBreakdown[][];  // [categoryIndex][answerIndex]
}

interface CCPlayerResult {
  userId: string;
  userName: string;
  answers: (string | null)[];
  answerScores: number[];         // score per category
  crashBonusPenalty: number;      // net from crashes
  roundTotal: number;
}

interface CCAnswerBreakdown {
  answer: string;
  submittedBy: string[];          // userNames
  wasLetterValid: boolean;
  crashCount: number;
  crashThreshold: number;
  wasCrashed: boolean;
  isDuplicate: boolean;
  fuzzyMatchGroup: string | null;  // group ID if fuzzy-matched with others
  points: number;
}
```

### 3.5 WebSocket Event Map

#### Client → Server

| Action | Payload | Description |
|---|---|---|
| `SAVE_ANSWERS` | `{ answers: (string \| null)[] }` | Auto-save current answers (debounced) |
| `SUBMIT_ANSWERS` | `{ answers: (string \| null)[] }` | Explicitly lock in final answers |
| `CRASH_ANSWER` | `{ targetUserId: string, categoryIndex: number }` | Challenge an answer during Peer Review |
| `UNCRASH_ANSWER` | `{ targetUserId: string, categoryIndex: number }` | Undo a crash |

**Zod schemas:**

```typescript
const SaveAnswersSchema = z.object({
  answers: z.array(z.string().max(50).nullable()).length(5),
});

const CrashAnswerSchema = z.object({
  targetUserId: z.string().min(1),
  categoryIndex: z.number().int().min(0).max(4),
});
```

#### Server → Client (Game Actions)

| Action Type | Payload | Sent To | Description |
|---|---|---|---|
| `CC_ROUND_START` | `{ round: number, letter: string, categories: Category[], inputDurationSeconds: number }` | All (lobby) | Round begins |
| `CC_ANSWER_SAVED` | `{ categoryIndex: number, answer: string }` | Submitting player only | Confirm answer auto-save |
| `CC_ANSWERS_LOCKED` | `{ userId: string }` | All (lobby) | A player has submitted/locked their answers |
| `CC_PEER_REVIEW_START` | `{ allAnswers: AnonymizedAnswerSet[], reviewDurationSeconds: number }` | All (lobby) | Peer review begins — all answers revealed (anonymized) |
| `CC_CRASH_UPDATE` | `{ targetUserId: string, categoryIndex: number, crashCount: number, threshold: number }` | All (lobby) | Updated crash count for an answer |
| `CC_ROUND_RESULTS` | `CCRoundResults` | All (lobby) | Round scoring complete (de-anonymized) |
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer |

**`AnonymizedAnswerSet`:**

```typescript
interface AnonymizedAnswerSet {
  anonymousId: string;      // "Player 1", "Player 2", etc. (randomized, not by join order)
  realUserId: string;       // actual userId (needed for crash targeting)
  answers: (string | null)[];
}
```

> **Note on anonymization:** During peer review, the mapping from `anonymousId` to real username is hidden. The `realUserId` is sent for crash targeting but the client UI should display only the anonymous label. After crash resolution, the results are fully de-anonymized.

### 3.6 Information Masking

| Data | Player View | Spectator View |
|---|---|---|
| Letter + categories | Visible | Visible |
| Own answers (during input) | Visible | N/A |
| Other players' answers (during input) | **HIDDEN** | **HIDDEN** |
| All answers (during peer review) | Visible (anonymized) | Visible (anonymized) |
| Who submitted what (during peer review) | **HIDDEN** (anonymized) | **HIDDEN** (anonymized) |
| Crash counts | Visible (live updated) | Visible |
| Final results (de-anonymized) | Visible | Visible |

**`getStateForPlayer(userId)` during INPUT phase:**

```typescript
interface CCPlayerInputState {
  round: number;
  letter: string;
  categories: Category[];
  phase: 'INPUT';
  myAnswers: (string | null)[];
  timeRemaining: number;
  lockedPlayerCount: number;    // how many have submitted (not who)
  totalPlayers: number;
}
```

### 3.7 Join-in-Progress Logic

**Policy:** `join_next_subround`

If a player joins during Round 1, they become a spectator for the remainder of that round. At the start of Round 2, they are promoted to player status and participate normally. They score 0 for any rounds they missed.

**Implementation:**
- The game coordinator maintains a `pendingPlayers: string[]` list.
- At the start of each new round, `pendingPlayers` are added to the active player pool.
- They receive the `CC_ROUND_START` action like everyone else.

### 3.8 Reconnection Behavior

On reconnect:
1. During INPUT phase: Player receives their saved answers and can continue editing.
2. During PEER_REVIEW: Player receives the anonymized answer set and current crash counts. They can still crash answers (if they haven't used all their crashes).
3. Their previous crashes are preserved.

### 3.9 Awards

| Award | Condition | Icon |
|---|---|---|
| Unique Snowflake | Player with the most unique (non-shared) answers | `snowflake` |
| Speed Demon | First player to lock in all 5 answers | `zap` |
| Crash Test Dummy | Player whose answers were crashed the most | `car` |
| Vigilante | Player with the most successful crashes | `shield-alert` |
| Full House | Player who filled all 5 categories with valid answers | `check-check` |

### 3.10 NPM Package Suggestions

| Package | Purpose | Notes |
|---|---|---|
| `fuse.js` | Fuzzy string matching for duplicate detection | Already in core spec dependencies. Used with threshold 0.85 for answer comparison. |

No additional packages needed. The category pool is a static JSON file.

### 3.11 Client Component Structure

```
components/rmhbox/minigames/category-crash/
  CategoryCrashGame.tsx       # Main game component, phase router
  CategoryInput.tsx           # 5 text input fields with category labels
  PeerReview.tsx              # Grid of all answers with crash buttons
  CrashButton.tsx             # Animated crash/challenge button with count badge
  AnswerCard.tsx              # Individual answer display (valid/crashed/duplicate states)
  CategoryCrashResults.tsx    # Round results with answer breakdowns
```

**Mobile UI layout (INPUT phase):**

```
┌──────────────────────────────┐
│ Category Crash  ⏱ 0:42       │
├──────────────────────────────┤
│       Letter: 🅢              │  ← Large, styled letter
├──────────────────────────────┤
│ Pizza Topping                │
│ ┌────────────────────────┐   │
│ │ Sausage                │   │  ← Text input
│ └────────────────────────┘   │
│ Country                      │
│ ┌────────────────────────┐   │
│ │ Spain                  │   │
│ └────────────────────────┘   │
│ 80s Band                     │
│ ┌────────────────────────┐   │
│ │ Scorpions              │   │
│ └────────────────────────┘   │
│ Animal                       │
│ ┌────────────────────────┐   │
│ │ _                      │   │  ← Empty, cursor blinking
│ └────────────────────────┘   │
│ Movie Genre                  │
│ ┌────────────────────────┐   │
│ │ Sci-fi                 │   │
│ └────────────────────────┘   │
├──────────────────────────────┤
│ [    Submit All    ]         │
│ Score: 820  │  3/6 submitted │
└──────────────────────────────┘
```

### 3.12 Constants

```typescript
export const CC_TOTAL_ROUNDS = 2;
export const CC_CATEGORIES_PER_ROUND = 5;
export const CC_INPUT_DURATION_SECONDS = 60;
export const CC_PEER_REVIEW_DURATION_SECONDS = 30;
export const CC_CRASH_RESOLUTION_SECONDS = 5;
export const CC_ROUND_RESULTS_SECONDS = 8;
export const CC_REVEAL_SECONDS = 3;

export const CC_MAX_ANSWER_LENGTH = 50;
export const CC_MAX_CRASHES_PER_ROUND = 5;
export const CC_CRASH_THRESHOLD_PERCENT = 50;

export const CC_UNIQUE_ANSWER_POINTS = 10;
export const CC_SHARED_ANSWER_POINTS = 5;
export const CC_SUCCESSFUL_CRASH_BONUS = 2;
export const CC_FAILED_CRASH_PENALTY = -1;

export const CC_FUZZY_MATCH_THRESHOLD = 0.85;
export const CC_ANSWER_SAVE_DEBOUNCE_MS = 500;

export const CC_CATEGORY_DISTRIBUTION = { easy: 2, medium: 2, hard: 1 };

export const CC_LETTER_WEIGHTS: Record<string, number> = {
  A: 10, B: 8, C: 10, D: 8, E: 7, F: 7, G: 6, H: 6,
  I: 5, J: 3, K: 4, L: 7, M: 8, N: 6, O: 5, P: 8,
  Q: 1, R: 8, S: 10, T: 9, U: 3, V: 3, W: 5, X: 1, Y: 2, Z: 1,
};
```

---

## 4. Wiki-Race

### 4.1 Overview

| Field | Value |
|---|---|
| **ID** | `wiki-race` |
| **Display Name** | Wiki-Race |
| **Category** | `trivia` |
| **Icon** | `globe` (Lucide) |
| **Min Players** | 2 |
| **Max Players** | 10 |
| **Estimated Duration** | 180 seconds |
| **Supports Teams** | No |
| **Join-in-Progress** | `spectate_only` |
| **Tags** | `['trivia', 'speed', 'navigation', 'knowledge']` |

### 4.2 Game Concept

A competitive scavenger hunt through Wikipedia. All players start on the same random Wikipedia article and must navigate to a **Target Article** using only internal hyperlinks (blue links). No search bar, no back button. First to reach the target (or closest after the timer) wins.

### 4.3 Detailed Mechanics

#### 4.3.1 Round Structure

The game is a single round with one Start → Target pair.

| Phase | Duration | Description |
|---|---|---|
| Article Reveal | 5s | Start and Target articles displayed with titles and brief descriptions |
| Navigation Phase | 180s (3 min) | Players navigate through Wikipedia articles |
| Results | 8s | Show who finished, click counts, and paths taken |

**Total game time:** ~193s ≈ 3.2 minutes.

#### 4.3.2 Article Selection

The server selects the Start and Target articles from a curated list (`/public/data/rmhbox/wiki-race/article-pairs.json`). Each pair is pre-validated to ensure:

1. A path exists between the two articles within a reasonable number of clicks (pre-computed: `optimalPathLength` stored in the pair data).
2. Both articles are "popular" (exist in a curated subset of ~10,000 well-known articles).
3. The optimal path length is between `WIKI_MIN_PATH_LENGTH` (default: 3) and `WIKI_MAX_PATH_LENGTH` (default: 8).
4. Neither article is a disambiguation page, list page, or stub.

```typescript
interface ArticlePair {
  id: string;
  startArticle: WikiArticleRef;
  targetArticle: WikiArticleRef;
  optimalPathLength: number;        // pre-computed shortest path
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];                    // e.g., ['history', 'science']
}

interface WikiArticleRef {
  title: string;                     // e.g., "Banana"
  url: string;                       // relative: "/wiki/Banana"
  description: string;               // brief one-liner
  thumbnail: string | null;          // Wikipedia thumbnail URL
}
```

#### 4.3.3 Wikipedia Content Proxy

The client does NOT load Wikipedia directly in an iframe (due to CSP restrictions and to ensure the server can track navigation). Instead:

1. The **server** acts as a **Wikipedia content proxy**.
2. When a player requests an article, the server:
   a. Fetches the article from the Wikipedia API (`https://en.wikipedia.org/api/rest_v1/page/html/{title}`).
   b. **Parses and sanitizes** the HTML:
      - Strips external links (anything not leading to another Wikipedia article).
      - Strips the search bar, navigation elements, and sidebar.
      - Strips `<script>` and `<style>` tags.
      - Converts internal Wikipedia links (`/wiki/...`) into clickable elements that emit a WebSocket event instead of navigating.
      - Strips "Edit" links, references/citations bar, and category links at the bottom.
   c. Sends the sanitized HTML to the player's client.
3. The client renders this HTML in a sandboxed container.

**Why server-side proxy?**
- Prevents players from using browser URL bar / developer tools to jump directly to the target.
- Allows the server to track every page transition for anti-cheat.
- Ensures consistent rendering across devices.

#### 4.3.4 Navigation Tracking

Every time a player clicks a link:

1. Client emits `NAVIGATE` with the target article title.
2. Server validates the link exists on the player's current page (anti-cheat: player can't navigate to arbitrary pages).
3. Server logs the navigation in the player's path.
4. Server fetches, sanitizes, and returns the new article's HTML.
5. Server broadcasts `WR_PLAYER_PROGRESS` to all players (shows click count, not the path — to prevent copying).

```typescript
interface NavigationEntry {
  articleTitle: string;
  timestamp: number;
  clickNumber: number;       // sequential click counter
}
```

#### 4.3.5 Link Validation (Anti-Cheat)

The server maintains for each player:
- `currentArticleTitle: string` — the article they're currently viewing.
- `currentArticleLinks: Set<string>` — all valid internal link targets extracted from the current article's HTML.

When a `NAVIGATE` action arrives:
1. Check that the target title is in `currentArticleLinks`.
2. If not, reject with `INVALID_NAVIGATION` error (possible cheat attempt).
3. If valid, update `currentArticleTitle` and fetch the new page.

#### 4.3.6 Finishing & Scoring

A player **finishes** when they navigate to the Target Article (`currentArticleTitle` matches `targetArticle.title`, case-insensitive, with Wikipedia normalization).

Scoring:

| Metric | Scoring Formula |
|---|---|
| Finished | `WR_FINISH_BASE_POINTS` (default: **500**) |
| Speed bonus | `WR_SPEED_BONUS_POINTS_PER_SECOND` (default: **5**) × seconds remaining |
| Efficiency bonus | `WR_EFFICIENCY_BONUS_POINTS` (default: **50**) × max(0, `optimalPathLength + 2` - `playerClickCount`) |
| Did not finish | Points based on **proximity score** (see below) |

**Proximity scoring for DNF players:**

If the timer expires before a player reaches the target, their score is based on how "close" they got. This is estimated by the server using the link structure:

1. The server checks if the target article title appears as a link on the player's current page → score = `WR_ONE_AWAY_POINTS` (default: **200**).
2. Otherwise, a heuristic based on click count relative to optimal: `WR_DNF_BASE_POINTS` (default: **50**) + `WR_DNF_CLICK_BONUS` (default: **10**) × min(`playerClickCount`, `optimalPathLength`).

Players who finish are ranked by finish order (first = rank 1). DNF players are ranked by proximity score, all after finishers.

#### 4.3.7 "Back" Button Replacement

Since the browser back button is disabled (the page doesn't actually navigate), the game provides a **Breadcrumb Trail** UI showing the player's path. Players can click any previous article in their breadcrumb to "go back" — but this costs them a click (it's treated as a forward navigation to a previously visited page).

### 4.4 Server-Side State Schema

```typescript
interface WikiRaceState {
  startArticle: WikiArticleRef;
  targetArticle: WikiArticleRef;
  optimalPathLength: number;
  phase: WRPhase;
  
  // Per-player state
  playerStates: Map<string, WRPlayerState>;
  
  // Finish order
  finishOrder: string[];            // userIds in order of finishing
  
  // Timer
  phaseStartedAt: number;
  phaseEndsAt: number;
}

type WRPhase = 'ARTICLE_REVEAL' | 'NAVIGATION' | 'RESULTS';

interface WRPlayerState {
  userId: string;
  currentArticleTitle: string;
  currentArticleLinks: Set<string>;  // valid link targets from current page
  path: NavigationEntry[];
  clickCount: number;
  hasFinished: boolean;
  finishedAt: number | null;
  finishRank: number | null;
  score: number;
}
```

### 4.5 WebSocket Event Map

#### Client → Server

| Action | Payload | Description |
|---|---|---|
| `NAVIGATE` | `{ targetTitle: string }` | Click an internal Wikipedia link |
| `GO_BACK` | `{ targetTitle: string, pathIndex: number }` | Navigate back to a previous article via breadcrumb |

**Zod schemas:**

```typescript
const NavigateSchema = z.object({
  targetTitle: z.string().min(1).max(300),
});

const GoBackSchema = z.object({
  targetTitle: z.string().min(1).max(300),
  pathIndex: z.number().int().min(0),
});
```

#### Server → Client (Game Actions)

| Action Type | Payload | Sent To | Description |
|---|---|---|---|
| `WR_ARTICLES_REVEALED` | `{ startArticle: WikiArticleRef, targetArticle: WikiArticleRef, navigationDurationSeconds: number }` | All (lobby) | Start and target revealed |
| `WR_ARTICLE_CONTENT` | `{ title: string, sanitizedHtml: string, linkCount: number }` | Requesting player only | Sanitized article HTML |
| `WR_NAVIGATE_ERROR` | `{ reason: 'INVALID_LINK' \| 'ARTICLE_NOT_FOUND' \| 'RATE_LIMITED' }` | Requesting player only | Navigation rejected |
| `WR_PLAYER_PROGRESS` | `{ userId: string, userName: string, clickCount: number, hasFinished: boolean }` | All (lobby) | A player's progress update |
| `WR_PLAYER_FINISHED` | `{ userId: string, userName: string, clickCount: number, finishRank: number, timeElapsed: number }` | All (lobby) | A player reached the target |
| `WR_RESULTS` | `{ rankings: WRRanking[], startArticle: string, targetArticle: string, optimalPath: string[] }` | All (lobby) | Game over — paths and scores revealed |
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer |

**`WRRanking`:**

```typescript
interface WRRanking {
  userId: string;
  userName: string;
  rank: number;
  score: number;
  clickCount: number;
  hasFinished: boolean;
  timeElapsed: number | null;  // null if DNF
  path: string[];              // article titles visited (revealed at end)
}
```

### 4.6 Information Masking

| Data | Player View | Spectator View |
|---|---|---|
| Start + Target articles | Visible | Visible |
| Own current article + path | Visible | N/A |
| Other players' current article | **HIDDEN** | **VISIBLE** (spectators see everyone's current page) |
| Other players' paths | **HIDDEN** until results | **VISIBLE** in real-time |
| Other players' click count | Visible | Visible |
| Article HTML content | Only own current page | Can cycle through players' current pages |
| Optimal path | **HIDDEN** until results | **HIDDEN** until results |

**`getStateForPlayer(userId)` returns:**

```typescript
interface WRPlayerViewState {
  startArticle: WikiArticleRef;
  targetArticle: WikiArticleRef;
  phase: WRPhase;
  timeRemaining: number;
  
  // My state
  myPath: string[];                 // article titles I've visited
  myClickCount: number;
  myCurrentArticle: string;
  myHasFinished: boolean;
  
  // Other players (masked)
  otherPlayers: Array<{
    userId: string;
    userName: string;
    clickCount: number;
    hasFinished: boolean;
    finishRank: number | null;
  }>;
  
  // Results (null during navigation)
  results: WRRanking[] | null;
  optimalPath: string[] | null;
}
```

**`getStateForSpectator()` returns:**  
Same structure but includes `currentArticleTitle` for each player and their full path in real-time (spectators get the omniscient view).

### 4.7 Join-in-Progress Logic

**Policy:** `spectate_only`

The article pair and paths are established at game start. Joining mid-race would give no meaningful starting point. New players spectate and see the omniscient spectator view.

### 4.8 Reconnection Behavior

On reconnect:
1. Player receives their full path, current article title, and a re-fetch of their current article's sanitized HTML.
2. Their click count and path are preserved.
3. The timer continues (not paused).
4. If they had already finished, they see the waiting-for-others state.

### 4.9 Player Disconnect Mid-Game

A disconnected player simply stops navigating. Their path freezes at whatever article they were on. If they don't reconnect before the timer ends, they're treated as DNF with their current proximity score.

### 4.10 Awards

| Award | Condition | Icon |
|---|---|---|
| Speed Runner | First player to reach the target | `trophy` |
| Efficiency Expert | Reached the target with the fewest clicks | `target` |
| Tourist | Visited the most unique articles (highest click count, finished or not) | `map` |
| Optimal Path | Matched or beat the pre-computed optimal path length | `route` |
| Almost There | Got within 1 click of the target but didn't finish | `map-pin` |

### 4.11 NPM Package Suggestions

| Package | Purpose | Notes |
|---|---|---|
| `node-html-parser` | Fast HTML parser for server-side Wikipedia content sanitization | ~10× faster than `cheerio` for simple parse-and-modify operations. Use to strip external links, scripts, and rewrite internal links. |
| `sanitize-html` | Additional HTML sanitization layer | Ensures no XSS vectors in Wikipedia content before sending to client. Use with a strict allowlist of tags/attributes. |

**Wikipedia API usage:** The server uses the [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/) for article fetching. Rate limit: polite use, ≤ 200 req/s with a descriptive User-Agent header. For a lobby of 10 players each clicking ~1 link/3s, that's ~3 req/s — well within limits.

**Caching:** Articles should be cached in memory (LRU cache, max 500 entries, TTL 10 minutes) to avoid redundant Wikipedia API calls when multiple players visit the same article.

```typescript
// Server-side article cache
import { LRUCache } from 'lru-cache';

const articleCache = new LRUCache<string, SanitizedArticle>({
  max: 500,
  ttl: 10 * 60 * 1000, // 10 minutes
});

interface SanitizedArticle {
  title: string;
  html: string;
  links: string[];       // extracted internal link targets
  fetchedAt: number;
}
```

> **Note on `lru-cache`:** This is a well-maintained, zero-dependency LRU cache by Isaac Z. Schlueter. NPM package `lru-cache`. Lightweight and perfect for this use case.

### 4.12 Client Component Structure

```
components/rmhbox/minigames/wiki-race/
  WikiRaceGame.tsx            # Main game component, phase router
  WikiFrame.tsx               # Sandboxed article renderer (dangerouslySetInnerHTML in a contained div)
  BreadcrumbTrail.tsx         # Clickable path history
  ArticleReveal.tsx           # Start/target article display with thumbnails
  PlayerProgressBar.tsx       # Other players' click counts (horizontal bar chart)
  WikiRaceResults.tsx         # Results with path visualization
```

**Mobile UI layout (NAVIGATION phase):**

```
┌──────────────────────────────┐
│ Wiki-Race   ⏱ 2:15           │
├──────────────────────────────┤
│ 🎯 Target: Industrial Rev.  │  ← Fixed target reminder
├──────────────────────────────┤
│ 📍 Banana > Fruit > ...     │  ← Breadcrumb trail (scrollable)
├──────────────────────────────┤
│                              │
│  [Sanitized Wikipedia        │  ← Scrollable article content
│   article content with       │     Internal links are styled blue
│   clickable blue links]      │     and emit NAVIGATE on tap
│                              │
│                              │
├──────────────────────────────┤
│ Clicks: 5  │  2/6 finished   │
└──────────────────────────────┘
```

### 4.13 Constants

```typescript
export const WR_NAVIGATION_DURATION_SECONDS = 180;
export const WR_ARTICLE_REVEAL_SECONDS = 5;
export const WR_RESULTS_SECONDS = 8;
export const WR_MIN_PATH_LENGTH = 3;
export const WR_MAX_PATH_LENGTH = 8;

export const WR_FINISH_BASE_POINTS = 500;
export const WR_SPEED_BONUS_POINTS_PER_SECOND = 5;
export const WR_EFFICIENCY_BONUS_POINTS = 50;
export const WR_ONE_AWAY_POINTS = 200;
export const WR_DNF_BASE_POINTS = 50;
export const WR_DNF_CLICK_BONUS = 10;

export const WR_ARTICLE_CACHE_MAX_ENTRIES = 500;
export const WR_ARTICLE_CACHE_TTL_MS = 10 * 60 * 1000;  // 10 min
export const WR_NAVIGATE_RATE_LIMIT_PER_SECOND = 3;       // per player
export const WR_MAX_ARTICLE_PAIR_POOL_SIZE = 200;
```

### 4.14 Anti-Cheat Notes

- The server validates every navigation against the current page's link set. Players cannot jump to arbitrary articles.
- The "back" button is a tracked click (not free), discouraging random exploration.
- External links are stripped; the client receives no raw Wikipedia URLs.
- Article content is rendered in a controlled container — no iframe with real Wikipedia access.
- Per-player navigation rate limit (`WR_NAVIGATE_RATE_LIMIT_PER_SECOND`) prevents automated link-clicking scripts.
- The optimal path is only revealed in results, never during gameplay.

---

*End of Minigame Specifications Part 1*
