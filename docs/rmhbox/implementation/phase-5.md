# Phase 5: Minigames Set 1 — Rhyme Time, Undercover Agent, Category Crash, Wiki-Race

> **Depends on:** Phase 4 (Minigame Engine & Lifecycle)
>
> This phase implements the first four minigames for the RMHbox party game platform. Each game extends `BaseMinigame` from Phase 4 and integrates with the existing lobby, lifecycle, scoring, and award systems.

---

## Table of Contents

1. [5.1 Rhyme Time](#51-rhyme-time)
2. [5.2 Undercover Agent](#52-undercover-agent)
3. [5.3 Category Crash](#53-category-crash)
4. [5.4 Wiki-Race](#54-wiki-race)
5. [5.5 Cross-Game Integration Testing](#55-cross-game-integration-testing)

---

## 5.1 Rhyme Time

**Game ID:** `rhyme-time` | **Category:** `word` | **Icon:** `mic-vocal`
**Players:** 2–16 | **Duration:** ~171s (3 rounds)

---

### 5.1.1 Install NPM Packages

- [ ] Install `cmu-pronouncing-dictionary` (CMU dict, ~134K phonetic entries, MIT license)
  ```bash
  pnpm add cmu-pronouncing-dictionary
  ```
  **Verification:** Run `pnpm ls cmu-pronouncing-dictionary` and confirm version is listed.

- [ ] Install `syllable` (syllable counter, ~2KB)
  ```bash
  pnpm add syllable
  ```
  **Verification:** Run `pnpm ls syllable` and confirm version is listed.

- [ ] Verify both packages have correct TypeScript types or install `@types/*` if needed
  **Verification:** Create a scratch `.ts` file, import both packages, and confirm no type errors via `tsc --noEmit`.

---

### 5.1.2 Add Constants to `lib/rmhbox/constants.ts`

- [ ] Add `RT_TOTAL_ROUNDS = 3` — number of rounds per game
- [ ] Add `RT_INPUT_DURATION = 45` — seconds for each input phase
- [ ] Add `RT_SCORING_DURATION = 5` — seconds for scoring reveal phase
- [ ] Add `RT_INTERMISSION_DURATION = 5` — seconds between rounds
- [ ] Add `RT_ROUND_START_DURATION = 2` — seconds for round-start countdown
- [ ] Add `RT_MAX_SUBMISSIONS = 30` — maximum submissions per player per round
- [ ] Add `RT_COMMON_POINTS = 1` — points for a word submitted by ≥3 players
- [ ] Add `RT_UNCOMMON_POINTS = 3` — points for a word submitted by exactly 2 players
- [ ] Add `RT_RARE_POINTS = 5` — points for a word submitted by exactly 1 player
- [ ] Add `RT_MULTI_SYLLABLE_MULT = 2` — multiplier for multi-syllable rhymes
- [ ] Add `RT_SPEED_BONUS = 2` — bonus points for first rare submitter
- [ ] Add `RT_INVALID_PENALTY = -1` — penalty for invalid submissions
- [ ] Add `RT_MIN_RHYMES = 15` — minimum known rhymes for a root word to be eligible
- [ ] Add `RT_MAX_FREQ_RANK = 5000` — maximum frequency rank for root word eligibility
- [ ] Add `RT_MIN_WORD_LEN = 2` — minimum word length
- [ ] Add `RT_MAX_WORD_LEN = 30` — maximum word length
- [ ] **Verification:** Import all `RT_*` constants in a test file; confirm no undefined values and correct types (`number`).

---

### 5.1.3 Create Static Data Files

- [ ] Create directory `public/data/rmhbox/rhyme-time/`
  **Verification:** Directory exists on disk.

- [ ] Create `public/data/rmhbox/rhyme-time/root-words.json` — curated list of root words
  - Each entry follows `RootWord` interface:
    ```ts
    {
      word: string;           // the root word
      phonetic: string;       // CMU phonetic transcription
      syllableCount: number;  // number of syllables
      rhymeEndSound: string;  // ending phoneme(s) used for rhyme matching
      knownRhymeCount: number;// count of known rhymes in dictionary
      difficulty: "easy" | "medium" | "hard";
    }
    ```
  - [ ] Include at least 30 root words with `knownRhymeCount ≥ 15`
  - [ ] All words must have frequency rank ≤ 5000 (common English)
  - [ ] Balanced difficulty distribution: ~10 easy, ~12 medium, ~8 hard
  **Verification:** Parse the JSON file; validate every entry has all 6 fields; confirm all `knownRhymeCount ≥ RT_MIN_RHYMES`.

- [ ] Create `public/data/rmhbox/rhyme-time/rhyme-dictionary.json` — server-only rhyme lookup
  - Structure: `{ [rhymeEndSound: string]: RhymeEntry[] }`
  - `RhymeEntry`:
    ```ts
    {
      word: string;
      syllableCount: number;
      frequencyRank: number;
      isMultiSyllableRhyme: boolean;
    }
    ```
  - [ ] Generated from CMU dictionary via build pipeline (see 5.1.4)
  - [ ] Estimated size ~2–4MB; loaded into memory at server start
  **Verification:** Parse JSON; confirm all `rhymeEndSound` keys from `root-words.json` exist; spot-check 5 root words have ≥15 rhyme entries.

---

### 5.1.4 Build Data Pipeline

- [ ] Create `scripts/rmhbox/generate-rhyme-data.ts` — build-time script
  - [ ] Import `cmu-pronouncing-dictionary` and `syllable`
  - [ ] Parse all ~134K entries from CMU dict
  - [ ] For each entry, extract ending phonemes to compute `rhymeEndSound`
  - [ ] Group words by `rhymeEndSound` to build `rhyme-dictionary.json`
  - [ ] For each group, compute `syllableCount` (via `syllable` package), `frequencyRank` (from a frequency list or heuristic), and `isMultiSyllableRhyme` flag
  - [ ] Filter candidate root words: `knownRhymeCount ≥ 15`, freq rank ≤ 5000, common English word
  - [ ] Assign difficulty based on `knownRhymeCount` thresholds (e.g., ≥40 = easy, 25–39 = medium, 15–24 = hard)
  - [ ] Output `root-words.json` and `rhyme-dictionary.json` to `public/data/rmhbox/rhyme-time/`
  **Verification:** Run `npx tsx scripts/rmhbox/generate-rhyme-data.ts`; confirm both JSON files are generated; validate structure and entry counts.

- [ ] Add npm script `"generate:rhyme-data"` to `package.json`
  ```json
  "generate:rhyme-data": "tsx scripts/rmhbox/generate-rhyme-data.ts"
  ```
  **Verification:** Run `pnpm generate:rhyme-data` successfully.

- [ ] Create `lib/rmhbox/rhyme-time/dictionary-loader.ts`
  - [ ] Export `loadRhymeDictionary(): Map<string, RhymeEntry[]>` — reads and parses `rhyme-dictionary.json` once at server init
  - [ ] Export `loadRootWords(): RootWord[]` — reads and parses `root-words.json`
  - [ ] Cache in module-level variable (singleton pattern)
  **Verification:** Unit test: call `loadRhymeDictionary()` twice; confirm same reference returned (singleton). Confirm map has expected keys.

---

### 5.1.5 Define Zod Validation Schemas

- [ ] Create `lib/rmhbox/rhyme-time/schemas.ts`

- [ ] Define `SubmitRhymeSchema`:
  ```ts
  const SubmitRhymeSchema = z.object({
    word: z.string()
      .min(RT_MIN_WORD_LEN)
      .max(RT_MAX_WORD_LEN)
      .transform(s => s.trim().toLowerCase()),
  });
  ```
  **Verification:** Test with valid inputs (`"cat"`, `"  Dog "` → `"dog"`). Test invalid: empty string, 1-char, 31-char string — all rejected.

- [ ] Define `RootWordSchema` for data validation:
  ```ts
  const RootWordSchema = z.object({
    word: z.string(),
    phonetic: z.string(),
    syllableCount: z.number().int().positive(),
    rhymeEndSound: z.string(),
    knownRhymeCount: z.number().int().min(RT_MIN_RHYMES),
    difficulty: z.enum(["easy", "medium", "hard"]),
  });
  ```
  **Verification:** Validate all entries in `root-words.json` against this schema in a test.

- [ ] Define `RhymeEntrySchema`:
  ```ts
  const RhymeEntrySchema = z.object({
    word: z.string(),
    syllableCount: z.number().int().positive(),
    frequencyRank: z.number().int().positive(),
    isMultiSyllableRhyme: z.boolean(),
  });
  ```
  **Verification:** Validate a sample of entries from `rhyme-dictionary.json`.

---

### 5.1.6 Implement Server Handler

- [ ] Create `server/rmhbox/minigames/rhyme-time.ts`

#### 5.1.6.1 Type Definitions

- [ ] Define `RhymeTimePhase` enum:
  ```ts
  enum RhymeTimePhase {
    ROUND_START = "ROUND_START",
    INPUT = "INPUT",
    SCORING = "SCORING",
    INTERMISSION = "INTERMISSION",
  }
  ```
  **Verification:** Enum has exactly 4 values matching spec.

- [ ] Define `PlayerSubmission` type:
  ```ts
  type PlayerSubmission = {
    word: string;
    isValid: boolean;
    invalidReason?: string;
    submittedAt: number;  // timestamp
  };
  ```

- [ ] Define `PlayerSubmissions` type:
  ```ts
  type PlayerSubmissions = {
    submissions: PlayerSubmission[];
    validCount: number;
  };
  ```

- [ ] Define `RoundResult` type:
  ```ts
  type RoundResult = {
    rootWord: RootWord;
    playerResults: PlayerRoundResult[];
    allWords: WordBreakdown[];
  };
  ```

- [ ] Define `PlayerRoundResult`:
  ```ts
  type PlayerRoundResult = {
    userId: string;
    validWords: string[];
    invalidWords: string[];
    commonCount: number;
    uncommonCount: number;
    rareCount: number;
    multiSyllableCount: number;
    speedBonuses: number;
    roundScore: number;
  };
  ```

- [ ] Define `WordBreakdown`:
  ```ts
  type WordBreakdown = {
    word: string;
    submittedBy: string[];   // userIds
    rarity: "common" | "uncommon" | "rare";
    isMultiSyllable: boolean;
    basePoints: number;
    multipliedPoints: number;
  };
  ```

- [ ] Define `RhymeTimeState`:
  ```ts
  type RhymeTimeState = {
    currentRound: number;
    totalRounds: number;
    rootWords: RootWord[];
    phase: RhymeTimePhase;
    roundStartedAt: number;
    roundEndsAt: number;
    submissions: Map<string, PlayerSubmissions>;  // userId → submissions
    roundResults: RoundResult | null;
    playerScores: Map<string, number>;  // userId → cumulative score
  };
  ```
  **Verification:** All types compile without errors. Cross-reference every field against spec.

#### 5.1.6.2 Class: `RhymeTimeGame extends BaseMinigame`

- [ ] Constructor: call `super("rhyme-time")`; initialize `rhymeDictionary` and `rootWordPool` via dictionary loader
  **Verification:** Instantiate class; confirm no errors and dictionary is loaded.

#### 5.1.6.3 State Initialization (`initializeState()`)

- [ ] Shuffle root word pool and select 3 words (no repeats within session)
- [ ] Initialize `playerScores` map with 0 for each player
- [ ] Initialize empty `submissions` map for each player
- [ ] Set `currentRound = 0`, `totalRounds = RT_TOTAL_ROUNDS`, `phase = ROUND_START`
- [ ] Set `roundResults = null`
  **Verification:** Unit test: init with 4 players; confirm 3 root words selected, all scores = 0, all submissions empty.

#### 5.1.6.4 Phase Management

- [ ] `startRound()`: increment `currentRound`, set `phase = ROUND_START`, emit `RT_ROUND_START` to all players with `{ round, totalRounds, rootWord: rootWords[currentRound-1], inputDurationSeconds: RT_INPUT_DURATION, endsAt }`, schedule transition to INPUT after `RT_ROUND_START_DURATION` seconds
  **Verification:** Unit test: call `startRound()`; confirm event emitted with correct root word and round number.

- [ ] `startInputPhase()`: set `phase = INPUT`, set `roundStartedAt = Date.now()`, compute `roundEndsAt = roundStartedAt + RT_INPUT_DURATION * 1000`, clear submissions for this round, start `TIMER_TICK` interval (1s), schedule `endInputPhase()` after `RT_INPUT_DURATION`
  **Verification:** Confirm timer ticks emitted; confirm phase transitions after exactly 45s.

- [ ] `endInputPhase()`: stop timer, set `phase = SCORING`, call `computeRoundScoring()`, emit `RT_ROUND_RESULTS` to all players, schedule transition after `RT_SCORING_DURATION`
  **Verification:** Confirm scoring runs and results event is emitted.

- [ ] `startIntermission()`: set `phase = INTERMISSION`, emit `RT_INTERMISSION` with `{ nextRound, nextRootWordPreview: rootWords[currentRound].word (first letter + length hint), mvpUserId, mvpScore }`, schedule next `startRound()` after `RT_INTERMISSION_DURATION`. If `currentRound === totalRounds`, call `endGame()` instead.
  **Verification:** After round 3 scoring, confirm game ends rather than starting intermission.

- [ ] `endGame()`: emit `RT_GAME_OVER` with final scores and awards, call `super.endGame()`
  **Verification:** Confirm awards are computed and game transitions to GAME_OVER.

#### 5.1.6.5 Input Handling — `SUBMIT_RHYME`

- [ ] Validate phase is `INPUT`; reject if not
- [ ] Parse input through `SubmitRhymeSchema`; reject on validation failure
- [ ] Check player hasn't exceeded `RT_MAX_SUBMISSIONS`; reject with reason if exceeded
- [ ] **Rhyme Validation (server-side only):**
  - [ ] Lookup the current root word's `rhymeEndSound`
  - [ ] Check submitted word exists in rhyme dictionary under that `rhymeEndSound`
  - [ ] Check submitted word is a real word in the ~50K dictionary
  - [ ] Check submitted word is NOT the root word itself
  - [ ] Check submitted word is NOT a duplicate for this player this round
  - [ ] Check word length is 2–30 characters
  - [ ] If any check fails, mark `isValid = false` with appropriate `invalidReason`
- [ ] Record submission in `submissions` map with timestamp
- [ ] Emit `RT_RHYME_SUBMITTED` to submitter ONLY: `{ word, isValid, invalidReason?, totalSubmitted }`
- [ ] Emit `RT_SUBMISSION_COUNT` to ALL players: `{ userId, count }` (count of valid submissions only)
- [ ] Do NOT reveal score, rarity, or the word itself to other players
  **Verification:** Unit test: submit valid rhyme → ack valid. Submit root word → ack invalid ("cannot use root word"). Submit duplicate → ack invalid ("already submitted"). Submit non-rhyme → ack invalid ("does not rhyme"). Submit 31st word → rejected ("max submissions reached"). Confirm other players receive count update but not the word.

#### 5.1.6.6 Scoring Computation (`computeRoundScoring()`)

- [ ] Collect all valid submissions across all players for this round
- [ ] Count how many players submitted each unique word
- [ ] Classify each word:
  - `common`: submitted by ≥3 players → `RT_COMMON_POINTS` (1)
  - `uncommon`: submitted by exactly 2 → `RT_UNCOMMON_POINTS` (3)
  - `rare`: submitted by exactly 1 → `RT_RARE_POINTS` (5)
- [ ] Apply multi-syllable bonus: if `isMultiSyllableRhyme`, multiply points by `RT_MULTI_SYLLABLE_MULT` (×2)
- [ ] Apply speed bonus: first player to submit each rare word gets +`RT_SPEED_BONUS` (2), determined by `submittedAt` timestamp
- [ ] Apply invalid penalty: each invalid submission incurs `RT_INVALID_PENALTY` (-1)
- [ ] Sum per-player round scores; add to cumulative `playerScores`
- [ ] Build `RoundResult` with `playerResults[]` and `allWords[]` (full breakdown)
- [ ] Build `WordBreakdown[]` for all valid words: word, submittedBy, rarity, isMultiSyllable, basePoints, multipliedPoints
  **Verification:** Unit test with 3 players:
  - Player A submits ["cat", "hat", "bat"] (all common if B/C also submit them)
  - Player B submits ["cat", "hat", "splat"]
  - Player C submits ["cat", "mat", "brat"]
  - "cat" = common (3 players, 1pt each)
  - "hat" = uncommon (2 players, 3pts each)
  - "bat" = rare (1 player, 5pts to A)
  - "splat" = rare (5pts to B); if multi-syllable, 5×2=10pts
  - Confirm speed bonus applied to earliest rare submitter.

#### 5.1.6.7 `getStateForPlayer(userId)`

- [ ] Return object:
  ```ts
  {
    currentRound: number;
    totalRounds: number;
    rootWord: RootWord;          // current round's root word
    phase: RhymeTimePhase;
    timeRemaining: number;       // seconds
    mySubmissions: PlayerSubmission[];  // own submissions with valid/invalid
    submissionCounts: { userId: string; count: number }[];  // all players' valid counts
    playerScores: { userId: string; score: number }[];      // cumulative scores
    roundResults?: RoundResult;  // only during SCORING/INTERMISSION
    allWordsBreakdown?: WordBreakdown[];  // only during SCORING/INTERMISSION
  }
  ```
- [ ] During INPUT: `roundResults` and `allWordsBreakdown` are `undefined`
- [ ] Other players' actual words are NEVER included during INPUT
- [ ] Dictionary is NEVER sent to client
  **Verification:** Unit test: call during INPUT phase; confirm `roundResults` is undefined and no other player's words are present. Call during SCORING; confirm `roundResults` and `allWordsBreakdown` are populated.

#### 5.1.6.8 `getStateForSpectator()`

- [ ] Return same as `getStateForPlayer` but with `mySubmissions = []`
- [ ] Include all player scores and submission counts
- [ ] Include `roundResults` during SCORING/INTERMISSION
  **Verification:** Confirm spectator state has empty `mySubmissions` array and all public fields populated.

#### 5.1.6.9 `handleJoinInProgress(userId)`

- [ ] Set JIP policy: `spectate_only`
- [ ] Add player as spectator
- [ ] Send full spectator state via `getStateForSpectator()`
  **Verification:** Unit test: JIP during round 2 INPUT → player is spectator, receives state, cannot submit.

#### 5.1.6.10 `handleReconnect(userId)`

- [ ] Send full state via `getStateForPlayer(userId)`
- [ ] Preserve all previous submissions for this player
- [ ] If phase is INPUT, player can continue submitting (up to remaining capacity)
- [ ] Send current `TIMER_TICK` with accurate `timeRemaining`
  **Verification:** Unit test: disconnect during INPUT with 5 submissions, reconnect → state shows 5 submissions, can submit up to `RT_MAX_SUBMISSIONS - 5` more.

#### 5.1.6.11 `handleDisconnect(userId)`

- [ ] Submissions are preserved (not cleared)
- [ ] Player's valid submissions still count for scoring at round end
- [ ] No special behavior — player simply can't submit until reconnected
  **Verification:** Unit test: player disconnects mid-INPUT, round ends → their existing submissions are scored normally.

#### 5.1.6.12 `computeResults()` and Awards

- [ ] Compute final rankings by cumulative `playerScores` (descending)
- [ ] Compute awards:
  - [ ] **Wordsmith** — most total valid submissions across all rounds
  - [ ] **Diamond in the Rough** — most rare rhymes across all rounds
  - [ ] **Syllable Surfer** — most multi-syllable rhymes across all rounds
  - [ ] **Quick Draw** — most speed bonuses earned across all rounds
  - [ ] **Overachiever** — hit `RT_MAX_SUBMISSIONS` in any round
- [ ] Store in game results for lobby-level awards system
  **Verification:** Unit test: construct scenario where each award triggers for a different player; confirm all 5 awards assigned correctly.

#### 5.1.6.13 `buildGameLog()`

- [ ] Maintain an `actionLog: GameLogAction[]` array on the game instance
- [ ] Log `round_start` action when root word is revealed (with rootWord, validRhymeCount)
- [ ] Log `submission` action on each validated submission (userId, word, valid, rarityTier, score)
- [ ] Log `round_end` action at round completion (round, rootWord, roundWinner, all submissions)
- [ ] In `computeResults()`, build `GameLog` object with `initialState` containing rounds config and player list
- [ ] Set `version: 1` for forward compatibility
- [ ] Return `GameLog` from `buildGameLog()` to be passed to `persistMatchResults()`
  **Verification:** Unit test: play a 3-round game, call `buildGameLog()`; verify log contains 3 `round_start`, N `submission`, and 3 `round_end` actions in sequential order with increasing timestamps.

---

### 5.1.7 Register Game in Minigame Registry

- [ ] Add entry to minigame registry (from Phase 4):
  ```ts
  {
    id: "rhyme-time",
    name: "Rhyme Time",
    category: "word",
    icon: "mic-vocal",
    minPlayers: 2,
    maxPlayers: 16,
    estimatedDuration: 171,
    description: "High-speed vocabulary sprint. Race to type valid rhymes — common rhymes score low, rare ones score big!",
    handler: RhymeTimeGame,
  }
  ```
  **Verification:** Call registry lookup for `"rhyme-time"`; confirm all metadata fields correct and handler instantiates.

---

### 5.1.8 Build Client Components

#### 5.1.8.1 `components/rmhbox/rhyme-time/RhymeTimeGame.tsx`

- [ ] Phase router component — renders appropriate sub-component based on `phase`
- [ ] Subscribe to all `RT_*` and `TIMER_TICK` WebSocket events
- [ ] Maintain local state:
  - `currentRound`, `totalRounds`, `rootWord`, `phase`, `timeRemaining`
  - `mySubmissions[]`, `submissionCounts[]`, `playerScores[]`
  - `roundResults`, `allWordsBreakdown`
- [ ] Handle `RT_ROUND_START` → show root word reveal animation, transition to input
- [ ] Handle `RT_ROUND_RESULTS` → populate results state, render results
- [ ] Handle `RT_INTERMISSION` → show MVP highlight and next round preview
- [ ] Handle `RT_GAME_OVER` → show final scoreboard and awards
- [ ] Handle `TIMER_TICK` → update `timeRemaining` display
- [ ] Conditional rendering:
  - `ROUND_START` → `<RoundStartOverlay />`
  - `INPUT` → `<RhymeTimeInput />`
  - `SCORING` → `<RhymeTimeResults />`
  - `INTERMISSION` → `<RhymeTimeScoreboard />`
  **Verification:** Component renders without errors for each phase. Inspect React DevTools: state updates correctly on each event.

#### 5.1.8.2 `components/rmhbox/rhyme-time/RhymeTimeInput.tsx`

- [ ] Text input field (auto-focused) + Submit button (Enter key support)
- [ ] On submit: emit `rmhbox:game:input` with `{ type: "SUBMIT_RHYME", word }`
- [ ] Clear input after submission
- [ ] Display root word prominently at top
- [ ] Show timer countdown
- [ ] Show list of own submitted words as `<SubmissionPill />` components
- [ ] Display submission count: `N / RT_MAX_SUBMISSIONS`
- [ ] Disabled state when max submissions reached
- [ ] Handle `RT_RHYME_SUBMITTED` → update pill state (valid/invalid with reason)
- [ ] Handle `RT_SUBMISSION_COUNT` → update other players' counts display
- [ ] Show live leaderboard sidebar with submission counts per player
  **Verification:** Type a word, press Enter → word appears as pending pill, then updates to valid/invalid. Submit 30 words → input disabled. Invalid word shows tooltip with reason.

#### 5.1.8.3 `components/rmhbox/rhyme-time/RhymeTimeResults.tsx`

- [ ] Display round results: all words grouped by rarity (rare → uncommon → common)
- [ ] Each word shows: the word, who submitted it, rarity badge, points earned, multi-syllable indicator
- [ ] Player-specific highlight: own words highlighted differently
- [ ] Speed bonus indicator on applicable words
- [ ] Animated score tallying
- [ ] Show per-player breakdown: valid count, invalid count, round score
  **Verification:** Renders with mock `RoundResult` data. All rarity badges show correct colors. Own words are visually distinct.

#### 5.1.8.4 `components/rmhbox/rhyme-time/RhymeTimeScoreboard.tsx`

- [ ] Running cumulative scores for all players, sorted descending
- [ ] Score change animation (delta from this round)
- [ ] MVP callout with highlight
- [ ] Next round preview (if not final round)
- [ ] Awards display (if final round / game over)
  **Verification:** Renders with 4-player mock data. Scores sorted correctly. MVP highlighted.

#### 5.1.8.5 `components/rmhbox/rhyme-time/SubmissionPill.tsx`

- [ ] Display states: `pending` (gray), `valid` (green), `invalid` (red with strikethrough)
- [ ] Tooltip on invalid: shows `invalidReason`
- [ ] Compact pill shape, fits in scrollable list
- [ ] Animation on state transition
  **Verification:** Render in all 3 states. Tooltip visible on hover for invalid pills.

---

### 5.1.9 Integration Testing

- [ ] End-to-end test: 3 players join lobby → game starts → 3 rounds of Rhyme Time
  - [ ] Verify root words are different each round
  - [ ] Verify submissions are validated server-side only
  - [ ] Verify scoring matches spec formula exactly
  - [ ] Verify information masking: Player A cannot see Player B's words during INPUT
  - [ ] Verify `submissionCounts` broadcast to all players
  - [ ] Verify results reveal all words during SCORING phase
  - [ ] Verify `RT_GAME_OVER` includes final scores and awards
  **Verification:** All assertions pass. No client-side dictionary exposure in network tab.

- [ ] Reconnection test: Player disconnects mid-INPUT, reconnects → receives state, continues submitting
  **Verification:** Reconnected player sees previous submissions and can submit new ones.

- [ ] JIP test: Player joins mid-game → spectator mode, cannot submit, sees public state
  **Verification:** Spectator receives state with `mySubmissions = []` and no input UI.

- [ ] Anti-cheat test: Confirm rhyme dictionary is never sent to client
  - [ ] Inspect all WebSocket events — no dictionary payload
  - [ ] Inspect all HTTP responses — no dictionary endpoint
  - [ ] Submit word at rate > 1/500ms for bot detection flagging
  **Verification:** Network inspector shows zero dictionary data on client. Bot flag logs warning for suspiciously fast submissions.

- [ ] Rate limiting test: Rapid-fire `SUBMIT_RHYME` events via socket
  **Verification:** Server throttles after exceeding socket rate limit; excess submissions rejected.

---

## 5.2 Undercover Agent

**Game ID:** `undercover-agent` | **Category:** `word` | **Icon:** `shield-check`
**Players:** 4–16 | **Duration:** ~180s

---

### 5.2.1 Install NPM Packages

- [ ] No additional NPM packages required for Undercover Agent
  **Verification:** Confirm no new dependencies needed — word pool is static JSON.

---

### 5.2.2 Add Constants to `lib/rmhbox/constants.ts`

- [ ] Add `UA_GRID_SIZE = 25` — total tiles in the grid
- [ ] Add `UA_GRID_COLS = 5` — columns in the grid
- [ ] Add `UA_FIRST_TEAM_AGENTS = 9` — agent count for first team (Red)
- [ ] Add `UA_SECOND_TEAM_AGENTS = 8` — agent count for second team (Blue)
- [ ] Add `UA_ASSASSIN = 1` — number of assassin tiles
- [ ] Add `UA_BYSTANDER = 7` — number of bystander tiles
- [ ] Add `UA_SPYMASTER_TIMEOUT = 90` — seconds for Spymaster clue phase
- [ ] Add `UA_OPERATIVE_TIMEOUT = 120` — seconds for Operative guess phase (resets on correct)
- [ ] Add `UA_TURN_TRANSITION = 3` — seconds for turn transition display
- [ ] Add `UA_MAX_UNLIMITED = 25` — max guesses when clue number is ∞
- [ ] Add `UA_MAX_PASSES = 6` — max consecutive passes (3/team) before forced end
- [ ] Add `UA_WIN = 500` — points for winning team members
- [ ] Add `UA_LOSE = 100` — points for losing team members
- [ ] Add `UA_CLUE_EFFICIENCY = 50` — points per agent found per clue (spymaster bonus)
- [ ] Add `UA_CORRECT_GUESS = 75` — points per correct operative guess
- [ ] Add `UA_ASSASSIN_PENALTY = -200` — penalty for triggering assassin
- [ ] **Verification:** Import all `UA_*` constants; confirm 16 constants defined with correct values and types.

---

### 5.2.3 Create Static Data Files

- [ ] Create directory `public/data/rmhbox/undercover-agent/`
  **Verification:** Directory exists.

- [ ] Create `public/data/rmhbox/undercover-agent/word-pool.json`
  - [ ] Array of ~400 common nouns (single- or multi-word allowed)
  - [ ] All nouns should be well-known, unambiguous, and family-friendly
  - [ ] No duplicates, no proper nouns, no overly obscure words
  - [ ] Example words: "apple", "bridge", "castle", "diamond", etc.
  **Verification:** Parse JSON; confirm array length ≥ 400; confirm no duplicates (case-insensitive); spot-check 20 words for appropriateness.

---

### 5.2.4 Build Data Pipeline

- [ ] No build-time data pipeline required — word pool is hand-curated static JSON
  **Verification:** `word-pool.json` loads and parses correctly at server init.

---

### 5.2.5 Define Zod Validation Schemas

- [ ] Create `lib/rmhbox/undercover-agent/schemas.ts`

- [ ] Define `GiveClueSchema`:
  ```ts
  const GiveClueSchema = z.object({
    word: z.string()
      .min(1)
      .max(30)
      .transform(s => s.trim())
      .refine(s => /^\S+$/.test(s), { message: "Clue must be a single word" }),
    number: z.union([
      z.number().int().min(0).max(9),
      z.literal("unlimited"),
    ]),
  });
  ```
  **Verification:** Valid: `{ word: "animal", number: 3 }`, `{ word: "link", number: "unlimited" }`. Invalid: `{ word: "two words", number: 3 }`, `{ word: "", number: 5 }`, `{ word: "a".repeat(31), number: 1 }`, `{ word: "test", number: 10 }`.

- [ ] Define `GuessTileSchema`:
  ```ts
  const GuessTileSchema = z.object({
    position: z.number().int().min(0).max(24),
  });
  ```
  **Verification:** Valid: `{ position: 0 }`, `{ position: 24 }`. Invalid: `{ position: -1 }`, `{ position: 25 }`, `{ position: 3.5 }`.

- [ ] Define `EndTurnSchema`:
  ```ts
  const EndTurnSchema = z.object({});
  ```
  **Verification:** Valid: `{}`. Invalid inputs with extra fields still pass (Zod strips by default).

---

### 5.2.6 Implement Server Handler

- [ ] Create `server/rmhbox/minigames/undercover-agent.ts`

#### 5.2.6.1 Type Definitions

- [ ] Define `UndercoverAgentPhase` enum:
  ```ts
  enum UndercoverAgentPhase {
    SETUP = "SETUP",
    CLUE = "CLUE",
    GUESS = "GUESS",
    TURN_TRANSITION = "TURN_TRANSITION",
    GAME_OVER = "GAME_OVER",
  }
  ```
  **Verification:** Enum has exactly 5 values.

- [ ] Define `TileType` enum:
  ```ts
  enum TileType {
    RED_AGENT = "RED_AGENT",
    BLUE_AGENT = "BLUE_AGENT",
    BYSTANDER = "BYSTANDER",
    ASSASSIN = "ASSASSIN",
  }
  ```

- [ ] Define `TileState` enum:
  ```ts
  enum TileState {
    HIDDEN = "HIDDEN",
    REVEALED = "REVEALED",
  }
  ```

- [ ] Define `GridTile`:
  ```ts
  type GridTile = {
    position: number;  // 0–24
    word: string;
    type: TileType;
    state: TileState;
    revealedBy?: string;  // team that revealed
  };
  ```

- [ ] Define `TeamState`:
  ```ts
  type TeamState = {
    teamId: "red" | "blue";
    spymasterId: string;
    operativeIds: string[];
    agentsTotal: number;
    agentsRevealed: number;
    color: string;
  };
  ```

- [ ] Define `CurrentClue`:
  ```ts
  type CurrentClue = {
    word: string;
    number: number | "unlimited";
    teamId: "red" | "blue";
    guessesUsed: number;
  };
  ```

- [ ] Define `UndercoverAgentState`:
  ```ts
  type UndercoverAgentState = {
    grid: GridTile[];
    keyCard: TileType[];       // position → type (server-only full view)
    teams: {
      red: TeamState;
      blue: TeamState;
    };
    currentTeam: "red" | "blue";
    phase: UndercoverAgentPhase;
    currentClue: CurrentClue | null;
    guessesRemaining: number;
    turnNumber: number;
    consecutivePasses: number;
    winner: "red" | "blue" | null;
    winReason: string | null;
  };
  ```
  **Verification:** All types compile. Cross-reference every field against spec.

#### 5.2.6.2 Class: `UndercoverAgentGame extends BaseMinigame`

- [ ] Constructor: call `super("undercover-agent")`; load word pool from JSON
  **Verification:** Instantiate; confirm word pool loaded with ≥400 words.

#### 5.2.6.3 State Initialization (`initializeState()`)

- [ ] Shuffle word pool; select 25 words for the grid
- [ ] Generate key card: randomly assign 9 RED_AGENT, 8 BLUE_AGENT, 1 ASSASSIN, 7 BYSTANDER to 25 positions
- [ ] Assign grid tiles: position 0–24, each with word and HIDDEN state
- [ ] Divide players into Red and Blue teams (round-robin assignment)
- [ ] Randomly select 1 Spymaster per team from team members
- [ ] Remaining team members are Operatives
- [ ] Set `currentTeam = "red"` (Red goes first since they have 9 agents)
- [ ] Set `turnNumber = 0`, `consecutivePasses = 0`, `winner = null`, `winReason = null`
- [ ] Set `phase = SETUP`
  **Verification:** Unit test with 6 players: confirm grid has 25 unique words, key card has correct distribution (9+8+1+7=25), 2 teams with 3 players each, 1 spymaster per team.

#### 5.2.6.4 Phase Management

- [ ] `startGame()`: emit `UA_SETUP` to all with `{ grid (words only, types hidden), teams, currentTeam }`. Emit `UA_KEY_CARD` privately to EACH spymaster with `{ keyCard[] }`. Transition to `CLUE` phase.
  **Verification:** Confirm operatives receive grid without tile types. Confirm spymasters receive key card. Confirm events are separate (key card is private).

- [ ] `startCluePhase()`: set `phase = CLUE`, increment `turnNumber`, emit `UA_CLUE_PHASE { teamId: currentTeam, spymasterName, timeoutSeconds: UA_SPYMASTER_TIMEOUT }`, start timer. On timeout: auto-pass (increment `consecutivePasses`), transition to next team's CLUE.
  **Verification:** Timer of 90s starts. If spymaster doesn't submit clue, auto-pass triggers.

- [ ] `handleClueGiven(clue)`: validate clue word is not on the grid (case-insensitive comparison against all 25 words), validate single word, validate max 30 chars. Set `currentClue`, compute `guessesRemaining` = clue.number + 1 (or `UA_MAX_UNLIMITED` if unlimited). Emit `UA_CLUE_GIVEN { teamId, word, number }` to all. Reset `consecutivePasses` for this team. Transition to GUESS phase.
  **Verification:** Clue "bridge 3" → guessesRemaining = 4. Clue "link ∞" → guessesRemaining = 25. Clue with grid word → rejected. Multi-word clue → rejected.

- [ ] `startGuessPhase()`: set `phase = GUESS`, emit `UA_GUESS_PHASE { teamId, guessesAllowed: guessesRemaining, timeoutSeconds: UA_OPERATIVE_TIMEOUT }`, start timer. On timeout: end turn automatically.
  **Verification:** Timer resets on correct guess. Turn ends on timeout.

- [ ] `handleTileGuess(userId, position)`:
  - [ ] Validate guesser is an operative on the current team
  - [ ] Validate tile at `position` is HIDDEN
  - [ ] Reveal tile: set `state = REVEALED`, set `revealedBy`
  - [ ] Determine tile type from key card
  - [ ] Emit `UA_TILE_REVEALED { position, tileType, revealedBy: currentTeam, correct: (tileType matches team's agent) }`
  - [ ] If `ASSASSIN`: other team wins immediately → `endGame(otherTeam, "assassin_hit")`
  - [ ] If own team's agent: decrement `guessesRemaining`, update `agentsRevealed`, reset guess timer. If all team agents found → `endGame(currentTeam, "all_agents_found")`. If `guessesRemaining === 0` → end turn.
  - [ ] If opponent's agent: update opponent `agentsRevealed`. If all opponent agents found → `endGame(opponent, "all_agents_found")`. End turn.
  - [ ] If BYSTANDER: end turn.
  **Verification:** Full matrix test:
  - Guess own agent → continue, guesses decrease
  - Guess opponent agent → turn ends, opponent updated
  - Guess bystander → turn ends
  - Guess assassin → game over, other team wins
  - Last own agent found → game over, current team wins
  - Guess at position of already-revealed tile → rejected

- [ ] `handleEndTurn(userId)`: validate userId is operative on current team. End turn voluntarily. Increment `consecutivePasses`.
  **Verification:** Non-operative cannot end turn. After end turn, other team's clue phase starts.

- [ ] `endTurn(reason)`: emit `UA_TURN_END { reason, nextTeam }`, set `phase = TURN_TRANSITION`, schedule `startCluePhase()` with swapped team after `UA_TURN_TRANSITION` seconds. Check `consecutivePasses >= UA_MAX_PASSES` → force end game (team with more revealed agents wins; tie = draw).
  **Verification:** After 6 consecutive passes, game ends. Scores computed based on agents revealed.

- [ ] `endGame(winner, winReason)`: reveal full key card to all players. Emit `UA_GAME_OVER { winner, winReason, keyCard[] }`. Set `phase = GAME_OVER`. Call `computeResults()`.
  **Verification:** All players receive full key card on game over. Winner and reason are correct.

#### 5.2.6.5 `getStateForPlayer(userId)`

- [ ] Determine player's role: Spymaster or Operative (and which team)
- [ ] Return grid tiles:
  - If tile is `REVEALED`: include `tileType`
  - If tile is `HIDDEN` and player is Spymaster: include `tileType` (full visibility)
  - If tile is `HIDDEN` and player is Operative: `tileType = null` (hidden)
- [ ] Include: `teams`, `currentTeam`, `phase`, `currentClue`, `guessesRemaining`, `turnNumber`, `timeRemaining`
- [ ] Spymasters: include private `keyCard[]` (full)
- [ ] Operatives: `keyCard` is omitted
  **Verification:** Unit test: Spymaster call → all tile types visible. Operative call → hidden tiles have `null` type. Cross-team operative also sees `null` for hidden tiles.

#### 5.2.6.6 `getStateForSpectator()`

- [ ] Full key card visible BUT only sent via spectator room (never main lobby room)
- [ ] All tile types visible (same as Spymaster view)
- [ ] Include all game state: teams, phase, clue, guesses, turn info
  **Verification:** Confirm spectator state includes full key card. Confirm it's emitted to spectator room only (not player rooms).

#### 5.2.6.7 `handleJoinInProgress(userId)`

- [ ] JIP policy: `spectate_only`
- [ ] Add to spectator list
- [ ] Send full spectator state
  **Verification:** JIP player cannot guess, give clues, or end turns.

#### 5.2.6.8 `handleReconnect(userId)`

- [ ] Send full state via `getStateForPlayer(userId)`
- [ ] If Spymaster: re-send `UA_KEY_CARD` event privately
- [ ] Timer does NOT pause on any disconnection
- [ ] If disconnected Spymaster: after grace period, auto-pass their clue turn
  **Verification:** Reconnected Spymaster receives key card and current clue phase state. Disconnected Spymaster triggers auto-pass after timeout + grace.

#### 5.2.6.9 `handleDisconnect(userId)`

- [ ] If disconnected player is Spymaster:
  - [ ] Start grace period countdown
  - [ ] After grace period: auto-pass the clue (increment `consecutivePasses`)
  - [ ] If Spymaster was in CLUE phase: transition to other team's turn
- [ ] If disconnected player is Operative:
  - [ ] Team continues with remaining operatives
  - [ ] If all operatives on a team disconnect: remaining team can still play
- [ ] If ALL players on a team disconnect: other team wins immediately
  **Verification:** Unit test: Spymaster disconnects → auto-pass after grace. All 3 red players disconnect → blue wins.

#### 5.2.6.10 Scoring (`computeResults()`)

- [ ] Winning team: each member gets `UA_WIN` (500) points
- [ ] Losing team: each member gets `UA_LOSE` (100) points
- [ ] Spymaster clue efficiency bonus: for each clue given, `UA_CLUE_EFFICIENCY` (50) × agents found from that clue
- [ ] Operative correct guess bonus: `UA_CORRECT_GUESS` (75) per correct guess
- [ ] Assassin penalty: `UA_ASSASSIN_PENALTY` (-200) to the player who triggered it
- [ ] In case of draw (6 passes): both teams get `(UA_WIN + UA_LOSE) / 2` = 300
  **Verification:** Unit test: Red wins with Spymaster giving 2 clues (3 agents found, 2 agents found), Red operative made 5 correct guesses. Spymaster score: 500 + 50×3 + 50×2 = 750. Operative score: 500 + 75×5 = 875. Blue players: 100 each. Assassin triggerer: 100 - 200 = -100.

#### 5.2.6.11 Awards

- [ ] **Mastermind** — 3 or more agents guessed correctly from a single clue
- [ ] **Sharpshooter** — most correct guesses in the game (among all operatives)
- [ ] **Oops** — triggered the assassin tile
- [ ] **Speedrunner** — winning team won in ≤5 turns
- [ ] **Linguist** — spymaster who used the longest clue word (by character count)
  **Verification:** Unit test: construct scenarios triggering each award; confirm all 5 assigned correctly.

#### 5.2.6.12 `buildGameLog()`

- [ ] Maintain an `actionLog: GameLogAction[]` array on the game instance
- [ ] Log `turn_start` action on each new turn (team, role, turnNumber)
- [ ] Log `clue_given` action when spymaster submits (team, spymasterId, word, number)
- [ ] Log `guess` action on each operative guess (team, operativeId, word, tileType, correct)
- [ ] Log `tile_reveal` action on each tile flip (word, tileType, gridPosition)
- [ ] Log `pass` action when operatives end turn early (team, remainingGuesses)
- [ ] Log `turn_end` action at turn conclusion (team, guessCount, correctCount)
- [ ] Log `game_end` action with full win condition details
- [ ] In `computeResults()`, build `GameLog` with `initialState` containing the full grid, keyCard, team assignments, and spymaster IDs
- [ ] Return `GameLog` from `buildGameLog()`
  **Verification:** Unit test: play a full game with 2+ turns, call `buildGameLog()`; verify log contains turn_start/clue_given/guess/tile_reveal actions in correct order. Verify initialState contains keyCard.

---

### 5.2.7 Register Game in Minigame Registry

- [ ] Add entry:
  ```ts
  {
    id: "undercover-agent",
    name: "Undercover Agent",
    category: "word",
    icon: "shield-check",
    minPlayers: 4,
    maxPlayers: 16,
    estimatedDuration: 180,
    description: "Team-based word-association espionage. Spymasters give clues, Operatives guess tiles. Avoid the Assassin!",
    handler: UndercoverAgentGame,
  }
  ```
  **Verification:** Registry lookup returns correct metadata. Handler instantiates with 6 players.

---

### 5.2.8 Build Client Components

#### 5.2.8.1 `components/rmhbox/undercover-agent/UndercoverAgentGame.tsx`

- [ ] Phase router: renders sub-components based on `phase`
- [ ] Subscribe to all `UA_*` and `TIMER_TICK` events
- [ ] Maintain local state: grid, teams, currentTeam, phase, currentClue, guessesRemaining, turnNumber, timeRemaining, winner, winReason, keyCard (spymaster only)
- [ ] Handle `UA_SETUP` → populate grid and teams
- [ ] Handle `UA_KEY_CARD` → store privately (spymaster only)
- [ ] Handle `UA_CLUE_PHASE` → show clue input (spymaster) or waiting state (operatives)
- [ ] Handle `UA_CLUE_GIVEN` → display clue to all
- [ ] Handle `UA_GUESS_PHASE` → enable tile clicking for current team operatives
- [ ] Handle `UA_TILE_REVEALED` → update grid tile state and type
- [ ] Handle `UA_TURN_END` → show transition, swap team indicator
- [ ] Handle `UA_GAME_OVER` → reveal full board, show results
- [ ] Conditional rendering:
  - `SETUP` → loading/team display
  - `CLUE` → `<ClueInput />` (spymaster) or `<ClueDisplay />` waiting
  - `GUESS` → `<GridBoard />` with clickable tiles + `<ClueDisplay />`
  - `TURN_TRANSITION` → transition overlay
  - `GAME_OVER` → full board reveal + scoreboard
  **Verification:** Component renders for each phase. State transitions are smooth. No key card leak to operatives in React DevTools.

#### 5.2.8.2 `components/rmhbox/undercover-agent/GridBoard.tsx`

- [ ] Render 5×5 grid of tiles
- [ ] Each tile shows: word text, color-coded background when revealed (red/blue/beige/black)
- [ ] Hidden tiles: neutral background, clickable if current team operative during GUESS phase
- [ ] Revealed tiles: show color, non-clickable, slight transparency
- [ ] Hover state on clickable tiles
- [ ] Spymaster overlay: tiles have colored borders/tints matching key card
- [ ] Click handler: emit `rmhbox:game:input` with `{ type: "GUESS_TILE", position }`
- [ ] Responsive: scales for mobile and desktop
  **Verification:** Grid displays 25 tiles in 5 columns. Clicking a hidden tile emits event. Revealed tiles are non-interactive. Spymaster sees color hints.

#### 5.2.8.3 `components/rmhbox/undercover-agent/SpymasterKey.tsx`

- [ ] Overlay or sidebar showing the full key card
- [ ] 5×5 mini-grid with color coding: red, blue, beige (bystander), black (assassin)
- [ ] Only rendered for spymasters (conditionally)
- [ ] Shows count: "Red: X/9 found" and "Blue: X/8 found"
  **Verification:** Only visible in spymaster view. Colors match key card. Counts update on reveals.

#### 5.2.8.4 `components/rmhbox/undercover-agent/ClueInput.tsx`

- [ ] Text input for clue word + number selector (0–9, ∞)
- [ ] Only rendered for current team's spymaster during CLUE phase
- [ ] Validation: single word, not a grid word, max 30 chars
- [ ] Client-side warnings (non-blocking): "This word appears on the grid"
- [ ] Submit button: emit `rmhbox:game:input` with `{ type: "GIVE_CLUE", word, number }`
- [ ] Timer display showing remaining seconds
  **Verification:** Input validates single word. Grid word shows warning. Submit emits correct event. Timer counts down.

#### 5.2.8.5 `components/rmhbox/undercover-agent/ClueDisplay.tsx`

- [ ] Shows current clue: word + number (e.g., "ANIMAL 3")
- [ ] Shows guesses remaining
- [ ] End Turn button (visible only to current team operatives)
- [ ] "Waiting for [Spymaster]..." state during CLUE phase
  **Verification:** Clue displays correctly. End Turn button only visible to correct players. Waiting state shows spymaster name.

#### 5.2.8.6 `components/rmhbox/undercover-agent/TeamPanel.tsx`

- [ ] Shows team name, color, member list
- [ ] Highlights Spymaster vs Operatives
- [ ] Shows agent count: "Agents: X/9 found"
- [ ] Active team indicator (glow/border)
- [ ] Disconnected player indicator
  **Verification:** Both teams displayed. Active team visually distinct. Agent counts update on reveals.

#### 5.2.8.7 `components/rmhbox/undercover-agent/TurnIndicator.tsx`

- [ ] Shows whose turn it is: "[Red/Blue] Team — [Clue/Guess] Phase"
- [ ] Timer countdown
- [ ] Turn number display
- [ ] Animated transition between phases
  **Verification:** Indicator updates on phase changes. Timer is accurate. Animation plays on transition.

---

### 5.2.9 Integration Testing

- [ ] End-to-end test: 6 players, 2 teams of 3, full game to completion
  - [ ] Verify team assignment and spymaster selection
  - [ ] Verify clue validation (grid word rejected, multi-word rejected)
  - [ ] Verify guess mechanics (correct → continue, bystander → end, opponent → end)
  - [ ] Verify assassin termination
  - [ ] Verify win condition: all agents revealed
  - [ ] Verify scoring formula for all roles
  **Verification:** All assertions pass. Game completes with correct winner and scores.

- [ ] Information masking test:
  - [ ] Operative WebSocket traffic contains NO tile types for hidden tiles
  - [ ] Spymaster WebSocket traffic contains tile types for all tiles
  - [ ] Spectator receives full key card via spectator room only
  **Verification:** Inspect WebSocket frames for each role; confirm masking.

- [ ] Disconnection test:
  - [ ] Spymaster disconnects → auto-pass after grace period
  - [ ] All red players disconnect → blue wins
  - [ ] Operative disconnects → team continues
  **Verification:** Each scenario results in correct behavior.

- [ ] Reconnection test:
  - [ ] Spymaster reconnects → receives key card + full state
  - [ ] Operative reconnects → sees revealed tiles, can guess
  **Verification:** Reconnected players can resume without data loss.

- [ ] Pass limit test: 6 consecutive passes → game ends, team with more agents wins
  **Verification:** Game terminates with correct winner.

---

## 5.3 Category Crash

**Game ID:** `category-crash` | **Category:** `word` | **Icon:** `list-collapse`
**Players:** 3–16 | **Duration:** ~212s (2 rounds)

---

### 5.3.1 Install NPM Packages

- [ ] Confirm `fuse.js` is already in core dependencies (used for fuzzy duplicate detection)
  ```bash
  pnpm ls fuse.js
  ```
  **Verification:** `fuse.js` is listed as a dependency. If not, install with `pnpm add fuse.js`.

---

### 5.3.2 Add Constants to `lib/rmhbox/constants.ts`

- [ ] Add `CC_TOTAL_ROUNDS = 2` — number of rounds
- [ ] Add `CC_CATEGORIES_PER_ROUND = 5` — categories shown each round
- [ ] Add `CC_INPUT_DURATION = 60` — seconds for answer input
- [ ] Add `CC_PEER_REVIEW_DURATION = 30` — seconds for crash/challenge phase
- [ ] Add `CC_CRASH_RESOLUTION = 5` — seconds for crash resolution display
- [ ] Add `CC_ROUND_RESULTS = 8` — seconds for round results display
- [ ] Add `CC_REVEAL = 3` — seconds for letter + category reveal animation
- [ ] Add `CC_MAX_ANSWER_LENGTH = 50` — max characters per answer
- [ ] Add `CC_MAX_CRASHES = 5` — max total crashes a player can issue per round
- [ ] Add `CC_CRASH_THRESHOLD_PERCENT = 50` — percent of other players needed to invalidate
- [ ] Add `CC_UNIQUE_POINTS = 10` — points for a unique valid answer
- [ ] Add `CC_SHARED_POINTS = 5` — points for a shared (duplicate) valid answer
- [ ] Add `CC_CRASH_BONUS = 2` — bonus for a successful crash
- [ ] Add `CC_CRASH_PENALTY = -1` — penalty for a failed crash
- [ ] Add `CC_FUZZY_THRESHOLD = 0.85` — fuse.js similarity threshold for fuzzy duplicate detection
- [ ] Add `CC_SAVE_DEBOUNCE = 500` — milliseconds debounce for auto-save
- [ ] Add `CC_CATEGORY_DISTRIBUTION` — object: `{ easy: 2, medium: 2, hard: 1 }`
- [ ] Add `CC_LETTER_WEIGHTS` — map of letter → weight: `{ A: 10, B: 5, C: 5, D: 5, E: 8, F: 4, G: 4, H: 4, I: 5, J: 2, K: 2, L: 5, M: 5, N: 5, O: 5, P: 5, Q: 1, R: 5, S: 8, T: 8, U: 3, V: 2, W: 3, X: 1, Y: 2, Z: 1 }`
  **Verification:** Import all `CC_*` constants; confirm 18 constants defined with correct values and types. `CC_LETTER_WEIGHTS` keys A–Z, weights sum correctly.

---

### 5.3.3 Create Static Data Files

- [ ] Create directory `public/data/rmhbox/category-crash/`
  **Verification:** Directory exists.

- [ ] Create `public/data/rmhbox/category-crash/categories.json`
  - [ ] Array of ~200 category objects
  - Each follows:
    ```ts
    {
      id: string;
      name: string;
      difficulty: "easy" | "medium" | "hard";
      examples: string[];  // 2–3 example answers
    }
    ```
  - [ ] Distribution: roughly 80 easy, 80 medium, 40 hard
  - [ ] Examples: `{ id: "animals", name: "Animals", difficulty: "easy", examples: ["cat", "dog", "eagle"] }`
  - [ ] No duplicate category IDs
  - [ ] Categories should be clear, unambiguous, and broadly accessible
  **Verification:** Parse JSON; confirm ≥200 entries; validate each has `id`, `name`, `difficulty`, `examples`; check difficulty distribution; confirm no duplicate IDs.

---

### 5.3.4 Build Data Pipeline

- [ ] No build-time pipeline — categories are hand-curated static JSON
- [ ] Create `lib/rmhbox/category-crash/data-loader.ts`
  - [ ] Export `loadCategories(): Category[]` — reads and caches `categories.json`
  - [ ] Export `selectRoundLetter(usedLetters: string[]): string` — picks weighted random letter from `CC_LETTER_WEIGHTS`, excluding `usedLetters`
  - [ ] Export `selectRoundCategories(usedCategoryIds: string[]): Category[]` — selects 5 categories (2 easy, 2 medium, 1 hard) excluding previously used, randomized
  **Verification:** Unit test: `selectRoundLetter([])` returns a valid letter A–Z. `selectRoundLetter(["A","B",...,"Y"])` returns "Z". `selectRoundCategories([])` returns 5 categories with correct difficulty distribution. Call twice with accumulating exclusions → no repeats.

---

### 5.3.5 Define Zod Validation Schemas

- [ ] Create `lib/rmhbox/category-crash/schemas.ts`

- [ ] Define `SaveAnswersSchema`:
  ```ts
  const SaveAnswersSchema = z.object({
    answers: z.array(
      z.union([
        z.string().max(CC_MAX_ANSWER_LENGTH).transform(s => s.trim()),
        z.null(),
      ])
    ).length(CC_CATEGORIES_PER_ROUND),
  });
  ```
  **Verification:** Valid: `{ answers: ["cat", null, "bridge", "apple", null] }`. Invalid: `{ answers: ["a".repeat(51)] }` (over max length), wrong array length.

- [ ] Define `SubmitAnswersSchema`:
  ```ts
  const SubmitAnswersSchema = z.object({
    answers: z.array(
      z.union([
        z.string().max(CC_MAX_ANSWER_LENGTH).transform(s => s.trim().toLowerCase()),
        z.null(),
      ])
    ).length(CC_CATEGORIES_PER_ROUND),
  });
  ```
  **Verification:** Valid: `{ answers: ["Cat", null, " BRIDGE ", "apple", ""] }` → transforms to `["cat", null, "bridge", "apple", ""]`. Empty strings preserved (handled as skip in scoring).

- [ ] Define `CrashAnswerSchema`:
  ```ts
  const CrashAnswerSchema = z.object({
    targetUserId: z.string().uuid(),
    categoryIndex: z.number().int().min(0).max(CC_CATEGORIES_PER_ROUND - 1),
  });
  ```
  **Verification:** Valid: `{ targetUserId: "uuid-here", categoryIndex: 0 }`. Invalid: `{ targetUserId: "", categoryIndex: 5 }`.

- [ ] Define `UncrashAnswerSchema`:
  ```ts
  const UncrashAnswerSchema = z.object({
    targetUserId: z.string().uuid(),
    categoryIndex: z.number().int().min(0).max(CC_CATEGORIES_PER_ROUND - 1),
  });
  ```
  **Verification:** Same validation as `CrashAnswerSchema`.

---

### 5.3.6 Implement Server Handler

- [ ] Create `server/rmhbox/minigames/category-crash.ts`

#### 5.3.6.1 Type Definitions

- [ ] Define `CategoryCrashPhase` enum:
  ```ts
  enum CategoryCrashPhase {
    REVEAL = "REVEAL",
    INPUT = "INPUT",
    PEER_REVIEW = "PEER_REVIEW",
    CRASH_RESOLUTION = "CRASH_RESOLUTION",
    ROUND_RESULTS = "ROUND_RESULTS",
  }
  ```
  **Verification:** Enum has exactly 5 values.

- [ ] Define `Category` type:
  ```ts
  type Category = {
    id: string;
    name: string;
    difficulty: "easy" | "medium" | "hard";
    examples: string[];
  };
  ```

- [ ] Define `AnonymizedAnswerSet`:
  ```ts
  type AnonymizedAnswerSet = {
    anonymousId: string;     // "Player 1", "Player 2", etc. (randomized)
    realUserId: string;      // actual userId (server-only for de-anonymization)
    answers: (string | null)[];
  };
  ```

- [ ] Define `CrashRecord`:
  ```ts
  type CrashRecord = {
    targetUserId: string;
    categoryIndex: number;
    crashedByUserIds: Set<string>;
  };
  ```

- [ ] Define `CCRoundResults`:
  ```ts
  type CCRoundResults = {
    letter: string;
    categories: Category[];
    playerResults: CCPlayerResult[];
  };
  type CCPlayerResult = {
    userId: string;
    answers: { answer: string | null; status: "unique" | "shared" | "crashed" | "invalid" | "empty"; points: number }[];
    roundScore: number;
    crashBonuses: number;
    crashPenalties: number;
  };
  ```

- [ ] Define `CategoryCrashState`:
  ```ts
  type CategoryCrashState = {
    currentRound: number;
    totalRounds: number;
    phase: CategoryCrashPhase;
    letter: string;
    categories: Category[];
    savedAnswers: Map<string, (string | null)[]>;   // userId → 5 answers (drafts)
    lockedAnswers: Map<string, (string | null)[]>;   // userId → 5 answers (final)
    crashes: Map<string, CrashRecord[]>;             // key = `${targetUserId}-${categoryIndex}`
    roundResults: CCRoundResults | null;
    playerScores: Map<string, number>;
    usedLetters: string[];
    usedCategoryIds: string[];
    anonymizationMap: Map<string, string>;            // realUserId → anonymousId
    pendingPlayers: string[];                         // JIP players waiting for next round
  };
  ```
  **Verification:** All types compile. Fields match spec.

#### 5.3.6.2 Class: `CategoryCrashGame extends BaseMinigame`

- [ ] Constructor: call `super("category-crash")`; load categories from data loader
  **Verification:** Instantiate; confirm categories loaded.

#### 5.3.6.3 State Initialization (`initializeState()`)

- [ ] Initialize `playerScores` to 0 for each player
- [ ] Initialize empty maps for `savedAnswers`, `lockedAnswers`, `crashes`
- [ ] Set `currentRound = 0`, `totalRounds = CC_TOTAL_ROUNDS`
- [ ] Initialize `usedLetters = []`, `usedCategoryIds = []`
- [ ] Initialize `pendingPlayers = []`
- [ ] Call `startRound()` to begin round 1
  **Verification:** Unit test: init with 5 players → all scores 0, round starts.

#### 5.3.6.4 Phase Management

- [ ] `startRound()`:
  - [ ] Promote any `pendingPlayers` to active players (add to scores map with 0)
  - [ ] Clear `pendingPlayers`
  - [ ] Increment `currentRound`
  - [ ] Select letter via `selectRoundLetter(usedLetters)`; push to `usedLetters`
  - [ ] Select 5 categories via `selectRoundCategories(usedCategoryIds)`; push IDs to `usedCategoryIds`
  - [ ] Clear `savedAnswers`, `lockedAnswers`, `crashes` for new round
  - [ ] Set `phase = REVEAL`
  - [ ] Emit `CC_ROUND_START { round, letter, categories[], inputDurationSeconds: CC_INPUT_DURATION }`
  - [ ] Schedule `startInputPhase()` after `CC_REVEAL` seconds
  **Verification:** Round start emits correct letter and 5 categories with proper difficulty distribution.

- [ ] `startInputPhase()`:
  - [ ] Set `phase = INPUT`
  - [ ] Start `TIMER_TICK` interval
  - [ ] Schedule `endInputPhase()` after `CC_INPUT_DURATION` seconds
  **Verification:** Timer ticks broadcast. Phase transitions after 60s.

- [ ] `endInputPhase()`:
  - [ ] Lock all remaining unlocked answers (auto-lock with current saved state)
  - [ ] For each player without saved answers, lock as 5 nulls
  - [ ] Generate anonymization map: shuffle player list, assign "Player 1", "Player 2", etc.
  - [ ] Build `AnonymizedAnswerSet[]` for all players
  - [ ] Set `phase = PEER_REVIEW`
  - [ ] Emit `CC_PEER_REVIEW_START { allAnswers: AnonymizedAnswerSet[], reviewDurationSeconds: CC_PEER_REVIEW_DURATION }`
  - [ ] Start timer, schedule `startCrashResolution()` after `CC_PEER_REVIEW_DURATION`
  **Verification:** All answers locked. Anonymized set has randomized player IDs. Players who didn't submit have null answers.

- [ ] `startCrashResolution()`:
  - [ ] Set `phase = CRASH_RESOLUTION`
  - [ ] For each crashed answer, check if crash count ≥ threshold (rounded up: `Math.ceil((playerCount - 1) * CC_CRASH_THRESHOLD_PERCENT / 100)`)
  - [ ] Mark answers as crashed/valid accordingly
  - [ ] Schedule `showRoundResults()` after `CC_CRASH_RESOLUTION` seconds
  **Verification:** With 5 players: threshold = ceil(4 * 0.5) = 2 crashes needed. Answer with 2 crashes → invalidated. Answer with 1 crash → survives.

- [ ] `showRoundResults()`:
  - [ ] Compute scoring for all answers (see 5.3.6.6)
  - [ ] Build `CCRoundResults` with de-anonymized player info
  - [ ] Set `phase = ROUND_RESULTS`
  - [ ] Emit `CC_ROUND_RESULTS { CCRoundResults }` to all
  - [ ] Schedule next round or game end after `CC_ROUND_RESULTS` seconds
  **Verification:** Results are de-anonymized. Scores match formula.

- [ ] After final round results: call `endGame()` with final scores and awards
  **Verification:** Game ends after round 2 results.

#### 5.3.6.5 Input Handling

- [ ] **`SAVE_ANSWERS` handler:**
  - [ ] Validate phase is `INPUT`
  - [ ] Parse through `SaveAnswersSchema`
  - [ ] Store in `savedAnswers` map for this user
  - [ ] Emit `CC_ANSWER_SAVED { categoryIndex, answer }` back to submitter ONLY for each changed answer
  - [ ] Do NOT broadcast to other players
  **Verification:** Save debounces on client (500ms). Each save updates server state. No broadcast to others.

- [ ] **`SUBMIT_ANSWERS` handler (explicit lock):**
  - [ ] Validate phase is `INPUT`
  - [ ] Parse through `SubmitAnswersSchema`
  - [ ] Transform: trim, lowercase each answer; empty string → null
  - [ ] Store in `lockedAnswers` map for this user
  - [ ] Emit `CC_ANSWERS_LOCKED { userId }` to ALL players (so others see "Player X has locked in")
  - [ ] Player cannot edit after locking
  **Verification:** After lock, further SAVE_ANSWERS from this user are rejected. All players notified.

- [ ] **`CRASH_ANSWER` handler:**
  - [ ] Validate phase is `PEER_REVIEW`
  - [ ] Parse through `CrashAnswerSchema`
  - [ ] Validate `targetUserId` is not the crashing player (can't crash own answers)
  - [ ] Validate player hasn't exceeded `CC_MAX_CRASHES` total crashes this round
  - [ ] Validate player hasn't already crashed this specific `targetUserId + categoryIndex`
  - [ ] Add crash record
  - [ ] Compute crash count and threshold for this answer
  - [ ] Emit `CC_CRASH_UPDATE { targetUserId, categoryIndex, crashCount, threshold }` to ALL
  **Verification:** Can't crash own answer. Max 5 crashes per round enforced. Duplicate crash on same answer rejected. Crash count broadcast to all.

- [ ] **`UNCRASH_ANSWER` handler:**
  - [ ] Validate phase is `PEER_REVIEW`
  - [ ] Parse through `UncrashAnswerSchema`
  - [ ] Remove crash record for this player on the target answer
  - [ ] Emit `CC_CRASH_UPDATE` with updated count
  **Verification:** Uncrash removes the crash. Count decrements. Player can re-crash if under max limit.

#### 5.3.6.6 Scoring Computation

- [ ] **Letter validation:** each answer must start with the round's letter (case-insensitive). Answers failing this check → auto-invalid, 0 pts.
- [ ] **Empty/null check:** empty or null answers → 0 pts.
- [ ] **Exact duplicate detection:** group answers by category (case-insensitive, trimmed). Exact matches → "shared".
- [ ] **Fuzzy duplicate detection:** use `fuse.js` with `threshold = CC_FUZZY_THRESHOLD` (0.85) to detect near-duplicates within same category. Near-duplicates also treated as "shared".
- [ ] **Crash resolution:** answers with crashes ≥ threshold → status "crashed", 0 pts.
- [ ] **Scoring:**
  - Unique valid answer: `CC_UNIQUE_POINTS` (10)
  - Shared valid answer (duplicate): `CC_SHARED_POINTS` (5) to each
  - Crashed / auto-invalid / empty: 0 pts
  - Successful crash bonus: `CC_CRASH_BONUS` (2) per answer that was successfully invalidated by this player's crash
  - Failed crash penalty: `CC_CRASH_PENALTY` (-1) per crash on an answer that survived
- [ ] Sum per-player round scores; add to cumulative `playerScores`
  **Verification:** Unit test with 4 players, letter "B":
  - P1: ["bear", "bridge", null, "biscuit", "brazil"]
  - P2: ["bear", "bike", "banana", "biscuit", "belgium"]
  - P3: ["bear", "bat", "banana", "bread", "brazil"]
  - P4: ["buffalo", "bridge", "blueberry", "bread", "bhutan"]
  - Category 0: "bear" shared (3 players, 5pts each), "buffalo" unique (10pts)
  - Category 1: "bridge" shared (2 players, 5pts each), "bike" unique (10pts), "bat" unique (10pts)
  - Crash P1's "brazil" by P2, P3 → crash count 2, threshold ceil(3*0.5)=2 → crashed, 0pts
  - P2's crash bonus: +2. P3's crash bonus: +2.

#### 5.3.6.7 `getStateForPlayer(userId)`

- [ ] During `REVEAL`:
  ```ts
  { round, letter, categories[], phase, timeRemaining }
  ```
- [ ] During `INPUT`:
  ```ts
  {
    round, letter, categories[], phase, timeRemaining,
    myAnswers: (string | null)[],     // own saved/locked answers
    lockedPlayerCount: number,         // how many players have locked
    totalPlayers: number,
    isLocked: boolean,                 // whether this player has locked
  }
  ```
- [ ] During `PEER_REVIEW`:
  ```ts
  {
    round, letter, categories[], phase, timeRemaining,
    allAnswers: AnonymizedAnswerSet[],  // anonymized player answers
    crashCounts: { targetUserId: string, categoryIndex: number, count: number, threshold: number }[],
    myCrashesUsed: number,
    maxCrashes: CC_MAX_CRASHES,
  }
  ```
- [ ] During `CRASH_RESOLUTION` and `ROUND_RESULTS`:
  ```ts
  {
    round, letter, categories[], phase,
    roundResults: CCRoundResults,     // de-anonymized
    playerScores: { userId: string, score: number }[],
  }
  ```
- [ ] Other players' answers NEVER visible during INPUT phase
- [ ] Anonymized during PEER_REVIEW — `anonymousId` is used, not actual names (server maps internally)
  **Verification:** Unit test: call during each phase; confirm correct fields present and information properly masked.

#### 5.3.6.8 `getStateForSpectator()`

- [ ] During INPUT: see locked count but NOT individual answers
- [ ] During PEER_REVIEW: see anonymized answers and crash counts (same as players)
- [ ] During ROUND_RESULTS: see full de-anonymized results
  **Verification:** Spectator cannot see answers during INPUT.

#### 5.3.6.9 `handleJoinInProgress(userId)`

- [ ] JIP policy: `join_next_subround`
- [ ] If joining during Round 1: add to `pendingPlayers` list, player spectates
- [ ] At Round 2 start: promote pending players to active (initialize score to 0)
- [ ] If joining during Round 2: spectate only (no more rounds to join)
  **Verification:** Unit test: JIP during Round 1 → spectator, promoted at Round 2. JIP during Round 2 → permanent spectator.

#### 5.3.6.10 `handleReconnect(userId)`

- [ ] During `INPUT`: receive saved answers (from `savedAnswers` map), continue editing if not locked
- [ ] During `PEER_REVIEW`: receive full anonymized answer set + current crash counts, can still issue crashes (up to remaining limit)
- [ ] Previous crashes by this player are preserved
- [ ] Timer continues (no pause)
  **Verification:** Reconnect during INPUT with 3 saved answers → player sees those 3 answers and can edit/submit. Reconnect during PEER_REVIEW with 2 crashes used → can issue 3 more.

#### 5.3.6.11 `handleDisconnect(userId)`

- [ ] During INPUT: saved answers are preserved. At timer end, auto-lock with current saved state.
- [ ] During PEER_REVIEW: existing crashes preserved. No further crashes from this player.
- [ ] Scoring proceeds with whatever state the player had.
  **Verification:** Disconnected player's saved answers are scored. Their crashes count.

#### 5.3.6.12 `computeResults()` and Awards

- [ ] Final rankings by cumulative `playerScores`
- [ ] Awards:
  - [ ] **Unique Snowflake** — most unique (non-shared, non-crashed) valid answers across all rounds
  - [ ] **Speed Demon** — first player to lock in their answers (by timestamp) across all rounds
  - [ ] **Crash Test Dummy** — player whose answers were crashed the most
  - [ ] **Vigilante** — most successful crashes (crashes that resulted in invalidation)
  - [ ] **Full House** — all 5 answers valid (non-crashed, non-empty, letter-correct) in any single round
  **Verification:** Unit test: construct scenarios triggering each award; confirm all 5 assigned correctly.

#### 5.3.6.13 `buildGameLog()`

- [ ] Maintain an `actionLog: GameLogAction[]` array on the game instance
- [ ] Log `round_start` action when letter/categories are revealed (round, letter, categories)
- [ ] Log `answers_locked` action when submissions close (userId, answers per category)
- [ ] Log `crash` action for each crash during peer review (crasherId, targetUserId, category, answer)
- [ ] Log `round_end` action at round completion (round, validAnswers, crashedAnswers, scores)
- [ ] In `computeResults()`, build `GameLog` with `initialState` containing round count and player list
- [ ] Return `GameLog` from `buildGameLog()`
  **Verification:** Unit test: play 2-round game with crashes, verify log contains round_start, answers_locked, crash, round_end actions.

---

### 5.3.7 Register Game in Minigame Registry

- [ ] Add entry:
  ```ts
  {
    id: "category-crash",
    name: "Category Crash",
    category: "word",
    icon: "list-collapse",
    minPlayers: 3,
    maxPlayers: 16,
    estimatedDuration: 212,
    description: "Brainstorming showdown! Fill categories with a random letter, then crash your opponents' answers.",
    handler: CategoryCrashGame,
  }
  ```
  **Verification:** Registry lookup returns correct metadata. Handler instantiates with 5 players.

---

### 5.3.8 Build Client Components

#### 5.3.8.1 `components/rmhbox/category-crash/CategoryCrashGame.tsx`

- [ ] Phase router component based on `phase`
- [ ] Subscribe to all `CC_*` and `TIMER_TICK` events
- [ ] Maintain local state: round, letter, categories, phase, timeRemaining, myAnswers, isLocked, allAnswers (anonymized), crashCounts, roundResults, playerScores
- [ ] Handle `CC_ROUND_START` → show letter and category reveal animation
- [ ] Handle `CC_ANSWER_SAVED` → update local answer state (own answers)
- [ ] Handle `CC_ANSWERS_LOCKED` → update locked player count
- [ ] Handle `CC_PEER_REVIEW_START` → switch to peer review UI with anonymized answers
- [ ] Handle `CC_CRASH_UPDATE` → update crash counts in real-time
- [ ] Handle `CC_ROUND_RESULTS` → show de-anonymized results and scores
- [ ] Conditional rendering:
  - `REVEAL` → letter + category animation
  - `INPUT` → `<CategoryInput />`
  - `PEER_REVIEW` → `<PeerReview />`
  - `CRASH_RESOLUTION` → crash resolution animation
  - `ROUND_RESULTS` → `<CategoryCrashResults />`
  **Verification:** Component renders for each phase. State transitions are smooth.

#### 5.3.8.2 `components/rmhbox/category-crash/CategoryInput.tsx`

- [ ] 5 text input fields, one per category
- [ ] Each field: labeled with category name, placeholder with examples, max length `CC_MAX_ANSWER_LENGTH`
- [ ] Auto-save: debounced 500ms (`CC_SAVE_DEBOUNCE`) via `SAVE_ANSWERS` event
- [ ] "Submit All" button: locks answers, emit `SUBMIT_ANSWERS`
- [ ] Visual: letter displayed prominently, answers must start with that letter (show inline warning if wrong letter)
- [ ] After lock: all fields disabled, "Locked In ✓" indicator
- [ ] Show count: "N/T players locked in"
- [ ] Timer countdown display
  **Verification:** Type in field → auto-save fires after 500ms. Click Submit All → fields disabled. Wrong-letter answer shows warning. Timer visible.

#### 5.3.8.3 `components/rmhbox/category-crash/PeerReview.tsx`

- [ ] Grid layout: rows = players (anonymized as "Player 1", etc.), columns = categories
- [ ] Each cell shows the player's answer for that category (or "—" for empty)
- [ ] Own answers highlighted differently (player knows which anonymous ID is theirs via mapping)
- [ ] `<CrashButton />` on each cell (except own answers)
- [ ] Show crash count badge on each answer
- [ ] Show remaining crashes: `N/CC_MAX_CRASHES crashes remaining`
- [ ] Timer countdown
  **Verification:** Grid renders with correct dimensions. Crash buttons absent on own row. Crash count updates in real-time.

#### 5.3.8.4 `components/rmhbox/category-crash/CrashButton.tsx`

- [ ] Toggle button: default state (inactive) vs crashed state (active with red indicator)
- [ ] Click to crash: emit `CRASH_ANSWER { targetUserId, categoryIndex }`
- [ ] Click again to uncrash: emit `UNCRASH_ANSWER { targetUserId, categoryIndex }`
- [ ] Disabled when player has used all `CC_MAX_CRASHES` crashes
- [ ] Cannot appear on own answers
- [ ] Tooltip: "Challenge this answer (N/5 crashes used)"
  **Verification:** Toggle between crash/uncrash. Disabled at max. Correct events emitted.

#### 5.3.8.5 `components/rmhbox/category-crash/AnswerCard.tsx`

- [ ] Displays a single answer within the results grid
- [ ] Color-coded by status: unique (gold), shared (blue), crashed (red strikethrough), invalid (gray), empty (dim)
- [ ] Shows points earned
- [ ] Crash indicator if answer was challenged
- [ ] Animation on reveal
  **Verification:** Renders in all 5 states with correct styling.

#### 5.3.8.6 `components/rmhbox/category-crash/CategoryCrashResults.tsx`

- [ ] Full de-anonymized results grid
- [ ] Per-player row: 5 answer cards + round score + crash bonuses/penalties
- [ ] Cumulative scoreboard sorted by total score
- [ ] Highlight unique answers, crashed answers
- [ ] Awards display (after final round)
  **Verification:** Results match scoring formula. Awards displayed correctly. Scoreboard sorted.

---

### 5.3.9 Integration Testing

- [ ] End-to-end test: 4 players, 2 rounds
  - [ ] Verify letter selection is weighted and unique per round
  - [ ] Verify category selection: 2 easy, 2 medium, 1 hard, no repeats
  - [ ] Verify auto-save and explicit lock
  - [ ] Verify peer review anonymization
  - [ ] Verify crash threshold calculation
  - [ ] Verify fuzzy duplicate detection with fuse.js
  - [ ] Verify letter validation (wrong letter → invalid)
  - [ ] Verify scoring matches formula
  **Verification:** All assertions pass. Fuzzy duplicates correctly detected.

- [ ] JIP test: Player joins during Round 1 → spectates → promoted at Round 2
  **Verification:** Pending player added at round 2 start with score 0.

- [ ] Reconnection test during INPUT: player reconnects → sees saved answers, can continue editing
  **Verification:** Reconnected player sees 3 previously saved answers and can edit remaining 2.

- [ ] Reconnection test during PEER_REVIEW: player reconnects → sees full answer grid and crash counts, can still crash
  **Verification:** Reconnected player's previous 2 crashes still active, can issue 3 more.

- [ ] Information masking test:
  - [ ] During INPUT: WebSocket traffic contains no other players' answers
  - [ ] During PEER_REVIEW: answers are anonymized (no real usernames in `anonymousId`)
  - [ ] During ROUND_RESULTS: answers are de-anonymized
  **Verification:** Inspect WebSocket frames; confirm masking at each phase.

- [ ] Edge case: all players submit same answer for a category → all "shared" (5pts each)
  **Verification:** No answers marked "unique" when all are identical.

- [ ] Edge case: player submits no answers (all null) → 0 pts, no crashes possible on empty answers
  **Verification:** Empty answers scored as 0. Crash buttons not shown for empty cells.

---

## 5.4 Wiki-Race

**Game ID:** `wiki-race` | **Category:** `trivia` | **Icon:** `globe`
**Players:** 2–10 | **Duration:** ~193s (single round)

---

### 5.4.1 Install NPM Packages

- [ ] Install `node-html-parser` (fast HTML parser for Wikipedia content)
  ```bash
  pnpm add node-html-parser
  ```
  **Verification:** Run `pnpm ls node-html-parser` and confirm version listed.

- [ ] Install `sanitize-html` (XSS protection for HTML content)
  ```bash
  pnpm add sanitize-html
  ```
  **Verification:** Run `pnpm ls sanitize-html`.

- [ ] Install `@types/sanitize-html` if needed
  ```bash
  pnpm add -D @types/sanitize-html
  ```
  **Verification:** TypeScript import resolves without errors.

- [ ] Install `lru-cache` (article caching)
  ```bash
  pnpm add lru-cache
  ```
  **Verification:** Run `pnpm ls lru-cache`.

- [ ] Verify all 3 packages import correctly in a TypeScript file
  **Verification:** `tsc --noEmit` passes with imports of all three packages.

---

### 5.4.2 Add Constants to `lib/rmhbox/constants.ts`

- [ ] Add `WR_NAV_DURATION = 180` — seconds for navigation phase
- [ ] Add `WR_REVEAL = 5` — seconds for article reveal phase
- [ ] Add `WR_RESULTS = 8` — seconds for results display
- [ ] Add `WR_MIN_PATH = 3` — minimum optimal path length for article pairs
- [ ] Add `WR_MAX_PATH = 8` — maximum optimal path length for article pairs
- [ ] Add `WR_FINISH_BASE = 500` — base points for finishing
- [ ] Add `WR_SPEED_BONUS_PER_SEC = 5` — bonus points per second remaining
- [ ] Add `WR_EFFICIENCY_BONUS = 50` — bonus points per click under (optimalPath + 2)
- [ ] Add `WR_ONE_AWAY = 200` — points if target article is a link on current page (DNF)
- [ ] Add `WR_DNF_BASE = 50` — base points for DNF
- [ ] Add `WR_DNF_CLICK_BONUS = 10` — bonus per click (capped at optimal path clicks) for DNF
- [ ] Add `WR_CACHE_MAX = 500` — max entries in article LRU cache
- [ ] Add `WR_CACHE_TTL = 600000` — cache TTL in milliseconds (10 minutes)
- [ ] Add `WR_NAV_RATE_LIMIT = 3` — max navigations per second per player
- [ ] Add `WR_MAX_PAIR_POOL = 200` — max article pairs in curated pool
- [ ] **Verification:** Import all `WR_*` constants; confirm 15 constants defined with correct values and types.

---

### 5.4.3 Create Static Data Files

- [ ] Create directory `public/data/rmhbox/wiki-race/`
  **Verification:** Directory exists.

- [ ] Create `public/data/rmhbox/wiki-race/article-pairs.json`
  - [ ] Array of curated article pair objects (up to `WR_MAX_PAIR_POOL` = 200)
  - Each follows `ArticlePair`:
    ```ts
    {
      id: string;
      startArticle: {
        title: string;      // Wikipedia article title
        url: string;         // full Wikipedia URL
        description: string; // brief description
        thumbnail?: string;  // thumbnail URL
      };
      targetArticle: {
        title: string;
        url: string;
        description: string;
        thumbnail?: string;
      };
      optimalPathLength: number;  // 3–8
      difficulty: "easy" | "medium" | "hard";
      tags: string[];             // topic tags
    }
    ```
  - [ ] All pairs pre-validated: a path exists from start → target
  - [ ] Optimal path length between `WR_MIN_PATH` (3) and `WR_MAX_PATH` (8)
  - [ ] Both articles should be popular (~10K+ views), real Wikipedia articles
  - [ ] No disambiguation pages or stubs
  - [ ] Include at least 50 easy (3–4 clicks), 100 medium (5–6 clicks), 50 hard (7–8 clicks) pairs
  - [ ] Unique IDs, no duplicate pairs
  **Verification:** Parse JSON; confirm ≤200 entries; validate each has all required fields; confirm `optimalPathLength` within 3–8 range; confirm no duplicate IDs.

---

### 5.4.4 Build Data Pipeline

- [ ] Create `lib/rmhbox/wiki-race/wikipedia-proxy.ts` — Wikipedia content fetching and sanitization
  - [ ] Export `fetchArticle(title: string): Promise<{ title, sanitizedHtml, links: string[] }>`
    - [ ] Fetch from Wikipedia REST API: `https://en.wikipedia.org/api/rest_v1/page/html/{title}`
    - [ ] Parse HTML with `node-html-parser`
    - [ ] Sanitize with `sanitize-html`:
      - [ ] Strip all `<script>`, `<style>`, `<nav>`, `<footer>` tags
      - [ ] Strip external links (non-Wikipedia hrefs)
      - [ ] Strip edit links (`[edit]` sections)
      - [ ] Strip reference sections and footnotes
      - [ ] Strip infobox tables (optional, or simplify)
    - [ ] Convert internal `/wiki/...` links to data attributes for WebSocket event handling:
      ```html
      <a data-wiki-target="Article_Title" class="wiki-link">Article Title</a>
      ```
    - [ ] Extract all internal link targets into `links: string[]` (Set for dedup)
    - [ ] Return sanitized HTML and link list
  **Verification:** Unit test: fetch "Albert Einstein" article; confirm HTML is sanitized (no scripts, no external links); confirm `links` array contains expected articles like "Physics", "Germany", etc.

  - [ ] Export `createArticleCache(): LRUCache<string, CachedArticle>`
    - Configure with `max: WR_CACHE_MAX`, `ttl: WR_CACHE_TTL`
    - `CachedArticle = { title, sanitizedHtml, links: Set<string>, fetchedAt: number }`
  **Verification:** Cache hit returns same object. Cache evicts after 500 entries. Cache expires after 10 minutes.

  - [ ] Implement rate limiting for Wikipedia API: ≤200 requests/second global
  **Verification:** Rapid consecutive fetches are queued, not exceeding rate limit.

- [ ] Create `lib/rmhbox/wiki-race/data-loader.ts`
  - [ ] Export `loadArticlePairs(): ArticlePair[]` — reads and caches `article-pairs.json`
  - [ ] Export `selectArticlePair(usedPairIds: string[]): ArticlePair` — random selection excluding used pairs
  **Verification:** Unit test: `selectArticlePair([])` returns valid pair. Repeated calls with exclusions never return used pairs.

---

### 5.4.5 Define Zod Validation Schemas

- [ ] Create `lib/rmhbox/wiki-race/schemas.ts`

- [ ] Define `NavigateSchema`:
  ```ts
  const NavigateSchema = z.object({
    targetTitle: z.string()
      .min(1)
      .max(300)
      .transform(s => s.trim()),
  });
  ```
  **Verification:** Valid: `{ targetTitle: "Albert_Einstein" }`. Invalid: `{ targetTitle: "" }`.

- [ ] Define `GoBackSchema`:
  ```ts
  const GoBackSchema = z.object({
    targetTitle: z.string().min(1).max(300),
    pathIndex: z.number().int().min(0),
  });
  ```
  **Verification:** Valid: `{ targetTitle: "Physics", pathIndex: 2 }`. Invalid: `{ targetTitle: "", pathIndex: -1 }`.

- [ ] Define `WikiArticleRefSchema` for data validation:
  ```ts
  const WikiArticleRefSchema = z.object({
    title: z.string(),
    url: z.string().url(),
    description: z.string(),
    thumbnail: z.string().url().optional(),
  });
  ```
  **Verification:** Validate sample entries from `article-pairs.json`.

- [ ] Define `ArticlePairSchema`:
  ```ts
  const ArticlePairSchema = z.object({
    id: z.string(),
    startArticle: WikiArticleRefSchema,
    targetArticle: WikiArticleRefSchema,
    optimalPathLength: z.number().int().min(WR_MIN_PATH).max(WR_MAX_PATH),
    difficulty: z.enum(["easy", "medium", "hard"]),
    tags: z.array(z.string()),
  });
  ```
  **Verification:** Validate all entries in `article-pairs.json`.

---

### 5.4.6 Implement Server Handler

- [ ] Create `server/rmhbox/minigames/wiki-race.ts`

#### 5.4.6.1 Type Definitions

- [ ] Define `WikiRacePhase` enum:
  ```ts
  enum WikiRacePhase {
    ARTICLE_REVEAL = "ARTICLE_REVEAL",
    NAVIGATION = "NAVIGATION",
    RESULTS = "RESULTS",
  }
  ```
  **Verification:** Enum has exactly 3 values.

- [ ] Define `WRPlayerState`:
  ```ts
  type WRPlayerState = {
    userId: string;
    currentArticleTitle: string;
    currentArticleLinks: Set<string>;  // links on current page (server-only)
    path: string[];                     // ordered list of article titles visited
    clickCount: number;
    hasFinished: boolean;
    finishedAt: number | null;          // timestamp
    finishRank: number | null;          // 1-based
    score: number;
  };
  ```

- [ ] Define `WikiRaceState`:
  ```ts
  type WikiRaceState = {
    startArticle: WikiArticleRef;
    targetArticle: WikiArticleRef;
    optimalPathLength: number;
    phase: WikiRacePhase;
    playerStates: Map<string, WRPlayerState>;
    finishOrder: string[];       // userIds in order of finish
    phaseStartedAt: number;
    phaseEndsAt: number;
  };
  ```

- [ ] Define `WikiArticleRef`:
  ```ts
  type WikiArticleRef = {
    title: string;
    url: string;
    description: string;
    thumbnail?: string;
  };
  ```
  **Verification:** All types compile. Cross-reference every field against spec.

#### 5.4.6.2 Class: `WikiRaceGame extends BaseMinigame`

- [ ] Constructor: call `super("wiki-race")`; load article pairs; create article cache
  **Verification:** Instantiate; confirm pairs loaded and cache initialized.

#### 5.4.6.3 State Initialization (`initializeState()`)

- [ ] Select article pair via `selectArticlePair([])`
- [ ] For each player, initialize `WRPlayerState`:
  - `currentArticleTitle = startArticle.title`
  - `currentArticleLinks = new Set()` (populated when article is fetched)
  - `path = [startArticle.title]`
  - `clickCount = 0`, `hasFinished = false`, `finishedAt = null`, `finishRank = null`, `score = 0`
- [ ] Set `phase = ARTICLE_REVEAL`, `finishOrder = []`
- [ ] Pre-fetch start article HTML and cache it
  **Verification:** Unit test: init with 4 players; all players start on same article; start article is pre-cached.

#### 5.4.6.4 Phase Management

- [ ] `startGame()`:
  - [ ] Set `phase = ARTICLE_REVEAL`
  - [ ] Emit `WR_ARTICLES_REVEALED { startArticle, targetArticle, navigationDurationSeconds: WR_NAV_DURATION }` to all
  - [ ] Schedule `startNavigation()` after `WR_REVEAL` seconds
  **Verification:** Both articles revealed to all players with descriptions and thumbnails.

- [ ] `startNavigation()`:
  - [ ] Set `phase = NAVIGATION`, record `phaseStartedAt`, compute `phaseEndsAt`
  - [ ] For each player: fetch start article HTML, populate `currentArticleLinks`, emit `WR_ARTICLE_CONTENT { title, sanitizedHtml, linkCount }` privately
  - [ ] Start `TIMER_TICK` interval
  - [ ] Schedule `endNavigation()` after `WR_NAV_DURATION` seconds
  **Verification:** Each player receives start article HTML. Links extracted. Timer ticking.

- [ ] `endNavigation()`:
  - [ ] Stop timer
  - [ ] Score all players (including DNF)
  - [ ] Compute final results
  - [ ] Set `phase = RESULTS`
  - [ ] Emit `WR_RESULTS { rankings[], startArticle, targetArticle, optimalPath[] }` to all
  - [ ] Schedule `endGame()` after `WR_RESULTS` seconds
  **Verification:** Results include all players ranked. Optimal path revealed. DNF players scored.

- [ ] `endGame()`: call `super.endGame()` with scores and awards
  **Verification:** Game transitions to GAME_OVER.

#### 5.4.6.5 Input Handling — `NAVIGATE`

- [ ] Validate phase is `NAVIGATION`
- [ ] Parse through `NavigateSchema`
- [ ] **Anti-cheat: Link validation:**
  - [ ] Get player's `currentArticleLinks` (Set of valid link targets)
  - [ ] Check `targetTitle` is in `currentArticleLinks`
  - [ ] If NOT: emit `WR_NAVIGATE_ERROR { reason: "INVALID_NAVIGATION" }` to player; reject
- [ ] **Rate limiting:** check player hasn't exceeded `WR_NAV_RATE_LIMIT` (3/sec)
  - [ ] If exceeded: emit `WR_NAVIGATE_ERROR { reason: "RATE_LIMITED" }` to player; reject
- [ ] **Process valid navigation:**
  - [ ] Increment `clickCount`
  - [ ] Push `targetTitle` to `path`
  - [ ] Set `currentArticleTitle = targetTitle`
  - [ ] Fetch new article (from cache or Wikipedia API)
  - [ ] Update `currentArticleLinks` with new article's links
  - [ ] Emit `WR_ARTICLE_CONTENT { title, sanitizedHtml, linkCount }` to player ONLY
  - [ ] Emit `WR_PLAYER_PROGRESS { userId, userName, clickCount, hasFinished: false }` to ALL
- [ ] **Check for finish:** if `currentArticleTitle === targetArticle.title`:
  - [ ] Set `hasFinished = true`, `finishedAt = Date.now()`
  - [ ] Assign `finishRank = finishOrder.length + 1`
  - [ ] Push userId to `finishOrder`
  - [ ] Compute time elapsed
  - [ ] Emit `WR_PLAYER_FINISHED { userId, userName, clickCount, finishRank, timeElapsed }` to ALL
  - [ ] If all players finished: end navigation early
  **Verification:** Unit test: navigate to valid link → article fetched, progress broadcast. Navigate to invalid link → error emitted. Navigate to target → finish triggered. Rate limit exceeded → error.

#### 5.4.6.6 Input Handling — `GO_BACK`

- [ ] Validate phase is `NAVIGATION`
- [ ] Parse through `GoBackSchema`
- [ ] Validate `pathIndex` is within bounds of player's `path` array
- [ ] Validate `targetTitle` matches `path[pathIndex]`
- [ ] **Back navigation costs a click:** increment `clickCount`
- [ ] Truncate `path` to `pathIndex + 1` (remove everything after the target)
- [ ] Set `currentArticleTitle = targetTitle`
- [ ] Fetch article (likely cached) and update `currentArticleLinks`
- [ ] Emit `WR_ARTICLE_CONTENT` to player
- [ ] Emit `WR_PLAYER_PROGRESS` to all (with updated click count)
  **Verification:** Unit test: player at path ["A", "B", "C", "D"], go back to index 1 ("B") → path becomes ["A", "B"], clickCount incremented. Cost verified.

#### 5.4.6.7 Scoring Computation

- [ ] **Finished players:**
  - Base: `WR_FINISH_BASE` (500)
  - Speed bonus: `WR_SPEED_BONUS_PER_SEC` (5) × seconds remaining (`WR_NAV_DURATION - timeElapsed`)
  - Efficiency bonus: `WR_EFFICIENCY_BONUS` (50) × `max(0, optimalPathLength + 2 - clickCount)`
  - Total: base + speed + efficiency

- [ ] **DNF players — target on current page:**
  - If `targetArticle.title` is in `currentArticleLinks`: `WR_ONE_AWAY` (200) points

- [ ] **DNF players — target NOT on current page:**
  - Base: `WR_DNF_BASE` (50)
  - Click bonus: `WR_DNF_CLICK_BONUS` (10) × `min(clickCount, optimalPathLength)`
  - Total: base + click bonus

- [ ] Rank all players: finished first by `finishRank`, then DNF by proximity heuristic
  **Verification:** Unit test:
  - Player A finishes in 120s, 5 clicks, optimal=4 → 500 + 5×60 + 50×max(0, 6-5) = 500+300+50 = 850
  - Player B finishes in 170s, 8 clicks, optimal=4 → 500 + 5×10 + 50×max(0, 6-8) = 500+50+0 = 550
  - Player C DNF, target on current page → 200
  - Player D DNF, 3 clicks, optimal=4 → 50 + 10×min(3,4) = 50+30 = 80

#### 5.4.6.8 `getStateForPlayer(userId)`

- [ ] Return:
  ```ts
  {
    startArticle: WikiArticleRef;
    targetArticle: WikiArticleRef;
    phase: WikiRacePhase;
    timeRemaining: number;
    myPath: string[];              // own navigation path
    myClickCount: number;
    myCurrentArticle: string;      // own current article title
    myHasFinished: boolean;
    otherPlayers: {
      userId: string;
      userName: string;
      clickCount: number;          // visible
      hasFinished: boolean;        // visible
      finishRank?: number;         // visible if finished
      // currentArticleTitle: HIDDEN
      // path: HIDDEN
    }[];
    results?: WRResults;           // only during RESULTS phase
    optimalPath?: string[];        // only during RESULTS phase
  }
  ```
- [ ] Other players' current article title is HIDDEN
- [ ] Other players' paths are HIDDEN until RESULTS
- [ ] Optimal path is HIDDEN until RESULTS
  **Verification:** Unit test: during NAVIGATION, confirm other players' `currentArticleTitle` and `path` are absent. During RESULTS, confirm `optimalPath` is present.

#### 5.4.6.9 `getStateForSpectator()`

- [ ] Same as player view PLUS:
  - [ ] `currentArticleTitle` visible for each player
  - [ ] Full `path` visible for each player
- [ ] Optimal path still hidden until RESULTS
  **Verification:** Spectator can see where each player currently is. Paths visible during NAVIGATION.

#### 5.4.6.10 `handleJoinInProgress(userId)`

- [ ] JIP policy: `spectate_only`
- [ ] Send spectator state
  **Verification:** JIP player cannot navigate. Sees all public progress.

#### 5.4.6.11 `handleReconnect(userId)`

- [ ] Send full state via `getStateForPlayer(userId)`
- [ ] Re-fetch current article HTML and send `WR_ARTICLE_CONTENT` to reconnected player
- [ ] Path and click count preserved
- [ ] Timer continues (no pause)
- [ ] If player had finished, they see finished state
  **Verification:** Reconnected player sees their path, current article HTML, and can continue navigating. Click count accurate.

#### 5.4.6.12 `handleDisconnect(userId)`

- [ ] Player's state preserved (path, clicks, current article)
- [ ] Player cannot navigate until reconnected
- [ ] At navigation end: scored as DNF with whatever state they had
  **Verification:** Disconnected player ends as DNF with their last path/clicks.

#### 5.4.6.13 `computeResults()` and Awards

- [ ] Final rankings by score (descending)
- [ ] Awards:
  - [ ] **Speed Runner** — first player to finish (finishRank = 1)
  - [ ] **Efficiency Expert** — fewest clicks among all finished players
  - [ ] **Tourist** — most clicks among all players (finished or DNF)
  - [ ] **Optimal Path** — matched or beat the optimal path length (`clickCount ≤ optimalPathLength`)
  - [ ] **Almost There** — was exactly 1 click away from target (target in `currentArticleLinks`) but didn't finish (DNF)
  **Verification:** Unit test: construct scenarios triggering each award; confirm all 5 assigned correctly.

#### 5.4.6.14 `buildGameLog()`

- [ ] Maintain an `actionLog: GameLogAction[]` array on the game instance
- [ ] Log `navigate` action on every article click (userId, fromArticle, toArticle, clickCount)
- [ ] Log `go_back` action when player uses back (userId, fromArticle, toArticle, backtrackCount)
- [ ] Log `player_finished` action when player reaches target (userId, clickCount, timeMs)
- [ ] Log `game_end` action with all players' final paths and completion status
- [ ] In `computeResults()`, build `GameLog` with `initialState` containing startArticle, targetArticle, optimalPathLength
- [ ] Return `GameLog` from `buildGameLog()`
  **Verification:** Unit test: simulate 3 players navigating, 2 finish, 1 DNF; verify log captures all navigation steps and completion events.

---

### 5.4.7 Register Game in Minigame Registry

- [ ] Add entry:
  ```ts
  {
    id: "wiki-race",
    name: "Wiki-Race",
    category: "trivia",
    icon: "globe",
    minPlayers: 2,
    maxPlayers: 10,
    estimatedDuration: 193,
    description: "Competitive scavenger hunt through Wikipedia. Navigate from start to target using only internal links!",
    handler: WikiRaceGame,
  }
  ```
  **Verification:** Registry lookup returns correct metadata. Handler instantiates with 4 players.

---

### 5.4.8 Build Client Components

#### 5.4.8.1 `components/rmhbox/wiki-race/WikiRaceGame.tsx`

- [ ] Phase router based on `phase`
- [ ] Subscribe to all `WR_*` and `TIMER_TICK` events
- [ ] Maintain local state: startArticle, targetArticle, phase, timeRemaining, myPath, myClickCount, myCurrentArticle, myHasFinished, otherPlayers, currentArticleHtml, currentLinkCount, results, optimalPath
- [ ] Handle `WR_ARTICLES_REVEALED` → show start and target articles with descriptions/thumbnails
- [ ] Handle `WR_ARTICLE_CONTENT` → update displayed article HTML
- [ ] Handle `WR_NAVIGATE_ERROR` → show error toast (invalid navigation or rate limited)
- [ ] Handle `WR_PLAYER_PROGRESS` → update other players' click counts
- [ ] Handle `WR_PLAYER_FINISHED` → show finish notification, update player status
- [ ] Handle `WR_RESULTS` → show results with optimal path
- [ ] Conditional rendering:
  - `ARTICLE_REVEAL` → `<ArticleReveal />`
  - `NAVIGATION` → `<WikiFrame />` + `<BreadcrumbTrail />` + `<PlayerProgressBar />`
  - `RESULTS` → `<WikiRaceResults />`
  **Verification:** Component renders for each phase. State transitions smooth. Error toasts display.

#### 5.4.8.2 `components/rmhbox/wiki-race/WikiFrame.tsx`

- [ ] Sandboxed container rendering sanitized Wikipedia HTML
- [ ] No iframe — render directly in a styled div with scoped CSS
- [ ] Internal wiki links (`data-wiki-target` attributes) are clickable
- [ ] Click handler on wiki links: emit `rmhbox:game:input` with `{ type: "NAVIGATE", targetTitle }`
- [ ] External links stripped (should not exist in sanitized HTML, but double-check in UI)
- [ ] Scrollable content area
- [ ] Loading state while fetching new article
- [ ] Disabled state after player finishes
- [ ] Responsive layout: readable on mobile
  **Verification:** Render sample Wikipedia HTML. Click an internal link → NAVIGATE event emitted. No external links in DOM. Scrolling works. Loading spinner shows during fetch.

#### 5.4.8.3 `components/rmhbox/wiki-race/BreadcrumbTrail.tsx`

- [ ] Horizontal scrollable trail of visited articles
- [ ] Each breadcrumb shows article title (truncated if long)
- [ ] Clicking a previous breadcrumb: emit `rmhbox:game:input` with `{ type: "GO_BACK", targetTitle, pathIndex }`
- [ ] Current article highlighted
- [ ] Click count display: "Clicks: N"
- [ ] Warning on back-navigation: "Going back costs a click"
  **Verification:** Trail shows correct path. Clicking previous breadcrumb emits GO_BACK. Current article visually distinct. Warning tooltip on hover.

#### 5.4.8.4 `components/rmhbox/wiki-race/ArticleReveal.tsx`

- [ ] Split-screen or sequential reveal of start and target articles
- [ ] Show title, description, and thumbnail for each
- [ ] Animated reveal (fade in, or card flip)
- [ ] Arrow or visual connector from start → target
- [ ] Countdown to navigation phase
  **Verification:** Both articles displayed with correct info. Animation plays. Countdown visible.

#### 5.4.8.5 `components/rmhbox/wiki-race/PlayerProgressBar.tsx`

- [ ] Sidebar or bottom bar showing all players' progress
- [ ] Each player: name, click count, finished indicator
- [ ] Finished players: show rank badge and time elapsed
- [ ] DNF players: show click count
- [ ] Current player highlighted
- [ ] No current article title shown for other players (masked)
  **Verification:** All players listed. Finished players show rank. Click counts update in real-time. No article titles leaked for other players.

#### 5.4.8.6 `components/rmhbox/wiki-race/WikiRaceResults.tsx`

- [ ] Final rankings: all players sorted by score
- [ ] Each entry: rank, player name, score breakdown (base + speed + efficiency), finish time or DNF status
- [ ] Optimal path display: sequence of article titles from start → target (revealed post-game)
- [ ] Player path comparison: each player's actual path shown alongside
- [ ] Click count and time comparison
- [ ] Awards display
  **Verification:** Rankings match scoring formula. Optimal path displayed. Player paths shown. Awards visible.

---

### 5.4.9 Integration Testing

- [ ] End-to-end test: 4 players, single round, at least 1 finisher
  - [ ] Verify article pair selection and reveal
  - [ ] Verify Wikipedia article fetching and sanitization
  - [ ] Verify internal links work (NAVIGATE event → new article)
  - [ ] Verify player reaches target → finish triggered
  - [ ] Verify scoring for finished and DNF players
  - [ ] Verify optimal path revealed in results
  **Verification:** All assertions pass. Game completes with correct scores.

- [ ] Anti-cheat test — invalid navigation:
  - [ ] Attempt to navigate to an article not linked from current page → `WR_NAVIGATE_ERROR` emitted
  - [ ] Inspect player's `currentArticleLinks` on server — target not present
  **Verification:** Invalid navigation rejected. No unauthorized article fetching.

- [ ] Anti-cheat test — rate limiting:
  - [ ] Send 5 NAVIGATE events in 1 second → first 3 accepted, last 2 rate-limited
  **Verification:** Rate limit message emitted for excess navigations.

- [ ] Information masking test:
  - [ ] During NAVIGATION: other players' `currentArticleTitle` NOT in WebSocket traffic to player
  - [ ] During NAVIGATION: other players' `path` NOT in WebSocket traffic to player
  - [ ] During RESULTS: `optimalPath` present
  - [ ] Spectator: can see all players' `currentArticleTitle` and `path`
  **Verification:** Inspect WebSocket frames; confirm masking for players and full visibility for spectators.

- [ ] Reconnection test: player disconnects at 5 clicks, reconnects → receives path, current article HTML, can continue
  **Verification:** Reconnected player sees correct path (5 articles), current article content, and can navigate.

- [ ] Back navigation test: player at ["A", "B", "C", "D"], goes back to "B" → path = ["A", "B"], clickCount increases by 1
  **Verification:** Path truncated correctly. Click count incremented. New article content sent.

- [ ] Caching test: two players navigate to same article → second fetch is cache hit
  **Verification:** Server logs show cache hit for second request. Response time significantly faster.

- [ ] All-finished early end: all players reach target before timeout → navigation phase ends early
  **Verification:** RESULTS phase starts immediately after last player finishes.

- [ ] External link stripping: sanitized HTML contains no `<a href="https://...">` links
  **Verification:** Parse sanitized HTML; confirm all `<a>` tags have `data-wiki-target` attributes, no external `href`.

---

## 5.5 Cross-Game Integration Testing

- [ ] **Minigame Registry:** verify all 4 games are registered with correct metadata
  - [ ] `rhyme-time`: word, 2–16 players, ~171s
  - [ ] `undercover-agent`: word, 4–16 players, ~180s
  - [ ] `category-crash`: word, 3–16 players, ~212s
  - [ ] `wiki-race`: trivia, 2–10 players, ~193s
  **Verification:** Registry lists all 4 games. Lookup by ID returns correct handler.

- [ ] **Random minigame selection:** with 4 players, random selection should be able to pick any of the 4 games (all meet 4-player minimum)
  **Verification:** Multiple random selections include all 4 games over sufficient iterations.

- [ ] **Player count filtering:** with 3 players, `undercover-agent` (min 4) should be excluded from selection
  **Verification:** With 3 players, only `rhyme-time`, `category-crash`, `wiki-race` are eligible.

- [ ] **Lifecycle integration:** each game follows the standard lifecycle from Phase 4:
  - [ ] `GAME_STARTING` → `GAME_IN_PROGRESS` → `GAME_COMPLETE`
  - [ ] Timer events use standardized `TIMER_TICK` format
  - [ ] Scores feed into lobby-level player scores
  - [ ] Awards stored in lobby-level awards system
  **Verification:** Run each game through full lifecycle; confirm state transitions match Phase 4 lifecycle.

- [ ] **Sequential game test:** play Rhyme Time → Undercover Agent → Category Crash → Wiki-Race in one lobby session
  - [ ] Verify cumulative scores persist across games
  - [ ] Verify awards accumulate
  - [ ] Verify no state leakage between games
  **Verification:** After 4 games, player scores are sum of individual game scores. Awards from all 4 games present. No stale state.

- [ ] **Concurrent lobby test:** two lobbies simultaneously running different minigames
  - [ ] Verify no cross-contamination of game state
  - [ ] Verify WebSocket events are scoped to correct rooms
  **Verification:** Each lobby's players only receive events from their game.

- [ ] **Spectator mode across all games:** verify spectators receive appropriate state for each game type
  **Verification:** Spectators see correct information (no more, no less) per game spec.

- [ ] **Disconnection/reconnection across all games:** verify reconnection restores correct state for each game
  **Verification:** Reconnected players resume correctly in all 4 games.

- [ ] **Game history integration:** verify `buildGameLog()` produces valid `GameLog` objects for each game
  - [ ] Rhyme Time: log contains `round_start`, `submission`, `round_end` actions
  - [ ] Undercover Agent: log contains `turn_start`, `clue_given`, `guess`, `tile_reveal`, `game_end` actions
  - [ ] Category Crash: log contains `round_start`, `answers_locked`, `crash`, `round_end` actions
  - [ ] Wiki-Race: log contains `navigate`, `go_back`, `player_finished`, `game_end` actions
  - [ ] Verify game log is passed to `persistMatchResults()` and stored in the `rmhbox_match.gameLog` column
  - [ ] Verify `GET /api/rmhbox/history?matchId=...` returns the game log in `MatchDetailResponse`
  **Verification:** All 4 games produce valid game logs. Logs persist and are retrievable via the history API.

---

> **Phase 5 Complete** when all checkboxes are checked and all verification steps pass. After Phase 5 is complete, Phases 6, 7, and 8 can be implemented **in parallel** — they share no inter-dependencies and each independently extends the patterns established here.
