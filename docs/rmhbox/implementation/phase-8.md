# Phase 8: Minigames Set 4 — Identity Crisis, Ranking File, Pixel Pushers, Scroll Soul

> **Depends on:** Phase 4 (Minigame Engine & Lifecycle), Phase 5 (first minigame set establishes implementation patterns: BaseMinigame extensions, registry registration, constants, Zod schemas, data pipelines, client components, and `buildGameLog()`)
>
> **Parallelizable with:** Phase 6, Phase 7 — after Phase 5 is complete, Phases 6, 7, and 8 can be implemented in parallel since they share no inter-dependencies. Each phase independently extends `BaseMinigame`, registers games in the shared registry, and follows the patterns established in Phase 5.
>
> This phase implements the fourth and final set of four minigames for RMHbox. Each game extends `BaseMinigame` from Phase 4 and integrates with the existing lobby, lifecycle, scoring, and award systems. Notable in this phase: Identity Crisis features complex per-player information masking (each player sees all identities except their own), Pixel Pushers includes a server-side 2D physics simulation with polarity mechanics, and Scroll Soul requires procedural level generation with a server-authoritative platformer physics loop.

---

## Table of Contents

1. [8.1 Identity Crisis](#81-identity-crisis)
2. [8.2 Ranking File](#82-ranking-file)
3. [8.3 Pixel Pushers](#83-pixel-pushers)
4. [8.4 Scroll Soul](#84-scroll-soul)
5. [8.5 Cross-Game Integration Testing](#85-cross-game-integration-testing)
6. [8.6 Game Settings Test Plan (§12A)](#86-game-settings-test-plan-12a)

---

## 8.1 Identity Crisis

**Game ID:** `identity-crisis` | **Category:** `social` | **Icon:** `user-question`
**Players:** 3–10 | **Duration:** ~180s (variable, depends on player count × questions per player)

---

### 8.1.1 Install NPM Packages

- [ ] Verify `fuse.js` is already installed (used for fuzzy identity guess matching)
  ```bash
  pnpm ls fuse.js
  ```
  — `fuse.js` should already be in the project from the core spec / earlier phases (used by Emoji Cinema in Phase 6 and Category Crash in Phase 5).
  **Verification:** `pnpm ls fuse.js` shows version listed. If missing: `pnpm add fuse.js`.

- [ ] No additional NPM packages required for Identity Crisis
  - Identity data is a static JSON file; fuzzy matching uses the existing `fuse.js`; turn logic and voting are pure server-side.
  **Verification:** Confirm no new dependencies needed beyond `fuse.js`.

---

### 8.1.2 Add Constants to `lib/rmhbox/constants.ts`

- [ ] Add `IC_QUESTIONS_PER_PLAYER = 3` — number of question turns each player gets
- [ ] Add `IC_ASK_SECONDS = 20` — seconds for the active player to type a question
- [ ] Add `IC_VOTE_SECONDS = 15` — seconds for other players to vote Yes/No/Maybe
- [ ] Add `IC_VOTE_RESULTS_SECONDS = 3` — seconds to display vote results
- [ ] Add `IC_ASSIGNMENT_REVEAL_SECONDS = 5` — seconds to show others' identities at game start
- [ ] Add `IC_FINAL_GUESS_SECONDS = 30` — seconds for the final guess phase
- [ ] Add `IC_RESULTS_SECONDS = 10` — seconds to display final results and identity reveals
- [ ] Add `IC_CORRECT_GUESS_POINTS = 200` — points for correctly guessing own identity in final phase
- [ ] Add `IC_EARLY_GUESS_BONUS_BASE = 300` — base points for a correct early guess (scaled by remaining questions)
- [ ] Add `IC_EARLY_GUESS_PENALTY = -100` — points deducted for an incorrect early guess
- [ ] Add `IC_EFFICIENCY_BONUS = 20` — bonus points per unused question slot (rewarding early correct guess)
- [ ] Add `IC_VOTING_ACCURACY_BONUS = 5` — points per vote that matched the "true" answer for others' questions
- [ ] Add `IC_GUESS_MATCH_THRESHOLD = 0.3` — fuse.js threshold for forgiving guess matching (lower = more forgiving)
- [ ] Add `IC_MAX_QUESTION_LENGTH = 200` — maximum character length for a question
- [ ] Add `IC_MAX_GUESS_LENGTH = 100` — maximum character length for a guess
- [ ] **Verification:** Import all `IC_*` constants in a test file; confirm no undefined values and correct types (`number` or `string`). Verify `IC_GUESS_MATCH_THRESHOLD` is between 0 and 1.

---

### 8.1.3 Create Static Data Files

- [ ] Create directory `public/data/rmhbox/identity-crisis/`
  **Verification:** Directory exists on disk.

- [ ] Create `public/data/rmhbox/identity-crisis/identities.json` — curated identity pool
  - Each entry follows the `Identity` interface:
    ```ts
    {
      id: string;                     // unique identifier, e.g., "albert-einstein"
      name: string;                   // display name, e.g., "Albert Einstein"
      category: string;               // e.g., "Scientist", "Musician", "Fictional", "Historical", "Actor", "Athlete"
      difficulty: "easy" | "medium" | "hard";
      hints: string[];                // backup hints if game stalls (optional, min 0, max 3)
    }
    ```
  - [ ] Include at least 80 identities total
  - [ ] Balanced difficulty distribution: ≥25 easy, ≥30 medium, ≥20 hard
  - [ ] At least 8 distinct categories represented
  - [ ] No duplicate `id` values
  - [ ] All identities should be widely recognizable (no extremely obscure figures)
  - [ ] Easy: universally known (e.g., "Albert Einstein", "Mickey Mouse")
  - [ ] Medium: well-known but requires some cultural knowledge (e.g., "Cleopatra", "Beethoven")
  - [ ] Hard: recognizable but may require specific domain knowledge (e.g., "Ada Lovelace", "Nikola Tesla")
  **Verification:** Parse JSON; validate every entry against schema; confirm ≥80 entries; confirm ≥8 unique categories; confirm no duplicate `id`; confirm difficulty distribution meets minimums.

---

### 8.1.4 Define Zod Validation Schemas

- [ ] Create `lib/rmhbox/identity-crisis/schemas.ts`

- [ ] Define `ICQuestionSchema`:
  ```ts
  const ICQuestionSchema = z.object({
    question: z.string().min(3).max(IC_MAX_QUESTION_LENGTH).trim(),
  });
  ```
  **Verification:** Valid: `{ question: "Am I a real person?" }`, `{ question: "Do I play sports?" }`. Invalid: `{ question: "Hi" }` (too short), `{ question: "" }` (empty), string > 200 chars.

- [ ] Define `ICVoteSchema`:
  ```ts
  const ICVoteSchema = z.object({
    vote: z.enum(['yes', 'no', 'maybe']),
  });
  ```
  **Verification:** Valid: `{ vote: "yes" }`, `{ vote: "no" }`, `{ vote: "maybe" }`. Invalid: `{ vote: "perhaps" }`, `{ vote: 1 }`.

- [ ] Define `ICGuessSchema`:
  ```ts
  const ICGuessSchema = z.object({
    guess: z.string().min(1).max(IC_MAX_GUESS_LENGTH).trim(),
  });
  ```
  **Verification:** Valid: `{ guess: "Einstein" }`, `{ guess: "Albert Einstein" }`. Invalid: `{ guess: "" }`.

- [ ] Define `IdentityDataSchema` for server-side data validation at startup:
  ```ts
  const IdentitySchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: z.string().min(1),
    difficulty: z.enum(["easy", "medium", "hard"]),
    hints: z.array(z.string()).max(3).default([]),
  });
  ```
  **Verification:** Validate all entries in `identities.json` against this schema at server startup.

---

### 8.1.5 Create Data Loader

- [ ] Create `lib/rmhbox/identity-crisis/identity-loader.ts`
  - [ ] Export `loadIdentities(): Identity[]` — reads and parses `identities.json` once at server init
  - [ ] Validate each identity against `IdentitySchema` during load; skip invalid entries with a warning log
  - [ ] Cache in module-level variable (singleton pattern)
  - [ ] Export `selectIdentitiesForGame(pool: Identity[], playerCount: number, usedIds: Set<string>, sessionRound: number): Identity[]`
    - Select `playerCount` identities from the pool without replacement
    - Exclude identities with IDs in `usedIds` (prevents repeats within a lobby session)
    - Difficulty escalation: `sessionRound === 0` → prefer `easy` difficulty; `sessionRound >= 1` → mix of `easy`/`medium`; `sessionRound >= 3` → include `hard`
    - Category diversity: avoid assigning multiple identities from the same category (shuffle and pick across categories when possible). Algorithm: group pool by category → round-robin pick one from each category until `playerCount` is met
    - Return an array of `playerCount` identities, shuffled
  **Verification:** Unit test: `loadIdentities()` returns cached reference on repeated calls. `selectIdentitiesForGame()` with 5 players → 5 unique identities, no duplicate categories if pool allows. With `sessionRound=0` → all easy or mostly easy. With used IDs → those IDs excluded. With `playerCount=10` and 8 categories → at most 2 from same category.

---

### 8.1.6 Implement Server Handler

- [ ] Create `server/rmhbox/minigames/identity-crisis.ts`

#### 8.1.6.1 Type Definitions

- [ ] Define `ICPhase` type:
  ```ts
  type ICPhase = 'ASSIGNMENT_REVEAL' | 'ASK' | 'VOTE' | 'VOTE_RESULTS' | 'FINAL_GUESS' | 'RESULTS';
  ```
  **Verification:** Type has exactly 6 values matching spec §1.4.

- [ ] Define `ICQuestion` type:
  ```ts
  type ICQuestion = {
    askerId: string;
    askerName: string;
    questionText: string;
    roundNumber: number;
    voteResult: { yes: number; no: number; maybe: number } | null;
    majorityAnswer: 'yes' | 'no' | 'maybe' | null;
    trueAnswer: 'yes' | 'no' | 'maybe';
  };
  ```

- [ ] Define `ICVote` type:
  ```ts
  type ICVote = 'yes' | 'no' | 'maybe';
  ```

- [ ] Define `ICGuessResult` type:
  ```ts
  type ICGuessResult = {
    userId: string;
    guess: string;
    correct: boolean;
    matchScore: number;
    roundGuessed: number;
  };
  ```

- [ ] Define `IdentityCrisisState` type:
  ```ts
  type IdentityCrisisState = {
    phase: ICPhase;
    identityAssignments: Map<string, Identity>;
    questionOrder: string[];
    currentQuestionRound: number;
    questionsAsked: ICQuestion[];
    questionsPerPlayer: Map<string, number>;
    maxQuestionsPerPlayer: number;
    currentVotes: Map<string, ICVote> | null;
    earlyGuesses: Map<string, ICGuessResult>;
    finalGuesses: Map<string, ICGuessResult>;
    eliminatedFromQuestions: Set<string>;
    phaseStartedAt: number;
    phaseEndsAt: number;
    playerScores: Map<string, number>;
    currentAskerId: string | null;
    currentQuestionText: string | null;
    totalQuestionRounds: number;
  };
  ```
  **Verification:** All types compile without errors. Cross-reference every field against design spec §1.4.

#### 8.1.6.2 Class: `IdentityCrisisGame extends BaseMinigame`

- [ ] Constructor: call `super(context)`; load identity pool via identity loader
  **Verification:** Instantiate class; confirm no errors and identity pool is loaded.

#### 8.1.6.3 State Initialization (`start()`)

- [ ] Retrieve `usedIdentityIds` from the lobby's session context (prevents repeats across games in same lobby)
- [ ] Call `selectIdentitiesForGame()` with pool, player count, exclusion set, and session round number
- [ ] Create `identityAssignments` map: assign one identity to each player (randomized)
- [ ] Add used identity IDs to lobby session context for future games
- [ ] Generate `questionOrder`: randomize the order of player IDs for turn-taking
- [ ] Compute `totalQuestionRounds = playerCount × IC_QUESTIONS_PER_PLAYER`
- [ ] Initialize `questionsPerPlayer` map: every player starts at 0 questions asked
- [ ] Initialize `playerScores` map: every player starts at 0
- [ ] Initialize empty maps: `currentVotes`, `earlyGuesses`, `finalGuesses`
- [ ] Initialize empty set: `eliminatedFromQuestions`
- [ ] Initialize empty array: `questionsAsked`
- [ ] Set `currentQuestionRound = 0`
- [ ] Set `maxQuestionsPerPlayer = IC_QUESTIONS_PER_PLAYER`
- [ ] Call `startAssignmentReveal()`
  **Verification:** Unit test with 5 players: 5 unique identities assigned, question order contains 5 player IDs, totalQuestionRounds = 15, all scores = 0, all question counts = 0.

#### 8.1.6.4 Assignment Reveal Phase

- [ ] `startAssignmentReveal()`:
  - Set `phase = 'ASSIGNMENT_REVEAL'`
  - Set `phaseStartedAt = Date.now()`
  - Set `phaseEndsAt = phaseStartedAt + IC_ASSIGNMENT_REVEAL_SECONDS * 1000`
  - For EACH player individually, emit `rmhbox:game:action` with type `IC_IDENTITIES_REVEAL`:
    ```ts
    {
      otherPlayers: Array<{ userId: string; userName: string; identity: string }>
    }
    ```
    - **CRITICAL:** The `otherPlayers` array must EXCLUDE the receiving player's own identity
    - For player A: send identities of players B, C, D, E — NOT A's identity
    - For player B: send identities of players A, C, D, E — NOT B's identity
    - Each player sees N-1 identities (everyone except themselves)
  - For spectators: emit with ALL identities (spectators have god view)
  - Schedule `startNextQuestionTurn()` after `IC_ASSIGNMENT_REVEAL_SECONDS`
  **Verification:** Unit test with 4 players: Player A's payload has 3 entries, none with A's userId. Player B's payload has 3 entries, none with B's userId. Spectator payload has all 4 entries.

#### 8.1.6.5 Question Turn Lifecycle

- [ ] `startNextQuestionTurn()`:
  - Increment `currentQuestionRound`
  - If `currentQuestionRound > totalQuestionRounds`, call `startFinalGuessPhase()`; return
  - Determine current asker: `currentAskerId = questionOrder[(currentQuestionRound - 1) % questionOrder.length]`
  - If current asker is in `eliminatedFromQuestions` (wrong early guess), skip to next turn:
    - Recursively call `startNextQuestionTurn()`; return
  - Check `questionsPerPlayer.get(currentAskerId)`: if >= `IC_QUESTIONS_PER_PLAYER`, skip this player (all questions used)
    - Find next eligible asker by advancing through `questionOrder`
    - If no eligible askers remain, call `startFinalGuessPhase()`; return
  - Set `phase = 'ASK'`
  - Set `currentQuestionText = null`
  - Set `phaseStartedAt = Date.now()`
  - Set `phaseEndsAt = phaseStartedAt + IC_ASK_SECONDS * 1000`
  - Emit `rmhbox:game:action` with type `IC_TURN_START` to ALL EXCEPT the asker:
    ```ts
    {
      askerId: string;
      askerName: string;
      askerIdentity: string;       // the asker's ACTUAL identity (so voters know the truth)
      questionNumber: questionsPerPlayer.get(askerId) + 1;
      totalQuestions: IC_QUESTIONS_PER_PLAYER;
      askDurationSeconds: IC_ASK_SECONDS;
    }
    ```
  - Emit `rmhbox:game:action` with type `IC_TURN_START_SELF` to the asker ONLY:
    ```ts
    {
      questionNumber: questionsPerPlayer.get(askerId) + 1;
      totalQuestions: IC_QUESTIONS_PER_PLAYER;
      askDurationSeconds: IC_ASK_SECONDS;
    }
    ```
    - **CRITICAL:** This event has NO identity information. The asker must NOT know who they are.
  - Start `TIMER_TICK` interval (1s)
  - Schedule `handleAskTimeout()` after `IC_ASK_SECONDS`
  **Verification:** Unit test: when player A is asker — A receives `IC_TURN_START_SELF` with NO identity; others receive `IC_TURN_START` with A's identity. Timer starts. Skip logic works for eliminated players.

- [ ] `handleAskTimeout()`:
  - If `currentQuestionText` is still null (player didn't submit a question):
    - Player's turn is skipped — they lose this question opportunity
    - The `questionsPerPlayer` count is NOT incremented (preserving their remaining questions from design spec: "If a player doesn't ask a question (timeout): Their turn is skipped. They still have their remaining turns.")
    - Note: Keeping behavior consistent — a skipped question means the total rounds still advance, but the player retains unused question slots
  - Call `startNextQuestionTurn()`
  **Verification:** Unit test: player times out → turn skipped, question count unchanged. Next turn begins.

#### 8.1.6.6 Input Handling — `IC_ASK_QUESTION`

- [ ] Validate phase is `'ASK'`; reject if not
- [ ] Validate sender is `currentAskerId`; reject if someone else tries to ask
- [ ] Parse input through `ICQuestionSchema`; reject on validation failure
- [ ] Check player hasn't already submitted a question this turn (idempotency guard)
- [ ] Store question text: `currentQuestionText = question`
- [ ] Increment `questionsPerPlayer` for the asker
- [ ] Cancel the ask timeout timer
- [ ] Emit `rmhbox:game:action` with type `IC_QUESTION_ASKED` to ALL lobby:
  ```ts
  {
    question: string;
    askerId: string;
    askerName: string;
  }
  ```
- [ ] Call `startVotePhase()`
  **Verification:** Unit test: valid question from asker → stored, event emitted, vote phase starts. Question from non-asker → rejected. Duplicate question submission → rejected. Question too short → rejected.

#### 8.1.6.7 Vote Phase

- [ ] `startVotePhase()`:
  - Set `phase = 'VOTE'`
  - Initialize `currentVotes = new Map()` (empty)
  - Set `phaseStartedAt = Date.now()`
  - Set `phaseEndsAt = phaseStartedAt + IC_VOTE_SECONDS * 1000`
  - Start `TIMER_TICK` interval (1s)
  - Schedule `endVotePhase()` after `IC_VOTE_SECONDS`
  **Verification:** Phase transitions to VOTE. Timer starts. Empty votes map initialized.

#### 8.1.6.8 Input Handling — `IC_VOTE`

- [ ] Validate phase is `'VOTE'`; reject if not
- [ ] Validate sender is NOT the current asker (askers cannot vote on their own question); reject if asker
- [ ] Validate sender is a player (not spectator); reject if spectator
- [ ] Parse input through `ICVoteSchema`; reject on validation failure
- [ ] Check player hasn't already voted this round; reject if duplicate
- [ ] Store vote: `currentVotes.set(userId, vote)`
- [ ] Compute total eligible voters: `connectedPlayers.length - 1` (excluding asker)
- [ ] Emit `rmhbox:game:action` with type `IC_VOTE_RECEIVED` to ALL lobby:
  ```ts
  {
    votesReceived: currentVotes.size;
    totalVoters: eligibleVoterCount;
  }
  ```
  - **Note:** Do NOT include who voted or what they voted — votes are anonymous
- [ ] If all eligible voters have voted, cancel the vote timeout and call `endVotePhase()` immediately
  **Verification:** Unit test: vote from non-asker → stored, count emitted. Vote from asker → rejected. Duplicate vote → rejected. All voters done → early phase end.

#### 8.1.6.9 Vote Results

- [ ] `endVotePhase()`:
  - Stop timer tick interval
  - Compute vote tallies: count `yes`, `no`, `maybe` across all votes in `currentVotes`
  - Determine `majorityAnswer`: the vote with the highest count; if tied, pick the first in priority order: `yes > no > maybe`
  - Build `ICQuestion` object:
    ```ts
    {
      askerId: currentAskerId,
      askerName: ...,
      questionText: currentQuestionText,
      roundNumber: currentQuestionRound,
      voteResult: { yes, no, maybe },
      majorityAnswer,
      trueAnswer: 'yes' | 'no' | 'maybe',    // determined retroactively at game end
    }
    ```
    - Note: `trueAnswer` is set to `'maybe'` as placeholder now; will be evaluated retroactively during `computeResults()` by a human-impossible automatic judge. For the implementation, leave `trueAnswer` as `'maybe'` during gameplay and compute it at results time if feasible, or skip retroactive true-answer evaluation and only use vote majority for scoring.
    - **Design decision:** Since automatically determining the "true" answer to an arbitrary yes/no question about a famous person is not feasible without an AI/LLM integration, the `trueAnswer` field and `IC_VOTING_ACCURACY_BONUS` scoring should use the majority vote as the "truth proxy." The bonus rewards voting with the consensus.
  - Append to `questionsAsked` array
  - Set `phase = 'VOTE_RESULTS'`
  - Emit `rmhbox:game:action` with type `IC_VOTE_RESULTS` to ALL lobby:
    ```ts
    {
      question: currentQuestionText;
      votes: { yes: number; no: number; maybe: number };
      majorityAnswer: 'yes' | 'no' | 'maybe';
    }
    ```
    - **Note:** Individual vote attribution is HIDDEN — players don't see who voted what
  - Schedule `afterVoteResults()` after `IC_VOTE_RESULTS_SECONDS`
  **Verification:** Unit test: 4 voters → 3 yes, 1 no → majorityAnswer = 'yes'. Tie (2 yes, 2 no) → 'yes' wins (priority). Results event emitted without individual attribution. Question stored in history.

- [ ] `afterVoteResults()`:
  - Call `startNextQuestionTurn()`
  **Verification:** Next turn begins after vote results display.

#### 8.1.6.10 Input Handling — `IC_EARLY_GUESS`

- [ ] Validate sender is a player and NOT in `eliminatedFromQuestions`; reject if eliminated
- [ ] Validate phase is NOT `'VOTE'` and NOT `'ASK'` (early guesses are allowed between turns — during `VOTE_RESULTS`, `ASSIGNMENT_REVEAL', or transition moments); reject if in restricted phase
  - **Refinement:** Allow early guesses during `VOTE_RESULTS` phase (the brief 3s window between vote result display and next turn). Also allow during `ASSIGNMENT_REVEAL` if a player is very confident.
- [ ] Parse input through `ICGuessSchema`; reject on validation failure
- [ ] Check player hasn't already made an early guess; reject if they have (one chance only)
- [ ] Use `fuse.js` to match guess against the player's ACTUAL identity:
  - Create Fuse instance with `[identityAssignments.get(userId)]` and options:
    ```ts
    { keys: ['name'], threshold: IC_GUESS_MATCH_THRESHOLD, ignoreLocation: true, isCaseSensitive: false }
    ```
  - If match found with score ≤ threshold → **correct**
  - Otherwise → **incorrect**
- [ ] Compute `matchScore` from fuse result
- [ ] Store `ICGuessResult` in `earlyGuesses` map
- [ ] Emit `rmhbox:game:action` with type `IC_EARLY_GUESS_ATTEMPT` to ALL lobby:
  ```ts
  { userId: string; userName: string }
  ```
  - Do NOT include the guess text in this broadcast
- [ ] If **correct**:
  - Compute bonus: `IC_EARLY_GUESS_BONUS_BASE × (questionsRemaining / totalQuestionRounds)` where `questionsRemaining = totalQuestionRounds - currentQuestionRound`
  - Add to player's score: `IC_CORRECT_GUESS_POINTS + bonus`
  - Compute efficiency bonus: `IC_EFFICIENCY_BONUS × unusedQuestionSlots` where `unusedQuestionSlots = IC_QUESTIONS_PER_PLAYER - questionsPerPlayer.get(userId)`
  - Add efficiency bonus to score
  - Emit `IC_EARLY_GUESS_CORRECT` to ALL lobby:
    ```ts
    {
      userId: string;
      userName: string;
      identity: string;
      questionsRemaining: number;
      bonusPoints: number;
    }
    ```
  - Add player to `eliminatedFromQuestions` (they've guessed correctly — no more question turns needed)
- [ ] If **incorrect**:
  - Apply penalty: add `IC_EARLY_GUESS_PENALTY` to player's score (can go negative)
  - Add player to `eliminatedFromQuestions` (wrong guess → eliminated from asking further questions)
  - Emit `IC_EARLY_GUESS_RESULT` to ALL lobby:
    ```ts
    {
      userId: string;
      userName: string;
      correct: false;
    }
    ```
    - Do NOT reveal the player's identity on a wrong guess
  **Verification:** Unit test: correct guess → bonus points calculated, player eliminated from questions, correct event emitted with identity. Incorrect guess → penalty applied, player eliminated, event emitted WITHOUT identity. Already guessed → rejected. During VOTE phase → rejected.

#### 8.1.6.11 Final Guess Phase

- [ ] `startFinalGuessPhase()`:
  - Set `phase = 'FINAL_GUESS'`
  - Set `phaseStartedAt = Date.now()`
  - Set `phaseEndsAt = phaseStartedAt + IC_FINAL_GUESS_SECONDS * 1000`
  - Emit `rmhbox:game:action` with type `IC_FINAL_GUESS_PHASE` to ALL lobby:
    ```ts
    { durationSeconds: IC_FINAL_GUESS_SECONDS }
    ```
  - Start `TIMER_TICK` interval (1s)
  - Schedule `endFinalGuessPhase()` after `IC_FINAL_GUESS_SECONDS`
  **Verification:** Phase transitions. Event emitted. Timer starts.

#### 8.1.6.12 Input Handling — `IC_FINAL_GUESS`

- [ ] Validate phase is `'FINAL_GUESS'`; reject if not
- [ ] Validate sender is a player; reject if spectator
- [ ] Parse input through `ICGuessSchema`; reject on validation failure
- [ ] Check player hasn't already submitted a final guess; reject if duplicate
- [ ] Check player hasn't already guessed correctly via early guess; reject if so (they're done)
- [ ] Use `fuse.js` to match guess against the player's identity (same logic as early guess)
- [ ] Store `ICGuessResult` in `finalGuesses` map with `roundGuessed = -1` (indicates final phase)
- [ ] If correct: add `IC_CORRECT_GUESS_POINTS` to player's score (no early bonus)
- [ ] If incorrect: no additional penalty (just no points)
- [ ] If all eligible players have submitted final guesses, cancel timeout and call `endFinalGuessPhase()` immediately
  **Verification:** Unit test: correct final guess → 200 points. Incorrect → 0 penalty. Already guessed early correctly → rejected. All submitted → early phase end.

- [ ] `endFinalGuessPhase()`:
  - Stop timer
  - Players who didn't submit a final guess and haven't guessed correctly → scored as incorrect (no points)
  - Call `computeResults()`
  **Verification:** Non-submitters handled. Results computation triggered.

#### 8.1.6.13 `computeResults()` and Awards

- [ ] Compute voting accuracy bonus for each player:
  - For each question in `questionsAsked`:
    - The "truth" for voting accuracy: use the `majorityAnswer` as the consensus truth (see design decision in §8.1.6.9)
    - For each voter (player who voted on this question, i.e., not the asker):
      - If their vote matches `majorityAnswer`: add `IC_VOTING_ACCURACY_BONUS` to their score
  - This rewards players who engaged with others' questions and voted thoughtfully

- [ ] Build `ICReveal[]` array for each player:
  ```ts
  {
    userId: string;
    userName: string;
    identity: string;
    guessedCorrectly: boolean;
    guess: string | null;
    questionsAsked: number;
    wasEarlyGuesser: boolean;
  }
  ```

- [ ] Compute final rankings by `playerScores` (descending)

- [ ] Build `ICFinalRanking[]`:
  ```ts
  {
    userId: string;
    userName: string;
    totalScore: number;
    rank: number;
    guessedCorrectly: boolean;
    questionsUsed: number;
    votingAccuracyPct: number;    // percentage of votes matching majority
  }
  ```

- [ ] Compute awards:
  - [ ] **Self-Aware** — guessed correctly first (earliest `roundGuessed` for correct guess); icon: `eye`
  - [ ] **Master of Disguise** — last person to guess correctly, OR didn't guess correctly at all; icon: `ghost`
  - [ ] **Philosopher** — asked the most "decisive" questions (questions with the highest yes/no consensus — least "Maybe" votes as a percentage); icon: `brain`
  - [ ] **Crowd Pleaser** — highest voting accuracy percentage (most votes matching majority answer); icon: `check-circle`
  - [ ] **Bold Move** — made an early guess (regardless of outcome); icon: `zap`

- [ ] Set `phase = 'RESULTS'`
- [ ] Emit `rmhbox:game:action` with type `IC_RESULTS` to ALL lobby:
  ```ts
  {
    reveals: ICReveal[];
    finalRankings: ICFinalRanking[];
  }
  ```
  - **Note:** Now ALL identities are revealed to ALL players including their own
- [ ] Return `MinigameResults` with rankings, awards, and `gameSpecificData` containing `questionsAsked`, `reveals`
  **Verification:** Unit test: player with correct early guess at round 2 → highest score. Player with correct final guess → 200 pts. Voting accuracy bonus computed correctly. Awards assigned to correct players. All identities revealed in results.

#### 8.1.6.14 `buildGameLog()`

- [ ] Maintain an `actionLog: GameLogAction[]` array on the game instance
- [ ] Build `GameLog` conforming to core.md §13.3, including `gameSettings` per §12A.11

**`initialState` (from minigames-4.md §1.14):**

```typescript
interface ICGameHistoryInit {
  identityPool: string;
  identityAssignments: Array<{
    userId: string;
    assignedIdentity: string;
  }>;
  questionOrder: string[];
  maxQuestionsPerPlayer: number;
  gameSettings: GameSettingValues;
}
```

**Actions Logged:**

| Action Type | Payload | Recorded When |
|---|---|---|
| `question_asked` | `{ askerId: string; questionText: string; roundNumber: number }` | Player submits a question |
| `vote_cast` | `{ voterId: string; vote: 'yes' \| 'no' \| 'maybe' }` | Each player votes on current question |
| `vote_result` | `{ yes: number; no: number; maybe: number; majorityAnswer: string }` | Voting phase closes |
| `early_guess` | `{ userId: string; guess: string; correct: boolean; matchScore: number; roundNumber: number }` | Player attempts an early guess |
| `final_guess` | `{ userId: string; guess: string; correct: boolean; matchScore: number }` | Player submits final guess |
| `identity_reveal` | `{ userId: string; assignedIdentity: string; guessedCorrectly: boolean }` | Results phase reveals all identities |

- [ ] In `computeResults()`, build `GameLog` with `initialState`, full action log, and `finalResults`
- [ ] Return `GameLog` from `buildGameLog()`

**Verification:** Unit test: 5-player game, 15 question rounds, verify `question_asked`/`vote_result` per round, early and final guesses, `identity_reveal` for each player, `initialState` has identity assignments and question order.

---

### 8.1.7 `getStateForPlayer(userId)`

- [ ] During `ASSIGNMENT_REVEAL`:
  ```ts
  {
    phase: 'ASSIGNMENT_REVEAL';
    otherPlayersIdentities: Array<{ userId: string; userName: string; identity: string }>;
    // Own identity NEVER included
    timeRemaining: number;
  }
  ```

- [ ] During `ASK` (if userId === currentAskerId):
  ```ts
  {
    phase: 'ASK';
    isMyTurn: true;
    questionNumber: number;
    totalQuestions: number;
    timeRemaining: number;
    otherPlayersIdentities: Array<{ userId: string; userName: string; identity: string }>;
    questionHistory: Array<{ question: string; askerName: string; result: { yes: number; no: number; maybe: number } }>;
    myQuestionsRemaining: number;
    canEarlyGuess: boolean;        // true if not already guessed and not eliminated
  }
  ```
  - **CRITICAL:** No `askerIdentity` field — the asker must NOT know their own identity

- [ ] During `ASK` (if userId !== currentAskerId):
  ```ts
  {
    phase: 'ASK';
    isMyTurn: false;
    askerId: string;
    askerName: string;
    askerIdentity: string;          // the asker's identity (so voter knows the truth)
    questionNumber: number;
    totalQuestions: number;
    timeRemaining: number;
    otherPlayersIdentities: Array<{ userId: string; userName: string; identity: string }>;
    questionHistory: ...;
    myQuestionsRemaining: number;
    canEarlyGuess: boolean;
  }
  ```

- [ ] During `VOTE`:
  ```ts
  {
    phase: 'VOTE';
    currentQuestion: { text: string; askerId: string; askerName: string };
    askerIdentity: string;          // ONLY included if userId !== askerId
    myVote: ICVote | null;
    votesReceived: number;
    totalVoters: number;
    timeRemaining: number;
    questionHistory: ...;
    myQuestionsRemaining: number;
    otherPlayersIdentities: Array<{ userId: string; userName: string; identity: string }>;
  }
  ```
  - **CRITICAL:** `askerIdentity` is ONLY sent if the requesting player is NOT the asker

- [ ] During `VOTE_RESULTS`:
  ```ts
  {
    phase: 'VOTE_RESULTS';
    question: string;
    votes: { yes: number; no: number; maybe: number };
    majorityAnswer: string;
    questionHistory: ...;
    canEarlyGuess: boolean;
  }
  ```

- [ ] During `FINAL_GUESS`:
  ```ts
  {
    phase: 'FINAL_GUESS';
    timeRemaining: number;
    hasSubmittedGuess: boolean;
    otherPlayersIdentities: ...;
    questionHistory: ...;
  }
  ```

- [ ] During `RESULTS`: full reveals and rankings (all identities visible including own)

- [ ] **CRITICAL MASKING RULE:** In EVERY phase except `RESULTS`, the player's OWN identity must NEVER appear in any field of the returned state. The `otherPlayersIdentities` array always excludes the receiving player. This is the core mechanic of the entire game.
  **Verification:** Security test: for each player in each phase, iterate through all fields of the returned state object — assert own identity string does NOT appear anywhere. Test with string search, not just field-level check (in case identity leaks through nested objects or combined strings).

---

### 8.1.8 `getStateForSpectator()`

- [ ] Returns full omniscient state including:
  - ALL players' identities (including each player's own — spectator sees who everyone is)
  - All votes with individual attribution (who voted what)
  - All guess texts (including early guesses)
  - Current phase, question, timer
  - Full question history
  - All scores
  **Verification:** Spectator state includes all identities. No masking applied.

---

### 8.1.9 Join-in-Progress Handling

- [ ] Policy: `spectate_only`
- [ ] Identities are assigned at game start and question order is pre-determined
- [ ] A late joiner would not have an identity and would disrupt the turn order
- [ ] Send spectator state on join (full god view)
  **Verification:** Unit test: JIP → spectator role assigned, receives full state, cannot send game inputs.

---

### 8.1.10 Reconnection Handling (`handlePlayerReconnect(userId)`)

- [ ] Send full state via `getStateForPlayer(userId)`:
  - All other players' identities (NOT own)
  - Question history with vote results
  - Remaining question count for this player
  - Current phase and timer
- [ ] If it was their turn to ask and ASK timer is still active: they can submit a question
- [ ] If VOTE phase is active and they haven't voted: they can still vote
- [ ] Identity is preserved — they NEVER see their own
- [ ] If eliminated from questions (wrong early guess): reconnect state reflects elimination
  **Verification:** Unit test: disconnect during ASK (their turn) → reconnect → can submit question. Disconnect during VOTE → reconnect → can vote. Own identity never in reconnect state.

---

### 8.1.11 Disconnect Handling (`handlePlayerDisconnect(userId)`)

- [ ] If ASK phase and disconnected player is the asker: their turn will timeout (skip)
- [ ] If VOTE phase and disconnected player hasn't voted: they'll be excluded from total voter count check; if all remaining connected voters have voted, phase ends early
- [ ] If FINAL_GUESS phase and disconnected player hasn't guessed: treated as no guess (0 points)
- [ ] No special cleanup — identity preserved, turn order intact
  **Verification:** Unit test: asker disconnects during ASK → timeout → turn skipped. Voter disconnects → remaining voters checked for completion.

---

### 8.1.12 Register Game in Minigame Registry

- [ ] Add entry to `lib/rmhbox/minigame-registry.ts`:
  ```ts
  {
    id: "identity-crisis",
    displayName: "Identity Crisis",
    description: "Everyone knows who you are... except you! Ask yes/no questions and piece together your secret identity. Guess early for bonus points, but get it wrong and you're out!",
    category: "social",
    icon: "user-question",
    minPlayers: 3,
    maxPlayers: 10,
    estimatedDurationSeconds: 180,
    supportsTeams: false,
    instructionDurationSeconds: 15,
    preloadAssets: {
      images: [],
      sounds: [],
      data: ["/data/rmhbox/identity-crisis/identities.json"],
      estimatedSizeBytes: 15000,
    },
    joinInProgressPolicy: "spectate_only",
    tags: ["social", "deduction", "competitive", "knowledge"],
  }
  ```
  **Verification:** Call registry lookup for `"identity-crisis"`; confirm all metadata fields correct and handler instantiates with valid context.

- [ ] Add server handler to `MINIGAME_SERVER_REGISTRY` in `server/rmhbox/minigame-server-registry.ts`:
  ```ts
  import { IdentityCrisisGame } from './minigames/identity-crisis';
  MINIGAME_SERVER_REGISTRY.set('identity-crisis', IdentityCrisisGame);
  ```
  **Verification:** `MINIGAME_SERVER_REGISTRY.get('identity-crisis')` returns `IdentityCrisisGame` class.

- [ ] Add lazy-loaded component to `MinigameRenderer` map in `components/rmhbox/MinigameRenderer.tsx`:
  ```ts
  'identity-crisis': lazy(() => import('./minigames/identity-crisis/IdentityCrisisGame'))
  ```
  **Verification:** `MinigameRenderer` renders `<Suspense>` fallback, then loads `IdentityCrisisGame` chunk on demand.

---

### 8.1.13 Build Client Components

#### 8.1.13.1 `components/rmhbox/minigames/identity-crisis/IdentityCrisisGame.tsx`

- [ ] Phase router component — renders appropriate sub-component based on `phase`
- [ ] Subscribe to all `IC_*` and `TIMER_TICK` WebSocket events via `useRMHboxStore`
- [ ] Maintain local state:
  - `phase`, `otherPlayersIdentities[]`, `isMyTurn`, `currentAskerId`, `askerIdentity`
  - `currentQuestion`, `myVote`, `votesReceived`, `totalVoters`
  - `questionHistory[]`, `myQuestionsRemaining`, `canEarlyGuess`
  - `timeRemaining`, `scores[]`
- [ ] Handle `IC_IDENTITIES_REVEAL` → populate other players' identity cards
- [ ] Handle `IC_TURN_START` → set asker info with identity (for voters)
- [ ] Handle `IC_TURN_START_SELF` → set isMyTurn with NO identity info
- [ ] Handle `IC_QUESTION_ASKED` → show question, transition to vote UI
- [ ] Handle `IC_VOTE_RECEIVED` → update vote progress counter
- [ ] Handle `IC_VOTE_RESULTS` → display vote breakdown
- [ ] Handle `IC_EARLY_GUESS_ATTEMPT` → show guess animation
- [ ] Handle `IC_EARLY_GUESS_RESULT` → show result (no identity reveal if wrong)
- [ ] Handle `IC_EARLY_GUESS_CORRECT` → dramatic identity reveal for guesser
- [ ] Handle `IC_FINAL_GUESS_PHASE` → show guess input
- [ ] Handle `IC_RESULTS` → show all identity reveals and rankings
- [ ] Handle `TIMER_TICK` → update timer display
- [ ] Conditional rendering:
  - `ASSIGNMENT_REVEAL` → `<IdentityRevealGrid />` (show N-1 identity cards)
  - `ASK` (my turn) → `<QuestionInput />` + identity cards
  - `ASK` (other's turn) → waiting view with asker's identity displayed
  - `VOTE` → `<VotePanel />` with Yes/No/Maybe buttons
  - `VOTE_RESULTS` → `<VoteResultBar />` with early guess option
  - `FINAL_GUESS` → `<GuessInput />` with autocomplete
  - `RESULTS` → `<IdentityReveal />` dramatic reveal + rankings
  **Verification:** Component renders without errors for each phase. React DevTools: state updates correctly on each event.

#### 8.1.13.2 `components/rmhbox/minigames/identity-crisis/IdentityCard.tsx`

- [ ] Displays a player's identity with their name and assigned famous person
- [ ] Props: `{ userId: string; userName: string; identity: string; isHighlighted?: boolean }`
- [ ] Visual: rounded card with player avatar, name, and identity text
- [ ] Highlighted state: glowing border when it's that player's turn to ask
- [ ] Category-themed color accent (Scientist=blue, Musician=purple, Fictional=green, etc.)
- [ ] Responsive sizing for mobile (compact card on small screens)
  **Verification:** Renders correctly with mock data. Highlighted state visually distinct. Category colors applied.

#### 8.1.13.3 `components/rmhbox/minigames/identity-crisis/HiddenIdentityCard.tsx`

- [ ] Shows "???" for the player's own identity
- [ ] Props: `{ userName: string; questionsRemaining: number; hasGuessedCorrectly?: boolean }`
- [ ] Visual: large question mark icon with pulsing animation
- [ ] Shows question count: "Questions left: 2"
- [ ] Turns green with checkmark if player guessed correctly
- [ ] Mobile-friendly: prominent at top of screen
  **Verification:** Renders "???" state. Questions remaining count accurate. Correct guess state shows checkmark.

#### 8.1.13.4 `components/rmhbox/minigames/identity-crisis/QuestionInput.tsx`

- [ ] Text input for typing a yes/no question about yourself
- [ ] Props: `{ onSubmit: (question: string) => void; timeRemaining: number; maxLength: number }`
- [ ] Placeholder text: "Ask a yes/no question about yourself..."
- [ ] Character counter showing remaining chars
- [ ] Submit button (disabled until ≥3 chars)
- [ ] Auto-submit on Enter key (desktop)
- [ ] Timer bar at top
- [ ] Emit `rmhbox:game:input` with `{ action: "IC_ASK_QUESTION", data: { question } }` on submit
- [ ] Mobile-friendly keyboard handling (auto-focus, appropriate keyboard type)
  **Verification:** Submit emits correct event. Disabled when too short. Character counter works. Timer displays.

#### 8.1.13.5 `components/rmhbox/minigames/identity-crisis/VotePanel.tsx`

- [ ] Three vote buttons: Yes (green), No (red), Maybe (yellow/amber)
- [ ] Props: `{ question: string; askerName: string; askerIdentity: string; myVote: ICVote | null; onVote: (vote: ICVote) => void; votesReceived: number; totalVoters: number; timeRemaining: number }`
- [ ] Shows the question prominently
- [ ] Shows asker's identity (so voter knows the truth)
- [ ] Once voted: buttons become disabled, selected vote highlighted
- [ ] Vote progress: "Votes: 3/5 received"
- [ ] Timer bar
- [ ] Emit `rmhbox:game:input` with `{ action: "IC_VOTE", data: { vote } }` on button tap
- [ ] Touch-friendly button sizing (min 48px height, full-width on mobile)
  **Verification:** Tap emits event. Selected vote highlighted after voting. Cannot re-vote.

#### 8.1.13.6 `components/rmhbox/minigames/identity-crisis/VoteResultBar.tsx`

- [ ] Horizontal stacked bar showing Yes/No/Maybe distribution
- [ ] Props: `{ votes: { yes: number; no: number; maybe: number }; majorityAnswer: string }`
- [ ] Color-coded segments: green (yes), red (no), amber (maybe)
- [ ] Labels with counts above each segment
- [ ] Majority answer highlighted with a larger label or crown icon
- [ ] Animated entrance (segments grow from left)
  **Verification:** Bar renders with correct proportions. Majority highlighted. Animation plays.

#### 8.1.13.7 `components/rmhbox/minigames/identity-crisis/QuestionHistory.tsx`

- [ ] Scrollable list of all past questions and their vote results
- [ ] Props: `{ questions: Array<{ question: string; askerName: string; votes: { yes, no, maybe }; majorityAnswer: string }> }`
- [ ] Each entry shows: asker name, question text, vote result bar mini-version
- [ ] Most recent at top
- [ ] Collapse/expand on mobile (shows last 3 by default, tap to see all)
  **Verification:** Renders history correctly. Scrollable. Collapse toggle works on mobile.

#### 8.1.13.8 `components/rmhbox/minigames/identity-crisis/GuessInput.tsx`

- [ ] Text input for guessing own identity
- [ ] Props: `{ onSubmit: (guess: string) => void; identityPool?: string[]; timeRemaining?: number; isEarlyGuess?: boolean }`
- [ ] Optional autocomplete dropdown from visible identities (identities the player has SEEN assigned to others — helps narrow down remaining possibilities)
- [ ] Warning text for early guess: "⚠️ Wrong guess = elimination from future questions!"
- [ ] Submit button with confirmation dialog for early guesses (prevent accidental submission)
- [ ] Timer bar (for final guess phase)
- [ ] Emit `rmhbox:game:input` with `{ action: "IC_EARLY_GUESS" or "IC_FINAL_GUESS", data: { guess } }`
  **Verification:** Submit emits correct action. Autocomplete shows relevant names. Warning shown for early guesses.

#### 8.1.13.9 `components/rmhbox/minigames/identity-crisis/IdentityReveal.tsx`

- [ ] Dramatic reveal animation showing each player's identity
- [ ] Props: `{ reveals: ICReveal[]; finalRankings: ICFinalRanking[] }`
- [ ] Sequential reveal: each player's card flips to show their identity (staggered animation, ~1s per player)
- [ ] Correct guessers get a green checkmark + confetti (using `canvas-confetti`)
- [ ] Wrong/no guessers get a red X
- [ ] After all reveals: show final rankings table
- [ ] Rankings show: rank, name, score, guessed correctly, questions used, voting accuracy
  **Verification:** Reveals play sequentially. Confetti on correct guessers. Rankings table correct.

#### 8.1.13.10 Sound Effects

- [ ] Wire up sound effects for Identity Crisis events:
  - `IC_IDENTITIES_REVEAL` → `playSound('swoosh')`
  - `IC_TURN_START` / `IC_TURN_START_SELF` → `playSound('chime')`
  - `IC_QUESTION_ASKED` → `playSound('click')`
  - `IC_VOTE_RECEIVED` → `playSound('click')`
  - `IC_VOTE_RESULTS` → `playSound('swoosh')`
  - `IC_EARLY_GUESS_RESULT` correct → `playSound('scoreDing')`
  - `IC_EARLY_GUESS_RESULT` wrong → `playSound('buzzer')`
  - `IC_FINAL_GUESS_PHASE` → `playSound('goFanfare')`
  - `IC_RESULTS` → `playSound('victoryFanfare')`
  **Verification:** Each event triggers the correct sound exactly once. Volume settings respected.

#### 8.1.13.11 Zustand Store Integration

- [ ] Read other players' identities from `publicState`; own identity is NEVER in client state until `IC_RESULTS`
- [ ] Spectator sees ALL identities (god view)
- [ ] Component uses `IC_TURN_START_SELF` vs `IC_TURN_START` to determine if current player is the asker
  **Verification:** Own identity absent from store during gameplay. Spectator store contains all identities. Asker detection correct.

---

### 8.1.14 Integration Testing

- [ ] End-to-end test: 4 players join lobby → start Identity Crisis → play through all question rounds + final guess
  - [ ] Verify each player receives N-1 identities (never their own)
  - [ ] Verify asker receives `IC_TURN_START_SELF` (no identity); others receive `IC_TURN_START` (with asker's identity)
  - [ ] Verify vote aggregation: correct tallies, majority calculation, anonymous results
  - [ ] Verify question turn rotation through all players
  - [ ] Verify early guess: correct → bonus + elimination from questions; incorrect → penalty + elimination
  - [ ] Verify final guess: correct → base points; incorrect → no penalty
  - [ ] Verify fuse.js matching: "einstein" matches "Albert Einstein" at threshold 0.3
  - [ ] Verify voting accuracy bonus computed using majority answer
  - [ ] Verify all 5 awards assigned correctly
  **Verification:** All assertions pass. Scores match manual calculation.

- [ ] Information masking test (CRITICAL):
  - [ ] During ASSIGNMENT_REVEAL: Player A's socket NEVER receives Player A's identity in any field
  - [ ] During ASK (A is asker): A receives `IC_TURN_START_SELF` without identity; B receives `IC_TURN_START` with A's identity
  - [ ] During VOTE: A (asker) receives state WITHOUT `askerIdentity`; B (voter) receives state WITH `askerIdentity`
  - [ ] String scan test: for each player in each phase, JSON.stringify the entire player state and search for the player's own identity name → must return NO matches
  - [ ] During RESULTS: ALL identities visible to ALL players (masking ends)
  **Verification:** Zero identity leakage. String scan confirms no hidden identity exposure.

- [ ] Fuzzy matching test:
  - [ ] "Albert Einstein" → "albert einstein" = CORRECT (case-insensitive)
  - [ ] "Albert Einstein" → "einstein" = CORRECT (partial match at threshold 0.3)
  - [ ] "Albert Einstein" → "Albert Einstien" = CORRECT (typo tolerance)
  - [ ] "Albert Einstein" → "Mickey Mouse" = WRONG
  - [ ] "Albert Einstein" → "einstein albert" = CORRECT (word order tolerance)
  **Verification:** All fuzzy match results match expected outcomes.

- [ ] Turn skip test:
  - [ ] Player doesn't submit question in ASK timeout → turn skipped, question count preserved
  - [ ] Eliminated player's turn → auto-skipped
  - [ ] All players eliminated from questions → final guess phase starts
  **Verification:** Skip logic works in all scenarios.

- [ ] Spectator test: Spectator receives ALL identities, ALL individual votes, ALL guess texts
  **Verification:** Full god view confirmed.

- [ ] Reconnection test: Disconnect during VOTE → reconnect → can still vote if timer active
  **Verification:** State restored correctly, no identity leakage.

### 8.1.15 Game Settings Integration (§12A)

Integrate host-configurable settings using the §12A system established in Phase 5. See `lib/rmhbox/game-settings.ts` and `BaseMinigame.getSetting()` for the canonical pattern.

#### Registry Entry

- [ ] Export `IDENTITY_CRISIS_SETTINGS: GameSettingsSchema` in `lib/rmhbox/minigame-registry.ts` with 5 entries:
  - `questionsPerPlayer` (integer, default `3`, min 2, max 5, step 1)
  - `askDuration` (integer, default `30`, min 15, max 60, step 5)
  - `voteDuration` (integer, default `15`, min 10, max 30, step 5)
  - `finalGuessDuration` (integer, default `30`, min 15, max 60, step 5)
  - `enableEarlyGuess` (boolean, default `true`)
- [ ] Attach `settingsSchema: IDENTITY_CRISIS_SETTINGS` to the `identity-crisis` `MinigameDefinition`.
  **Verification:** Registry lookup returns definition with `settingsSchema` containing 5 entries.

#### Handler `getSetting()` Integration

Replace hardcoded constants with `this.getSetting()` calls in the Identity Crisis handler:

| Constant | Setting Key | Replacement |
|---|---|---|
| `IC_QUESTIONS_PER_PLAYER` | `questionsPerPlayer` | `this.getSetting('questionsPerPlayer', IC_QUESTIONS_PER_PLAYER)` |
| `IC_ASK_DURATION` | `askDuration` | `this.getSetting('askDuration', IC_ASK_DURATION)` |
| `IC_VOTE_DURATION` | `voteDuration` | `this.getSetting('voteDuration', IC_VOTE_DURATION)` |
| `IC_FINAL_GUESS_DURATION` | `finalGuessDuration` | `this.getSetting('finalGuessDuration', IC_FINAL_GUESS_DURATION)` |
| `IC_ENABLE_EARLY_GUESS` | `enableEarlyGuess` | `this.getSetting('enableEarlyGuess', IC_ENABLE_EARLY_GUESS)` |

- [ ] **Boolean setting logic:** When `enableEarlyGuess` is `false`, the subject must use all of their allotted questions before guessing. The early-guess action is rejected server-side if the setting is disabled.
  **Verification:** Each constant usage replaced. Handler respects custom settings passed via `MinigameContext.gameSettings`.

---

### 8.1.16 History Display Configuration

Implement the history display config for Identity Crisis as defined in `minigames-4.md §1.15`.

#### 8.1.16.1 Create Detail Component

Create `components/rmhbox/minigames/identity-crisis/IdentityCrisisHistoryDetail.tsx`:
- Render identity assignments revealed (who was assigned whom)
- Show question timeline with vote breakdowns (yes/no/maybe)
- Display early guess attempts with outcomes (correct/incorrect)
- Show final guess results and voting accuracy scores

#### 8.1.16.2 Register History Display

Add registration in `lib/rmhbox/history-display-registrations.ts` with:
- Searchable fields: `identities` (identity names), `questions` (question texts)
- Filterable fields: `guessedCorrectly` (boolean), `madeEarlyGuess` (boolean), `identityCategory` (select)
- Summary: `{correct}/{total} correct guesses — Identity deduction`

#### 8.1.16.3 Tests

- [ ] Verify `getHistoryDisplay('identity-crisis')` returns a valid config
- [ ] Verify searchable fields extract identities and questions from a mock game log
- [ ] Verify filterable fields include guessedCorrectly (boolean), madeEarlyGuess (boolean), identityCategory (select)
- [ ] Verify `getSummary()` returns a meaningful string for a mock game log
- [ ] Verify `DetailComponent` renders without errors when given a valid game log

---

## 8.2 Ranking File

**Game ID:** `ranking-file` | **Category:** `social` | **Icon:** `list-ordered`
**Players:** 3–16 | **Duration:** ~120s (5 rounds × ~41s each, reducible to 3 rounds for shorter sessions)

---

### 8.2.1 Install NPM Packages

- [ ] Install `@dnd-kit/core` and `@dnd-kit/sortable` (drag-and-drop for ranking UI)
  ```bash
  pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
  ```
  **Verification:** Run `pnpm ls @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` and confirm versions listed.

- [ ] Verify TypeScript types are included (dnd-kit ships its own types)
  **Verification:** Create a scratch `.ts` file, import `{ DndContext }` from `@dnd-kit/core` and `{ SortableContext }` from `@dnd-kit/sortable`, confirm no type errors via `tsc --noEmit`.

---

### 8.2.2 Add Constants to `lib/rmhbox/constants.ts`

- [ ] Add `RF_TOTAL_ROUNDS = 5` — number of rounds per game
- [ ] Add `RF_ITEMS_PER_CATEGORY = 5` — items to rank per round
- [ ] Add `RF_CATEGORY_REVEAL_SECONDS = 3` — seconds to display category name and items
- [ ] Add `RF_RANKING_SECONDS = 25` — seconds for players to drag-rank items
- [ ] Add `RF_LOCK_IN_SECONDS = 3` — seconds for final chance to confirm ranking
- [ ] Add `RF_RESULTS_SECONDS = 8` — seconds to display round results
- [ ] Add `RF_TRANSITION_SECONDS = 2` — seconds between rounds
- [ ] Add `RF_MAX_ROUND_POINTS = 200` — maximum points per round (perfect consensus match)
- [ ] Add `RF_EXACT_MATCH_BONUS = 100` — bonus for ranking matching the global average ordering exactly
- [ ] Add `RF_OUTLIER_BONUS = 25` — consolation bonus for the player most different from average
- [ ] Add `RF_MAX_THEORETICAL_DISTANCE = 12` — theoretical maximum sum of absolute deviations for 5 items ranked 1–5
- [ ] **Verification:** Import all `RF_*` constants in a test file; confirm no undefined values and correct types (`number`). Verify `RF_MAX_THEORETICAL_DISTANCE` is mathematically correct: worst case for 5 items is rank [5,4,3,2,1] vs average [1,2,3,4,5] → |5-1|+|4-2|+|3-3|+|2-4|+|1-5| = 4+2+0+2+4 = 12.

---

### 8.2.3 Create Static Data Files

- [ ] Create directory `public/data/rmhbox/ranking-file/`
  **Verification:** Directory exists on disk.

- [ ] Create `public/data/rmhbox/ranking-file/categories.json` — curated ranking categories
  - Each entry follows the `RankingCategory` interface:
    ```ts
    {
      id: string;                   // unique identifier, e.g., "fast-food-chains"
      name: string;                 // display name, e.g., "Fast Food Chains"
      items: string[];              // exactly 5 items to rank
      emoji: string;                // category emoji, e.g., "🍔"
      difficulty: "easy" | "medium" | "hard";
    }
    ```
  - [ ] Include at least 40 categories total
  - [ ] Each category has exactly 5 items
  - [ ] Items should be well-known and culturally diverse
  - [ ] Balanced difficulty: ≥15 easy, ≥15 medium, ≥10 hard
  - [ ] No duplicate `id` values
  - [ ] No duplicate items within a category
  - [ ] Categories span diverse topics: food, entertainment, travel, sports, animals, technology, etc.
  - [ ] Difficulty defined by subjectivity: easy = clear popular consensus likely; medium = debatable; hard = highly subjective with no obvious "right" answer
  - **Example categories:**
    - 🍔 Fast Food Chains: McDonald's, Burger King, Wendy's, Chick-fil-A, Taco Bell
    - 🎬 90s Movies: Titanic, Pulp Fiction, The Matrix, Forrest Gump, Jurassic Park
    - 🎵 Music Genres: Pop, Rock, Hip-Hop, Country, Jazz
    - 🏖️ Vacation Types: Beach, Mountain, City, Road Trip, Staycation
    - 🐕 Pets: Dog, Cat, Fish, Hamster, Parrot
  **Verification:** Parse JSON; validate every entry against schema; confirm ≥40 entries; confirm all have exactly 5 items each; confirm no duplicate `id`; confirm difficulty distribution meets minimums; confirm no duplicate items within any category.

---

### 8.2.4 Define Zod Validation Schemas

- [ ] Create `lib/rmhbox/ranking-file/schemas.ts`

- [ ] Define `RFSubmitSchema`:
  ```ts
  const RFSubmitSchema = z.object({
    ranking: z.array(z.number().int().min(1).max(5)).length(5)
      .refine(
        (arr) => new Set(arr).size === 5,
        'Ranking must contain each position 1-5 exactly once'
      ),
  });
  ```
  **Verification:** Valid: `{ ranking: [1, 2, 3, 4, 5] }`, `{ ranking: [5, 3, 1, 2, 4] }`. Invalid: `{ ranking: [1, 1, 3, 4, 5] }` (duplicate), `{ ranking: [1, 2, 3, 4] }` (too short), `{ ranking: [0, 1, 2, 3, 4] }` (0 out of range), `{ ranking: [1, 2, 3, 4, 6] }` (6 out of range).

- [ ] Define `RFUpdateSchema` (same shape as submit — used for live preview updates):
  ```ts
  const RFUpdateSchema = z.object({
    ranking: z.array(z.number().int().min(1).max(5)).length(5)
      .refine(
        (arr) => new Set(arr).size === 5,
        'Ranking must contain each position 1-5 exactly once'
      ),
  });
  ```
  **Verification:** Same validation as submit schema.

- [ ] Define `RankingCategorySchema` for server-side data validation at startup:
  ```ts
  const RankingCategorySchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    items: z.array(z.string().min(1)).length(5),
    emoji: z.string().min(1),
    difficulty: z.enum(["easy", "medium", "hard"]),
  });
  ```
  **Verification:** Validate all entries in `categories.json` against this schema at server startup.

---

### 8.2.5 Create Data Loader

- [ ] Create `lib/rmhbox/ranking-file/category-loader.ts`
  - [ ] Export `loadCategories(): RankingCategory[]` — reads and parses `categories.json` once at server init
  - [ ] Validate each category against `RankingCategorySchema` during load; skip invalid entries with a warning log
  - [ ] Cache in module-level variable (singleton pattern)
  - [ ] Export `selectCategoriesForGame(pool: RankingCategory[], roundCount: number, usedIds: Set<string>): RankingCategory[]`
    - Select `roundCount` categories without replacement
    - Exclude categories with IDs in `usedIds` (prevents repeats within a lobby session)
    - Shuffle before selection to ensure variety
    - Return an ordered array of `roundCount` categories
  **Verification:** Unit test: `loadCategories()` returns cached reference. `selectCategoriesForGame()` with `roundCount=5` → 5 unique categories. With used IDs → those excluded. Pool consistency check: all returned categories have exactly 5 items.

---

### 8.2.6 Implement Server Handler

- [ ] Create `server/rmhbox/minigames/ranking-file.ts`

#### 8.2.6.1 Type Definitions

- [ ] Define `RFPhase` type:
  ```ts
  type RFPhase = 'CATEGORY_REVEAL' | 'RANKING' | 'LOCK_IN' | 'RESULTS_REVEAL' | 'TRANSITION' | 'GAME_OVER';
  ```
  **Verification:** Type has exactly 6 values matching spec §2.4.

- [ ] Define `RFPlayerResult` type:
  ```ts
  type RFPlayerResult = {
    userId: string;
    userName: string;
    ranking: number[];
    distance: number;
    roundScore: number;
    isExactMatch: boolean;
    isOutlier: boolean;
  };
  ```

- [ ] Define `RFRoundResult` type:
  ```ts
  type RFRoundResult = {
    roundNumber: number;
    category: RankingCategory;
    averageRanking: number[];
    consensusOrder: number[];
    playerResults: RFPlayerResult[];
  };
  ```

- [ ] Define `RFFinalRanking` type:
  ```ts
  type RFFinalRanking = {
    userId: string;
    userName: string;
    rank: number;
    totalScore: number;
    averageDistance: number;
    exactMatches: number;
    outlierRounds: number;
  };
  ```

- [ ] Define `RankingFileState` type:
  ```ts
  type RankingFileState = {
    currentRound: number;
    totalRounds: number;
    phase: RFPhase;
    currentCategory: RankingCategory | null;
    categories: RankingCategory[];
    submissions: Map<string, number[]>;
    hasSubmitted: Map<string, boolean>;
    averageRanking: number[] | null;
    roundResults: RFRoundResult[];
    playerScores: Map<string, number>;
    phaseStartedAt: number;
    phaseEndsAt: number;
  };
  ```
  **Verification:** All types compile without errors. Cross-reference every field against design spec §2.4.

#### 8.2.6.2 Class: `RankingFileGame extends BaseMinigame`

- [ ] Constructor: call `super(context)`; load category pool via category loader
  **Verification:** Instantiate class; confirm no errors and category pool loaded.

#### 8.2.6.3 State Initialization (`start()`)

- [ ] Retrieve `usedCategoryIds` from the lobby's session context (prevents repeats across games in same lobby)
- [ ] Call `selectCategoriesForGame()` with pool, `RF_TOTAL_ROUNDS`, and exclusion set
- [ ] Add used category IDs to lobby session context
- [ ] Initialize `playerScores` map: every player starts at 0
- [ ] Initialize empty maps: `submissions`, `hasSubmitted`
- [ ] Initialize empty array: `roundResults`
- [ ] Set `currentRound = 0`, `totalRounds = RF_TOTAL_ROUNDS`
- [ ] Call `startNextRound()`
  **Verification:** Unit test with 5 players: 5 categories selected, all scores = 0, first round starts.

#### 8.2.6.4 Round Lifecycle

- [ ] `startNextRound()`:
  - Increment `currentRound`
  - If `currentRound > totalRounds`, call `endGame()`; return
  - Set `currentCategory = categories[currentRound - 1]`
  - Clear `submissions` and `hasSubmitted` maps
  - Set `averageRanking = null`
  - Set `phase = 'CATEGORY_REVEAL'`
  - Emit `rmhbox:game:action` with type `RF_CATEGORY_REVEAL` to ALL lobby:
    ```ts
    {
      round: currentRound;
      totalRounds: totalRounds;
      category: {
        name: currentCategory.name;
        items: currentCategory.items;
        emoji: currentCategory.emoji;
      };
      rankingDurationSeconds: RF_RANKING_SECONDS;
    }
    ```
  - Schedule `startRankingPhase()` after `RF_CATEGORY_REVEAL_SECONDS`
  **Verification:** Unit test: round 1 → category revealed with correct data. New round → previous submissions cleared.

- [ ] `startRankingPhase()`:
  - Set `phase = 'RANKING'`
  - Set `phaseStartedAt = Date.now()`
  - Set `phaseEndsAt = phaseStartedAt + RF_RANKING_SECONDS * 1000`
  - Start `TIMER_TICK` interval (1s)
  - Schedule `startLockInPhase()` after `RF_RANKING_SECONDS`
  **Verification:** Phase transitions to RANKING. Timer starts.

- [ ] `startLockInPhase()`:
  - Set `phase = 'LOCK_IN'`
  - Set `phaseStartedAt = Date.now()`
  - Set `phaseEndsAt = phaseStartedAt + RF_LOCK_IN_SECONDS * 1000`
  - Emit `rmhbox:game:action` with type `RF_LOCK_IN_PHASE` to ALL:
    ```ts
    { lockInSeconds: RF_LOCK_IN_SECONDS }
    ```
  - Schedule `endRankingPhase()` after `RF_LOCK_IN_SECONDS`
  **Verification:** Lock-in event emitted. Timer continues.

- [ ] `endRankingPhase()`:
  - Stop timer
  - For any player who hasn't submitted:
    - If they partially interacted (sent at least one `RF_UPDATE_RANKING`): use their last known ranking as submission
    - If they never interacted: assign a random ranking (shuffled [1,2,3,4,5])
  - Mark all non-submitters as `hasSubmitted = true` with their auto-assigned ranking
  - Call `computeRoundResults()`
  **Verification:** Unit test: timeout player with no interaction → random ranking used. Timeout player with partial interaction → last update used. All players have submissions after this step.

#### 8.2.6.5 Consensus Calculation and Scoring

- [ ] `computeAverageRanking(submissions: Map<string, number[]>): number[]`:
  - For each of the 5 items (index 0–4): compute the arithmetic mean of all players' ranks for that item
  - Return array of 5 average values (floating point)
  ```ts
  function computeAverageRanking(submissions: Map<string, number[]>): number[] {
    const itemCount = RF_ITEMS_PER_CATEGORY;
    const playerCount = submissions.size;
    const averages: number[] = [];
    for (let item = 0; item < itemCount; item++) {
      let sum = 0;
      for (const ranking of submissions.values()) {
        sum += ranking[item];
      }
      averages.push(sum / playerCount);
    }
    return averages;
  }
  ```
  **Verification:** Unit test: 3 players rank item 0 as [1, 2, 3] → average = 2.0. 2 players rank same → average matches.

- [ ] `computeDistance(playerRanking: number[], averageRanking: number[]): number`:
  - Sum of `|playerRank[i] - averageRank[i]|` for all 5 items
  ```ts
  function computeDistance(playerRanking: number[], averageRanking: number[]): number {
    return playerRanking.reduce((sum, rank, i) => sum + Math.abs(rank - averageRanking[i]), 0);
  }
  ```
  **Verification:** Unit test: player [1,2,3,4,5] vs avg [1,2,3,4,5] → distance = 0. Player [5,4,3,2,1] vs avg [1,2,3,4,5] → distance = 12.

- [ ] `computeRoundScore(distance: number): number`:
  ```ts
  function computeRoundScore(distance: number): number {
    const normalizedScore = Math.max(0, 1 - (distance / RF_MAX_THEORETICAL_DISTANCE));
    return Math.round(normalizedScore * RF_MAX_ROUND_POINTS);
  }
  ```
  **Verification:** Distance 0 → 200 pts. Distance 6 → 100 pts. Distance 12 → 0 pts.

- [ ] `computeConsensusOrder(averageRanking: number[]): number[]`:
  - Return array of item indices sorted by their average rank (ascending = best rank first)
  ```ts
  function computeConsensusOrder(averageRanking: number[]): number[] {
    return averageRanking
      .map((avg, index) => ({ index, avg }))
      .sort((a, b) => a.avg - b.avg)
      .map(entry => entry.index);
  }
  ```
  **Verification:** Avg [3.0, 1.5, 2.0, 4.0, 2.5] → consensus order [1, 2, 4, 0, 3] (item 1 ranked highest on average).

- [ ] `isExactMatch(playerRanking: number[], consensusOrder: number[]): boolean`:
  - Convert `consensusOrder` to ordinal rankings, then compare with player's ranking
  - Player's ranking for each item must match the ordinal position of that item in the consensus order
  ```ts
  function isExactMatch(playerRanking: number[], consensusOrder: number[]): boolean {
    const consensusRanks = new Array(consensusOrder.length);
    for (let rank = 0; rank < consensusOrder.length; rank++) {
      consensusRanks[consensusOrder[rank]] = rank + 1;
    }
    return playerRanking.every((rank, i) => rank === consensusRanks[i]);
  }
  ```
  **Verification:** Unit test: player ranking matches consensus ordering exactly → true. One position differs → false.

- [ ] `computeRoundResults()`:
  - Call `computeAverageRanking()` with all submissions
  - Store `averageRanking`
  - Call `computeConsensusOrder()`
  - For each player:
    - Compute `distance` via `computeDistance()`
    - Compute `roundScore` via `computeRoundScore()`
    - Check `isExactMatch()`: if true, add `RF_EXACT_MATCH_BONUS` to round score
    - Track distance for outlier detection
  - Determine outlier: player with the HIGHEST distance gets `RF_OUTLIER_BONUS` (if >1 player tied at highest distance, all tied players get it)
  - Add round scores to cumulative `playerScores`
  - Build `RFRoundResult` and append to `roundResults`
  - Build `RFPlayerResult[]` array
  - Determine `mostConsensus` (lowest distance) and `mostUnique` (highest distance) players
  - Set `phase = 'RESULTS_REVEAL'`
  - Emit `rmhbox:game:action` with type `RF_ROUND_RESULTS` to ALL lobby:
    ```ts
    {
      averageRanking: number[];
      consensusOrder: Array<{ item: string; avgRank: number }>;
      playerResults: RFPlayerResult[];
      mostConsensus: { userId: string; userName: string };
      mostUnique: { userId: string; userName: string };
    }
    ```
  - Emit `rmhbox:game:action` with type `RF_SCORE_UPDATE` to ALL:
    ```ts
    {
      scores: Array<{ userId: string; userName: string; totalScore: number; roundScoreChange: number }>;
    }
    ```
  - Schedule `startTransition()` after `RF_RESULTS_SECONDS`
  **Verification:** Unit test: 4 players → average computed, distances correct, exact match bonus awarded, outlier bonus awarded, results emitted.

- [ ] `startTransition()`:
  - Set `phase = 'TRANSITION'`
  - Check for pending join-in-progress players; add them to `playerScores` with 0 and `hasSubmitted = false`
  - Schedule `startNextRound()` after `RF_TRANSITION_SECONDS`
  **Verification:** JIP players added. Next round starts.

#### 8.2.6.6 Input Handling — `RF_SUBMIT_RANKING`

- [ ] Validate phase is `'RANKING'` or `'LOCK_IN'`; reject if other phase
- [ ] Parse input through `RFSubmitSchema`; reject on validation failure (must be [1-5] with each value exactly once)
- [ ] Check player hasn't already submitted; reject if duplicate (can use `RF_UPDATE_RANKING` to update before submission)
- [ ] Store ranking in `submissions` map; set `hasSubmitted` to true
- [ ] Compute submitted count
- [ ] Emit `rmhbox:game:action` with type `RF_SUBMISSION_COUNT` to ALL lobby:
  ```ts
  {
    submitted: number;
    total: number;
  }
  ```
  - Do NOT include who submitted — only the count
- [ ] If all players have submitted and phase is `'RANKING'`, transition to `LOCK_IN` immediately (skip remaining ranking timer)
  **Verification:** Unit test: valid ranking → stored, count emitted. Invalid ranking [1,1,3,4,5] → rejected. Already submitted → rejected. All submitted → early lock-in.

#### 8.2.6.7 Input Handling — `RF_UPDATE_RANKING`

- [ ] Validate phase is `'RANKING'` or `'LOCK_IN'`; reject if other
- [ ] Validate player has NOT already submitted via `RF_SUBMIT_RANKING`; reject if already locked in
- [ ] Parse input through `RFUpdateSchema`; reject on validation failure
- [ ] Store ranking in `submissions` map (overwrite previous update); do NOT set `hasSubmitted` to true
- [ ] This serves as a live preview / partial interaction tracker (used for auto-submit on timeout)
- [ ] No broadcast — updates are silent (no one else sees your ranking during ranking phase)
  **Verification:** Unit test: update before submit → stored silently. Update after submit → rejected.

#### 8.2.6.8 `getStateForPlayer(userId)`

- [ ] During `CATEGORY_REVEAL`:
  ```ts
  {
    phase: 'CATEGORY_REVEAL';
    round: number;
    totalRounds: number;
    category: { name: string; items: string[]; emoji: string };
    timeRemaining: number;
    scores: Array<{ userId: string; userName: string; totalScore: number }>;
  }
  ```

- [ ] During `RANKING`:
  ```ts
  {
    phase: 'RANKING';
    round: number;
    totalRounds: number;
    category: { name: string; items: string[]; emoji: string };
    myRanking: number[] | null;      // current ranking (null if no interaction yet)
    hasSubmitted: boolean;
    submittedCount: number;          // how many players have submitted (not who)
    totalPlayers: number;
    timeRemaining: number;
    scores: Array<{ userId: string; userName: string; totalScore: number }>;
  }
  ```
  - **CRITICAL:** Other players' rankings are NOT included — rankings are independent

- [ ] During `LOCK_IN`: same as RANKING with `phase: 'LOCK_IN'`

- [ ] During `RESULTS_REVEAL`:
  ```ts
  {
    phase: 'RESULTS_REVEAL';
    round: number;
    averageRanking: number[];
    consensusOrder: Array<{ item: string; avgRank: number }>;
    playerResults: RFPlayerResult[];
    mostConsensus: { userId: string; userName: string };
    mostUnique: { userId: string; userName: string };
    scores: Array<{ userId: string; userName: string; totalScore: number }>;
    timeRemaining: number;
  }
  ```
  - All rankings are now visible to everyone

- [ ] During `GAME_OVER`: full final rankings
  **Verification:** During RANKING: no other player's ranking visible. During RESULTS: all rankings visible. Submission count anonymous.

#### 8.2.6.9 `getStateForSpectator()`

- [ ] Same as player view except during RANKING/LOCK_IN phases:
  - Spectators CAN see all players' live rankings (god view) — per spec §2.6
  - Include `allRankings: Map<string, number[]>` converted to `Array<{ userId, userName, ranking }>` in spectator state
- [ ] Submission status: spectators see WHO has submitted (not just count)
  **Verification:** Spectator sees all live rankings during RANKING. Players do not.

#### 8.2.6.10 Join-in-Progress Handling

- [ ] Policy: `join_next_subround`
- [ ] Each round is independent — new category, no dependence on previous
- [ ] Check for pending players during `startTransition()` between rounds
- [ ] Initialize new player in `playerScores` with 0
- [ ] New player participates starting from the next round's ranking phase
- [ ] Send current state via `getStateForPlayer()` on join (if results visible, they see them)
  **Verification:** Unit test: player joins during round 3 results → participates in round 4 with score 0.

#### 8.2.6.11 Reconnection Handling (`handlePlayerReconnect(userId)`)

- [ ] If in RANKING/LOCK_IN and player had submitted: their ranking is preserved; they see "locked in" state
- [ ] If in RANKING/LOCK_IN and player hadn't submitted: they can still submit/update
- [ ] Cumulative scores maintained
- [ ] Send full state via `getStateForPlayer(userId)`
  **Verification:** Reconnect during RANKING with prior update → can still submit. Reconnect after submit → locked state shown.

#### 8.2.6.12 Disconnect Handling (`handlePlayerDisconnect(userId)`)

- [ ] If RANKING/LOCK_IN and player hasn't submitted: timeout will auto-assign ranking (random or last update)
- [ ] Existing submission preserved
- [ ] No special cleanup
  **Verification:** Disconnect before submit → timeout handles it.

#### 8.2.6.13 `computeResults()` and Awards

- [ ] Compute final rankings by cumulative `playerScores` (descending)
- [ ] Compute per-player stats: averageDistance, exactMatches count, outlierRounds count

- [ ] Compute awards:
  - [ ] **Basic** — closest total ranking to lobby average (winner); icon: `users`
  - [ ] **Trendsetter** — most outlier rounds (most unique taste); icon: `snowflake`
  - [ ] **Mind Meld** — most exact matches with the average across rounds; icon: `brain`
  - [ ] **Consistent** — lowest variance in distance across rounds (most consistent performance); icon: `ruler`
  - [ ] **Hot Take** — single round with the highest distance from average (most extreme single-round opinion); icon: `flame`

- [ ] Build `RFFinalRanking[]` array
- [ ] Emit `rmhbox:game:action` with type `RF_GAME_OVER`:
  ```ts
  {
    finalRankings: RFFinalRanking[];
    categoryResults: RFRoundResult[];
  }
  ```
- [ ] Return `MinigameResults` with rankings, awards, and `gameSpecificData` containing `roundResults`
  **Verification:** Unit test: player with lowest average distance wins. Awards assigned correctly: trendsetter = most outlier rounds, consistent = lowest distance variance.

#### 8.2.6.14 `buildGameLog()`

- [ ] Maintain an `actionLog: GameLogAction[]` array on the game instance
- [ ] Build `GameLog` conforming to core.md §13.3, including `gameSettings` per §12A.11

**`initialState` (from minigames-4.md §2.14):**

```typescript
interface RFGameHistoryInit {
  categoryPack: string;
  totalRounds: number;
  itemsPerRound: number;
  playerCount: number;
  gameSettings: GameSettingValues;
}
```

**Actions Logged:**

| Action Type | Payload | Recorded When |
|---|---|---|
| `round_start` | `{ roundNumber: number; category: string; items: string[] }` | New round begins |
| `ranking_submitted` | `{ userId: string; submittedOrder: string[] }` | Player locks in their ranking |
| `round_result` | `{ consensusRanking: string[]; playerScores: Array<{ userId: string; distance: number; points: number; exactMatches: number }> }` | Round scoring completes |
| `outlier_awarded` | `{ userId: string; category: string; outlierItem: string; deviation: number }` | Player earns outlier bonus |
| `game_complete` | `{ finalStandings: Array<{ userId: string; totalPoints: number; roundBreakdown: number[] }> }` | All rounds finished |

- [ ] In `computeResults()`, build `GameLog` with `initialState`, full action log, and `finalResults`
- [ ] Return `GameLog` from `buildGameLog()`

**Verification:** Unit test: 5-round game, verify 5 `round_start`, all `ranking_submitted`, 5 `round_result` actions with consensus data and distance scores, `initialState` has category pack and round config.

---

### 8.2.7 Register Game in Minigame Registry

- [ ] Add entry to `lib/rmhbox/minigame-registry.ts`:
  ```ts
  {
    id: "ranking-file",
    displayName: "Ranking File",
    description: "Rank 5 items from best to worst — but the goal isn't to have the 'right' opinion, it's to match the group's consensus! The most average player wins.",
    category: "social",
    icon: "list-ordered",
    minPlayers: 3,
    maxPlayers: 16,
    estimatedDurationSeconds: 120,
    supportsTeams: false,
    instructionDurationSeconds: 15,
    preloadAssets: {
      images: [],
      sounds: [],
      data: ["/data/rmhbox/ranking-file/categories.json"],
      estimatedSizeBytes: 20000,
    },
    joinInProgressPolicy: "join_next_subround",
    tags: ["social", "opinion", "competitive", "light"],
  }
  ```
  **Verification:** Call registry lookup for `"ranking-file"`; confirm all metadata fields correct and handler instantiates with valid context.

- [ ] Add server handler to `MINIGAME_SERVER_REGISTRY` in `server/rmhbox/minigame-server-registry.ts`:
  ```ts
  import { RankingFileGame } from './minigames/ranking-file';
  MINIGAME_SERVER_REGISTRY.set('ranking-file', RankingFileGame);
  ```
  **Verification:** `MINIGAME_SERVER_REGISTRY.get('ranking-file')` returns `RankingFileGame` class.

- [ ] Add lazy-loaded component to `MinigameRenderer` map in `components/rmhbox/MinigameRenderer.tsx`:
  ```ts
  'ranking-file': lazy(() => import('./minigames/ranking-file/RankingFileGame'))
  ```
  **Verification:** `MinigameRenderer` renders `<Suspense>` fallback, then loads `RankingFileGame` chunk on demand.

---

### 8.2.8 Build Client Components

#### 8.2.8.1 `components/rmhbox/minigames/ranking-file/RankingFileGame.tsx`

- [ ] Phase router component — renders appropriate sub-component based on `phase`
- [ ] Subscribe to all `RF_*` and `TIMER_TICK` WebSocket events via `useRMHboxStore`
- [ ] Maintain local state:
  - `phase`, `round`, `totalRounds`, `category`, `items`
  - `myRanking`, `hasSubmitted`, `submittedCount`, `totalPlayers`
  - `timeRemaining`, `scores[]`
  - `averageRanking`, `playerResults[]`, `mostConsensus`, `mostUnique`
  - `roundResults[]`
- [ ] Handle `RF_CATEGORY_REVEAL` → set category data, show reveal animation
- [ ] Handle `RF_SUBMISSION_COUNT` → update submitted count
- [ ] Handle `RF_LOCK_IN_PHASE` → transition to lock-in UI (last chance to adjust)
- [ ] Handle `RF_ROUND_RESULTS` → display comparison view with average
- [ ] Handle `RF_SCORE_UPDATE` → animate score changes
- [ ] Handle `RF_GAME_OVER` → show final rankings and all category results
- [ ] Handle `TIMER_TICK` → update timer display
- [ ] Conditional rendering:
  - `CATEGORY_REVEAL` → `<CategoryReveal />` (animated category + items)
  - `RANKING` → `<RankingList />` (drag-and-drop) + submit button
  - `LOCK_IN` → `<RankingList />` (still adjustable) + "Lock In" emphasis
  - `RESULTS_REVEAL` → `<ResultsComparison />` + `<AverageRankingChart />`
  - `TRANSITION` → brief transition screen
  - `GAME_OVER` → `<RankingFileResults />`
  **Verification:** Component renders without errors for each phase. State updates correctly on each event.

#### 8.2.8.2 `components/rmhbox/minigames/ranking-file/CategoryReveal.tsx`

- [ ] Animated display of category name and 5 items
- [ ] Props: `{ category: { name: string; items: string[]; emoji: string }; round: number; totalRounds: number }`
- [ ] Entrance animation: emoji + category name scale in; items stagger-fade in
- [ ] Round counter: "Round 2/5"
- [ ] Items shown in a clean list with numbered positions (but unranked — items in randomized order)
- [ ] Responsive sizing for mobile
  **Verification:** Renders with mock data. Animation plays. Round counter correct.

#### 8.2.8.3 `components/rmhbox/minigames/ranking-file/RankingList.tsx`

- [ ] Drag-and-drop sortable list of 5 items using `@dnd-kit/sortable`
- [ ] Props: `{ items: string[]; ranking: number[]; onRankingChange: (ranking: number[]) => void; hasSubmitted: boolean; isLockIn: boolean }`
- [ ] Desktop: drag-and-drop reordering via mouse
- [ ] Mobile: touch-drag with drag handles (grip icon on right side); fallback: tap two items to swap
- [ ] Visual: numbered 1-5 on the left, item text in center, drag handle on right
- [ ] Medal icons for top 3: 🏆 (1st), 🥈 (2nd), 🥉 (3rd)
- [ ] Items start in a randomized order (shuffled per player to avoid positional bias)
- [ ] On reorder: call `onRankingChange()` which emits `RF_UPDATE_RANKING`; on submit: emit `RF_SUBMIT_RANKING`
- [ ] After submission: items become non-draggable, green "Locked In" indicator
- [ ] During lock-in phase: pulsing border, "Last chance!" text
- [ ] Smooth Framer Motion animations on item reposition
  **Verification:** Drag-and-drop works on desktop and mobile. Reorder emits update event. Submit emits submit event. Locked state disables interaction.

#### 8.2.8.4 `components/rmhbox/minigames/ranking-file/RankingItem.tsx`

- [ ] Individual item in the ranking list (used inside `RankingList`)
- [ ] Props: `{ item: string; rank: number; isDragging: boolean; isLocked: boolean }`
- [ ] Visual states: default (white bg), dragging (elevated shadow, slight scale), locked (green border, lock icon)
- [ ] Drag handle icon (≡ grip lines) on the right
- [ ] Rank number with medal for top 3
- [ ] Touch target ≥48px height
  **Verification:** All states render correctly. Accessible drag handle.

#### 8.2.8.5 `components/rmhbox/minigames/ranking-file/ResultsComparison.tsx`

- [ ] Side-by-side view: player's ranking vs global average
- [ ] Props: `{ myRanking: number[]; averageRanking: number[]; items: string[]; playerResults: RFPlayerResult[]; mostConsensus: {...}; mostUnique: {...} }`
- [ ] Two columns: "Your Ranking" and "Group Average" with items ordered by rank
- [ ] Items that deviate significantly (≥2 positions from average) highlighted in red/orange
- [ ] Items matching average highlighted in green
- [ ] "Most Consensus" player badge (closest to average)
- [ ] "Most Unique" player badge (furthest from average)
- [ ] Animated entrance: items slide to their positions
  **Verification:** Comparison renders correctly. Deviation highlighting works. Badges assigned.

#### 8.2.8.6 `components/rmhbox/minigames/ranking-file/AverageRankingChart.tsx`

- [ ] Horizontal bar chart showing each item's average rank
- [ ] Props: `{ items: string[]; averageRanking: number[]; consensusOrder: Array<{ item: string; avgRank: number }> }`
- [ ] Items ordered by consensus (best to worst)
- [ ] Bar length proportional to average rank (shorter bar = better average rank)
- [ ] Animated bar growth from left
- [ ] Item labels on left, average rank value on right of each bar
  **Verification:** Chart renders with correct proportions. Animation plays. Ordering matches consensus.

#### 8.2.8.7 `components/rmhbox/minigames/ranking-file/DistanceIndicator.tsx`

- [ ] Visual indicator showing how close a player is to the average
- [ ] Props: `{ distance: number; maxDistance: number; isExactMatch: boolean; isOutlier: boolean }`
- [ ] Circular or linear gauge: green (low distance) → yellow (mid) → red (high distance)
- [ ] Exact match: green checkmark with "Perfect Match!" label
- [ ] Outlier: snowflake icon with "Most Unique!" label
  **Verification:** Distance 0 → green "Perfect Match!". Distance 12 → red. Outlier badge shown.

#### 8.2.8.8 `components/rmhbox/minigames/ranking-file/RankingFileResults.tsx`

- [ ] Final results: overall rankings, all category results summary
- [ ] Props: `{ finalRankings: RFFinalRanking[]; categoryResults: RFRoundResult[] }`
- [ ] Rankings table: rank, player name, total score, average distance, exact matches, outlier rounds
- [ ] Category summary: collapsible per-round results
- [ ] Winner highlighted with crown
- [ ] Awards display
  **Verification:** Rankings correct. Category results expandable. Awards shown.

#### 8.2.8.9 Sound Effects

- [ ] Wire up sound effects for Ranking File events:
  - `RF_CATEGORY_REVEAL` → `playSound('goFanfare')`
  - `RF_LOCK_IN_PHASE` → `playSound('swoosh')`
  - `RF_ROUND_RESULTS` → `playSound('victoryFanfare')`
  - `RF_GAME_OVER` → `playSound('victoryFanfare')`
  - `TIMER_TICK` with `timeRemaining <= 5` → `playSound('countdownBeep')`
  **Verification:** Each event triggers the correct sound exactly once. Countdown beeps fire only in final 5 seconds. Volume settings respected.

#### 8.2.8.10 Zustand Store Integration

- [ ] Read category and items from `publicState`; read own ranking from `privateState`
- [ ] Detect spectator to show submission progress without drag-and-drop
- [ ] Uses `@dnd-kit/core` and `@dnd-kit/sortable` for ranking interaction
  **Verification:** Public/private state separation correct. Spectator view shows progress count only. Drag-and-drop libraries load correctly.

---

### 8.2.9 Integration Testing

- [ ] End-to-end test: 4 players join lobby → start Ranking File → play through 5 rounds
  - [ ] Verify 5 unique categories selected (no repeats)
  - [ ] Verify each category has exactly 5 items
  - [ ] Verify average ranking computation: manual calculation matches server output
  - [ ] Verify distance computation: sum of absolute deviations correct
  - [ ] Verify scoring: distance → normalized score → round points
  - [ ] Verify exact match bonus: player ranking matches consensus → +100
  - [ ] Verify outlier bonus: highest distance player → +25
  - [ ] Verify cumulative scores correct across 5 rounds
  - [ ] Verify all 5 awards assigned correctly
  **Verification:** All assertions pass. Scores match manual calculation.

- [ ] Information masking test:
  - [ ] During RANKING: other players' rankings NOT in any player's WebSocket state
  - [ ] Submission count is anonymous (number only, not who)
  - [ ] During RESULTS: all rankings visible
  - [ ] Spectator during RANKING: CAN see all live rankings
  **Verification:** Zero ranking leakage during ranking phase. Spectator has full view.

- [ ] Auto-submit test:
  - [ ] Player doesn't interact → timeout assigns random ranking [1-5 shuffled]
  - [ ] Player partially interacts (sends updates but no submit) → timeout uses last update
  - [ ] Player submits early → ranking locked, no change on timeout
  **Verification:** Auto-submit behavior correct for all scenarios.

- [ ] Drag-and-drop test:
  - [ ] Desktop: drag item 5 to position 1 → ranking updates correctly
  - [ ] Mobile: touch-drag with handle → ranking updates
  - [ ] Tap-swap fallback: tap item 2, tap item 4 → positions swap
  **Verification:** DnD works on both platforms.

- [ ] JIP test: Player joins during round 2 results → participates in round 3 with score 0
  **Verification:** JIP player's ranking included in round 3 average.

- [ ] Reconnection test: Disconnect during RANKING → reconnect → can still submit/update
  **Verification:** State restored. Prior updates preserved.

### 8.2.10 Game Settings Integration (§12A)

Integrate host-configurable settings using the §12A system.

#### Registry Entry

- [ ] Export `RANKING_FILE_SETTINGS: GameSettingsSchema` in `lib/rmhbox/minigame-registry.ts` with 4 entries:
  - `totalRounds` (integer, default `4`, min 2, max 6, step 1)
  - `rankingDuration` (integer, default `45`, min 20, max 90, step 5)
  - `itemsPerCategory` (integer, default `5`, min 3, max 7, step 1)
  - `enableOutlierBonus` (boolean, default `true`)
- [ ] Attach `settingsSchema: RANKING_FILE_SETTINGS` to the `ranking-file` `MinigameDefinition`.
  **Verification:** Registry lookup returns definition with `settingsSchema` containing 4 entries.

#### Handler `getSetting()` Integration

Replace hardcoded constants with `this.getSetting()` calls in the Ranking File handler:

| Constant | Setting Key | Replacement |
|---|---|---|
| `RF_TOTAL_ROUNDS` | `totalRounds` | `this.getSetting('totalRounds', RF_TOTAL_ROUNDS)` |
| `RF_RANKING_DURATION` | `rankingDuration` | `this.getSetting('rankingDuration', RF_RANKING_DURATION)` |
| `RF_ITEMS_PER_CATEGORY` | `itemsPerCategory` | `this.getSetting('itemsPerCategory', RF_ITEMS_PER_CATEGORY)` |
| `RF_OUTLIER_BONUS` | `enableOutlierBonus` | `this.getSetting('enableOutlierBonus', RF_OUTLIER_BONUS)` |

- [ ] **Boolean setting logic:** When `enableOutlierBonus` is `false`, no bonus points are awarded for correctly placing the hardest-to-rank item. The outlier detection still runs (for analytics), but the bonus is suppressed.
  **Verification:** Each constant usage replaced. Handler respects custom settings passed via `MinigameContext.gameSettings`.

---

### 8.2.15 History Display Configuration

Implement the history display config for Ranking File as defined in `minigames-4.md §2.15`.

#### 8.2.15.1 Create Detail Component

Create `components/rmhbox/minigames/ranking-file/RankingFileHistoryDetail.tsx`:
- Render per-round ranking comparison (consensus vs. player rankings)
- Show distance scores per player per round
- Display exact match bonuses and outlier bonuses highlighted

#### 8.2.15.2 Register History Display

Add registration in `lib/rmhbox/history-display-registrations.ts` with:
- Searchable fields: `categories` (category names), `items` (item names)
- Filterable fields: `exactMatches` (range), `wasOutlier` (boolean), `roundCount` (range)
- Summary: `{rounds} rounds — {categories}`

#### 8.2.15.3 Tests

- [ ] Verify `getHistoryDisplay('ranking-file')` returns a valid config
- [ ] Verify searchable fields extract categories and items from a mock game log
- [ ] Verify filterable fields include exactMatches (range), wasOutlier (boolean), roundCount (range)
- [ ] Verify `getSummary()` returns a meaningful string for a mock game log
- [ ] Verify `DetailComponent` renders without errors when given a valid game log

---

## 8.3 Pixel Pushers

**Game ID:** `pixel-pushers` | **Category:** `action` | **Icon:** `move`
**Players:** 2–8 | **Duration:** ~120s (3 levels × ~35s average)

---

### 8.3.1 Install NPM Packages

- [ ] No additional NPM packages required for Pixel Pushers
  - The physics simulation is simplified (circle-circle, circle-AABB collisions, velocity damping, inverse-square attraction) — ~100 lines of TypeScript, not warranting a full physics engine like Matter.js
  - All physics run server-side; client is a render-only terminal
  **Verification:** Confirm no new dependencies needed.

---

### 8.3.2 Add Constants to `lib/rmhbox/constants.ts`

- [ ] Add `PP_TOTAL_LEVELS = 3` — number of levels per game
- [ ] Add `PP_CANVAS_WIDTH = 600` — logical canvas width in pixels
- [ ] Add `PP_CANVAS_HEIGHT = 400` — logical canvas height in pixels
- [ ] Add `PP_LEVEL_PREVIEW_SECONDS = 3` — seconds to show level layout before gameplay
- [ ] Add `PP_ACTIVE_DURATION_SECONDS = 90` — maximum seconds for the active phase per level
- [ ] Add `PP_LEVEL_COMPLETE_SECONDS = 3` — seconds to show level completion celebration
- [ ] Add `PP_PUSHER_RADIUS = 15` — radius of player circles in logical pixels
- [ ] Add `PP_BALL_RADIUS = 20` — radius of the physics ball in logical pixels
- [ ] Add `PP_PUSHER_SPEED = 3` — pusher movement speed in pixels per tick (at 30 ticks/s)
- [ ] Add `PP_PUSH_FORCE = 0.8` — impulse magnitude when pusher collides with ball
- [ ] Add `PP_BALL_FRICTION = 0.97` — velocity damping per tick (0–1, lower = more friction)
- [ ] Add `PP_BALL_MAX_SPEED = 8` — maximum velocity magnitude for the ball
- [ ] Add `PP_BALL_WALL_RESTITUTION = 0.6` — bounce coefficient for ball-wall collisions
- [ ] Add `PP_POLARITY_INTERVAL_SECONDS = 10` — seconds between polarity flips
- [ ] Add `PP_POLARITY_WARNING_SECONDS = 3` — countdown warning before polarity flip
- [ ] Add `PP_ATTRACT_RADIUS = 80` — radius within which attraction force applies
- [ ] Add `PP_ATTRACT_FORCE = 200` — numerator for inverse-square attraction law
- [ ] Add `PP_MAX_ATTRACT_FORCE = 2.0` — maximum attraction force per tick (clamp)
- [ ] Add `PP_WAYPOINT_RADIUS = 30` — radius of waypoint detection zones
- [ ] Add `PP_MOVE_INPUT_RATE = 15` — max movement input rate per player in Hz
- [ ] Add `PP_SIMULATION_TICK_MS = 33` — physics simulation tick interval (~30Hz)
- [ ] Add `PP_STATE_BROADCAST_RATE = 15` — state broadcast frequency in Hz (every other tick)
- [ ] Add `PP_LEVEL_COMPLETE_POINTS = 200` — points per player for completing a level
- [ ] Add `PP_WAYPOINT_POINTS = 50` — points per player for reaching a waypoint
- [ ] Add `PP_TIME_BONUS_PER_SECOND = 3` — bonus points per second remaining on level completion
- [ ] Add `PP_MVP_BONUS = 75` — bonus for player with most ball pushes
- [ ] Add `PP_POLARITY_CONTROL_BONUS = 50` — bonus per polarity flip handled well
- [ ] Add `PP_DISCONNECT_GHOST_DELAY_MS = 10000` — ms before disconnected player's pusher becomes ghost (no collision)
- [ ] Add `PP_PUSHER_COLORS` — array of player colors:
  ```ts
  const PP_PUSHER_COLORS = [
    '#EF4444', '#3B82F6', '#22C55E', '#F59E0B',
    '#A855F7', '#EC4899', '#14B8A6', '#F97316',
  ];
  ```
- [ ] **Verification:** Import all `PP_*` constants in a test file; confirm no undefined values and correct types. Verify `PP_PUSHER_COLORS` has 8 entries (max players). Verify `PP_BALL_FRICTION` is between 0 and 1.

---

### 8.3.3 Create Static Data Files

- [ ] Create directory `public/data/rmhbox/pixel-pushers/`
  **Verification:** Directory exists on disk.

- [ ] Create `public/data/rmhbox/pixel-pushers/levels.json` — level definitions
  - Each entry follows the `PPLevel` interface:
    ```ts
    {
      id: string;                         // e.g., "the-corridor"
      name: string;                       // e.g., "The Corridor"
      walls: Array<{ x: number; y: number; width: number; height: number }>;
      ballStart: { x: number; y: number };
      goalZone: { x: number; y: number; width: number; height: number };
      waypoints: Array<{ x: number; y: number; order: number }>;
      playerStartPositions: Array<{ x: number; y: number }>;
      difficulty: "easy" | "medium" | "hard";
    }
    ```
  - [ ] Include at least 9 levels (3 per difficulty tier)
  - [ ] Easy levels (3): simple corridors, wide paths, few walls, 0–1 waypoints
  - [ ] Medium levels (3): L-shaped paths, moderate walls, 1–2 waypoints, narrower passages
  - [ ] Hard levels (3): maze-like layouts, tight corridors, 2–3 waypoints, dead ends
  - [ ] All coordinates within `PP_CANVAS_WIDTH × PP_CANVAS_HEIGHT` bounds
  - [ ] Ball start position is NOT inside a wall
  - [ ] Goal zone is NOT overlapping any wall
  - [ ] All waypoints are reachable (not blocked by walls)
  - [ ] `playerStartPositions` has at least 8 positions (max players) per level, none inside walls
  - [ ] Waypoints are ordered (order 1, 2, 3...) and sequential traversal is possible
  **Verification:** Parse JSON; validate every entry; confirm ≥9 levels; confirm all coordinates in bounds; confirm no wall overlaps with start/goal/waypoints; confirm ≥8 start positions per level.

---

### 8.3.4 Define Zod Validation Schemas

- [ ] Create `lib/rmhbox/pixel-pushers/schemas.ts`

- [ ] Define `PPMoveSchema`:
  ```ts
  const PPMoveSchema = z.object({
    dx: z.number().min(-1).max(1),
    dy: z.number().min(-1).max(1),
  });
  ```
  **Verification:** Valid: `{ dx: 1, dy: 0 }` (move right), `{ dx: 0.707, dy: 0.707 }` (diagonal), `{ dx: 0, dy: 0 }` (idle). Invalid: `{ dx: 2, dy: 0 }`, `{ dx: -1.5, dy: 0 }`.

- [ ] Define `PPLevelSchema` for server-side data validation at startup:
  ```ts
  const PPLevelSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    walls: z.array(z.object({
      x: z.number(), y: z.number(),
      width: z.number().positive(), height: z.number().positive(),
    })),
    ballStart: z.object({ x: z.number(), y: z.number() }),
    goalZone: z.object({
      x: z.number(), y: z.number(),
      width: z.number().positive(), height: z.number().positive(),
    }),
    waypoints: z.array(z.object({
      x: z.number(), y: z.number(), order: z.number().int().positive(),
    })),
    playerStartPositions: z.array(z.object({ x: z.number(), y: z.number() })).min(2),
    difficulty: z.enum(["easy", "medium", "hard"]),
  });
  ```
  **Verification:** Validate all level entries at server startup.

---

### 8.3.5 Create Data Loader

- [ ] Create `lib/rmhbox/pixel-pushers/level-loader.ts`
  - [ ] Export `loadLevels(): PPLevel[]` — reads and parses `levels.json` once at server init
  - [ ] Validate each level against `PPLevelSchema` during load; skip invalid entries with warning log
  - [ ] Cache in module-level variable (singleton pattern)
  - [ ] Export `selectLevelsForGame(pool: PPLevel[], levelCount: number, usedIds: Set<string>): PPLevel[]`
    - Select `levelCount` levels with escalating difficulty: first level = easy, second = medium, third = hard
    - Exclude levels with IDs in `usedIds`
    - Shuffle within each difficulty bucket before selection
    - Return ordered array [easy, medium, hard]
  **Verification:** Unit test: `selectLevelsForGame()` with 3 levels → [easy, medium, hard] in order. Used IDs excluded.

---

### 8.3.6 Implement Server Handler

- [ ] Create `server/rmhbox/minigames/pixel-pushers.ts`

#### 8.3.6.1 Type Definitions

- [ ] Define `PPPhase` type:
  ```ts
  type PPPhase = 'LEVEL_PREVIEW' | 'ACTIVE' | 'LEVEL_COMPLETE' | 'GAME_OVER';
  ```
  **Verification:** Type has exactly 4 values matching spec §3.4.

- [ ] Define `BallPhysics` type:
  ```ts
  type BallPhysics = {
    position: { x: number; y: number };
    velocity: { vx: number; vy: number };
    radius: number;
    friction: number;
    mass: number;
  };
  ```

- [ ] Define `PusherState` type:
  ```ts
  type PusherState = {
    userId: string;
    position: { x: number; y: number };
    color: string;
    polarity: 'push' | 'attract';
    moveDirection: { x: number; y: number } | null;
    pushCount: number;
    isDisconnected: boolean;
    disconnectedAt: number | null;
    isGhost: boolean;
  };
  ```

- [ ] Define `PPWaypoint` type:
  ```ts
  type PPWaypoint = {
    x: number;
    y: number;
    order: number;
    reached: boolean;
  };
  ```

- [ ] Define `PPFinalRanking` type:
  ```ts
  type PPFinalRanking = {
    userId: string;
    userName: string;
    rank: number;
    totalScore: number;
    totalPushes: number;
    polarityFlipsHandled: number;
  };
  ```

- [ ] Define `PixelPushersState` type:
  ```ts
  type PixelPushersState = {
    currentLevel: number;
    totalLevels: number;
    phase: PPPhase;
    canvasWidth: number;
    canvasHeight: number;
    currentLevelData: PPLevel;
    walls: Array<{ x: number; y: number; width: number; height: number }>;
    goalZone: { x: number; y: number; width: number; height: number };
    waypoints: PPWaypoint[];
    nextWaypointIndex: number;
    ball: BallPhysics;
    pushers: Map<string, PusherState>;
    polarityFlippedUserId: string | null;
    nextPolarityFlipAt: number;
    polarityWarningEmitted: boolean;
    playerScores: Map<string, number>;
    polarityFlipsHandled: Map<string, number>;
    levelStartedAt: number;
    phaseStartedAt: number;
    phaseEndsAt: number;
    simulationInterval: NodeJS.Timeout | null;
    broadcastInterval: NodeJS.Timeout | null;
  };
  ```
  **Verification:** All types compile without errors. Cross-reference every field against design spec §3.4.

#### 8.3.6.2 Class: `PixelPushersGame extends BaseMinigame`

- [ ] Constructor: call `super(context)`; load level pool via level loader
  **Verification:** Instantiate class; confirm no errors and level pool loaded.

#### 8.3.6.3 State Initialization (`start()`)

- [ ] Retrieve `usedLevelIds` from lobby session context
- [ ] Call `selectLevelsForGame()` with pool, `PP_TOTAL_LEVELS`, and exclusion set
- [ ] Add used level IDs to lobby session context
- [ ] Initialize `playerScores` map: every player starts at 0
- [ ] Initialize `polarityFlipsHandled` map: every player starts at 0
- [ ] Set `currentLevel = 0`, `totalLevels = PP_TOTAL_LEVELS`
- [ ] Call `startNextLevel()`
  **Verification:** Unit test with 4 players: 3 levels selected [easy, medium, hard], all scores = 0.

#### 8.3.6.4 Level Lifecycle

- [ ] `startNextLevel()`:
  - Increment `currentLevel`
  - If `currentLevel > totalLevels`, call `endGame()`; return
  - Set `currentLevelData = levels[currentLevel - 1]`
  - Initialize `walls`, `goalZone` from level data
  - Initialize `waypoints` from level data with `reached = false`
  - Set `nextWaypointIndex = 0` (or find first waypoint by order)
  - Initialize `ball`:
    ```ts
    {
      position: { ...currentLevelData.ballStart },
      velocity: { vx: 0, vy: 0 },
      radius: PP_BALL_RADIUS,
      friction: PP_BALL_FRICTION,
      mass: 1.0,
    }
    ```
  - Initialize `pushers` map: for each player, assign a start position from `currentLevelData.playerStartPositions[i]`, a color from `PP_PUSHER_COLORS[i]`, polarity = 'push', pushCount = 0
  - Set `polarityFlippedUserId = null`
  - Set `nextPolarityFlipAt = Date.now() + PP_POLARITY_INTERVAL_SECONDS * 1000`
  - Set `polarityWarningEmitted = false`
  - Set `phase = 'LEVEL_PREVIEW'`
  - Emit `rmhbox:game:action` with type `PP_LEVEL_START` to ALL:
    ```ts
    {
      level: currentLevel;
      levelName: currentLevelData.name;
      layout: {
        walls: [...],
        goalZone: { ... },
        waypoints: waypoints.map(w => ({ x: w.x, y: w.y, order: w.order })),
        ballStart: { ...currentLevelData.ballStart },
        playerStartPositions: currentLevelData.playerStartPositions.slice(0, playerCount),
      };
      activeDurationSeconds: PP_ACTIVE_DURATION_SECONDS;
    }
    ```
  - Schedule `startActivePhase()` after `PP_LEVEL_PREVIEW_SECONDS`
  **Verification:** Unit test: level 1 → easy level loaded, ball at start position, pushers at start positions with unique colors, no polarity flip active.

- [ ] `startActivePhase()`:
  - Set `phase = 'ACTIVE'`
  - Set `levelStartedAt = Date.now()`
  - Set `phaseStartedAt = Date.now()`
  - Set `phaseEndsAt = levelStartedAt + PP_ACTIVE_DURATION_SECONDS * 1000`
  - Start simulation loop: `setInterval(simulationTick, PP_SIMULATION_TICK_MS)` — stored in `simulationInterval`
  - Start broadcast loop: `setInterval(broadcastState, 1000 / PP_STATE_BROADCAST_RATE)` — stored in `broadcastInterval`
  - Start `TIMER_TICK` interval (1s)
  - Schedule `endLevel('TIMEOUT')` after `PP_ACTIVE_DURATION_SECONDS`
  **Verification:** Simulation loop starts at ~30Hz. Broadcast starts at ~15Hz. Timer ticks.

- [ ] `endLevel(reason: 'GOAL' | 'TIMEOUT')`:
  - Stop simulation interval
  - Stop broadcast interval
  - Stop timer interval
  - If `reason === 'GOAL'`:
    - Set `phase = 'LEVEL_COMPLETE'`
    - Compute time bonus: `Math.floor(timeRemainingSeconds * PP_TIME_BONUS_PER_SECOND)` per player
    - Award `PP_LEVEL_COMPLETE_POINTS` to all players
    - Award time bonus to all players
    - Determine MVP (most pushes): award `PP_MVP_BONUS`
    - Emit `rmhbox:game:action` with type `PP_LEVEL_COMPLETE` to ALL:
      ```ts
      { timeMs: elapsedMs, waypointsReached: reachedCount, totalWaypoints: totalCount }
      ```
  - If `reason === 'TIMEOUT'`:
    - Emit `rmhbox:game:action` with type `PP_LEVEL_FAILED` to ALL:
      ```ts
      { reason: 'TIMEOUT' }
      ```
  - Schedule `startNextLevel()` after `PP_LEVEL_COMPLETE_SECONDS` (for complete) or 2s (for timeout)
  **Verification:** Unit test: goal reached → points awarded, MVP determined, complete event emitted. Timeout → failed event, no points.

#### 8.3.6.5 Physics Simulation — `simulationTick()`

This is the core physics loop running at ~30Hz. Each tick:

- [ ] **Step 1: Apply Pusher Movement**
  - For each pusher in `pushers`:
    - If `isGhost` or `isDisconnected`: skip movement
    - If `moveDirection` is not null and not zero:
      - Normalize direction vector: `len = sqrt(dx² + dy²)`; if len > 0: `dx /= len; dy /= len`
      - Compute new position: `newX = position.x + dx * PP_PUSHER_SPEED; newY = position.y + dy * PP_PUSHER_SPEED`
      - Clamp to canvas bounds: `[PP_PUSHER_RADIUS, PP_CANVAS_WIDTH - PP_PUSHER_RADIUS]` for x, `[PP_PUSHER_RADIUS, PP_CANVAS_HEIGHT - PP_PUSHER_RADIUS]` for y
      - Check wall collisions (AABB-circle): resolve by pushing pusher back to nearest valid position
      - Update `position`

- [ ] **Step 2: Apply Polarity Attraction**
  - If `polarityFlippedUserId` is not null:
    - Get the attracted pusher's position
    - Compute distance from ball center to attracted pusher center
    - If distance ≤ `PP_ATTRACT_RADIUS`:
      - Compute attraction direction: `(pusher.x - ball.x, pusher.y - ball.y)` normalized
      - Compute force magnitude: `PP_ATTRACT_FORCE / (distance * distance)` (inverse-square)
      - Clamp force to `PP_MAX_ATTRACT_FORCE`
      - Apply force to ball velocity: `ball.velocity.vx += attractDir.x * force; ball.velocity.vy += attractDir.y * force`

- [ ] **Step 3: Apply Pusher-Ball Collisions (Push)**
  - For each non-ghost pusher:
    - If pusher polarity is `'attract'`: skip push collision (attraction handled in Step 2)
    - Compute distance from pusher center to ball center
    - If distance < `PP_PUSHER_RADIUS + PP_BALL_RADIUS` (overlap):
      - Compute collision normal: `(ball.x - pusher.x, ball.y - pusher.y)` normalized
      - Compute overlap amount: `(PP_PUSHER_RADIUS + PP_BALL_RADIUS) - distance`
      - Apply impulse to ball: `ball.velocity.vx += normal.x * PP_PUSH_FORCE * overlap; ball.velocity.vy += normal.y * PP_PUSH_FORCE * overlap`
      - Separate ball from pusher: move ball along normal by overlap distance
      - Increment pusher's `pushCount`
      - Emit `PP_PUSH_EVENT` to ALL:
        ```ts
        { userId: string; userName: string; impulse: { x: impulseX, y: impulseY } }
        ```

- [ ] **Step 4: Apply Ball Velocity**
  - `ball.position.x += ball.velocity.vx`
  - `ball.position.y += ball.velocity.vy`
  - Apply friction: `ball.velocity.vx *= PP_BALL_FRICTION; ball.velocity.vy *= PP_BALL_FRICTION`
  - Clamp speed: if `sqrt(vx² + vy²) > PP_BALL_MAX_SPEED`, normalize and multiply by max
  - Stop near-zero velocities: if `|vx| < 0.01` → `vx = 0`; same for vy (prevents infinite micro-drift)

- [ ] **Step 5: Ball-Wall Collisions**
  - For each wall (AABB):
    - Check if ball overlaps wall rectangle (circle-AABB collision test)
    - If overlap:
      - Determine which face of the wall the ball is closest to (top, bottom, left, right)
      - Push ball out of wall along that face's normal
      - Reflect the ball's velocity component perpendicular to that face: `velocity_perp *= -PP_BALL_WALL_RESTITUTION`
  - Also clamp ball to canvas bounds (treat canvas edges as walls)

- [ ] **Step 6: Ball-Waypoint Check**
  - If `nextWaypointIndex < waypoints.length`:
    - Get the next waypoint (`waypoints[nextWaypointIndex]`)
    - Compute distance from ball center to waypoint center
    - If distance < `PP_WAYPOINT_RADIUS`:
      - Mark waypoint as `reached = true`
      - Award `PP_WAYPOINT_POINTS` to all players
      - Increment `nextWaypointIndex`
      - Emit `PP_WAYPOINT_REACHED` to ALL:
        ```ts
        { waypointOrder: waypoint.order; nextWaypointOrder: nextWaypoint?.order || null }
        ```

- [ ] **Step 7: Goal Zone Check**
  - Check if ball center is within `goalZone` rectangle (point-in-AABB)
  - If required waypoints exist: only trigger goal if ALL waypoints are reached (`nextWaypointIndex >= waypoints.length`)
  - If ball is in goal zone and all waypoints reached:
    - Call `endLevel('GOAL')`

- [ ] **Step 8: Polarity Flip Timer**
  - If `Date.now() >= nextPolarityFlipAt - PP_POLARITY_WARNING_SECONDS * 1000` and `!polarityWarningEmitted`:
    - Select a random player (from connected, non-ghost pushers, different from current `polarityFlippedUserId`)
    - Emit `PP_POLARITY_WARNING` to ALL:
      ```ts
      { targetUserId: string; targetUserName: string; secondsUntilFlip: PP_POLARITY_WARNING_SECONDS }
      ```
    - Set `polarityWarningEmitted = true`
  - If `Date.now() >= nextPolarityFlipAt`:
    - If `polarityFlippedUserId` is not null:
      - Reset previous player's polarity to `'push'`
      - Emit `PP_POLARITY_RESTORE` to ALL:
        ```ts
        { userId: previousFlippedUserId; userName: string }
        ```
      - Evaluate polarity control: compute how much the ball deviated during this flip (compare ball position delta to optimal path). If ball deviation was below threshold → award `PP_POLARITY_CONTROL_BONUS` to the flipped player, increment `polarityFlipsHandled`
    - Set new player's polarity to `'attract'`
    - Set `polarityFlippedUserId` to new player
    - Emit `PP_POLARITY_FLIP` to ALL:
      ```ts
      { userId: string; userName: string; newPolarity: 'attract' }
      ```
    - Set `nextPolarityFlipAt = Date.now() + PP_POLARITY_INTERVAL_SECONDS * 1000`
    - Set `polarityWarningEmitted = false`

- [ ] **Step 9: Disconnected Player Ghost Transition**
  - For each disconnected pusher:
    - If `Date.now() - disconnectedAt > PP_DISCONNECT_GHOST_DELAY_MS` and `!isGhost`:
      - Set `isGhost = true`
      - If this pusher was the `polarityFlippedUserId`: restore polarity to push, select a new target

  **Verification:** Unit test each step individually:
  - Step 1: pusher moves in direction, stops at wall, stays in canvas bounds
  - Step 2: ball within attract radius → velocity changes toward pusher; ball outside radius → no effect
  - Step 3: pusher overlaps ball → impulse applied, push count incremented; attract-polarity pusher → no push collision
  - Step 4: ball moves, friction applied, speed clamped, micro-drift stopped
  - Step 5: ball bounces off wall with restitution 0.6, pushed out of wall
  - Step 6: ball enters waypoint zone → waypoint reached, next waypoint activated; skipped waypoint → not counted
  - Step 7: ball in goal with all waypoints reached → level ends; ball in goal without waypoints → not triggered
  - Step 8: polarity warning at T-3s, flip at T, previous player restored, new player attracted; polarity control evaluation
  - Step 9: disconnected 10s+ → ghost (no collision)

#### 8.3.6.6 State Broadcasting — `broadcastState()`

- [ ] Called at `PP_STATE_BROADCAST_RATE` Hz (15 times per second)
- [ ] Build state snapshot:
  ```ts
  {
    ball: { x: ball.position.x, y: ball.position.y, vx: ball.velocity.vx, vy: ball.velocity.vy };
    pushers: Array.from(pushers.values()).map(p => ({
      userId: p.userId,
      x: p.position.x,
      y: p.position.y,
      polarity: p.polarity,
      isGhost: p.isGhost,
    }));
  }
  ```
- [ ] Emit `rmhbox:game:action` with type `PP_STATE_UPDATE` to ALL lobby
- [ ] This is a compact update — walls and waypoints don't change so they're not re-sent
  **Verification:** State update events emitted at ~15Hz. Payload contains ball + all pushers. No wall/waypoint re-transmission.

#### 8.3.6.7 Input Handling — `PP_MOVE`

- [ ] Validate phase is `'ACTIVE'`; reject if not
- [ ] Parse input through `PPMoveSchema`; reject on validation failure
- [ ] Rate-limit: max `PP_MOVE_INPUT_RATE` inputs per second per player (15Hz); drop excess
- [ ] Update the player's `moveDirection` in their `PusherState`:
  - `{ x: dx, y: dy }` — will be applied on next simulation tick
  - If `dx === 0 && dy === 0`: set `moveDirection = null` (idle)
- [ ] Do NOT broadcast the input — it's consumed by the simulation loop
  **Verification:** Unit test: valid move → direction stored. Rate exceeding 15Hz → excess dropped. Idle input → direction nulled.

#### 8.3.6.8 `getStateForPlayer(userId)`

- [ ] During `LEVEL_PREVIEW`:
  ```ts
  {
    phase: 'LEVEL_PREVIEW';
    level: number;
    levelName: string;
    layout: PPLevelLayout;
    timeRemaining: number;
    scores: Array<{ userId: string; userName: string; totalScore: number }>;
  }
  ```

- [ ] During `ACTIVE`:
  ```ts
  {
    phase: 'ACTIVE';
    level: number;
    ball: { x: number; y: number };
    pushers: Array<{ userId: string; userName: string; x: number; y: number; color: string; polarity: 'push' | 'attract'; isGhost: boolean }>;
    waypoints: Array<{ x: number; y: number; order: number; reached: boolean }>;
    goalZone: { x: number; y: number; width: number; height: number };
    walls: Array<{ ... }>;
    timeRemaining: number;
    myUserId: string;
    scores: Array<{ userId: string; userName: string; totalScore: number }>;
  }
  ```
  - Individual push counts are HIDDEN until results (per spec §3.6)

- [ ] During `LEVEL_COMPLETE`:
  ```ts
  {
    phase: 'LEVEL_COMPLETE';
    level: number;
    timeMs: number;
    waypointsReached: number;
    totalWaypoints: number;
    scores: Array<{ userId: string; userName: string; totalScore: number }>;
  }
  ```

- [ ] During `GAME_OVER`: full final rankings with push counts revealed
  **Verification:** During ACTIVE: individual push counts hidden. During GAME_OVER: push counts visible.

#### 8.3.6.9 `getStateForSpectator()`

- [ ] Same as player view with additional data:
  - Individual push counts visible during ACTIVE phase
  - Real-time polarity control metrics
  **Verification:** Spectator sees push counts during gameplay.

#### 8.3.6.10 Join-in-Progress Handling

- [ ] Policy: `join_immediately`
- [ ] On join during ACTIVE phase:
  - Assign a new `PusherState` at a valid spawn position (not inside wall, away from ball)
    - Algorithm: find a player start position from level data that is unoccupied; if all occupied, pick a random open position
  - Assign next available color from `PP_PUSHER_COLORS`
  - Set polarity to `'push'`
  - Add to `pushers` map
  - Add to simulation immediately
  - Initialize score to 0 (no retroactive scoring for past levels)
  - Send full current state via `getStateForPlayer()`
- [ ] During LEVEL_PREVIEW or LEVEL_COMPLETE: add to roster, will be included in next level
  **Verification:** Unit test: player joins mid-level → pusher spawned at valid position, receives full state, can move immediately.

#### 8.3.6.11 Reconnection Handling (`handlePlayerReconnect(userId)`)

- [ ] Restore pusher position (wherever they left off)
- [ ] Set `isDisconnected = false`, `disconnectedAt = null`
- [ ] If was ghost: set `isGhost = false` (re-enable collision)
- [ ] If polarity was attract: maintain attract state
- [ ] Send full current state via `getStateForPlayer(userId)`
- [ ] Player can immediately resume movement
  **Verification:** Reconnect → pusher at last position, active again, collision enabled, can move.

#### 8.3.6.12 Disconnect Handling (`handlePlayerDisconnect(userId)`)

- [ ] Set pusher `isDisconnected = true`, `disconnectedAt = Date.now()`
- [ ] Set `moveDirection = null` (stop moving)
- [ ] Pusher becomes frozen (still has collision until ghost delay)
- [ ] If pusher had attract polarity:
  - Attraction persists from frozen position
  - After `PP_DISCONNECT_GHOST_DELAY_MS`: restore polarity to push and select new target
- [ ] After `PP_DISCONNECT_GHOST_DELAY_MS`: set `isGhost = true` (no collision, fade visual)
  **Verification:** Disconnect → frozen, attraction persists. After 10s → ghost (no collision). Polarity reassigned.

#### 8.3.6.13 Cleanup (`cleanup()`)

- [ ] Clear `simulationInterval` if active
- [ ] Clear `broadcastInterval` if active
- [ ] Clear all timer intervals
- [ ] Important: physics loop MUST be stopped to prevent memory leaks and CPU waste
  **Verification:** After cleanup: no intervals running. No memory leaks.

#### 8.3.6.14 `computeResults()` and Awards

- [ ] Compute final rankings by cumulative `playerScores` (descending)

- [ ] Compute awards:
  - [ ] **Heavy Hitter** — most ball pushes across all levels; icon: `hand-fist` (or `hand-metal`)
  - [ ] **Gravity Master** — handled polarity attraction best (highest `polarityFlipsHandled`); icon: `magnet`
  - [ ] **Goal Scorer** — last pusher to touch the ball before it entered the goal zone (for the LAST level completed); icon: `target`
  - [ ] **Speed Demon** — level completed fastest (shortest elapsed time for ANY single level); icon: `zap`
  - [ ] **Wall Flower** — spent the most time near walls (cumulative proximity metric, humorous consolation); icon: `flower`

- [ ] Build `PPFinalRanking[]` with total pushes and polarity flips handled
- [ ] Emit `rmhbox:game:action` with type `PP_GAME_OVER`:
  ```ts
  {
    finalRankings: PPFinalRanking[];
    levelsCompleted: number;
    totalPushes: number;
  }
  ```
- [ ] Return `MinigameResults` with rankings, awards, and `gameSpecificData`
  **Verification:** Unit test: player with most pushes gets Heavy Hitter. Goal Scorer tracks last touch. Speed Demon tracks fastest level time.

#### 8.3.6.15 `buildGameLog()`

- [ ] Maintain an `actionLog: GameLogAction[]` array on the game instance
- [ ] Build `GameLog` conforming to core.md §13.3, including `gameSettings` per §12A.11

**`initialState` (from minigames-4.md §3.15):**

```typescript
interface PPGameHistoryInit {
  levelSequence: string[];
  totalLevels: number;
  playerCount: number;
  initialPolarity: Record<string, 'positive' | 'negative'>;
  gameSettings: GameSettingValues;
}
```

**Actions Logged:**

| Action Type | Payload | Recorded When |
|---|---|---|
| `level_start` | `{ levelIndex: number; layoutId: string; timeLimit: number }` | Team begins a level |
| `waypoint_hit` | `{ userId: string; waypointId: string; elapsed: number }` | Player reaches a waypoint |
| `polarity_flip` | `{ targetUserId: string; flippedBy: 'server' \| 'obstacle'; newPolarity: string; elapsed: number }` | Player's polarity is inverted |
| `level_complete` | `{ levelIndex: number; completionTime: number; waypointsCollected: number; timeBonus: number }` | All players reach the exit |
| `level_failed` | `{ levelIndex: number; reason: 'timeout' \| 'all_eliminated'; elapsed: number }` | Team fails a level |
| `game_complete` | `{ levelsCleared: number; totalTime: number; mvpUserId: string; playerStats: Array<{ userId: string; waypointsHit: number; flipsReceived: number }> }` | Run ends |

- [ ] In `computeResults()`, build `GameLog` with `initialState`, full action log, and `finalResults`
- [ ] Return `GameLog` from `buildGameLog()`

**Verification:** Unit test: 3-level game, verify `level_start`/`level_complete` per level, `polarity_flip` events captured, `initialState` has level sequence and initial polarities.

---

### 8.3.7 Physics Utility Module

- [ ] Create `server/rmhbox/minigames/pixel-pushers-physics.ts` (extracted for testability and modularity)
  - [ ] Export `circleCircleCollision(c1: Circle, c2: Circle): CollisionResult | null`
    ```ts
    type Circle = { x: number; y: number; radius: number };
    type CollisionResult = { normal: { x: number; y: number }; overlap: number };
    ```
    - Compute distance between centers
    - If distance < r1 + r2: return collision normal and overlap amount
    - Otherwise: return null
  - [ ] Export `circleAABBCollision(circle: Circle, rect: AABB): CollisionResult | null`
    ```ts
    type AABB = { x: number; y: number; width: number; height: number };
    ```
    - Find closest point on AABB to circle center
    - If distance from closest point to circle center < radius: collision
    - Compute normal and overlap
  - [ ] Export `pointInAABB(point: { x: number; y: number }, rect: AABB): boolean`
    - Simple bounds check
  - [ ] Export `normalizeVector(v: { x: number; y: number }): { x: number; y: number }`
    - Return unit vector; return {0,0} if magnitude is 0
  - [ ] Export `clampMagnitude(v: { x: number; y: number }, max: number): { x: number; y: number }`
    - If magnitude > max: normalize and multiply by max
  - [ ] Export `resolveCircleWallCollision(circle: Circle, velocity: { vx: number; vy: number }, wall: AABB, restitution: number): { position: { x: number; y: number }; velocity: { vx: number; vy: number } }`
    - Push circle out of AABB
    - Reflect velocity component perpendicular to collision face
    - Apply restitution to reflected component
  **Verification:** Unit test each function:
  - Two circles overlapping → collision with correct normal/overlap
  - Two circles not touching → null
  - Circle overlapping AABB → collision resolved
  - Point inside AABB → true; outside → false
  - Vector normalization: (3,4) → (0.6, 0.8); (0,0) → (0,0)
  - Clamp: magnitude 10, max 5 → magnitude 5 in same direction
  - Wall collision: ball bouncing off right wall → vx negated × 0.6

---

### 8.3.8 Register Game in Minigame Registry

- [ ] Add entry to `lib/rmhbox/minigame-registry.ts`:
  ```ts
  {
    id: "pixel-pushers",
    displayName: "Pixel Pushers",
    description: "Work together to push a ball through obstacle courses! But watch out — every 10 seconds, one player becomes a magnet that attracts the ball. Coordinate and adapt!",
    category: "action",
    icon: "move",
    minPlayers: 2,
    maxPlayers: 8,
    estimatedDurationSeconds: 120,
    supportsTeams: true,
    instructionDurationSeconds: 15,
    preloadAssets: {
      images: [],
      sounds: [],
      data: ["/data/rmhbox/pixel-pushers/levels.json"],
      estimatedSizeBytes: 25000,
    },
    joinInProgressPolicy: "join_immediately",
    tags: ["action", "physics", "cooperative", "coordination"],
  }
  ```
  **Verification:** Registry lookup for `"pixel-pushers"` returns correct metadata.

- [ ] Add server handler to `MINIGAME_SERVER_REGISTRY` in `server/rmhbox/minigame-server-registry.ts`:
  ```ts
  import { PixelPushersGame } from './minigames/pixel-pushers';
  MINIGAME_SERVER_REGISTRY.set('pixel-pushers', PixelPushersGame);
  ```
  **Verification:** `MINIGAME_SERVER_REGISTRY.get('pixel-pushers')` returns `PixelPushersGame` class.

- [ ] Add lazy-loaded component to `MinigameRenderer` map in `components/rmhbox/MinigameRenderer.tsx`:
  ```ts
  'pixel-pushers': lazy(() => import('./minigames/pixel-pushers/PixelPushersGame'))
  ```
  **Verification:** `MinigameRenderer` renders `<Suspense>` fallback, then loads `PixelPushersGame` chunk on demand.

---

### 8.3.9 Build Client Components

#### 8.3.9.1 `components/rmhbox/minigames/pixel-pushers/PixelPushersGame.tsx`

- [ ] Phase router component — renders based on `phase`
- [ ] Subscribe to all `PP_*` and `TIMER_TICK` events via `useRMHboxStore`
- [ ] Maintain local state:
  - `phase`, `level`, `levelName`, `layout` (walls, goal, waypoints)
  - `ball` (position), `pushers[]` (positions, colors, polarities)
  - `timeRemaining`, `scores[]`, `myUserId`
- [ ] Handle `PP_LEVEL_START` → set level data, show preview
- [ ] Handle `PP_STATE_UPDATE` → update ball and pusher positions (interpolate for smooth rendering between updates at 15Hz)
- [ ] Handle `PP_PUSH_EVENT` → trigger push visual effect (brief particle burst)
- [ ] Handle `PP_POLARITY_WARNING` → show warning countdown on target player
- [ ] Handle `PP_POLARITY_FLIP` → update pusher polarity, show "MAGNET!" indicator
- [ ] Handle `PP_POLARITY_RESTORE` → restore pusher to push mode
- [ ] Handle `PP_WAYPOINT_REACHED` → animate waypoint as reached (checkmark)
- [ ] Handle `PP_LEVEL_COMPLETE` → celebration animation
- [ ] Handle `PP_LEVEL_FAILED` → failure animation
- [ ] Handle `PP_GAME_OVER` → show final results
- [ ] Handle `TIMER_TICK` → update timer
- [ ] **Input emission:** capture keyboard (WASD/arrows) on desktop; virtual joystick on mobile. Emit `PP_MOVE` at `PP_MOVE_INPUT_RATE` Hz (15 times/second) while input is active
- [ ] Conditional rendering:
  - `LEVEL_PREVIEW` → `<LevelPreview />` (show layout with labels)
  - `ACTIVE` → `<GameCanvas />` + controls (keyboard/joystick)
  - `LEVEL_COMPLETE` → `<LevelComplete />` celebration
  - `GAME_OVER` → `<PixelPushersResults />`
  **Verification:** Component renders for each phase. Input emits at correct rate. Interpolation smooths 15Hz updates.

#### 8.3.9.2 `components/rmhbox/minigames/pixel-pushers/GameCanvas.tsx`

- [ ] HTML5 Canvas renderer for the game field
- [ ] Props: `{ ball, pushers, walls, goalZone, waypoints, myUserId, canvasWidth, canvasHeight }`
- [ ] Render layers (back to front):
  1. Background (light gray)
  2. Goal zone (green semi-transparent rectangle with "GOAL" text)
  3. Walls (dark gray/black rectangles)
  4. Waypoints (numbered circles, green checkmark if reached, yellow if next, gray if future)
  5. Ball (neutral gray circle with subtle shadow)
  6. Pushers (colored circles with player initials, "MAGNET!" label if attracting, ghosted if disconnected)
- [ ] Client-side interpolation: lerp ball and pusher positions between state updates for smooth visuals at 60fps
- [ ] Responsive scaling: canvas scales to fit container while maintaining aspect ratio (600:400)
- [ ] Canvas dimensions adapt to screen size; use `devicePixelRatio` for sharp rendering on retina displays
  **Verification:** Canvas renders all elements. Ball and pushers move smoothly. Responsive on mobile. Retina sharp.

#### 8.3.9.3 `components/rmhbox/minigames/pixel-pushers/VirtualJoystick.tsx`

- [ ] On-screen touch joystick for mobile movement
- [ ] Position: bottom-left corner of screen (above any bottom bar)
- [ ] Visual: outer circle (boundary) + inner circle (thumb position)
- [ ] Touch handling:
  - On touch start: record touch origin
  - On touch move: compute direction vector from origin to current touch position; normalize; emit as `PP_MOVE` direction
  - On touch end: emit `{ dx: 0, dy: 0 }` (idle)
- [ ] Configurable size: `joystickRadius` prop, default 60px
- [ ] Semi-transparent so it doesn't fully block game view
- [ ] Only rendered on mobile/touch devices (use `useIsMobile()` hook)
  **Verification:** Joystick appears on mobile. Touch emits correct directions. Release emits idle.

#### 8.3.9.4 `components/rmhbox/minigames/pixel-pushers/PolarityIndicator.tsx`

- [ ] Visual indicator for a player with attract polarity
- [ ] Props: `{ userName: string; secondsUntilFlip?: number; isWarning?: boolean }`
- [ ] Warning state: pulsing yellow "⚠️ POLARITY FLIP in 3s → [PlayerName]"
- [ ] Active state: pulsing red "MAGNET!" label on the player's pusher
- [ ] Attract lines: animated dashed lines radiating from the attracted player toward the ball (visual effect showing attraction)
- [ ] Position: follows the attracted player's pusher on the canvas
  **Verification:** Warning shows countdown. Active shows magnet indicator. Lines animate.

#### 8.3.9.5 `components/rmhbox/minigames/pixel-pushers/WaypointMarker.tsx`

- [ ] Waypoint circle with order number
- [ ] Props: `{ order: number; reached: boolean; isNext: boolean }`
- [ ] States: future (gray, numbered), next (yellow, pulsing, numbered), reached (green, checkmark)
- [ ] Animated transition on reach (scale pop + color change)
  **Verification:** Three states render correctly. Animation on reach.

#### 8.3.9.6 `components/rmhbox/minigames/pixel-pushers/LevelComplete.tsx`

- [ ] Level success celebration
- [ ] Props: `{ timeMs: number; waypointsReached: number; totalWaypoints: number }`
- [ ] Confetti animation (using `canvas-confetti`)
- [ ] Time display: "Completed in 42s"
- [ ] Waypoints reached counter
- [ ] Brief display before next level loads
  **Verification:** Confetti fires. Time and waypoint stats shown.

#### 8.3.9.7 `components/rmhbox/minigames/pixel-pushers/PixelPushersResults.tsx`

- [ ] Final results screen
- [ ] Props: `{ finalRankings: PPFinalRanking[]; levelsCompleted: number; totalPushes: number }`
- [ ] Rankings table: rank, player name (with color dot), total score, push count, polarity flips handled
- [ ] Summary: "3/3 levels completed!" or "2/3 levels completed"
- [ ] Awards display
- [ ] Winner highlighted (cooperative, so highest individual score)
  **Verification:** Rankings correct. Stats displayed. Awards shown.

#### 8.3.9.8 Sound Effects

- [ ] Wire up sound effects for Pixel Pushers events:
  - `PP_LEVEL_START` → `playSound('goFanfare')`
  - `PP_PUSH_EVENT` → `playSound('click')`
  - `PP_POLARITY_WARNING` → `playSound('countdownBeep')`
  - `PP_POLARITY_FLIP` → `playSound('swoosh')`
  - `PP_WAYPOINT_REACHED` → `playSound('scoreDing')`
  - `PP_LEVEL_COMPLETE` → `playSound('victoryFanfare')`
  - `PP_LEVEL_FAILED` → `playSound('buzzer')`
  - `PP_GAME_OVER` → `playSound('victoryFanfare')`
  **Verification:** Each event triggers the correct sound exactly once. Volume settings respected.

#### 8.3.9.9 Zustand Store Integration

- [ ] Read all pusher positions, ball state, and polarity info from `publicState` (cooperative game)
- [ ] Client uses `requestAnimationFrame` to interpolate between 15Hz server state updates for smooth 60fps rendering
- [ ] Spectator sees same view but `VirtualJoystick` disabled
  **Verification:** Store reflects all cooperative state. Interpolation produces smooth animation. Spectator cannot emit inputs.

---

### 8.3.10 Integration Testing

- [ ] End-to-end test: 4 players join lobby → start Pixel Pushers → play through 3 levels
  - [ ] Verify ball physics: pusher push → ball moves in correct direction with correct speed
  - [ ] Verify friction: ball decelerates and eventually stops
  - [ ] Verify wall collision: ball bounces off walls with restitution 0.6
  - [ ] Verify pusher-wall collision: pushers cannot pass through walls
  - [ ] Verify waypoint detection: ball enters waypoint zone → marked as reached, points awarded
  - [ ] Verify waypoint ordering: waypoint 3 not triggered before waypoint 2
  - [ ] Verify goal detection: ball in goal zone with all waypoints reached → level complete
  - [ ] Verify polarity flip: warning at T-3s, flip at T, attraction force applied, previous restored
  - [ ] Verify scoring: level complete + waypoints + time bonus + MVP + polarity control
  **Verification:** All assertions pass.

- [ ] Physics accuracy test:
  - [ ] Push ball at 45° angle into corner → correct bounce behavior (two wall reflections)
  - [ ] Ball at max speed → speed clamped to `PP_BALL_MAX_SPEED`
  - [ ] Ball with near-zero velocity → stops (no infinite drift)
  - [ ] Attraction force: ball within 80px of attracted player → accelerates toward them
  - [ ] Attraction force: ball at 40px → stronger force than at 70px (inverse-square)
  - [ ] Attraction clamped at `PP_MAX_ATTRACT_FORCE`
  **Verification:** Physics behave correctly in edge cases.

- [ ] Information masking test:
  - [ ] During ACTIVE: individual push counts NOT in player state
  - [ ] Spectator during ACTIVE: push counts visible
  - [ ] During GAME_OVER: push counts visible to all
  **Verification:** Push counts hidden during gameplay for players.

- [ ] JIP test: Player joins during level 2 → spawns at valid position, can move immediately, score starts at 0
  **Verification:** JIP works for cooperative game.

- [ ] Disconnect test: Player disconnects → pusher frozen → after 10s becomes ghost (no collision)
  **Verification:** Ghost transition works. Polarity reassigned if needed.

- [ ] Performance test: 8 players, all moving, physics simulation at 30Hz, broadcast at 15Hz → server CPU usage acceptable
  **Verification:** No frame drops. Simulation stays on schedule.

### 8.3.11 Game Settings Integration (§12A)

Integrate host-configurable settings using the §12A system.

#### Registry Entry

- [ ] Export `PIXEL_PUSHERS_SETTINGS: GameSettingsSchema` in `lib/rmhbox/minigame-registry.ts` with 4 entries:
  - `totalLevels` (integer, default `3`, min 2, max 5, step 1)
  - `activeDuration` (integer, default `90`, min 45, max 180, step 15)
  - `enablePolarityFlip` (boolean, default `true`)
  - `polarityInterval` (integer, default `15`, min 8, max 30, step 1)
- [ ] Attach `settingsSchema: PIXEL_PUSHERS_SETTINGS` to the `pixel-pushers` `MinigameDefinition`.
  **Verification:** Registry lookup returns definition with `settingsSchema` containing 4 entries.

#### Handler `getSetting()` Integration

Replace hardcoded constants with `this.getSetting()` calls in the Pixel Pushers handler:

| Constant | Setting Key | Replacement |
|---|---|---|
| `PP_TOTAL_LEVELS` | `totalLevels` | `this.getSetting('totalLevels', PP_TOTAL_LEVELS)` |
| `PP_ACTIVE_DURATION` | `activeDuration` | `this.getSetting('activeDuration', PP_ACTIVE_DURATION)` |
| `PP_ENABLE_POLARITY_FLIP` | `enablePolarityFlip` | `this.getSetting('enablePolarityFlip', PP_ENABLE_POLARITY_FLIP)` |
| `PP_POLARITY_INTERVAL` | `polarityInterval` | `this.getSetting('polarityInterval', PP_POLARITY_INTERVAL)` |

- [ ] **Boolean setting logic:** When `enablePolarityFlip` is `false`, push/pull controls never invert — players retain their initial polarity for the entire run. The `polarityInterval` setting is ignored when polarity flipping is disabled.
  **Verification:** Each constant usage replaced. Handler respects custom settings passed via `MinigameContext.gameSettings`.

---

### 8.3.13 History Display Configuration

Implement the history display config for Pixel Pushers as defined in `minigames-4.md §3.16`.

#### 8.3.13.1 Create Detail Component

Create `components/rmhbox/minigames/pixel-pushers/PixelPushersHistoryDetail.tsx`:
- Render arena layout with block positions and polarity states
- Show goal zone completion status and per-player push contributions
- Display polarity toggle timeline and score breakdown per goal zone

#### 8.3.13.2 Register History Display

Add registration in `lib/rmhbox/history-display-registrations.ts` with:
- Searchable fields: `playerNames` (player names)
- Filterable fields: `blocksScored` (range), `polarityToggles` (range)
- Summary: `{scored} blocks scored — Physics puzzle`

#### 8.3.13.3 Tests

- [ ] Verify `getHistoryDisplay('pixel-pushers')` returns a valid config
- [ ] Verify searchable fields extract player names from a mock game log
- [ ] Verify filterable fields include blocksScored (range) and polarityToggles (range)
- [ ] Verify `getSummary()` returns a meaningful string for a mock game log
- [ ] Verify `DetailComponent` renders without errors when given a valid game log

---

## 8.4 Scroll Soul

**Game ID:** `scroll-soul` | **Category:** `action` | **Icon:** `flame`
**Players:** 2–8 | **Duration:** ~120s or until all eliminated

---

### 8.4.1 Install NPM Packages

- [ ] **(Optional)** Install `seedrandom` for deterministic procedural generation:
  ```bash
  pnpm add seedrandom
  pnpm add -D @types/seedrandom
  ```
  - Purpose: allows seeding the RNG per game instance so that all clients can deterministically predict safe zone positions (for client-side pre-rendering) while server remains authoritative
  - Alternative: use server-only RNG via `Math.random()` and send zone positions in state broadcasts
  **Verification:** `import seedrandom from 'seedrandom'` compiles. OR confirm server-only RNG approach chosen.

---

### 8.4.2 Add Constants to `lib/rmhbox/constants.ts`

- [ ] Add `SC_CANVAS_WIDTH = 400` — logical canvas width in pixels
- [ ] Add `SC_CANVAS_HEIGHT = 600` — logical canvas height in pixels (tall portrait orientation for vertical scrolling)
- [ ] Add `SC_PLAYER_WIDTH = 20` — player character width in pixels
- [ ] Add `SC_PLAYER_HEIGHT = 30` — player character height in pixels
- [ ] Add `SC_GRAVITY = 0.5` — gravity acceleration per tick (pixels/tick²)
- [ ] Add `SC_JUMP_VELOCITY = -10` — initial upward velocity on jump (negative = up)
- [ ] Add `SC_MOVE_SPEED = 4` — horizontal movement speed in pixels per tick
- [ ] Add `SC_MAX_FALL_SPEED = 12` — terminal velocity (max downward velocity)
- [ ] Add `SC_SCROLL_SPEED_INITIAL = 1.0` — starting viewport scroll speed (pixels/tick upward)
- [ ] Add `SC_SCROLL_SPEED_INCREMENT = 0.02` — scroll speed increase per second
- [ ] Add `SC_SCROLL_SPEED_MAX = 4.0` — maximum scroll speed
- [ ] Add `SC_LAVA_HEIGHT = 40` — height of the lava zone at the bottom of viewport
- [ ] Add `SC_SAFE_ZONE_MIN_WIDTH = 60` — minimum safe zone (platform) width
- [ ] Add `SC_SAFE_ZONE_MAX_WIDTH = 120` — maximum safe zone width
- [ ] Add `SC_SAFE_ZONE_HEIGHT = 10` — platform thickness
- [ ] Add `SC_SAFE_ZONE_VERTICAL_GAP_MIN = 60` — minimum vertical distance between platform tiers
- [ ] Add `SC_SAFE_ZONE_VERTICAL_GAP_MAX = 100` — maximum vertical distance between platform tiers
- [ ] Add `SC_SAFE_ZONE_HORIZONTAL_PADDING = 20` — minimum distance from platform edge to canvas edge
- [ ] Add `SC_MOVING_PLATFORM_SPEED = 1.5` — horizontal speed of moving platforms
- [ ] Add `SC_SHRINKING_PLATFORM_RATE = 0.5` — pixels per second a shrinking platform shrinks from each side
- [ ] Add `SC_AD_SPAWN_INTERVAL_MIN = 8` — minimum seconds between fake ad spawns
- [ ] Add `SC_AD_SPAWN_INTERVAL_MAX = 15` — maximum seconds between fake ad spawns
- [ ] Add `SC_AD_DURATION_SECONDS = 5` — how long a fake ad stays on screen before auto-dismissing
- [ ] Add `SC_AD_EFFECT_DURATION_SECONDS = 3` — how long the ad's effect lasts after player clicks wrong X
- [ ] Add `SC_AD_OBSCURE_OPACITY = 0.7` — opacity of the visual obstruction effect
- [ ] Add `SC_AD_PUSH_FORCE = 3` — horizontal push force applied by the "push" ad effect
- [ ] Add `SC_AD_SLOW_MULTIPLIER = 0.5` — movement speed multiplier for the "slow" effect
- [ ] Add `SC_AD_INVERT_MULTIPLIER = -1` — movement direction multiplier for the "invert" effect
- [ ] Add `SC_SIMULATION_TICK_MS = 33` — physics tick interval (~30Hz)
- [ ] Add `SC_STATE_BROADCAST_RATE = 15` — state broadcast frequency in Hz
- [ ] Add `SC_ELIMINATION_POINTS_BASE = 100` — base points for surviving (awarded to all at start, reduced on early elimination)
- [ ] Add `SC_SURVIVAL_BONUS_PER_SECOND = 5` — bonus points per second survived
- [ ] Add `SC_AD_DISMISS_BONUS = 20` — bonus per correctly dismissed fake ad
- [ ] Add `SC_LAST_SURVIVOR_BONUS = 150` — bonus for being the last player standing
- [ ] Add `SC_GHOST_SPECTATE_DELAY_MS = 2000` — ms after elimination before player becomes ghost spectator
- [ ] Add `SC_RESPAWN_INVINCIBILITY_MS = 0` — no respawn (elimination is permanent in this game)
- [ ] Add `SC_GENERATION_LOOKAHEAD = 400` — pixels of platform generation ahead of viewport top
- [ ] Add `SC_GENERATION_CULL_BEHIND = 200` — pixels behind viewport bottom before platforms are culled
- [ ] Add `SC_PLAYER_COLORS` — array of player ghost colors (8 entries, matching pusher colors or distinct):
  ```ts
  const SC_PLAYER_COLORS = [
    '#EF4444', '#3B82F6', '#22C55E', '#F59E0B',
    '#A855F7', '#EC4899', '#14B8A6', '#F97316',
  ];
  ```
- [ ] **Verification:** Import all `SC_*` constants in a test file; confirm no undefined values and correct types. Verify `SC_GRAVITY > 0`, `SC_JUMP_VELOCITY < 0`, `SC_SCROLL_SPEED_INITIAL < SC_SCROLL_SPEED_MAX`.

---

### 8.4.3 Create Static Data Files

- [ ] No static data files needed — Scroll Soul uses procedural generation
  - Safe zone positions, moving/shrinking platform assignments, and fake ad content are all generated at runtime by the server
  **Verification:** Confirm no static JSON files required.

- [ ] Define fake ad templates inline in the server handler constants or in a small module:
  ```ts
  const FAKE_AD_TEMPLATES = [
    { headline: "🔥 You Won a FREE iPhone!", body: "Click here NOW!!!", style: "flashy" },
    { headline: "WARNING: Your Soul is at Risk!", body: "Download SoulGuard™ today!", style: "scary" },
    { headline: "Hot Singles in Your Dungeon", body: "They're dying to meet you!", style: "cringe" },
    { headline: "Congratulations Player!", body: "You've been selected for a bonus round!", style: "fake-official" },
    { headline: "ANTIVIRUS ALERT", body: "69 viruses detected! Click to scan!", style: "alarm" },
    { headline: "You Look Tired...", body: "Try MegaEnergy Drink™! Only $0.99!", style: "chill" },
    { headline: "ENLARGE YOUR SCORE", body: "Doctors hate this one trick!", style: "spam" },
    { headline: "FREE V-BUCKS GENERATOR", body: "100% legit no scam working 2024!", style: "gaming" },
  ];
  ```
  - Each ad will have one real close button (tiny, positioned randomly in corners) and one fake close button (larger, centered, triggers effect)
  **Verification:** At least 8 templates defined. Each has headline, body, and style.

---

### 8.4.4 Define Zod Validation Schemas

- [ ] Create `lib/rmhbox/scroll-soul/schemas.ts`

- [ ] Define `SCInputSchema`:
  ```ts
  const SCInputSchema = z.object({
    dx: z.number().min(-1).max(1),
    jump: z.boolean(),
  });
  ```
  - `dx`: horizontal movement direction (-1 = left, 0 = idle, 1 = right, fractional for analog)
  - `jump`: true = jump (only applies if grounded)
  **Verification:** Valid: `{ dx: 1, jump: false }`, `{ dx: 0, jump: true }`. Invalid: `{ dx: 2, jump: "yes" }`.

- [ ] Define `SCCloseAdSchema`:
  ```ts
  const SCCloseAdSchema = z.object({
    adId: z.string().min(1),
    clickPosition: z.object({ x: z.number(), y: z.number() }),
  });
  ```
  - `adId`: identifier of the fake ad being dismissed
  - `clickPosition`: where the player clicked (server validates if it's on the REAL close button)
  **Verification:** Valid: `{ adId: "ad_1", clickPosition: { x: 340, y: 12 } }`. Invalid: missing `adId`.

---

### 8.4.5 Implement Server Handler

- [ ] Create `server/rmhbox/minigames/scroll-soul.ts`

#### 8.4.5.1 Type Definitions

- [ ] Define `SCPhase` type:
  ```ts
  type SCPhase = 'COUNTDOWN' | 'ACTIVE' | 'GAME_OVER';
  ```
  **Verification:** Type has exactly 3 values. COUNTDOWN is the pre-game countdown, ACTIVE is gameplay, GAME_OVER when last player eliminated or time-based.

- [ ] Define `PlayerState` type:
  ```ts
  type PlayerState = {
    userId: string;
    position: { x: number; y: number };
    velocity: { vx: number; vy: number };
    color: string;
    isGrounded: boolean;
    isAlive: boolean;
    eliminatedAt: number | null;
    survivalTimeMs: number;
    moveInput: { dx: number; jump: boolean } | null;
    activeEffect: AdEffect | null;
    effectExpiresAt: number | null;
    adsCorrectlyDismissed: number;
    adsFailed: number;
    score: number;
    eliminationRank: number | null;
  };
  ```

- [ ] Define `AdEffect` type:
  ```ts
  type AdEffect = 'obscure' | 'push' | 'slow' | 'invert';
  ```

- [ ] Define `FakeAd` type:
  ```ts
  type FakeAd = {
    id: string;
    template: typeof FAKE_AD_TEMPLATES[number];
    targetUserId: string;
    realCloseButton: { x: number; y: number; width: number; height: number };
    fakeCloseButton: { x: number; y: number; width: number; height: number };
    effect: AdEffect;
    spawnedAt: number;
    expiresAt: number;
    dismissed: boolean;
  };
  ```

- [ ] Define `Platform` type:
  ```ts
  type Platform = {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    type: 'static' | 'moving' | 'shrinking';
    // Moving platform fields:
    moveRangeMin?: number;
    moveRangeMax?: number;
    moveDirection?: 1 | -1;
    // Shrinking platform fields:
    originalWidth?: number;
    shrinkStartedAt?: number;
  };
  ```

- [ ] Define `SCFinalRanking` type:
  ```ts
  type SCFinalRanking = {
    userId: string;
    userName: string;
    rank: number;
    totalScore: number;
    survivalTimeMs: number;
    adsCorrectlyDismissed: number;
    adsFailed: number;
    eliminationRank: number;
  };
  ```

- [ ] Define `ScrollSoulState` type:
  ```ts
  type ScrollSoulState = {
    phase: SCPhase;
    players: Map<string, PlayerState>;
    platforms: Platform[];
    activeAds: Map<string, FakeAd>;
    viewportY: number;
    scrollSpeed: number;
    gameStartedAt: number;
    elapsedMs: number;
    generationY: number;
    platformIdCounter: number;
    adIdCounter: number;
    nextAdSpawnAt: number;
    alivePlayers: number;
    eliminationOrder: string[];
    rng: (() => number) | null;
    simulationInterval: NodeJS.Timeout | null;
    broadcastInterval: NodeJS.Timeout | null;
  };
  ```
  **Verification:** All types compile without errors. Cross-reference every field against design spec §4.

#### 8.4.5.2 Class: `ScrollSoulGame extends BaseMinigame`

- [ ] Constructor: call `super(context)`
  **Verification:** Instantiate class; confirm no errors.

#### 8.4.5.3 State Initialization (`start()`)

- [ ] Create RNG instance: `seedrandom(gameId)` or use `Math.random` (depends on 8.4.1 decision)
- [ ] Initialize `viewportY = 0` (viewport starts at bottom of the world)
- [ ] Initialize `scrollSpeed = SC_SCROLL_SPEED_INITIAL`
- [ ] Initialize `generationY = viewportY - SC_CANVAS_HEIGHT - SC_GENERATION_LOOKAHEAD` (generate platforms above viewport)
- [ ] Initialize `platformIdCounter = 0`, `adIdCounter = 0`
- [ ] Generate initial platforms:
  - Call `generatePlatforms()` to fill the viewport and lookahead region
  - Ensure a solid ground platform at the starting area so players don't immediately fall
- [ ] Initialize `players` map:
  - For each player: assign starting position at ground level, spaced evenly
  - Starting velocity: `{ vx: 0, vy: 0 }`
  - `isGrounded = true`, `isAlive = true`, `eliminatedAt = null`
  - Assign color from `SC_PLAYER_COLORS[i]`
  - All other fields initialized to 0/null
- [ ] Set `nextAdSpawnAt = Date.now() + randomBetween(SC_AD_SPAWN_INTERVAL_MIN, SC_AD_SPAWN_INTERVAL_MAX) * 1000`
- [ ] Set `alivePlayers = totalPlayerCount`
- [ ] Set `eliminationOrder = []`
- [ ] Set `phase = 'COUNTDOWN'`
- [ ] Start 3-second countdown (emit TIMER_TICK for 3, 2, 1)
- [ ] After countdown: call `startActive()`
  **Verification:** Unit test with 4 players: all at ground level, platforms generated above, countdown starts.

#### 8.4.5.4 Procedural Generation — `generatePlatforms()`

- [ ] Generate platforms from current `generationY` upward to fill the lookahead region
- [ ] Platform generation algorithm:
  1. While `generationY > viewportY - SC_CANVAS_HEIGHT - SC_GENERATION_LOOKAHEAD`:
     - Generate a "tier" of 1-3 platforms at this Y level
     - `tierY = generationY`
     - Number of platforms per tier: random 1-3 (more at lower difficulty, fewer as speed increases)
     - For each platform in tier:
       - Width: random between `SC_SAFE_ZONE_MIN_WIDTH` and `SC_SAFE_ZONE_MAX_WIDTH`
       - X position: random within `[SC_SAFE_ZONE_HORIZONTAL_PADDING, SC_CANVAS_WIDTH - width - SC_SAFE_ZONE_HORIZONTAL_PADDING]`
       - Avoid overlapping with other platforms in the same tier
     - Platform type distribution (based on elapsed time / scroll speed):
       - Early game (0-30s): 80% static, 15% moving, 5% shrinking
       - Mid game (30-60s): 50% static, 30% moving, 20% shrinking
       - Late game (60s+): 30% static, 35% moving, 35% shrinking
     - For `moving` platforms:
       - `moveRangeMin` and `moveRangeMax`: platform oscillates horizontally within this range
       - `moveDirection = 1` (initial direction)
     - For `shrinking` platforms:
       - `originalWidth = width`
       - `shrinkStartedAt`: set when platform first enters viewport
     - `id = 'plat_' + platformIdCounter++`
     - Add to `platforms` array
  2. Advance `generationY` by random `[SC_SAFE_ZONE_VERTICAL_GAP_MIN, SC_SAFE_ZONE_VERTICAL_GAP_MAX]` (negative, since Y decreases upward)
- [ ] Cull old platforms: remove platforms with `y > viewportY + SC_GENERATION_CULL_BEHIND` (below viewport bottom)
- [ ] Guarantee reachability: every platform tier must have at least one platform reachable from a platform in the tier below via a jump arc calculation:
  - Horizontal reach per jump = `SC_MOVE_SPEED * jumpDuration` where jumpDuration = `2 * |SC_JUMP_VELOCITY| / SC_GRAVITY`
  - Vertical reach = `SC_JUMP_VELOCITY² / (2 * SC_GRAVITY)` (peak height)
  - If no platform in the new tier is reachable, generate an additional bridging platform
  **Verification:** Unit test: generate 100 tiers → all tiers have reachable platforms. No overlapping platforms in a tier. Platform types shift with difficulty. Culling removes platforms below viewport.

#### 8.4.5.5 Active Phase — `startActive()`

- [ ] Set `phase = 'ACTIVE'`
- [ ] Set `gameStartedAt = Date.now()`
- [ ] Start simulation loop: `setInterval(simulationTick, SC_SIMULATION_TICK_MS)`
- [ ] Start broadcast loop: `setInterval(broadcastState, 1000 / SC_STATE_BROADCAST_RATE)`
- [ ] Start scroll speed incrementer: every second, increase `scrollSpeed` by `SC_SCROLL_SPEED_INCREMENT`, clamped to `SC_SCROLL_SPEED_MAX`
  **Verification:** Simulation at ~30Hz. Broadcast at ~15Hz. Scroll accelerates.

#### 8.4.5.6 Physics Simulation — `simulationTick()`

Each tick (~33ms):

- [ ] **Step 1: Update Viewport**
  - `viewportY -= scrollSpeed` (viewport moves upward; Y decreases upward)
  - Update `elapsedMs = Date.now() - gameStartedAt`

- [ ] **Step 2: Generate Platforms (if needed)**
  - If `viewportY - SC_CANVAS_HEIGHT - SC_GENERATION_LOOKAHEAD < generationY`:
    - Call `generatePlatforms()` to generate new platforms above

- [ ] **Step 3: Update Moving Platforms**
  - For each `moving` platform:
    - `platform.x += SC_MOVING_PLATFORM_SPEED * platform.moveDirection`
    - If `platform.x <= platform.moveRangeMin` or `platform.x + platform.width >= platform.moveRangeMax`:
      - Reverse `platform.moveDirection`

- [ ] **Step 4: Update Shrinking Platforms**
  - For each `shrinking` platform:
    - If platform is within viewport and `shrinkStartedAt` is set:
      - `timeShrinking = (Date.now() - shrinkStartedAt) / 1000`
      - `shrunkAmount = timeShrinking * SC_SHRINKING_PLATFORM_RATE`
      - `newWidth = originalWidth - shrunkAmount * 2` (shrink from both sides)
      - If `newWidth <= 0`: remove platform from array
      - Else: update `width = newWidth`, center x adjusted
    - If platform first enters viewport: set `shrinkStartedAt = Date.now()`

- [ ] **Step 5: Apply Player Physics (for each alive player)**
  - If `moveInput` is not null:
    - Compute effective speed:
      ```ts
      let effectiveSpeed = SC_MOVE_SPEED;
      if (activeEffect === 'slow') effectiveSpeed *= SC_AD_SLOW_MULTIPLIER;
      if (activeEffect === 'invert') effectiveSpeed *= SC_AD_INVERT_MULTIPLIER;
      ```
    - Apply horizontal movement: `velocity.vx = moveInput.dx * effectiveSpeed`
    - If `moveInput.jump && isGrounded`:
      - `velocity.vy = SC_JUMP_VELOCITY`
      - `isGrounded = false`
  - If `activeEffect === 'push'`:
    - Apply constant horizontal push: `velocity.vx += SC_AD_PUSH_FORCE` (or negative, depending on push direction chosen when effect activates)
  - Apply gravity: `velocity.vy += SC_GRAVITY`
  - Clamp fall speed: `velocity.vy = Math.min(velocity.vy, SC_MAX_FALL_SPEED)`
  - Update position: `position.x += velocity.vx; position.y += velocity.vy`

- [ ] **Step 6: Platform Collision Resolution (for each alive player)**
  - Set `isGrounded = false`
  - For each platform:
    - Check if player's bounding box overlaps platform's bounding box
    - If player was above platform on previous tick and now overlapping (falling through from above):
      - Snap player to platform top: `position.y = platform.y - SC_PLAYER_HEIGHT`
      - `velocity.vy = 0`
      - `isGrounded = true`
      - If platform is `moving`: add platform velocity to player (player rides the platform)
    - **One-way platforms:** players can jump through from below (only collide when falling from above)
  - Horizontal bounds: wrap around canvas or clamp:
    - If `position.x + SC_PLAYER_WIDTH < 0`: wrap to right side
    - If `position.x > SC_CANVAS_WIDTH`: wrap to left side
    - (Per spec §4.3: player wraps around horizontally — leaving left appears on right)

- [ ] **Step 7: Lava / Elimination Check**
  - Lava zone Y: `viewportY + SC_CANVAS_HEIGHT - SC_LAVA_HEIGHT` (bottom of viewport, accounting for scroll)
  - If `position.y + SC_PLAYER_HEIGHT > lavaY` (player touching or below lava):
    - Set `isAlive = false`
    - Set `eliminatedAt = Date.now()`
    - Set `survivalTimeMs = eliminatedAt - gameStartedAt`
    - Set `eliminationRank = players.size - alivePlayers + 1` (order of elimination: last eliminated = rank 1)
    - Push `userId` to `eliminationOrder`
    - Decrement `alivePlayers`
    - Award survival bonus: `Math.floor(survivalTimeMs / 1000) * SC_SURVIVAL_BONUS_PER_SECOND`
    - Emit `SC_PLAYER_ELIMINATED` to ALL:
      ```ts
      { userId: string; userName: string; survivalTimeMs: number; remainingPlayers: alivePlayers }
      ```
    - If `alivePlayers <= 1`:
      - If `alivePlayers === 1`: award last survivor bonus (`SC_LAST_SURVIVOR_BONUS`)
      - Call `endGame()`

- [ ] **Step 8: Ad Effect Expiration**
  - For each alive player with `activeEffect`:
    - If `Date.now() > effectExpiresAt`: clear `activeEffect` and `effectExpiresAt`

- [ ] **Step 9: Ad Spawning**
  - If `Date.now() >= nextAdSpawnAt` and `alivePlayers > 0`:
    - Select a random alive player as target
    - Select random template from `FAKE_AD_TEMPLATES`
    - Select random effect from `['obscure', 'push', 'slow', 'invert']`
    - Generate ad layout:
      - Real close button: small (12×12 px), positioned in a random corner of the ad overlay
      - Fake close button: larger (24×24 px), positioned prominently (center-top or where users instinctively click)
    - Create `FakeAd` with unique ID (`'ad_' + adIdCounter++`)
    - Set `expiresAt = Date.now() + SC_AD_DURATION_SECONDS * 1000`
    - Add to `activeAds` map
    - Send `SC_AD_SPAWN` ONLY to the targeted player:
      ```ts
      {
        adId: string;
        template: { headline: string; body: string; style: string };
        realCloseButton: { x: number; y: number; width: number; height: number };
        fakeCloseButton: { x: number; y: number; width: number; height: number };
      }
      ```
      - **CRITICAL:** Real and fake close button positions are sent to the client so it can render them, but the server is authoritative on which one is "real" — clicks are validated server-side
    - Set `nextAdSpawnAt = Date.now() + randomBetween(SC_AD_SPAWN_INTERVAL_MIN, SC_AD_SPAWN_INTERVAL_MAX) * 1000`
  - Auto-dismiss expired ads:
    - For each ad in `activeAds`:
      - If `Date.now() > ad.expiresAt && !ad.dismissed`:
        - Dismiss ad without penalty (no effect applied)
        - Remove from `activeAds`
        - Send `SC_AD_DISMISSED` to target player: `{ adId: string; reason: 'expired' }`

  **Verification:** Unit test each step individually:
  - Step 1: viewport scrolls upward at increasing speed
  - Step 2: new platforms generated as viewport approaches edge
  - Step 3: moving platforms oscillate within range
  - Step 4: shrinking platforms reduce width, removed when width ≤ 0
  - Step 5: player moves, jumps, gravity applied, ad effects modify movement
  - Step 6: player lands on platform, rides moving platforms, wraps horizontally
  - Step 7: player in lava → eliminated, bonus awarded, game ends when ≤1 remain
  - Step 8: effects expire after duration
  - Step 9: ads spawn for random players at scheduled intervals, auto-dismiss after timeout

#### 8.4.5.7 Input Handling — `SC_MOVE`

- [ ] Validate phase is `'ACTIVE'`; reject if not
- [ ] Validate player `isAlive`; reject if eliminated
- [ ] Parse input through `SCInputSchema`; reject on validation failure
- [ ] Rate-limit: max 15 inputs per second per player; drop excess
- [ ] Update the player's `moveInput`:
  ```ts
  players.get(userId).moveInput = { dx: input.dx, jump: input.jump };
  ```
  - `jump` is consumed once (set `moveInput.jump = false` after processing in simulation tick)
- [ ] Do NOT broadcast — consumed by simulation loop
  **Verification:** Valid input → stored. Rate exceeded → dropped. Dead player → rejected.

#### 8.4.5.8 Input Handling — `SC_CLOSE_AD`

- [ ] Validate phase is `'ACTIVE'`; reject if not
- [ ] Validate player `isAlive`; reject if eliminated
- [ ] Parse input through `SCCloseAdSchema`; reject on validation failure
- [ ] Look up `adId` in `activeAds`; reject if not found or already dismissed
- [ ] Validate that this ad targets the requesting player (`ad.targetUserId === userId`); reject if not
- [ ] Check if `clickPosition` is within the `realCloseButton` hitbox:
  ```ts
  const isReal = (
    clickPosition.x >= ad.realCloseButton.x &&
    clickPosition.x <= ad.realCloseButton.x + ad.realCloseButton.width &&
    clickPosition.y >= ad.realCloseButton.y &&
    clickPosition.y <= ad.realCloseButton.y + ad.realCloseButton.height
  );
  ```
- [ ] If click is on REAL close button:
  - Dismiss ad: `ad.dismissed = true`; remove from `activeAds`
  - Award `SC_AD_DISMISS_BONUS` points
  - Increment `adsCorrectlyDismissed`
  - Send `SC_AD_DISMISSED` to player: `{ adId: string; reason: 'correct' }`
- [ ] If click is on FAKE close button (or any other position):
  - Apply ad effect to player:
    ```ts
    player.activeEffect = ad.effect;
    player.effectExpiresAt = Date.now() + SC_AD_EFFECT_DURATION_SECONDS * 1000;
    player.adsFailed++;
    ```
  - Dismiss ad: `ad.dismissed = true`; remove from `activeAds`
  - Send `SC_AD_EFFECT_APPLIED` to player:
    ```ts
    { adId: string; effect: AdEffect; durationSeconds: SC_AD_EFFECT_DURATION_SECONDS }
    ```
  - Send `SC_AD_TRICKED` to ALL (lobby-wide notification):
    ```ts
    { userId: string; userName: string; effect: AdEffect }
    ```
  **Verification:** Click real button → dismissed, bonus awarded. Click fake button → effect applied, notification sent. Wrong ad target → rejected.

#### 8.4.5.9 End Game — `endGame()`

- [ ] Stop simulation interval
- [ ] Stop broadcast interval
- [ ] Stop scroll speed incrementer
- [ ] Set `phase = 'GAME_OVER'`
- [ ] Compute final survival time for last alive player (if any): `Date.now() - gameStartedAt`
- [ ] Assign final ranks:
  - Rank 1 = last player standing (longest survival)
  - Rank N = first player eliminated (shortest survival)
  - Based on `eliminationOrder` (reverse: last eliminated = rank 1)
- [ ] Compute final scores:
  ```ts
  for (const player of players.values()) {
    player.score = SC_ELIMINATION_POINTS_BASE
      + Math.floor((player.survivalTimeMs / 1000) * SC_SURVIVAL_BONUS_PER_SECOND)
      + player.adsCorrectlyDismissed * SC_AD_DISMISS_BONUS
      + (player.eliminationRank === 1 ? SC_LAST_SURVIVOR_BONUS : 0);
  }
  ```
- [ ] Emit `SC_GAME_OVER` to ALL:
  ```ts
  {
    finalRankings: SCFinalRanking[];
    totalSurvivalTimeMs: number;
    winner: { userId: string; userName: string } | null;
  }
  ```
  **Verification:** Rankings correct (last standing = rank 1). Scores calculated correctly.

#### 8.4.5.10 `getStateForPlayer(userId)`

- [ ] During `COUNTDOWN`:
  ```ts
  {
    phase: 'COUNTDOWN';
    countdown: number;
    players: Array<{ userId: string; userName: string; x: number; y: number; color: string }>;
    canvasWidth: SC_CANVAS_WIDTH;
    canvasHeight: SC_CANVAS_HEIGHT;
  }
  ```

- [ ] During `ACTIVE`:
  ```ts
  {
    phase: 'ACTIVE';
    viewportY: number;
    scrollSpeed: number;
    platforms: Array<{ id: string; x: number; y: number; width: number; height: number; type: string }>;
    players: Array<{
      userId: string; userName: string; x: number; y: number; color: string;
      isAlive: boolean; isGrounded: boolean;
      activeEffect: AdEffect | null;
    }>;
    lavaY: number;
    myUserId: string;
    elapsedMs: number;
    alivePlayers: number;
    scores: Array<{ userId: string; score: number }>;
  }
  ```
  - **Masking:** Each player's `adsCorrectlyDismissed` and `adsFailed` counts are hidden from other players — only the active effect is visible
  - **Ads:** `SC_AD_SPAWN` events are sent ONLY to the targeted player — other players never see the ad content or buttons
  - **Optimization:** Only send platforms within viewport + small buffer (not ALL generated platforms)

- [ ] During `GAME_OVER`: full final rankings with all stats revealed
  **Verification:** During ACTIVE: player ad stats hidden, ads only sent to target. GAME_OVER: all revealed.

#### 8.4.5.11 `getStateForSpectator()`

- [ ] Same as player view with additional data:
  - All players' ad dismiss/fail counts visible
  - Active ads visible (which player has which ad)
  - God-view: can see all players' positions even if they have obscure effect
  **Verification:** Spectators see everything. No masking.

#### 8.4.5.12 Join-in-Progress Handling

- [ ] Policy: `spectate_only`
  - New joiners cannot enter an active Scroll Soul game — elimination-based game is fundamentally incompatible with late entry
  - New joiners become spectators immediately
  - They receive the spectator state (`getStateForSpectator()`)
  **Verification:** JIP during ACTIVE → player is spectator, not added to game. Can see game state.

#### 8.4.5.13 Reconnection Handling (`handlePlayerReconnect(userId)`)

- [ ] If player was alive at disconnect:
  - Restore position, velocity, grounded state
  - Re-enable input processing
  - Send full current state via `getStateForPlayer(userId)`
  - **Risk:** during disconnection, the viewport scrolled — if player is now below lava, they are eliminated upon reconnect
- [ ] If player was eliminated before disconnect:
  - Reconnect as spectator
  - Send spectator state
  **Verification:** Reconnect alive → resume from last position (may be eliminated if below lava). Reconnect dead → spectator.

#### 8.4.5.14 Disconnect Handling (`handlePlayerDisconnect(userId)`)

- [ ] Set `moveInput = null` (stop moving)
- [ ] Player remains in physics simulation (still subject to gravity, scrolling viewport, lava)
- [ ] Player will likely fall and be eliminated naturally if disconnected long enough
- [ ] If player had an active ad: auto-dismiss without penalty
- [ ] No ghost mode — player is either alive (subject to physics) or eliminated
  **Verification:** Disconnect → stops moving, gravity applies, likely eliminated by lava. No special protection.

#### 8.4.5.15 Cleanup (`cleanup()`)

- [ ] Clear `simulationInterval` if active
- [ ] Clear `broadcastInterval` if active
- [ ] Clear scroll speed interval
- [ ] Clear `platforms` array
- [ ] Clear `activeAds` map
  **Verification:** After cleanup: no intervals running. No memory leaks. Data structures cleared.

#### 8.4.5.16 `computeResults()` and Awards

- [ ] Compute final rankings by score (descending)

- [ ] Compute awards:
  - [ ] **Soul Survivor** — last player standing (longest survival); icon: `shield`
  - [ ] **Ad Blocker** — most ads correctly dismissed; icon: `shield-x`
  - [ ] **Gullible** — clicked the most fake close buttons (most `adsFailed`); icon: `mouse-pointer-click`; humorous consolation
  - [ ] **Terminal Velocity** — reached the highest point (lowest `y` position ever achieved, relative to starting position); icon: `arrow-up`
  - [ ] **Lava Lover** — survived the longest while having the closest near-miss with lava (minimum distance above lava during gameplay); icon: `flame`

- [ ] Build `SCFinalRanking[]` with all stats
- [ ] Return `MinigameResults` with rankings, awards, and `gameSpecificData`:
  ```ts
  {
    gameSpecificData: {
      totalSurvivalTimeMs: number;
      platformsGenerated: number;
      adsSpawned: number;
      maxScrollSpeed: number;
    }
  }
  ```
  **Verification:** Unit test: last player = Soul Survivor. Most dismissals = Ad Blocker. Most fails = Gullible.

#### 8.4.5.17 `buildGameLog()`

- [ ] Maintain an `actionLog: GameLogAction[]` array on the game instance
- [ ] Build `GameLog` conforming to core.md §13.3, including `gameSettings` per §12A.11

**`initialState` (from minigames-4.md §4.15):**

```typescript
interface SCGameHistoryInit {
  playerCount: number;
  initialScrollSpeed: number;
  adFrequencyBase: number;
  obstacleLayoutSeed: number;
  gameSettings: GameSettingValues;
}
```

**Actions Logged:**

| Action Type | Payload | Recorded When |
|---|---|---|
| `ad_spawned` | `{ targetUserId: string; adType: string; elapsed: number }` | Ad popup appears on a player's screen |
| `ad_dismissed` | `{ userId: string; elapsed: number; dismissTime: number; usedFakeX: boolean }` | Player closes an ad |
| `player_eliminated` | `{ userId: string; survivalTime: number; cause: 'lava' \| 'ad' \| 'obstacle'; scrollSpeedAtDeath: number; placement: number }` | Player is eliminated |
| `speed_milestone` | `{ newSpeed: number; elapsed: number; playersRemaining: number }` | Scroll speed crosses a threshold |
| `game_complete` | `{ winnerId: string; finalSurvivalTime: number; eliminationOrder: Array<{ userId: string; survivalTime: number; cause: string }>; adStats: Array<{ userId: string; adsEncountered: number; adsDismissed: number }> }` | Last player standing or time expires |

- [ ] In `computeResults()`, build `GameLog` with `initialState`, full action log, and `finalResults`
- [ ] Return `GameLog` from `buildGameLog()`

**Verification:** Unit test: 8-player game, verify `player_eliminated` events in order, `ad_spawned`/`ad_dismissed` events captured, `speed_milestone` logged, `initialState` has scroll speed config and obstacle seed.

---

### 8.4.6 Register Game in Minigame Registry

- [ ] Add entry to `lib/rmhbox/minigame-registry.ts`:
  ```ts
  {
    id: "scroll-soul",
    displayName: "Scroll Soul",
    description: "Survival platformer with a twist! Jump between platforms as the screen scrolls faster and faster. Dodge lava, avoid fake ads that mess with your controls, and be the last soul standing!",
    category: "action",
    icon: "flame",
    minPlayers: 2,
    maxPlayers: 8,
    estimatedDurationSeconds: 120,
    supportsTeams: false,
    instructionDurationSeconds: 15,
    preloadAssets: {
      images: [],
      sounds: [],
      data: [],
      estimatedSizeBytes: 5000,
    },
    joinInProgressPolicy: "spectate_only",
    tags: ["action", "platformer", "survival", "elimination"],
  }
  ```
  **Verification:** Registry lookup for `"scroll-soul"` returns correct metadata. `joinInProgressPolicy` is `"spectate_only"`.

- [ ] Add server handler to `MINIGAME_SERVER_REGISTRY` in `server/rmhbox/minigame-server-registry.ts`:
  ```ts
  import { ScrollSoulGame } from './minigames/scroll-soul';
  MINIGAME_SERVER_REGISTRY.set('scroll-soul', ScrollSoulGame);
  ```
  **Verification:** `MINIGAME_SERVER_REGISTRY.get('scroll-soul')` returns `ScrollSoulGame` class.

- [ ] Add lazy-loaded component to `MinigameRenderer` map in `components/rmhbox/MinigameRenderer.tsx`:
  ```ts
  'scroll-soul': lazy(() => import('./minigames/scroll-soul/ScrollSoulGame'))
  ```
  **Verification:** `MinigameRenderer` renders `<Suspense>` fallback, then loads `ScrollSoulGame` chunk on demand.

---

### 8.4.7 Build Client Components

#### 8.4.7.1 `components/rmhbox/minigames/scroll-soul/ScrollSoulGame.tsx`

- [ ] Phase router component — renders based on `phase`
- [ ] Subscribe to all `SC_*` and `TIMER_TICK` events via `useRMHboxStore`
- [ ] Maintain local state:
  - `phase`, `players[]`, `platforms[]`, `viewportY`, `scrollSpeed`
  - `lavaY`, `myUserId`, `alivePlayers`, `elapsedMs`, `scores[]`
  - `activeAd: FakeAd | null` (only for this player)
  - `activeEffect: AdEffect | null`, `effectExpiresAt: number | null`
- [ ] Handle `SC_AD_SPAWN` → set `activeAd` state (only this player receives this)
- [ ] Handle `SC_AD_DISMISSED` → clear `activeAd`
- [ ] Handle `SC_AD_EFFECT_APPLIED` → set `activeEffect` with duration timer
- [ ] Handle `SC_AD_TRICKED` → show "PlayerName was tricked!" notification
- [ ] Handle `SC_PLAYER_ELIMINATED` → mark player as dead; if it's this player, transition to spectator view
- [ ] Handle `SC_GAME_OVER` → show final results
- [ ] Handle `PP_STATE_UPDATE` (reusing pattern: `SC_STATE_UPDATE`) → update all positions and platform states
- [ ] **Input emission:** capture keyboard (A/D or arrows for horizontal, W/space for jump) on desktop; virtual joystick + jump button on mobile. Emit `SC_MOVE` at 15Hz
- [ ] Conditional rendering:
  - `COUNTDOWN` → `<Countdown />` with player list
  - `ACTIVE` (alive) → `<ScrollCanvas />` + `<VirtualControls />` (mobile) + `<FakeAdOverlay />` (if ad active)
  - `ACTIVE` (eliminated) → `<ScrollCanvas />` in spectator mode with "You were eliminated!" banner
  - `GAME_OVER` → `<ScrollSoulResults />`
  **Verification:** Component renders for each phase. Input emits at correct rate. Ad overlay works. Spectator mode on elimination.

#### 8.4.7.2 `components/rmhbox/minigames/scroll-soul/ScrollCanvas.tsx`

- [ ] HTML5 Canvas renderer for the platformer
- [ ] Props: `{ players, platforms, viewportY, lavaY, myUserId, canvasWidth, canvasHeight, isSpectator }`
- [ ] Render layers (back to front):
  1. Sky background (gradient from light blue at top to darker below)
  2. Platforms:
     - Static: solid brown/gray rectangles
     - Moving: blue-tinted platform with directional arrows
     - Shrinking: red-tinted platform with warning edge glow
  3. Waypoint / height markers: subtle horizontal lines every 100 world units with height number
  4. Players:
     - Alive: colored rectangle (sprite-like) with player name label above
     - Current player: slightly glowing outline
     - Eliminated: ghost (semi-transparent, floating away animation)
  5. Lava zone: red/orange gradient with animated shimmer at the bottom of viewport
  6. UI overlays: alive player count in corner, elapsed time
- [ ] Camera follows viewport: translate all positions by `-viewportY`
- [ ] Client-side interpolation between 15Hz state updates
- [ ] If player has `'obscure'` effect: render a translucent dark overlay on part of the canvas
- [ ] Responsive scaling: canvas fits container, aspect ratio maintained (400:600)
  **Verification:** Canvas renders all elements. Viewport scrolls. Lava visible. Platforms correctly typed. Obscure effect visible.

#### 8.4.7.3 `components/rmhbox/minigames/scroll-soul/FakeAdOverlay.tsx`

- [ ] Full-screen (or partial-screen) overlay that looks like an ad popup
- [ ] Props: `{ ad: FakeAd; onClose: (adId: string, clickPosition: { x: number; y: number }) => void }`
- [ ] Render:
  - Ad background: styled per `template.style` (flashy = bright colors with animation, scary = red/dark, cringe = pink, fake-official = professional blue, alarm = red with borders, etc.)
  - Headline text: large, eye-catching
  - Body text: smaller
  - **Fake "X" button:** prominent, styled to look like a real close button (positioned where users expect it — top-right)
  - **Real "X" button:** tiny, hard to find (positioned in a random corner, very small, potentially same color as background)
  - Both buttons clickable — on click, capture click position and call `onClose(adId, position)`
- [ ] Click anywhere on the ad also triggers `onClose` with the click position (server validates)
- [ ] Add subtle flashing/animation to draw attention AWAY from the real close button
- [ ] Accessibility: despite being intentionally deceptive (it's the game mechanic), ensure the ad overlay can be tapped/clicked on all device sizes
  **Verification:** Ad renders with both close buttons. Click position captured and sent to server. Different styles render correctly.

#### 8.4.7.4 `components/rmhbox/minigames/scroll-soul/AdEffectOverlay.tsx`

- [ ] Visual indicator that an ad effect is currently active on the player
- [ ] Props: `{ effect: AdEffect; expiresAt: number }`
- [ ] Effects:
  - `'obscure'`: dark translucent overlay covering ~40% of screen (random position), with timer countdown
  - `'push'`: directional arrows animation showing push direction, screen shake
  - `'slow'`: slow-motion visual filter (subtle blur or desaturation), "SLOWED" text
  - `'invert'`: screen briefly flashes, "CONTROLS INVERTED" warning text
- [ ] Duration countdown bar at top of screen
- [ ] Disappears when effect expires
  **Verification:** Each effect type renders correctly. Countdown displays. Disappears on expiry.

#### 8.4.7.5 `components/rmhbox/minigames/scroll-soul/VirtualControls.tsx`

- [ ] Mobile touch controls for horizontal movement and jumping
- [ ] Layout: left side = movement joystick or L/R buttons; right side = jump button
- [ ] Left/Right buttons:
  - Large enough for comfortable touch on mobile
  - Emit `dx: -1` (left) or `dx: 1` (right) while held
  - Release emits `dx: 0`
- [ ] Jump button:
  - Large circular button on right side
  - On press: emit `{ dx: currentDx, jump: true }`
  - Jump is consumed once per press (does not repeat on hold)
- [ ] Semi-transparent controls so game is visible behind them
- [ ] Only rendered on mobile (use `useIsMobile()` hook)
  **Verification:** Controls appear on mobile. Left/right/jump inputs correct. Semi-transparent.

#### 8.4.7.6 `components/rmhbox/minigames/scroll-soul/EliminationBanner.tsx`

- [ ] Banner shown when the current player is eliminated
- [ ] Props: `{ survivalTimeMs: number }`
- [ ] "YOU FELL INTO THE LAVA! ☠️"
- [ ] "Survived for: 45s"
- [ ] "Watching as spectator..."
- [ ] Animation: dramatic zoom-out, ghost floating up
- [ ] Fades after 3 seconds, then spectator mode HUD appears
  **Verification:** Banner shows on elimination with stats. Fades to spectator.

#### 8.4.7.7 `components/rmhbox/minigames/scroll-soul/ScrollSoulResults.tsx`

- [ ] Final results screen
- [ ] Props: `{ finalRankings: SCFinalRanking[]; totalSurvivalTimeMs: number; winner: { userId: string; userName: string } | null }`
- [ ] Rankings table: rank, player name, total score, survival time, ads dismissed, ads failed
- [ ] Winner highlight: "👑 [PlayerName] — Soul Survivor!"
- [ ] Summary stats: total survival time, ads spawned, max scroll speed reached
- [ ] Awards display
  **Verification:** Rankings correct. Winner highlighted. Stats displayed.

#### 8.4.7.8 Sound Effects

- [ ] Wire up sound effects for Scroll Soul events:
  - `SC_COUNTDOWN` → `playSound('countdownBeep')`
  - `SC_GAME_START` → `playSound('goFanfare')`
  - `SC_AD_SPAWN` → `playSound('chime')`
  - `SC_AD_CLOSED` → `playSound('click')`
  - `SC_AD_CLOSE_FAILED` → `playSound('buzzer')`
  - `SC_LAVA_WARNING` → `playSound('buzzer')`
  - `SC_PLAYER_ELIMINATED` → `playSound('buzzer')`
  - `SC_HEIGHT_MILESTONE` → `playSound('scoreDing')`
  - `SC_GAME_OVER` → `playSound('victoryFanfare')`
  **Verification:** Each event triggers the correct sound exactly once. Volume settings respected.

#### 8.4.7.9 Zustand Store Integration

- [ ] Read all player positions, scroll offset, and safe zones from server state updates at 15Hz
- [ ] Client-side prediction for local player movement (gravity, jump) between server updates, with smooth server-correction interpolation
- [ ] Fake ads read from per-player state
- [ ] Spectator sees all players and all ads
  **Verification:** Client prediction produces smooth local movement. Server corrections interpolated without visible snapping. Per-player ad isolation maintained. Spectator store contains all player and ad data.

---

### 8.4.8 Integration Testing

- [ ] End-to-end test: 4 players join lobby → start Scroll Soul → play until all eliminated or last survivor
  - [ ] Verify scrolling: viewport moves upward at increasing speed
  - [ ] Verify platform generation: platforms appear above viewport, diverse types (static/moving/shrinking)
  - [ ] Verify gravity: player falls when not on platform
  - [ ] Verify jump: player jumps when grounded, cannot double-jump
  - [ ] Verify platform landing: player lands on platform from above, passes through from below
  - [ ] Verify horizontal wrapping: player exits left → appears right
  - [ ] Verify lava elimination: player touches lava → eliminated, rank assigned
  - [ ] Verify last survivor: when 1 player remains → game over, bonus awarded
  - [ ] Verify scoring: survival bonus + ad dismiss bonus + last survivor bonus = total
  **Verification:** All lifecycle assertions pass.

- [ ] Fake ad system test:
  - [ ] Verify ad spawns only for target player (other players don't receive `SC_AD_SPAWN`)
  - [ ] Verify real close button → ad dismissed, bonus awarded
  - [ ] Verify fake close button → effect applied, notification sent to all
  - [ ] Verify ad auto-dismisses after `SC_AD_DURATION_SECONDS`
  - [ ] Verify effects: obscure (visual overlay), push (horizontal force), slow (speed halved), invert (reversed controls)
  - [ ] Verify effect expires after `SC_AD_EFFECT_DURATION_SECONDS`
  **Verification:** Ad system works end-to-end.

- [ ] Anti-cheat validation test:
  - [ ] Server validates ad click position — spoofing a click at `(0,0)` when real button is at `(340, 12)` → fails validation → effect applied
  - [ ] Dead player cannot send movement inputs
  - [ ] Input rate exceeding 15Hz → excess inputs dropped
  **Verification:** Server catches invalid ad clicks. Rate limiting works.

- [ ] Information masking test:
  - [ ] Player A receives `SC_AD_SPAWN` — Player B does NOT see it
  - [ ] Spectator can see all ads and their targets
  - [ ] Individual ad stats hidden during ACTIVE; revealed at GAME_OVER
  **Verification:** Ads are per-player. Spectator sees all.

- [ ] Disconnect/reconnect test:
  - [ ] Disconnect → player stops, gravity continues, likely falls into lava → eliminated
  - [ ] Reconnect before lava → resume play
  - [ ] Reconnect after elimination → spectator mode
  **Verification:** Disconnection behavior correct. No special protection.

- [ ] Edge case test:
  - [ ] All players eliminated on same tick → all get same rank; game ends
  - [ ] Player eliminates at exact moment of ad spawn → ad cancelled, no effect
  - [ ] 0 platforms remaining in viewport → should not happen (generation guarantees coverage), but verify graceful handling
  **Verification:** Edge cases handled gracefully.

### 8.4.9 Game Settings Integration (§12A)

Integrate host-configurable settings using the §12A system.

#### Registry Entry

- [ ] Export `SCROLL_SOUL_SETTINGS: GameSettingsSchema` in `lib/rmhbox/minigame-registry.ts` with 6 entries:
  - `maxSurvival` (integer, default `120`, min 60, max 240, step 15)
  - `baseScrollSpeed` (float, default `1.0`, min 0.5, max 2.0, step 0.1)
  - `maxScrollSpeed` (float, default `3.0`, min 1.5, max 5.0, step 0.5)
  - `maxConcurrentAds` (integer, default `3`, min 1, max 5, step 1)
  - `fakeXChance` (float, default `0.3`, min 0.0, max 0.8, step 0.1)
  - `enableAds` (boolean, default `true`)
- [ ] Attach `settingsSchema: SCROLL_SOUL_SETTINGS` to the `scroll-soul` `MinigameDefinition`.
  **Verification:** Registry lookup returns definition with `settingsSchema` containing 6 entries.

> **Note:** Scroll Soul is the first game to use `float` type settings (`baseScrollSpeed`, `maxScrollSpeed`, `fakeXChance`). Ensure `validateGameSettings()` in `lib/rmhbox/game-settings.ts` correctly handles float clamping and step-snapping for these fields.

#### Handler `getSetting()` Integration

Replace hardcoded constants with `this.getSetting()` calls in the Scroll Soul handler:

| Constant | Setting Key | Replacement |
|---|---|---|
| `SC_MAX_SURVIVAL` | `maxSurvival` | `this.getSetting('maxSurvival', SC_MAX_SURVIVAL)` |
| `SC_BASE_SCROLL_SPEED` | `baseScrollSpeed` | `this.getSetting('baseScrollSpeed', SC_BASE_SCROLL_SPEED)` |
| `SC_MAX_SCROLL_SPEED` | `maxScrollSpeed` | `this.getSetting('maxScrollSpeed', SC_MAX_SCROLL_SPEED)` |
| `SC_MAX_CONCURRENT_ADS` | `maxConcurrentAds` | `this.getSetting('maxConcurrentAds', SC_MAX_CONCURRENT_ADS)` |
| `SC_FAKE_X_CHANCE` | `fakeXChance` | `this.getSetting('fakeXChance', SC_FAKE_X_CHANCE)` |
| `SC_ENABLE_ADS` | `enableAds` | `this.getSetting('enableAds', SC_ENABLE_ADS)` |

- [ ] **Boolean setting logic:** When `enableAds` is `false`, no pop-up ads spawn during the game. The `maxConcurrentAds` and `fakeXChance` settings are ignored when ads are disabled. This turns Scroll Soul into a pure platformer survival game.
- [ ] **Float setting notes:** `baseScrollSpeed` and `maxScrollSpeed` control the scroll speed ramp curve. The handler should interpolate between them over the game duration. `fakeXChance` is a probability (0.0–0.8) applied when spawning each ad's close button.
  **Verification:** Each constant usage replaced. Handler respects custom settings passed via `MinigameContext.gameSettings`.

---

### 8.4.13 History Display Configuration

Implement the history display config for Scroll Soul as defined in `minigames-4.md §4.16`.

#### 8.4.13.1 Create Detail Component

Create `components/rmhbox/minigames/scroll-soul/ScrollSoulHistoryDetail.tsx`:
- Render distance traveled visualization
- Show voting decision timeline (left/right/straight)
- Display difficulty scaling graph and combo streak indicators

#### 8.4.13.2 Register History Display

Add registration in `lib/rmhbox/history-display-registrations.ts` with:
- Searchable fields: `playerNames` (player names)
- Filterable fields: `distanceTraveled` (range), `combos` (range), `platformsCollected` (range)
- Summary: `Distance: {distance}px — Platformer survival`

#### 8.4.13.3 Tests

- [ ] Verify `getHistoryDisplay('scroll-soul')` returns a valid config
- [ ] Verify searchable fields extract player names from a mock game log
- [ ] Verify filterable fields include distanceTraveled (range), combos (range), platformsCollected (range)
- [ ] Verify `getSummary()` returns a meaningful string for a mock game log
- [ ] Verify `DetailComponent` renders without errors when given a valid game log

---

## 8.5 Cross-Game Integration Testing (Phase 8 Minigames)

This section validates that all four Phase 8 minigames integrate correctly with the existing RMHbox infrastructure and coexist with Phase 5, 6, and 7 games.

---

### 8.5.1 Registry Verification

- [ ] Verify all four Phase 8 games are registered in `lib/rmhbox/minigame-registry.ts`:
  - `identity-crisis` (category: social, icon: user-secret)
  - `ranking-file` (category: strategy, icon: list-ordered)
  - `pixel-pushers` (category: action, icon: move)
  - `scroll-soul` (category: action, icon: flame)
- [ ] Verify registry lookup returns correct metadata for each game
- [ ] Verify `getAllMinigames()` includes all 16 games (4 per phase × 4 phases)
- [ ] Verify `getMinigamesByCategory('action')` includes Pixel Pushers and Scroll Soul
- [ ] Verify `getMinigamesByCategory('social')` includes Identity Crisis
- [ ] Verify `getMinigamesByCategory('strategy')` includes Ranking File
  **Verification:** Registry queries return expected sets.

---

### 8.5.2 Random Game Selection (Full Pool)

- [ ] Test `selectRandomMinigame()` with all 16 games in pool:
  - Run 1000 iterations; verify all 16 game IDs appear at least once
  - Verify exclusion list works: exclude 15 games → only the 16th is returned
  - Verify category weighting: if configured, categories are balanced
- [ ] Test that `usedGameIds` accumulation prevents repetition:
  - Simulate a full lobby session: select 16 games sequentially → all unique
  - On the 17th selection: pool resets (or wraps)
  **Verification:** All 16 games selectable. No repetition until pool exhausted.

---

### 8.5.3 Lifecycle Integration (Per Game)

For each Phase 8 game (Identity Crisis, Ranking File, Pixel Pushers, Scroll Soul):

- [ ] Test full lifecycle: `create → start → play → end → computeResults → cleanup`
- [ ] Verify `start()` initializes state correctly and emits initial events
- [ ] Verify gameplay events are processed correctly (at least one full round/level)
- [ ] Verify `computeResults()` returns valid `MinigameResults` object:
  - Has `rankings` array with correct length (= player count)
  - Has `awards` array (0–5 entries)
  - Has `gameSpecificData` object
- [ ] Verify `cleanup()` stops all intervals and clears all data structures
- [ ] Verify no memory leaks: after cleanup, references to game-specific objects are released
  **Verification:** Each game completes full lifecycle without errors.

---

### 8.5.4 Sequential Game Test (Mixed Phases)

- [ ] Simulate a lobby playing games from different phases in sequence:
  1. Play a Phase 5 game (e.g., Blind Vote)
  2. Play Identity Crisis (Phase 8)
  3. Play a Phase 6 game (e.g., Word Forge)
  4. Play Pixel Pushers (Phase 8)
  5. Play a Phase 7 game (e.g., Vibe Check)
  6. Play Scroll Soul (Phase 8)
  7. Play Ranking File (Phase 8)
- [ ] Verify cumulative scores are maintained correctly across all games
- [ ] Verify `usedGameIds` is updated after each game (no re-selection)
- [ ] Verify lobby state transitions between games are clean (no stale state from previous game)
- [ ] Verify per-game data contexts (e.g., `usedLevelIds` for Pixel Pushers, `usedCategoryIds` for Ranking File) persist across games in the same session
  **Verification:** 7-game sequence completes without errors. Scores accumulate. No stale state.

---

### 8.5.5 Concurrent Lobby Test

- [ ] Spin up 3 lobbies simultaneously:
  - Lobby A: plays Identity Crisis with 6 players
  - Lobby B: plays Pixel Pushers with 4 players
  - Lobby C: plays Scroll Soul with 8 players
- [ ] Verify no state bleed between lobbies:
  - Lobby A's identity assignments don't appear in Lobby B
  - Lobby B's physics state doesn't affect Lobby C
  - Lobby C's ad spawns are isolated
- [ ] Verify all 3 lobbies can complete their games concurrently
- [ ] Verify server CPU remains stable with 3 concurrent physics simulations (Pixel Pushers × 1 + Scroll Soul × 1, each at 30Hz)
  **Verification:** No cross-lobby contamination. All lobbies complete. Performance acceptable.

---

### 8.5.6 Spectator Mode Test

- [ ] For each Phase 8 game, verify spectator receives correct state:
  - **Identity Crisis:** spectator sees ALL players' identities (god-view, including the one each player can't see)
  - **Ranking File:** spectator sees all players' current rankings in real-time
  - **Pixel Pushers:** spectator sees individual push counts during gameplay (players cannot)
  - **Scroll Soul:** spectator sees all active ads and their targets (players only see their own)
- [ ] Verify spectator state updates at same broadcast rate as player state
- [ ] Verify spectator cannot send game inputs (movement, votes, ad clicks, etc.)
  **Verification:** Spectator data is richer than player data. No input allowed.

---

### 8.5.7 Disconnection and Reconnection Test (All 4 Games)

- [ ] **Identity Crisis:** disconnect mid-question → answers default to "skip"; reconnect → resume with state. Votes excluded if disconnected during voting phase.
- [ ] **Ranking File:** disconnect during ranking phase → player's ranking defaults to current order (no change). Reconnect → can still re-order before time expires.
- [ ] **Pixel Pushers:** disconnect → pusher frozen, then ghost after 10s. Reconnect → pusher restored with collision. Polarity handled correctly on disconnect/reconnect.
- [ ] **Scroll Soul:** disconnect → player falls due to gravity, likely eliminated. Reconnect before elimination → resume. Reconnect after elimination → spectator.
  **Verification:** Each game handles disconnect/reconnect per its documented behavior.

---

### 8.5.8 Award System Integration

- [ ] Verify all Phase 8 game awards integrate with the lobby-wide award display:
  - Identity Crisis: Master of Disguise, Nosy Parker, Gullible, 20/20 Vision, Drama Queen
  - Ranking File: Hive Mind, Rebel, Data Analyst, Quickest Draw, Wild Card
  - Pixel Pushers: Heavy Hitter, Gravity Master, Goal Scorer, Speed Demon, Wall Flower
  - Scroll Soul: Soul Survivor, Ad Blocker, Gullible, Terminal Velocity, Lava Lover
- [ ] Verify award icons render correctly in the lobby results screen
- [ ] Verify award descriptions display on hover/tap
- [ ] Verify awards from multiple games display together in end-of-session summary
- [ ] Verify no duplicate award IDs across all 16 games
  **Verification:** All awards render. No ID conflicts.

---

### 8.5.9 Phase 5 + Phase 8 Coexistence Test

- [ ] Verify Phase 5 games (Rhyme Time, Undercover Agent, Category Crash, Wiki-Race) still function correctly after Phase 8 deployment
- [ ] Play a mixed session: Phase 5 game → Phase 8 game → Phase 5 game
- [ ] Verify registry correctly contains all 8 games (Phase 5 + Phase 8)
- [ ] Verify no naming collisions between Phase 5 and Phase 8 constants (`IC_*`, `RF_*`, `PP_*`, `SC_*` prefixes), event types, Zod schema names, component file paths, or award IDs
  **Verification:** No regressions. All 8 games playable in any order.

### 8.5.10 Full Coexistence Test (All Phases)

> **Note:** This test should be run once all phases (5, 6, 7, 8) are deployed. Since Phases 6, 7, and 8 are developed in parallel, this combined test validates the final integration.

- [ ] Full integration: register ALL games from Phases 5, 6, 7, and 8 simultaneously
- [ ] Verify `getAllMinigames().length === 16` (4 games per phase × 4 phases)
- [ ] Verify random selection draws from all 16 games
- [ ] Verify a complete 16-game session plays every game exactly once
- [ ] Verify cumulative scoring across all 16 games produces correct final leaderboard
- [ ] Verify lobby session can handle the full variety of game mechanics:
  - Text-based games (quizzes, voting)
  - Real-time physics games (Pixel Pushers, Scroll Soul, Cursor Curling)
  - Social deduction (Identity Crisis, Undercover Editor, Undercover Agent)
  - Creative games (Minimalist Masterpiece, Emoji Cinema)
  - Cooperative and competitive modes
- [ ] Verify no naming collisions across all 16 games:
  - Constants (`IC_*`, `RF_*`, `PP_*`, `SC_*`, `RT_*`, `UA_*`, `CC_*`, `WR_*`, `FOF_*`, `UE_*`, `MM_*`, `EC_*`, `SS_*`, `HK_*`, `CU_*`, `HT_*` prefixes)
  - WebSocket event types
  - Zod schema names
  - Component file paths
  - Award IDs
  **Verification:** All 16 games coexist. No namespace collisions. Full session completes.

### 8.5.11 Game History Integration Test

- [ ] For each Phase 8 game: verify `buildGameLog()` produces a valid `GameLog` object
- [ ] Verify game log is passed to `persistMatchResults()` and stored in the database
- [ ] Verify `GET /api/rmhbox/history?matchId=...` returns the game log in `MatchDetailResponse`
- [ ] Verify game-specific action types are present in the log for each game:
  - Identity Crisis: `question_asked`, `vote_cast`, `vote_result`, `early_guess`, `final_guess`, `identity_reveal`
  - Ranking File: `round_start`, `ranking_submitted`, `round_result`
  - Pixel Pushers: `level_start`, `waypoint_hit`, `polarity_flip`, `level_complete`
  - Scroll Soul: `player_eliminated`, `ad_spawned`, `ad_dismissed`, `speed_increase`
  **Verification:** Game logs persist and are retrievable via API. Action types match spec.
- [ ] Verify `getHistoryDisplay()` returns a valid config for each Phase 8 game
- [ ] Verify each game's history display has non-empty searchable and filterable fields
- [ ] Verify each game's `getSummary()` returns a non-empty string for a valid game log
- [ ] Verify each game's `DetailComponent` can be instantiated

### 8.5.12 Performance and Stress Testing

- [ ] Stress test: 8-player lobby, rapid fire through all 4 Phase 8 games:
  - Identity Crisis → Ranking File → Pixel Pushers → Scroll Soul
  - Total physics simulation time: ~240s of server-side 30Hz physics (PP + SC combined)
  - Verify no memory growth (garbage collection handles cleaned-up game states)
  - Verify no orphaned intervals after game transitions
- [ ] Concurrent stress: 5 lobbies, each playing a different Phase 8 game simultaneously
  - 5 × 30Hz simulation loops active
  - Monitor server CPU and memory
  - Target: <50% CPU on standard hardware, <200MB memory
- [ ] Client-side rendering test:
  - 8 players on low-end mobile devices
  - Pixel Pushers: 15Hz state updates + 60fps canvas rendering → smooth
  - Scroll Soul: 15Hz state updates + 60fps canvas rendering → smooth
  - No canvas memory leaks (canvases disposed on component unmount)
  **Verification:** Server stays responsive. No memory leaks. Client renders smoothly on mobile.

### 8.5.13 MinigameRenderer Code-Splitting

- [ ] **MinigameRenderer code-splitting:** verify each Phase 8 game loads as a separate chunk
  - [ ] Identity Crisis, Ranking File, Pixel Pushers, Scroll Soul each load on demand
  - [ ] Verify `<Suspense>` fallback renders during chunk load
  **Verification:** Network tab shows separate chunk files. Main bundle unaffected.

### 8.5.14 Sound Effect Integration Test

- [ ] **Sound effect integration test:** verify all 4 Phase 8 games trigger sounds at correct moments
  - [ ] Identity Crisis: chime on turn start, buzzer on wrong guess, fanfare on reveal
  - [ ] Ranking File: fanfare on category reveal, swoosh on lock-in, fanfare on results
  - [ ] Pixel Pushers: swoosh on polarity flip, ding on waypoint, fanfare on level complete
  - [ ] Scroll Soul: beeps on countdown, chime on ad spawn, buzzer on elimination
  **Verification:** Sounds fire once per event. Volume settings respected.

### 8.5.15 MINIGAME_SERVER_REGISTRY Completeness

- [ ] **MINIGAME_SERVER_REGISTRY completeness:** verify all 4 Phase 8 handlers registered
  - [ ] `MINIGAME_SERVER_REGISTRY.get('identity-crisis')` → `IdentityCrisisGame`
  - [ ] `MINIGAME_SERVER_REGISTRY.get('ranking-file')` → `RankingFileGame`
  - [ ] `MINIGAME_SERVER_REGISTRY.get('pixel-pushers')` → `PixelPushersGame`
  - [ ] `MINIGAME_SERVER_REGISTRY.get('scroll-soul')` → `ScrollSoulGame`
  **Verification:** All 4 handlers instantiate and implement `BaseMinigame` interface.

---

**Phase 8 implementation plan complete.** This phase adds the final 4 minigames to the RMHbox platform, bringing the total to 16 games. Key implementation priorities:

1. **Identity Crisis** — critical to get information masking right; never leak a player's own identity
2. **Ranking File** — consensus calculation algorithm must handle edge cases (ties, partial rankings)
3. **Pixel Pushers** — physics simulation must be deterministic per-tick and server-authoritative; test collision resolution thoroughly
4. **Scroll Soul** — procedural generation must guarantee reachability; fake ad system needs careful per-player isolation

> **Parallel Development Note:** Phase 8 can be developed in parallel with Phase 6 and Phase 7, as all three depend only on Phase 4 (engine) + Phase 5 (established patterns). The Phase 5 + Phase 8 Coexistence Test (§8.5.9) validates independent operation. The Full Coexistence Test (§8.5.10) should be run as a final integration step once all phases are merged.

---

## 8.6 Game Settings Test Plan (§12A)

All tests go in `testing/rmhbox/phase-8/game-settings.test.ts` (or integrated into the phase-8 test suite). Follow the Phase 5 test patterns in `testing/rmhbox/phase-5/6-game-settings.test.ts`.

### 8.6.1 Schema Completeness Tests

- [ ] Each of the 4 exported settings arrays has the expected number of entries (IC: 5, RF: 4, PP: 4, SC: 6).
- [ ] Every setting has `key`, `type`, `label`, `default` defined.
- [ ] Integer/float settings have `min`, `max`, `step` defined.
- [ ] Select settings (if any) have a non-empty `options` array.
- [ ] Boolean settings have no `min`/`max`/`step`.
- [ ] Default values fall within declared constraints.
- [ ] Float settings (`baseScrollSpeed`, `maxScrollSpeed`, `fakeXChance`) have type `'float'`.

### 8.6.2 Identity Crisis Settings Tests

| Test Case | Description |
|---|---|
| `default questionsPerPlayer` | With no custom settings, handler uses `IC_QUESTIONS_PER_PLAYER` (3) |
| `custom questionsPerPlayer = 5` | Handler allows 5 questions per player |
| `custom askDuration = 45` | Ask phase timer is 45s |
| `custom voteDuration = 25` | Vote phase timer is 25s |
| `custom finalGuessDuration = 60` | Final guess timer is 60s |
| `enableEarlyGuess = false` | Early guess action is rejected; must use all questions |
| `enableEarlyGuess = true (default)` | Subject can guess before all questions are used |

### 8.6.3 Ranking File Settings Tests

| Test Case | Description |
|---|---|
| `default totalRounds` | Uses `RF_TOTAL_ROUNDS` (4) |
| `custom totalRounds = 6` | Handler plays 6 ranking rounds |
| `custom rankingDuration = 60` | Ranking timer is 60s |
| `custom itemsPerCategory = 7` | 7 items to rank per round |
| `enableOutlierBonus = false` | No outlier bonus awarded |
| `enableOutlierBonus = true (default)` | Bonus points for hardest item |

### 8.6.4 Pixel Pushers Settings Tests

| Test Case | Description |
|---|---|
| `default totalLevels` | Uses `PP_TOTAL_LEVELS` (3) |
| `custom totalLevels = 5` | Handler plays 5 levels |
| `custom activeDuration = 120` | Level timer is 120s |
| `enablePolarityFlip = false` | Polarity never flips; controls are fixed |
| `enablePolarityFlip = true (default)` | Polarity flips every `polarityInterval` seconds |
| `custom polarityInterval = 10` | Polarity flips every 10s |
| `polarityInterval ignored when flip disabled` | Setting has no effect when `enablePolarityFlip = false` |

### 8.6.5 Scroll Soul Settings Tests

| Test Case | Description |
|---|---|
| `default maxSurvival` | Uses `SC_MAX_SURVIVAL` (120s) |
| `custom maxSurvival = 180` | Game lasts up to 180 seconds |
| `custom baseScrollSpeed = 1.5` | Starting speed is 1.5× |
| `custom maxScrollSpeed = 4.0` | Max speed ramps to 4.0× |
| `custom maxConcurrentAds = 5` | Up to 5 ads on screen at once |
| `custom fakeXChance = 0.6` | 60% chance of fake close button |
| `enableAds = false` | No ads spawn; pure platformer mode |
| `enableAds = true (default)` | Ads spawn normally |
| `maxConcurrentAds ignored when ads disabled` | Setting has no effect when `enableAds = false` |
| `fakeXChance ignored when ads disabled` | Setting has no effect when `enableAds = false` |
| `float clamping: baseScrollSpeed = 0.3` | Clamped to min 0.5 |
| `float step-snapping: fakeXChance = 0.35` | Snapped to nearest step (0.3 or 0.4) |

### 8.6.6 getSetting() Fallback Tests

- [ ] Calling `getSetting('maxSurvival', SC_MAX_SURVIVAL)` with empty `gameSettings` returns the fallback.
- [ ] Calling `getSetting('baseScrollSpeed', SC_BASE_SCROLL_SPEED)` with `gameSettings: { baseScrollSpeed: 1.5 }` returns `1.5`.
- [ ] Calling `getSetting('unknownKey', 42)` returns `42`.

