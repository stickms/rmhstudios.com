# Phase 6: Minigames Set 2 — Fact or Friction, Undercover Editor, Minimalist Masterpiece, Emoji Cinema

> **Depends on:** Phase 4 (Minigame Engine & Lifecycle), Phase 5 patterns (BaseMinigame, registry, constants, schemas)
>
> This phase implements the second set of four minigames for RMHbox. Each game extends `BaseMinigame` from Phase 4 and integrates with the existing lobby, lifecycle, scoring, and award systems established in Phases 1–4.

---

## Table of Contents

1. [6.1 Fact or Friction](#61-fact-or-friction)
2. [6.2 Undercover Editor](#62-undercover-editor)
3. [6.3 Minimalist Masterpiece](#63-minimalist-masterpiece)
4. [6.4 Emoji Cinema](#64-emoji-cinema)
5. [6.5 Cross-Game Integration Testing](#65-cross-game-integration-testing)

---

## 6.1 Fact or Friction

**Game ID:** `fact-or-friction` | **Category:** `trivia` | **Icon:** `flame`
**Players:** 2–16 | **Duration:** ~176s (8 questions)

---

### 6.1.1 Install NPM Packages

- [ ] No additional NPM packages required for Fact or Friction
  - The question pool is a static JSON file; the Point Pot is a server-side timer.
  **Verification:** Confirm no new dependencies needed beyond those installed in Phase 1.

---

### 6.1.2 Add Constants to `lib/rmhbox/constants.ts`

- [ ] Add `FOF_TOTAL_QUESTIONS = 8` — number of questions per game
- [ ] Add `FOF_QUESTION_REVEAL_SECONDS = 2` — duration of the question reveal animation
- [ ] Add `FOF_ANSWER_DURATION_SECONDS = 15` — seconds for the answer phase per question
- [ ] Add `FOF_ANSWER_REVEAL_SECONDS = 4` — duration of the answer reveal phase
- [ ] Add `FOF_PAUSE_SECONDS = 1` — brief pause between questions
- [ ] Add `FOF_POT_START_VALUE = 1000` — starting value of the Point Pot
- [ ] Add `FOF_POT_TICK_VALUE = 50` — amount the pot decreases per tick
- [ ] Add `FOF_POT_TICK_INTERVAL_MS = 500` — interval between pot ticks (2 ticks/second)
- [ ] Add `FOF_POT_MIN_VALUE = 100` — minimum pot value (floor)
- [ ] Add `FOF_EASY_MULTIPLIER = 0.8` — difficulty multiplier for easy questions
- [ ] Add `FOF_MEDIUM_MULTIPLIER = 1.0` — difficulty multiplier for medium questions
- [ ] Add `FOF_HARD_MULTIPLIER = 1.5` — difficulty multiplier for hard questions
- [ ] Add `FOF_SCORE_FLOOR = -500` — minimum total score a player can have
- [ ] Add `FOF_QUESTION_DISTRIBUTION = { easy: 3, medium: 3, hard: 2 }` — question difficulty distribution per game
- [ ] **Verification:** Import all `FOF_*` constants in a test file; confirm no undefined values and correct types. Verify `FOF_QUESTION_DISTRIBUTION` sums to `FOF_TOTAL_QUESTIONS` (3+3+2=8).

---

### 6.1.3 Create Static Data Files

- [ ] Create directory `public/data/rmhbox/fact-or-friction/`
  **Verification:** Directory exists on disk.

- [ ] Create `public/data/rmhbox/fact-or-friction/questions.json` — curated trivia question pool
  - Each entry follows the `TriviaQuestion` interface:
    ```ts
    {
      id: string;
      question: string;
      options: string[];           // exactly 4 options (A, B, C, D)
      correctIndex: number;        // 0–3
      category: string;            // e.g., "Science", "History", "Pop Culture"
      difficulty: "easy" | "medium" | "hard";
      source: string;              // attribution / fact-check source
    }
    ```
  - [ ] Include at least 100 questions total
  - [ ] Balanced difficulty: ≥30 easy, ≥30 medium, ≥30 hard
  - [ ] At least 8 distinct categories represented
  - [ ] All questions fact-checked; `source` field populated for each
  - [ ] No duplicate questions
  - [ ] All `options` arrays have exactly 4 entries
  - [ ] `correctIndex` is 0, 1, 2, or 3 for every question
  **Verification:** Parse JSON; validate every entry against schema; confirm difficulty distribution; confirm all `correctIndex` values are in range 0–3; confirm no duplicate `id` values; confirm ≥8 unique categories.

---

### 6.1.4 Define Zod Validation Schemas

- [ ] Create `lib/rmhbox/fact-or-friction/schemas.ts`

- [ ] Define `SubmitAnswerSchema`:
  ```ts
  const SubmitAnswerSchema = z.object({
    selectedIndex: z.number().int().min(0).max(3),
  });
  ```
  **Verification:** Valid: `{ selectedIndex: 0 }`, `{ selectedIndex: 3 }`. Invalid: `{ selectedIndex: -1 }`, `{ selectedIndex: 4 }`, `{ selectedIndex: 1.5 }`.

- [ ] Define `PassQuestionSchema`:
  ```ts
  const PassQuestionSchema = z.object({});
  ```
  **Verification:** Valid: `{}`. Extra fields stripped by Zod.

- [ ] Define `TriviaQuestionSchema` for data validation at server startup:
  ```ts
  const TriviaQuestionSchema = z.object({
    id: z.string().min(1),
    question: z.string().min(10),
    options: z.array(z.string().min(1)).length(4),
    correctIndex: z.number().int().min(0).max(3),
    category: z.string().min(1),
    difficulty: z.enum(["easy", "medium", "hard"]),
    source: z.string().min(1),
  });
  ```
  **Verification:** Validate all entries in `questions.json` against this schema at server startup.

---

### 6.1.5 Create Data Loader

- [ ] Create `lib/rmhbox/fact-or-friction/question-loader.ts`
  - [ ] Export `loadQuestions(): TriviaQuestion[]` — reads and parses `questions.json` once at server init
  - [ ] Validate each question against `TriviaQuestionSchema` during load; skip invalid entries with a warning log
  - [ ] Cache in module-level variable (singleton pattern)
  - [ ] Export `selectQuestionsForGame(pool: TriviaQuestion[], usedIds: Set<string>): TriviaQuestion[]`
    - Select questions according to `FOF_QUESTION_DISTRIBUTION` (3 easy, 3 medium, 2 hard)
    - Exclude questions with IDs in `usedIds` (prevents repeats within a lobby session)
    - Avoid consecutive questions from the same category when possible
    - Shuffle within each difficulty bucket before selection
    - Return an ordered array of 8 questions
  **Verification:** Unit test: call `loadQuestions()` twice → same reference returned. Call `selectQuestionsForGame()` with empty exclusion → 8 questions with correct distribution. Call again with previous IDs excluded → 8 different questions. Confirm no consecutive same-category when pool size allows.

---

### 6.1.6 Implement Server Handler

- [ ] Create `server/rmhbox/minigames/fact-or-friction.ts`

#### 6.1.6.1 Type Definitions

- [ ] Define `FOFPhase` enum:
  ```ts
  type FOFPhase = 'QUESTION_REVEAL' | 'ANSWER' | 'ANSWER_REVEAL' | 'PAUSE';
  ```
  **Verification:** Type has exactly 4 values matching spec.

- [ ] Define `PlayerAnswer` type:
  ```ts
  type PlayerAnswer = {
    userId: string;
    selectedIndex: number | null;   // null = pass
    potValueAtSubmission: number;
    submittedAt: number;
    isCorrect: boolean;
    scoreChange: number;            // +pot, -pot, or 0
  };
  ```

- [ ] Define `QuestionResult` type:
  ```ts
  type QuestionResult = {
    questionIndex: number;
    question: TriviaQuestion;
    playerAnswers: PlayerAnswer[];
    fastestCorrectUserId: string | null;
    correctCount: number;
    incorrectCount: number;
    passCount: number;
  };
  ```

- [ ] Define `FactOrFrictionState` type:
  ```ts
  type FactOrFrictionState = {
    questions: TriviaQuestion[];
    currentQuestionIndex: number;
    totalQuestions: number;
    phase: FOFPhase;
    potValue: number;
    potStartedAt: number;
    playerAnswers: Map<string, PlayerAnswer>;
    playerScores: Map<string, number>;
    questionHistory: QuestionResult[];
    phaseStartedAt: number;
    phaseEndsAt: number;
  };
  ```
  **Verification:** All types compile without errors. Cross-reference every field against design spec §1.4.

#### 6.1.6.2 Class: `FactOrFrictionGame extends BaseMinigame`

- [ ] Constructor: call `super(context)`; load question pool via question loader
  **Verification:** Instantiate class; confirm no errors and question pool is loaded.

#### 6.1.6.3 State Initialization (`start()`)

- [ ] Retrieve `usedQuestionIds` from the lobby's session context (prevents repeats across games in same lobby)
- [ ] Call `selectQuestionsForGame()` with the pool and exclusion set
- [ ] Initialize `playerScores` map with 0 for each player in `context.players`
- [ ] Initialize empty `playerAnswers` map
- [ ] Set `currentQuestionIndex = -1` (will be incremented to 0 on first call)
- [ ] Set `totalQuestions = FOF_TOTAL_QUESTIONS`
- [ ] Set `questionHistory = []`
- [ ] Call `startNextQuestion()`
  **Verification:** Unit test: init with 4 players; confirm 8 questions selected with correct distribution, all scores = 0, no answers recorded.

#### 6.1.6.4 Question Lifecycle

- [ ] `startNextQuestion()`:
  - Increment `currentQuestionIndex`
  - If `currentQuestionIndex >= totalQuestions`, call `endGame()`; return
  - Set `phase = 'QUESTION_REVEAL'`
  - Get current question from `questions[currentQuestionIndex]`
  - Clear `playerAnswers` map
  - Emit `rmhbox:game:action` with type `FOF_QUESTION` to all lobby members:
    ```ts
    {
      questionIndex: currentQuestionIndex,
      question: currentQuestion.question,
      options: currentQuestion.options,
      category: currentQuestion.category,
      difficulty: currentQuestion.difficulty,
      potStartValue: FOF_POT_START_VALUE,
      answerDurationSeconds: FOF_ANSWER_DURATION_SECONDS,
    }
    ```
  - **Do NOT include `correctIndex` in this payload**
  - Schedule `startAnswerPhase()` after `FOF_QUESTION_REVEAL_SECONDS` (2s)
  **Verification:** Unit test: call `startNextQuestion()` → event emitted without `correctIndex`. Timer scheduled for 2s. Phase is `QUESTION_REVEAL`.

- [ ] `startAnswerPhase()`:
  - Set `phase = 'ANSWER'`
  - Set `potValue = FOF_POT_START_VALUE` (1000)
  - Set `potStartedAt = Date.now()`
  - Set `phaseStartedAt = Date.now()`
  - Set `phaseEndsAt = phaseStartedAt + FOF_ANSWER_DURATION_SECONDS * 1000`
  - Start pot tick interval: every `FOF_POT_TICK_INTERVAL_MS` (500ms):
    - `potValue = Math.max(potValue - FOF_POT_TICK_VALUE, FOF_POT_MIN_VALUE)`
    - Emit `rmhbox:game:action` with type `FOF_POT_TICK` to all: `{ potValue }`
  - Start timer tick interval: every 1000ms, emit `TIMER_TICK` with `{ timeRemaining }`
  - Schedule `endAnswerPhase()` after `FOF_ANSWER_DURATION_SECONDS` (15s)
  **Verification:** Unit test: after 1s → pot = 950 (2 ticks at 500ms). After 9s → pot = 100 (min). After 14s → pot still 100. Timer ticks emit decreasing values.

- [ ] `endAnswerPhase()`:
  - Stop pot tick interval
  - Stop timer tick interval
  - For any player who hasn't submitted an answer, treat as pass (scoreChange = 0)
  - Call `computeQuestionResult()`
  - Set `phase = 'ANSWER_REVEAL'`
  - Emit `rmhbox:game:action` with type `FOF_ANSWER_REVEAL` to all:
    ```ts
    {
      correctIndex: currentQuestion.correctIndex,
      correctAnswer: currentQuestion.options[currentQuestion.correctIndex],
      playerResults: Array<FOFPlayerQuestionResult>,
    }
    ```
  - Emit `rmhbox:game:action` with type `FOF_SCORE_UPDATE` to all:
    ```ts
    {
      scores: Array<{ userId, userName, totalScore, scoreChange }>,
    }
    ```
  - Schedule `startPause()` after `FOF_ANSWER_REVEAL_SECONDS` (4s)
  **Verification:** Unit test: correctIndex now revealed. Player results include isCorrect, scoreChange, potValueAtSubmission. Scores updated correctly.

- [ ] `startPause()`:
  - Set `phase = 'PAUSE'`
  - Check for pending join-in-progress players; add them to `playerScores` with 0
  - Schedule `startNextQuestion()` after `FOF_PAUSE_SECONDS` (1s)
  **Verification:** JIP players added during pause. Next question starts after 1s.

#### 6.1.6.5 Input Handling — `SUBMIT_ANSWER`

- [ ] Validate phase is `'ANSWER'`; reject if not
- [ ] Parse input through `SubmitAnswerSchema`; reject on validation failure
- [ ] Check player hasn't already answered this question (check `playerAnswers` map); reject if duplicate
- [ ] Record answer:
  - Get current `potValue` from server state (NOT from client)
  - Compute effective pot: `floor(potValue × difficultyMultiplier)` where multiplier is `FOF_EASY_MULTIPLIER`, `FOF_MEDIUM_MULTIPLIER`, or `FOF_HARD_MULTIPLIER` based on question difficulty
  - Determine `isCorrect = (selectedIndex === currentQuestion.correctIndex)`
  - Compute `scoreChange`:
    - If correct: `+effectivePot`
    - If incorrect: `-effectivePot`
  - Apply score floor: `newTotal = Math.max(currentScore + scoreChange, FOF_SCORE_FLOOR)`; adjust `scoreChange` if floor was hit
  - Store `PlayerAnswer` in `playerAnswers` map
  - Update `playerScores`
- [ ] Emit `FOF_ANSWER_LOCKED` to answering player ONLY: `{ potValueAtLock: effectivePot }`
- [ ] Emit `FOF_PLAYER_ANSWERED` to ALL lobby members: `{ userId, userName }` (NOT what they answered)
- [ ] If ALL players have answered (or passed), immediately call `endAnswerPhase()` (skip remaining timer)
  **Verification:** Unit test: Player answers correctly at pot=800, medium difficulty → scoreChange = +800. Player answers incorrectly at pot=600, hard difficulty → scoreChange = -(600×1.5) = -900; if score would drop below -500, clamped. Duplicate submission rejected. After all players answer, phase ends early.

#### 6.1.6.6 Input Handling — `PASS_QUESTION`

- [ ] Validate phase is `'ANSWER'`; reject if not
- [ ] Parse input through `PassQuestionSchema`
- [ ] Check player hasn't already answered; reject if duplicate
- [ ] Record pass: `PlayerAnswer` with `selectedIndex = null`, `scoreChange = 0`
- [ ] Emit `FOF_PLAYER_ANSWERED` to ALL lobby members: `{ userId, userName }`
- [ ] If ALL players have answered/passed, immediately call `endAnswerPhase()`
  **Verification:** Unit test: pass recorded with scoreChange = 0. Player count check triggers early phase end.

#### 6.1.6.7 Scoring Computation (`computeQuestionResult()`)

- [ ] Build `QuestionResult` object:
  - Count `correctCount`, `incorrectCount`, `passCount` across all `playerAnswers`
  - Determine `fastestCorrectUserId`: the player with the earliest `submittedAt` timestamp who answered correctly; `null` if no one answered correctly
  - Store in `questionHistory` array
  **Verification:** Unit test with 4 players (1 correct, 1 incorrect, 1 pass, 1 timeout) → counts are 1/1/2. Fastest correct userId matches the first correct submitter.

#### 6.1.6.8 `getStateForPlayer(userId)`

- [ ] Return object:
  ```ts
  {
    currentQuestionIndex: number;
    totalQuestions: number;
    question: string;
    options: string[];
    category: string;
    difficulty: string;
    phase: FOFPhase;
    potValue: number;
    timeRemaining: number;
    myAnswer: { selectedIndex: number; potValueAtLock: number } | null;
    myHasPassed: boolean;
    playersAnswered: Array<{ userId: string; userName: string; hasAnswered: boolean }>;
    scores: Array<{ userId: string; userName: string; totalScore: number }>;
    questionHistory: QuestionResult[];  // only past revealed questions
  }
  ```
- [ ] During `ANSWER` phase: `correctIndex` is NOT included in the returned state
- [ ] During `ANSWER_REVEAL` phase: include full results with `correctIndex`
- [ ] `questionHistory` only includes questions where the reveal has already occurred
- [ ] Other players' individual answers are masked during `ANSWER` phase (only `hasAnswered` boolean)
  **Verification:** Unit test: during ANSWER → no `correctIndex`, myAnswer shows lock info. During ANSWER_REVEAL → correctIndex visible, all player results visible. Other players' selectedIndex hidden during ANSWER.

#### 6.1.6.9 `getStateForSpectator()`

- [ ] Same as player view (spectators have no privileged information during answer phase since correct answers are hidden from everyone)
- [ ] During `ANSWER_REVEAL`: same as player view with full results
  **Verification:** Spectator state matches player state structure.

#### 6.1.6.10 Join-in-Progress Handling

- [ ] Policy: `join_next_subround`
- [ ] Check for pending players during `startPause()` transition (between `ANSWER_REVEAL` and next `QUESTION_REVEAL`)
- [ ] Initialize new player in `playerScores` with 0
- [ ] New player can interact starting from the next `ANSWER` phase
- [ ] Send full state via `getStateForPlayer()` on join
  **Verification:** Unit test: player joins during question 3 → participates from question 4 onward with score 0.

#### 6.1.6.11 Reconnection Handling (`handlePlayerReconnect(userId)`)

- [ ] Send full state including current question, pot value, their locked answer (if any), and score history
- [ ] If `ANSWER` phase still active and player hasn't answered, they can still answer
- [ ] If they missed an entire question (disconnected during it), they score 0 for that question (treated as pass)
- [ ] Send current `TIMER_TICK` with accurate `timeRemaining`
  **Verification:** Unit test: disconnect during ANSWER with no answer, reconnect → can still answer. Disconnect for entire question → scored as pass (0).

#### 6.1.6.12 Disconnect Handling (`handlePlayerDisconnect(userId)`)

- [ ] Player's existing answer (if any) is preserved
- [ ] If phase is `ANSWER` and player hasn't answered, they will be treated as timeout/pass at phase end
- [ ] No special behavior — unanswered questions score 0
  **Verification:** Unit test: player disconnects mid-ANSWER without answering → scored as pass at phase end.

#### 6.1.6.13 `computeResults()` and Awards

- [ ] Compute final rankings by cumulative `playerScores` (descending)
- [ ] Compute awards:
  - [ ] **Pot Sniper** — answered correctly at the highest pot value (fastest correct answer) across all questions; icon: `crosshair`
  - [ ] **Friction Burn** — lost the most points from incorrect answers (largest total negative scoreChange); icon: `flame`
  - [ ] **Cool Head** — passed the most questions (risk-averse play); icon: `snowflake`
  - [ ] **Perfect Score** — answered every question correctly (0 incorrect, 0 passes); icon: `check-circle`
  - [ ] **Comeback Kid** — had the biggest single-question positive score swing from negative territory (was at negative score, then answered correctly for the largest positive delta); icon: `trending-up`
- [ ] Return `MinigameResults` with rankings, awards, and `gameSpecificData` containing `questionHistory`
  **Verification:** Unit test: construct scoring scenarios triggering each award → all 5 awards assigned correctly to different players.

#### 6.1.6.14 `buildGameLog()`

- [ ] Maintain an `actionLog: GameLogAction[]` array on the game instance
- [ ] Log `question_start` action when a question is revealed (questionIndex, questionText, category, pointPotMax)
- [ ] Log `answer_submitted` action per player answer (userId, answer, correct, timeMs, pointsAwarded)
- [ ] Log `question_pass` action when a player passes (userId, questionIndex)
- [ ] Log `question_end` action at question resolution (questionIndex, correctAnswer, potState, answerBreakdown)
- [ ] In `computeResults()`, build `GameLog` with `initialState` containing total questions, point pot config, player list
- [ ] Return `GameLog` from `buildGameLog()`
  **Verification:** Unit test: 8-question game, verify log has 8 `question_start` and 8 `question_end` actions.

---

### 6.1.7 Register Game in Minigame Registry

- [ ] Add entry to `lib/rmhbox/minigame-registry.ts`:
  ```ts
  {
    id: "fact-or-friction",
    displayName: "Fact or Friction",
    description: "High-stakes trivia where wrong answers cost you! Race to answer for maximum points, but one mistake deducts from your score.",
    category: "trivia",
    icon: "flame",
    minPlayers: 2,
    maxPlayers: 16,
    estimatedDurationSeconds: 176,
    supportsTeams: false,
    instructionDurationSeconds: 15,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: "join_next_subround",
    tags: ["trivia", "risk", "speed", "knowledge"],
  }
  ```
  **Verification:** Call registry lookup for `"fact-or-friction"`; confirm all metadata fields correct and handler instantiates with valid context.

---

### 6.1.8 Build Client Components

#### 6.1.8.1 `components/rmhbox/minigames/fact-or-friction/FactOrFrictionGame.tsx`

- [ ] Phase router component — renders appropriate sub-component based on `phase`
- [ ] Subscribe to all `FOF_*` and `TIMER_TICK` WebSocket events via `useRMHboxStore`
- [ ] Maintain local state:
  - `currentQuestionIndex`, `totalQuestions`, `question`, `options`, `category`, `difficulty`
  - `phase`, `potValue`, `timeRemaining`
  - `myAnswer`, `myHasPassed`, `playersAnswered[]`
  - `scores[]`, `questionHistory[]`
- [ ] Handle `FOF_QUESTION` → update question data, reset answer state, transition to reveal animation
- [ ] Handle `FOF_POT_TICK` → update `potValue` with smooth interpolation between ticks for animation
- [ ] Handle `FOF_ANSWER_LOCKED` → update `myAnswer` with locked pot value, show lock confirmation
- [ ] Handle `FOF_PLAYER_ANSWERED` → update `playersAnswered` array
- [ ] Handle `FOF_ANSWER_REVEAL` → show correct answer, highlight results
- [ ] Handle `FOF_SCORE_UPDATE` → animate score changes
- [ ] Handle `TIMER_TICK` → update `timeRemaining` display
- [ ] Conditional rendering:
  - `QUESTION_REVEAL` → `<QuestionCard />` with entrance animation
  - `ANSWER` → `<QuestionCard />` + `<PointPotDisplay />` + `<OptionButton />`s
  - `ANSWER_REVEAL` → `<AnswerReveal />`
  - `PAUSE` → brief transition screen
  **Verification:** Component renders without errors for each phase. React DevTools: state updates correctly on each event.

#### 6.1.8.2 `components/rmhbox/minigames/fact-or-friction/PointPotDisplay.tsx`

- [ ] Display current pot value with animated number transition (counting down effect)
- [ ] Visual fire/drain effect that intensifies as pot decreases
- [ ] Pulsing animation when pot is near minimum
- [ ] Color gradient: green (high) → yellow (mid) → red (low/min)
- [ ] Accept `potValue` and `maxValue` as props
- [ ] Use Framer Motion for smooth value transitions
  **Verification:** Render with various pot values; confirm animation plays smoothly. At potValue=100 (min), pulsing red effect visible.

#### 6.1.8.3 `components/rmhbox/minigames/fact-or-friction/QuestionCard.tsx`

- [ ] Display question text prominently
- [ ] Show category badge and difficulty indicator (star rating or colored label)
- [ ] Question number display: "Q3/8"
- [ ] Entrance animation (fade + slide up) on new question
- [ ] Responsive text sizing for mobile
  **Verification:** Renders with mock question data. Category badge shows correct category. Difficulty indicator matches difficulty level.

#### 6.1.8.4 `components/rmhbox/minigames/fact-or-friction/OptionButton.tsx`

- [ ] Reusable A/B/C/D option button with label prefix
- [ ] States: `default` (tappable), `selected` (locked in, green border), `correct` (green fill, during reveal), `incorrect` (red fill, during reveal), `disabled` (after locking or during reveal)
- [ ] Emit `rmhbox:game:input` with `{ action: "SUBMIT_ANSWER", data: { selectedIndex } }` on tap
- [ ] Once locked, show "Locked in at X points" indicator
- [ ] During `ANSWER_REVEAL`: highlight correct answer green, incorrect player answer red
- [ ] Touch-friendly sizing (min 48px tap target on mobile)
  **Verification:** Tap option → emits correct event. After lock → shows locked state. During reveal → correct/incorrect colors applied.

#### 6.1.8.5 `components/rmhbox/minigames/fact-or-friction/AnswerReveal.tsx`

- [ ] Show correct answer highlighted prominently
- [ ] Display all players' results: who answered what, correct/incorrect indicator, pot value at submission, score change (+/- animation)
- [ ] Score change animations: green "+800" floating up for correct, red "-600" for incorrect
- [ ] Player who answered fastest (if correct) gets a "First!" badge
- [ ] Pass/timeout indicators for players who didn't answer
  **Verification:** Renders with 4-player mock data. Correct/incorrect indicators match. Score animations play. First badge shows for fastest correct player.

#### 6.1.8.6 `components/rmhbox/minigames/fact-or-friction/ScoreRibbon.tsx`

- [ ] Persistent bottom bar showing player's running score
- [ ] Animated score change on update (delta appears briefly, e.g., "+800" or "-300")
- [ ] Players answered count: "4/6 answered"
- [ ] Pass button with tap handler (emits `PASS_QUESTION` action)
- [ ] Timer display
  **Verification:** Score updates animate correctly. Pass button emits correct event. Player count updates in real-time.

---

### 6.1.9 Integration Testing

- [ ] End-to-end test: 4 players join lobby → start Fact or Friction → play through 8 questions
  - [ ] Verify 8 questions with correct difficulty distribution (3 easy, 3 medium, 2 hard)
  - [ ] Verify pot starts at 1000 and drains to 100 over 9 seconds
  - [ ] Verify correct answer awards `+effectivePot`, incorrect deducts `-effectivePot`
  - [ ] Verify difficulty multipliers applied correctly (easy ×0.8, hard ×1.5)
  - [ ] Verify score floor at -500 prevents further deductions
  - [ ] Verify `correctIndex` is NEVER sent during `ANSWER` phase (inspect WebSocket traffic)
  - [ ] Verify all players answering triggers early phase end
  **Verification:** All assertions pass. Scores match manual calculation.

- [ ] Pot timing test:
  - [ ] Player answers at t=0s → pot = 1000 × multiplier
  - [ ] Player answers at t=4.5s → pot should be 1000 - (9 ticks × 50) = 550, × multiplier
  - [ ] Player answers at t=10s → pot should be 100 (at minimum), × multiplier
  **Verification:** Score changes match expected pot values at each timestamp.

- [ ] Information masking test:
  - [ ] During ANSWER: other players' `selectedIndex` NOT in WebSocket traffic; only `hasAnswered` boolean
  - [ ] During ANSWER: `correctIndex` NOT in any event payload
  - [ ] During ANSWER_REVEAL: `correctIndex` and all player results visible
  **Verification:** Network inspector confirms masking during ANSWER and reveal during ANSWER_REVEAL.

- [ ] Join-in-progress test: Player joins during question 4 → participates from question 5 with score 0
  **Verification:** JIP player added during PAUSE, starts interacting at next ANSWER phase.

- [ ] Reconnection test: Player disconnects mid-ANSWER (before answering), reconnects → receives current question, pot value, timer, can still answer
  **Verification:** Reconnected player can answer and score is computed correctly.

- [ ] Rate limiting test: Rapid-fire `SUBMIT_ANSWER` events
  **Verification:** Only first valid submission accepted; duplicates silently ignored.

- [ ] Anti-cheat test: Confirm `correctIndex` is never sent until `ANSWER_REVEAL` phase
  - [ ] Inspect all `FOF_QUESTION`, `FOF_POT_TICK`, `FOF_ANSWER_LOCKED`, `FOF_PLAYER_ANSWERED` events — no `correctIndex`
  - [ ] Inspect `getStateForPlayer()` during `ANSWER` — no `correctIndex`
  **Verification:** Zero correctIndex leakage before reveal.

---

## 6.2 Undercover Editor

**Game ID:** `undercover-editor` | **Category:** `social-deduction` | **Icon:** `pencil`
**Players:** 4–10 | **Duration:** ~variable (turn-based, 2 rotations)

---

### 6.2.1 Install NPM Packages

- [ ] No additional NPM packages required for Undercover Editor
  - `fuse.js` (already in core spec) is used for keyword proximity matching.
  **Verification:** Confirm `fuse.js` is listed in `package.json` dependencies.

---

### 6.2.2 Add Constants to `lib/rmhbox/constants.ts`

- [ ] Add `UE_MIN_PLAYERS = 4` — minimum players required
- [ ] Add `UE_MAX_PLAYERS = 10` — maximum players allowed
- [ ] Add `UE_ROTATIONS = 2` — each player writes twice
- [ ] Add `UE_WRITE_TIMEOUT_SECONDS = 45` — seconds for writing a sentence
- [ ] Add `UE_EDIT_TIMEOUT_SECONDS = 30` — seconds for the Editor's secret edit
- [ ] Add `UE_REVIEW_DURATION_SECONDS = 20` — duration of the review phase
- [ ] Add `UE_ACCUSATION_DURATION_SECONDS = 30` — duration of the accusation/voting phase
- [ ] Add `UE_REVEAL_DURATION_SECONDS = 10` — duration of the reveal phase
- [ ] Add `UE_DISCONNECT_TURN_WAIT_SECONDS = 15` — wait before auto-completing a disconnected player's turn
- [ ] Add `UE_MIN_SENTENCE_LENGTH = 10` — minimum sentence character length
- [ ] Add `UE_MAX_SENTENCE_LENGTH = 200` — maximum sentence character length
- [ ] Add `UE_MAX_EDIT_WORD_LENGTH = 30` — maximum replacement word character length
- [ ] Add `UE_WRITER_MAJOR_WIN = 400` — Writers correctly ID Editor AND keyword NOT in story
- [ ] Add `UE_WRITER_MINOR_WIN = 250` — Writers correctly ID Editor BUT keyword IS in story
- [ ] Add `UE_WRITER_LOSS = 50` — Writers vote wrong AND keyword IS in story
- [ ] Add `UE_WRITER_MINOR_LOSS = 100` — Writers vote wrong AND keyword NOT in story
- [ ] Add `UE_EDITOR_MAJOR_WIN = 600` — Editor not caught AND keyword IS in story
- [ ] Add `UE_EDITOR_MINOR_WIN = 300` — Editor not caught AND keyword NOT in story
- [ ] Add `UE_EDITOR_PARTIAL = 200` — Editor caught BUT keyword IS in story
- [ ] Add `UE_EDITOR_LOSS = 50` — Editor caught AND keyword NOT in story
- [ ] Add `UE_CORRECT_VOTE_BONUS = 100` — extra points for Writers who voted correctly
- [ ] Add `UE_KEYWORD_PROXIMITY_BONUS = 50` — bonus for Editor if near-match to keyword in story
- [ ] Add `UE_KEYWORD_FUZZY_THRESHOLD = 0.7` — fuse.js threshold for proximity bonus
- [ ] **Verification:** Import all `UE_*` constants in a test file; confirm no undefined values and correct types.

---

### 6.2.3 Create Static Data Files

- [ ] Create directory `public/data/rmhbox/undercover-editor/`
  **Verification:** Directory exists on disk.

- [ ] Create `public/data/rmhbox/undercover-editor/prompts.json` — curated story prompts
  - Each entry follows:
    ```ts
    {
      id: string;
      text: string;             // e.g., "A detective arrives at an abandoned mansion on a stormy night."
      genre: string;            // e.g., "Mystery", "Sci-Fi", "Comedy"
      mood: string;             // e.g., "tense", "lighthearted", "dramatic"
    }
    ```
  - [ ] Include at least 50 prompts across ≥6 genres
  - [ ] Each prompt should be 1–2 sentences that set a scene and invite continuation
  - [ ] No duplicate prompts
  **Verification:** Parse JSON; validate every entry against schema; confirm ≥50 entries; confirm ≥6 unique genres.

- [ ] Create `public/data/rmhbox/undercover-editor/keywords.json` — curated keyword pool
  - Each entry follows:
    ```ts
    {
      id: string;
      word: string;              // the secret keyword, e.g., "shadow"
      category: string;          // e.g., "Nature", "Emotion", "Object"
      difficulty: "easy" | "medium" | "hard";
    }
    ```
  - [ ] Include at least 100 keywords
  - [ ] Keywords should be common nouns or adjectives that can plausibly appear in a story
  - [ ] Balanced difficulty: easy words are very common and hard to notice when inserted; hard words are distinctive and risky
  - [ ] No duplicates
  **Verification:** Parse JSON; validate all entries; confirm ≥100 keywords; confirm balanced difficulty.

---

### 6.2.4 Define Zod Validation Schemas

- [ ] Create `lib/rmhbox/undercover-editor/schemas.ts`

- [ ] Define `WriteSentenceSchema`:
  ```ts
  const WriteSentenceSchema = z.object({
    text: z.string().min(UE_MIN_SENTENCE_LENGTH).max(UE_MAX_SENTENCE_LENGTH),
  });
  ```
  **Verification:** Valid: `{ text: "The fog rolled in across the harbor." }`. Invalid: `{ text: "Short." }` (below 10 chars).

- [ ] Define `EditWordSchema`:
  ```ts
  const EditWordSchema = z.object({
    sentenceIndex: z.number().int().min(0),
    wordIndex: z.number().int().min(0),
    newWord: z.string().min(1).max(UE_MAX_EDIT_WORD_LENGTH).regex(/^\S+$/),
  });
  ```
  **Verification:** Valid: `{ sentenceIndex: 0, wordIndex: 3, newWord: "shadow" }`. Invalid: `{ newWord: "two words" }` (contains space).

- [ ] Define `SkipEditSchema`:
  ```ts
  const SkipEditSchema = z.object({});
  ```
  **Verification:** Valid: `{}`.

- [ ] Define `CastAccusationSchema`:
  ```ts
  const CastAccusationSchema = z.object({
    targetUserId: z.string().min(1),
  });
  ```
  **Verification:** Valid: `{ targetUserId: "user_abc123" }`. Invalid: `{ targetUserId: "" }`.

---

### 6.2.5 Create Data Loader

- [ ] Create `lib/rmhbox/undercover-editor/data-loader.ts`
  - [ ] Export `loadPrompts(): StoryPrompt[]` — reads and parses `prompts.json`, caches as singleton
  - [ ] Export `loadKeywords(): Keyword[]` — reads and parses `keywords.json`, caches as singleton
  - [ ] Export `selectPromptForGame(pool: StoryPrompt[], usedIds: Set<string>): StoryPrompt` — picks a random prompt not in `usedIds`
  - [ ] Export `selectKeywordForGame(pool: Keyword[], usedIds: Set<string>): Keyword` — picks a random keyword not in `usedIds`
  **Verification:** Unit test: call loaders twice → same reference. Selection excludes used IDs.

---

### 6.2.6 Implement Server Handler

- [ ] Create `server/rmhbox/minigames/undercover-editor.ts`

#### 6.2.6.1 Type Definitions

- [ ] Define `UEPhase` type:
  ```ts
  type UEPhase = 'SETUP' | 'WRITE' | 'EDIT' | 'REVIEW' | 'ACCUSATION' | 'REVEAL';
  ```
  **Verification:** Type has exactly 6 values matching spec.

- [ ] Define `StorySentence` type:
  ```ts
  type StorySentence = {
    authorUserId: string;
    authorName: string;
    text: string;                  // current version (may have been edited)
    originalText: string;          // original as submitted
    turnNumber: number;
    words: string[];               // tokenized for editing
  };
  ```

- [ ] Define `WordEdit` type:
  ```ts
  type WordEdit = {
    sentenceIndex: number;
    wordIndex: number;
    originalWord: string;
    newWord: string;
    editedOnTurn: number;
  };
  ```

- [ ] Define `UndercoverEditorState` type:
  ```ts
  type UndercoverEditorState = {
    storyPrompt: string;
    keyword: string;
    editorUserId: string;
    turnOrder: string[];
    currentTurnIndex: number;
    totalTurns: number;
    phase: UEPhase;
    sentences: StorySentence[];
    edits: WordEdit[];
    editedWordPositions: Set<string>;   // "sentenceIndex:wordIndex"
    votes: Map<string, string>;         // voterId → accusedUserId
    keywordInStory: boolean;
    editorWasCaught: boolean;
    winner: 'editor' | 'writers' | null;
    playerScores: Map<string, number>;
    phaseStartedAt: number;
    phaseEndsAt: number;
  };
  ```
  **Verification:** All types compile without errors. Cross-reference every field against design spec §2.4.

#### 6.2.6.2 Class: `UndercoverEditorGame extends BaseMinigame`

- [ ] Constructor: call `super(context)`; load prompts and keywords via data loader
  **Verification:** Instantiate class; confirm no errors and data pools are loaded.

#### 6.2.6.3 State Initialization (`start()`)

- [ ] Select story prompt via `selectPromptForGame()`
- [ ] Select keyword via `selectKeywordForGame()`
- [ ] Randomly assign one player as the Editor; all others are Writers
- [ ] Compute `turnOrder`: shuffle player order; `totalTurns = players.length × UE_ROTATIONS`
- [ ] Initialize `sentences = []`, `edits = []`, `editedWordPositions = new Set()`
- [ ] Initialize `votes = new Map()`, `playerScores` with 0 for all players
- [ ] Set `currentTurnIndex = -1`
- [ ] Emit `UE_GAME_START` to all: `{ storyPrompt, turnOrder: PlayerTurnInfo[], totalTurns }`
- [ ] Emit `UE_ROLE_ASSIGNED` to each player individually:
  - Writers: `{ role: 'writer' }` — NO keyword
  - Editor: `{ role: 'editor', keyword }` — INCLUDES keyword
- [ ] Call `startNextTurn()`
  **Verification:** Unit test with 5 players: confirm 1 Editor, 4 Writers. Editor receives keyword. Writers do NOT receive keyword. Turn count = 10 (5 × 2). Story prompt selected.

#### 6.2.6.4 Turn Lifecycle

- [ ] `startNextTurn()`:
  - Increment `currentTurnIndex`
  - If `currentTurnIndex >= totalTurns`, call `startReviewPhase()`; return
  - Determine active player from `turnOrder[currentTurnIndex % turnOrder.length]`
  - Set `phase = 'WRITE'`
  - Emit `UE_TURN_START` to all: `{ turnNumber: currentTurnIndex + 1, activeUserId, activeUserName, writeDurationSeconds: UE_WRITE_TIMEOUT_SECONDS }`
  - Start `TIMER_TICK` interval (1s)
  - Schedule write timeout handler after `UE_WRITE_TIMEOUT_SECONDS`
  - If active player is disconnected, start shorter wait (`UE_DISCONNECT_TURN_WAIT_SECONDS`); if still disconnected, auto-complete with `"..."` sentence
  **Verification:** Unit test: call `startNextTurn()` → correct player activated. Timer starts. After timeout → auto-submit `"..."`.

- [ ] `handleWriteTimeout()`:
  - If player has not submitted a sentence, auto-submit `"..."` as their sentence
  - Proceed to Editor edit phase (or next turn if active player IS the Editor)
  **Verification:** Timeout fires → `"..."` sentence added. Phase transitions correctly.

- [ ] `afterSentenceSubmitted()`:
  - Tokenize sentence into `words[]` array (split by whitespace)
  - Create `StorySentence` and add to `sentences`
  - Emit `UE_SENTENCE_ADDED` to all: `{ turnNumber, authorName, sentence: text, fullStory: StorySentenceView[] }`
  - If active player is NOT the Editor:
    - Check if the Editor is the current turn player; if so, skip edit (Editor edits after their OWN sentence submission)
    - Transition to Editor edit phase
  - If active player IS the Editor:
    - The Editor writes AND gets an edit phase on their own turn
    - Transition to edit phase for the Editor
  **Verification:** Sentence added and broadcast. Story view updated. Edit phase triggered for Editor.

- [ ] `startEditPhase()`:
  - Set `phase = 'EDIT'`
  - Build `EditableStory` for the Editor:
    - Include all sentences with word-level tokens
    - Mark `isEditable = false` for:
      - Words already edited (`editedWordPositions`)
      - Words in the sentence the Editor just wrote (current turn, if they're the active player)
    - Mark `isEditable = true` for all other words
  - Emit `UE_EDIT_PROMPT` to Editor ONLY: `{ story: EditableStory, editDurationSeconds: UE_EDIT_TIMEOUT_SECONDS }`
  - Start `TIMER_TICK` for Editor only
  - Schedule edit timeout after `UE_EDIT_TIMEOUT_SECONDS`
  - **Non-Editor players see nothing during this phase** — they simply see a "The story is being reviewed..." message or similar waiting indicator (no events reveal the edit phase to Writers)
  **Verification:** Unit test: Edit prompt sent to Editor only. Writers receive NO edit-related events. Editable words correctly exclude already-edited positions and current sentence.

- [ ] `handleEditTimeout()`:
  - If Editor has not edited or skipped, auto-skip
  - Proceed to next turn
  **Verification:** Timeout fires → auto-skip. Next turn starts.

- [ ] `afterEditApplied(edit: WordEdit)`:
  - Update the target sentence's `words` array with the new word
  - Reconstruct `text` from updated `words`
  - Add edit to `edits[]` array
  - Add position to `editedWordPositions`
  - Emit `UE_STORY_UPDATED` to ALL: `{ fullStory: StorySentenceView[] }` — story now includes the edit but viewers don't know which word changed
  - Proceed to next turn via `startNextTurn()`
  **Verification:** Edit applied correctly. Story broadcast shows updated text. Old word preserved in `edits` array. New word visible in story.

#### 6.2.6.5 Input Handling — `WRITE_SENTENCE`

- [ ] Validate phase is `'WRITE'`; reject if not
- [ ] Validate sender is the active turn player; reject if not their turn
- [ ] Parse input through `WriteSentenceSchema`; reject on validation failure
- [ ] Sanitize sentence content (strip any HTML/script tags via `sanitizeString()`)
- [ ] Call `afterSentenceSubmitted()`
  **Verification:** Unit test: correct player submits valid sentence → accepted. Wrong player submits → rejected. Too-short sentence → rejected.

#### 6.2.6.6 Input Handling — `EDIT_WORD`

- [ ] Validate phase is `'EDIT'`; reject if not
- [ ] Validate sender is the Editor; reject if not
- [ ] Parse input through `EditWordSchema`; reject on validation failure
- [ ] Validate `sentenceIndex` is within range of `sentences`
- [ ] Validate `wordIndex` is within range of target sentence's `words` array
- [ ] Validate position is editable (not already edited, not current sentence if Editor wrote it)
- [ ] Sanitize `newWord` via `sanitizeString()`
- [ ] Create `WordEdit` object and call `afterEditApplied()`
  **Verification:** Unit test: Editor edits a valid word → accepted, story updated. Editor tries to edit already-edited word → rejected. Editor tries to edit their own sentence's word → rejected. Non-Editor tries to edit → rejected.

#### 6.2.6.7 Input Handling — `SKIP_EDIT`

- [ ] Validate phase is `'EDIT'` and sender is the Editor
- [ ] Parse through `SkipEditSchema`
- [ ] No edit applied; emit `UE_STORY_UPDATED` with unchanged story (to maintain the illusion that something happened — or simply proceed)
- [ ] Call `startNextTurn()`
  **Verification:** Unit test: Editor skips → no edit recorded, next turn starts.

#### 6.2.6.8 Review Phase

- [ ] `startReviewPhase()`:
  - Set `phase = 'REVIEW'`
  - Emit `UE_REVIEW_START` to all: `{ fullStory: StorySentenceView[], reviewDurationSeconds: UE_REVIEW_DURATION_SECONDS }`
  - Start `TIMER_TICK` interval
  - Schedule `startAccusationPhase()` after `UE_REVIEW_DURATION_SECONDS`
  **Verification:** Review event contains complete story. Timer runs for 20s.

#### 6.2.6.9 Accusation Phase

- [ ] `startAccusationPhase()`:
  - Set `phase = 'ACCUSATION'`
  - Build player list (excluding self for each voter)
  - Emit `UE_ACCUSATION_START` to all: `{ players: Array<{ userId, userName }>, accusationDurationSeconds: UE_ACCUSATION_DURATION_SECONDS }`
  - Start `TIMER_TICK` interval
  - Schedule `endAccusationPhase()` after `UE_ACCUSATION_DURATION_SECONDS`
  **Verification:** Accusation event includes all players. Timer runs for 30s.

#### 6.2.6.10 Input Handling — `CAST_ACCUSATION`

- [ ] Validate phase is `'ACCUSATION'`; reject if not
- [ ] Parse through `CastAccusationSchema`
- [ ] Validate `targetUserId` is a real player in the game
- [ ] Validate sender is NOT voting for themselves (Editor can vote for anyone except themselves)
- [ ] Update `votes` map (overwrites previous vote — players can change their vote)
- [ ] Emit `UE_VOTE_CAST` to all: `{ voterId, hasVoted: true }` — NOT who they voted for
  **Verification:** Unit test: valid vote recorded. Self-vote rejected. Vote change updates map. Other players only see that someone voted, not whom.

#### 6.2.6.11 Reveal Phase

- [ ] `endAccusationPhase()`:
  - Set `phase = 'REVEAL'`
  - Tally votes: find the player with the plurality of votes
  - Handle tie: if no plurality, Editor wins by default (no one accused)
  - Determine `editorWasCaught = (mostVotedUserId === editorUserId)`
  - Determine `keywordInStory`:
    - Tokenize entire story into individual words (lowercase)
    - Check exact match: does any word === keyword (case-insensitive)?
    - If no exact match, check proximity via `fuse.js` with threshold `UE_KEYWORD_FUZZY_THRESHOLD` (0.7) — only for proximity bonus, not for win condition
    - `keywordInStory` is true ONLY on exact match
  - Determine winner and scores per the 4-scenario table:
    - Scenario 1: Editor caught, keyword NOT in story → Writers major win
    - Scenario 2: Editor caught, keyword IS in story → Writers minor win
    - Scenario 3: Editor not caught, keyword IS in story → Editor major win
    - Scenario 4: Editor not caught, keyword NOT in story → Editor minor win
  - Apply `UE_CORRECT_VOTE_BONUS` (+100) to each Writer who voted correctly
  - Apply `UE_KEYWORD_PROXIMITY_BONUS` (+50) to Editor if a fuzzy near-match exists (but no exact match)
  - Update `playerScores`
  - Emit `UE_REVEAL` to all:
    ```ts
    {
      editorUserId, editorName, keyword, keywordInStory, editorCaught,
      edits: WordEditView[],          // all edits with original → new word
      votes: VoteResult[],            // who voted for whom
      winner: 'editor' | 'writers',
      scores: ScoreResult[],
    }
    ```
  **Verification:** Unit test for each of the 4 scenarios: correct scores assigned. Tie handling defaults to Editor win. Proximity bonus applied when near-match exists. Correct vote bonus applied to savvy Writers.

#### 6.2.6.12 `getStateForPlayer(userId)`

- [ ] If Writer:
  ```ts
  {
    storyPrompt: string;
    myRole: 'writer';
    turnOrder: PlayerTurnInfo[];
    currentTurnIndex: number;
    totalTurns: number;
    phase: UEPhase;
    story: StorySentenceView[];      // current text only (no edit history)
    isMyTurn: boolean;
    timeRemaining: number;
    // During ACCUSATION:
    myVote: string | null;
    votedPlayers: string[];          // userIds who have voted (not who for)
  }
  ```
- [ ] If Editor:
  ```ts
  {
    // All Writer fields PLUS:
    myRole: 'editor';
    keyword: string;
    myEdits: WordEdit[];
    editableStory?: EditableStory;   // only during EDIT phase
  }
  ```
- [ ] **CRITICAL MASKING:** Writer NEVER receives `keyword`, `editorUserId`, `myEdits`, or `editableStory`
- [ ] During WRITE/EDIT phases: only active player's turn info is relevant
- [ ] During ACCUSATION: `votedPlayers` shows who has voted but NOT their targets
  **Verification:** Unit test: getState for Writer → no keyword, no editorUserId. getState for Editor → keyword present. During ACCUSATION → votes masked.

#### 6.2.6.13 `getStateForSpectator()`

- [ ] Omniscient view:
  - Sees who the Editor is
  - Sees the keyword
  - Sees all edits as they happen (highlighted in story)
  - Sees all votes during ACCUSATION (who voted for whom)
  **Verification:** Spectator state includes `editorUserId`, `keyword`, `edits`, and full `votes` map.

#### 6.2.6.14 Join-in-Progress Handling

- [ ] Policy: `spectate_only`
- [ ] Roles and turn order are fixed at game start; adding mid-game would disrupt the social deduction
- [ ] JIP players receive spectator state
  **Verification:** JIP during turn 5 → spectator only, receives omniscient state.

#### 6.2.6.15 Reconnection Handling (`handlePlayerReconnect(userId)`)

- [ ] Send full state via `getStateForPlayer(userId)` (role-aware)
- [ ] If it was their turn and the WRITE/EDIT phase is still active, they can still submit
- [ ] If their turn was auto-completed (timeout → "..." sentence), they cannot redo it
- [ ] Editor receives keyword and edit history on reconnect
  **Verification:** Unit test: Editor disconnects and reconnects during WRITE phase → receives keyword, edit history, can still write. Writer reconnects → no keyword in state.

#### 6.2.6.16 Disconnect Handling (`handlePlayerDisconnect(userId)`)

- [ ] If disconnected player's turn arrives during grace period:
  - Wait `UE_DISCONNECT_TURN_WAIT_SECONDS` (15s, shorter than write timeout)
  - If still disconnected, auto-complete turn with `"..."` sentence
  - If they were the Editor, auto-skip edit phase
- [ ] If the Editor fully disconnects (beyond grace period):
  - Game continues — Editor won't make more edits
  - If keyword isn't in story at end, Writers win by default
  - Game is NOT terminated (Writers can still play out deduction)
- [ ] If total active players drop below `UE_MIN_PLAYERS` (4), force-end the game
  **Verification:** Unit test: disconnected player's turn → auto "..." after 15s. Editor disconnects fully → game continues, no more edits. Below min players → force end.

#### 6.2.6.17 `computeResults()` and Awards

- [ ] Compute final rankings by `playerScores` (descending)
- [ ] Compute awards:
  - [ ] **Master of Disguise** — Editor who wasn't caught AND got the keyword in; icon: `mask`
  - [ ] **Eagle Eye** — Writer who correctly voted for the Editor; icon: `eye`
  - [ ] **Shakespeare** — Player who wrote the longest sentence (by word count); icon: `quill`
  - [ ] **Smooth Operator** — Editor who made the most edits without getting caught; icon: `wand-2`
  - [ ] **Red Herring** — Writer who received the most accusation votes (falsely accused); icon: `fish`
- [ ] Return `MinigameResults` with rankings, awards, and `gameSpecificData` containing `edits`, `votes`, `winner`, `keyword`
  **Verification:** Unit test: construct scenarios for each award → all 5 awards assigned correctly.

#### 6.2.6.18 `buildGameLog()`

- [ ] Maintain an `actionLog: GameLogAction[]` array on the game instance
- [ ] Log `turn_start` action on each turn (turnNumber, activeUserId)
- [ ] Log `sentence_written` action when a player writes their sentence (userId, sentence)
- [ ] Log `editor_swap` action when the Editor swaps a word (sentenceIndex, originalWord, newWord, position)
- [ ] Log `editor_skip` action when Editor chooses not to edit
- [ ] Log `story_snapshot` action at end of each turn cycle (full story text)
- [ ] Log `accusation_vote` action for each vote (voterId, suspectedUserId)
- [ ] Log `vote_result` action at vote resolution (votes tally, editorCaught boolean)
- [ ] Log `final_reveal` action with Editor identity, keyword, and all swaps made
- [ ] In `computeResults()`, build `GameLog` with `initialState` containing story prompt, keyword, Editor userId, turn order
- [ ] Return `GameLog` from `buildGameLog()`
  **Verification:** Unit test: 6-player game, 12 turns, verify log contains turn_start/sentence_written per turn, editor_swap/skip on Editor turns, and final reveal.

---

### 6.2.7 Register Game in Minigame Registry

- [ ] Add entry to `lib/rmhbox/minigame-registry.ts`:
  ```ts
  {
    id: "undercover-editor",
    displayName: "Undercover Editor",
    description: "Write a collaborative story — but one player is secretly editing words to insert a hidden keyword. Can you spot the Editor?",
    category: "social-deduction",
    icon: "pencil",
    minPlayers: 4,
    maxPlayers: 10,
    estimatedDurationSeconds: 300,
    supportsTeams: false,
    instructionDurationSeconds: 20,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: "spectate_only",
    tags: ["social-deduction", "writing", "creative", "deception"],
  }
  ```
  **Verification:** Registry lookup for `"undercover-editor"` returns correct metadata and handler instantiates.

---

### 6.2.8 Build Client Components

#### 6.2.8.1 `components/rmhbox/minigames/undercover-editor/UndercoverEditorGame.tsx`

- [ ] Phase router component — renders sub-component based on `phase`
- [ ] Subscribe to all `UE_*` and `TIMER_TICK` WebSocket events
- [ ] Maintain local state: role, keyword (Editor only), story, turn info, votes, timer
- [ ] Handle `UE_GAME_START` → store turn order, total turns
- [ ] Handle `UE_ROLE_ASSIGNED` → store role; if Editor, store keyword
- [ ] Handle `UE_TURN_START` → update active player, reset turn state
- [ ] Handle `UE_SENTENCE_ADDED` → update story display
- [ ] Handle `UE_EDIT_PROMPT` → (Editor only) transition to edit interface
- [ ] Handle `UE_STORY_UPDATED` → refresh story display (seamless, no indication of edit)
- [ ] Handle `UE_REVIEW_START` → transition to review display
- [ ] Handle `UE_ACCUSATION_START` → transition to voting interface
- [ ] Handle `UE_VOTE_CAST` → update voted indicator
- [ ] Handle `UE_REVEAL` → transition to reveal screen
- [ ] Conditional rendering by phase:
  - `WRITE` (my turn) → `<WriteInput />`
  - `WRITE` (not my turn) → `<StoryDisplay />` with waiting indicator
  - `EDIT` (I am Editor) → `<StoryEditor />`
  - `EDIT` (I am Writer) → `<StoryDisplay />` with "reviewing..." message
  - `REVIEW` → `<StoryDisplay />` with emphasis on reading
  - `ACCUSATION` → `<AccusationPanel />`
  - `REVEAL` → `<RevealScreen />`
  **Verification:** Component renders without errors for each phase and role combination.

#### 6.2.8.2 `components/rmhbox/minigames/undercover-editor/StoryDisplay.tsx`

- [ ] Read-only story viewer showing all sentences with author attribution
- [ ] Each sentence is a distinct block with author name
- [ ] Scrollable; newest sentence highlighted briefly on addition
- [ ] During REVEAL: edited words highlighted in a distinct color with tooltip showing original → replacement
- [ ] Responsive text sizing
  **Verification:** Renders mock story. New sentence animates in. During reveal, edits highlighted correctly.

#### 6.2.8.3 `components/rmhbox/minigames/undercover-editor/WriteInput.tsx`

- [ ] Text input area for composing a sentence (10–200 chars)
- [ ] Character counter showing remaining characters
- [ ] Submit button (disabled until min length met)
- [ ] Timer display
- [ ] Story context above the input (previous sentences for reference)
- [ ] Placeholder text with writing tips
  **Verification:** Input validates length. Submit emits `WRITE_SENTENCE` action. Disabled when below min length.

#### 6.2.8.4 `components/rmhbox/minigames/undercover-editor/StoryEditor.tsx`

- [ ] Editor's secret word-editing interface — shown ONLY to the Editor during EDIT phase
- [ ] Display story with each word as a tappable token
- [ ] Editable words are visually distinct (subtle underline or selectable styling)
- [ ] Non-editable words (already edited / own sentence) are grayed out
- [ ] Tapping an editable word opens an inline replacement input
- [ ] Replacement input: single word, max 30 chars, no spaces
- [ ] Confirm/cancel buttons for the replacement
- [ ] Skip button to skip editing this turn
- [ ] Timer display
- [ ] Show the keyword prominently as a reminder
  **Verification:** Only editable words are tappable. Replacement validates single word. Skip emits `SKIP_EDIT`. Edit emits `EDIT_WORD`.

#### 6.2.8.5 `components/rmhbox/minigames/undercover-editor/AccusationPanel.tsx`

- [ ] Grid/list of all players (except self) with avatars
- [ ] Tap to vote; selected player has highlighted border
- [ ] Can change vote (tap another player) until timer expires
- [ ] "Voted" indicator shown next to players who have voted (not who for)
- [ ] Timer display
- [ ] Submit vote emits `CAST_ACCUSATION` action on each selection
  **Verification:** Tap player → vote event emitted. Self not in list. Vote indicator updates on `UE_VOTE_CAST` events.

#### 6.2.8.6 `components/rmhbox/minigames/undercover-editor/RevealScreen.tsx`

- [ ] Dramatic Editor reveal: "The Editor was... [name]!"
- [ ] Keyword reveal: "The keyword was... [word]"
- [ ] Story display with all edited words highlighted:
  - Show original word struck through and new word in accent color
- [ ] Vote tally visualization: who voted for whom
- [ ] Winner announcement: "Writers Win!" or "Editor Wins!"
- [ ] Score breakdown per player
- [ ] Framer Motion entrance animations for each reveal step (staggered)
  **Verification:** All reveal info displays correctly. Edits highlighted. Votes shown. Scores match server data.

#### 6.2.8.7 `components/rmhbox/minigames/undercover-editor/RoleBadge.tsx`

- [ ] Small persistent indicator in screen corner showing the player's role
- [ ] Writer: "🔎 Writer" in muted styling
- [ ] Editor: "✏️ Editor | Keyword: [word]" in accent styling (but subtle — don't reveal to screen-lookers too easily)
- [ ] Position: top-right corner, small font
  **Verification:** Correct role displayed. Editor badge includes keyword.

#### 6.2.8.8 `components/rmhbox/minigames/undercover-editor/TurnIndicator.tsx`

- [ ] Shows whose turn it is with their avatar/name
- [ ] "Your turn!" highlight when it's the player's own turn
- [ ] Turn progress: "Turn 4/12"
- [ ] Animated transition between turns
  **Verification:** Correct player shown per turn. Highlight on own turn. Progress counter accurate.

---

### 6.2.9 Integration Testing

- [ ] End-to-end test: 5 players → start Undercover Editor → play through 10 turns (2 rotations)
  - [ ] Verify 1 Editor, 4 Writers assigned
  - [ ] Verify Editor receives keyword; Writers do NOT
  - [ ] Verify each player writes on their turn and story updates broadcast to all
  - [ ] Verify Editor's edit phase is invisible to Writers (no EDIT-related events sent to Writers)
  - [ ] Verify story updates after edits show updated text without indicating which word changed
  - [ ] Verify review, accusation, and reveal phases execute in sequence
  **Verification:** All assertions pass. Role assignment correct. Information masking verified.

- [ ] Information masking test:
  - [ ] Inspect WebSocket traffic for Writer players: NO `keyword`, `editorUserId`, `editableStory`, or `edits` before REVEAL
  - [ ] Inspect `getStateForPlayer()` for Writer during all phases: no secret data
  - [ ] Inspect `getStateForPlayer()` for Editor: keyword and edits present
  - [ ] Inspect `getStateForSpectator()`: omniscient (keyword, editor, edits, votes all visible)
  **Verification:** Zero secret data leakage to Writers before REVEAL.

- [ ] Win condition test: Simulate all 4 scenarios:
  - [ ] Scenario 1: Correct accusation + keyword NOT in story → Writers major win (400 each)
  - [ ] Scenario 2: Correct accusation + keyword IS in story → Writers minor win (250 each)
  - [ ] Scenario 3: Wrong accusation + keyword IS in story → Editor major win (600)
  - [ ] Scenario 4: Wrong accusation + keyword NOT in story → Editor minor win (300)
  - [ ] Vote tie scenario → Editor wins by default
  **Verification:** Scores match spec for each scenario.

- [ ] Keyword proximity test: Story has `"shade"` when keyword is `"shadow"` → fuse.js detects proximity → Editor gets +50 bonus
  **Verification:** Proximity bonus applied. Exact match vs fuzzy match differentiated correctly.

- [ ] Disconnect test: Player disconnects on their turn → auto-`"..."` after 15s. Editor disconnects → game continues, no more edits.
  **Verification:** Auto-completion works. Game completes without Editor.

- [ ] Reconnection test: Editor disconnects and reconnects during WRITE → keyword and edit history restored
  **Verification:** Full state restored on reconnect.

- [ ] Vote change test: Player votes for A, then changes to B → only final vote counted
  **Verification:** Final vote is B in tally.

---

## 6.3 Minimalist Masterpiece

**Game ID:** `minimalist-masterpiece` | **Category:** `creative` | **Icon:** `brush`
**Players:** 3–12 | **Duration:** ~148s

---

### 6.3.1 Install NPM Packages

- [ ] Install `perfect-freehand` (smooth stroke rendering, ~5KB gzipped, MIT license)
  ```bash
  pnpm add perfect-freehand
  ```
  **Verification:** Run `pnpm ls perfect-freehand` and confirm version is listed.

- [ ] Verify TypeScript types work: create a scratch `.ts` file, import `getStroke` from `perfect-freehand`, confirm no type errors
  **Verification:** `tsc --noEmit` passes with the import.

---

### 6.3.2 Add Constants to `lib/rmhbox/constants.ts`

- [ ] Add `MM_PROMPT_REVEAL_SECONDS = 3` — prompt display duration
- [ ] Add `MM_DRAWING_DURATION_SECONDS = 60` — drawing phase duration
- [ ] Add `MM_GALLERY_DURATION_SECONDS = 15` — gallery walk duration
- [ ] Add `MM_AUCTION_DURATION_SECONDS = 60` — auction bidding duration
- [ ] Add `MM_RESULTS_DURATION_SECONDS = 10` — results display duration
- [ ] Add `MM_MAX_STROKES = 5` — maximum strokes per drawing
- [ ] Add `MM_CANVAS_SIZE = 400` — logical canvas size (px)
- [ ] Add `MM_STROKE_WIDTH = 4` — fixed stroke width (px)
- [ ] Add `MM_MIN_POINTS_PER_STROKE = 5` — minimum points for a valid stroke (anti-bot)
- [ ] Add `MM_MAX_POINTS_PER_STROKE = 500` — maximum points per stroke (DoS prevention)
- [ ] Add `MM_MIN_STROKE_DURATION_MS = 100` — minimum time between first and last point of a stroke (anti-bot)
- [ ] Add `MM_COLOR_PALETTE`:
  ```ts
  ['#1a1a2e', '#e0e0f0', '#f87171', '#4ade80', '#60a5fa', '#fbbf24', '#fb923c', '#c084fc']
  ```
- [ ] Add `MM_STARTING_CURRENCY = 1000` — fake auction currency per player
- [ ] Add `MM_BID_INCREMENT = 50` — minimum bid increment
- [ ] Add `MM_RANK_1_POINTS = 500` — points for 1st place market value
- [ ] Add `MM_RANK_2_POINTS = 350` — points for 2nd place
- [ ] Add `MM_RANK_3_POINTS = 250` — points for 3rd place
- [ ] Add `MM_PARTICIPATION_POINTS = 100` — points for all other ranks
- [ ] Add `MM_INVESTMENT_BONUS = 50` — bonus for investing in the top-valued drawing
- [ ] **Verification:** Import all `MM_*` constants; confirm correct types and values. Confirm `MM_COLOR_PALETTE` has 8 entries.

---

### 6.3.3 Create Static Data Files

- [ ] Create directory `public/data/rmhbox/minimalist-masterpiece/`
  **Verification:** Directory exists on disk.

- [ ] Create `public/data/rmhbox/minimalist-masterpiece/prompts.json` — curated drawing prompts
  - Each entry follows:
    ```ts
    {
      id: string;
      text: string;                   // e.g., "A house on a hill"
      category: string;               // e.g., "Landscape", "Animal", "Object"
      difficulty: "easy" | "medium" | "hard";
    }
    ```
  - [ ] Include at least 80 prompts
  - [ ] At least 8 distinct categories
  - [ ] Balanced difficulty: ≥25 easy, ≥30 medium, ≥20 hard
  - [ ] Prompts should be drawable with only 5 strokes (simple concepts)
  - [ ] No duplicate prompts
  **Verification:** Parse JSON; validate all entries; confirm ≥80 entries, ≥8 categories, balanced difficulty.

---

### 6.3.4 Define Zod Validation Schemas

- [ ] Create `lib/rmhbox/minimalist-masterpiece/schemas.ts`

- [ ] Define `PointSchema`:
  ```ts
  const PointSchema = z.object({
    x: z.number().min(0).max(MM_CANVAS_SIZE),
    y: z.number().min(0).max(MM_CANVAS_SIZE),
    pressure: z.number().min(0).max(1),
  });
  ```

- [ ] Define `StrokeSchema`:
  ```ts
  const StrokeSchema = z.object({
    id: z.string().min(1).max(36),
    points: z.array(PointSchema).min(MM_MIN_POINTS_PER_STROKE).max(MM_MAX_POINTS_PER_STROKE),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    width: z.number().positive(),
    timestamp: z.number(),
  });
  ```

- [ ] Define `SubmitDrawingSchema`:
  ```ts
  const SubmitDrawingSchema = z.object({
    strokes: z.array(StrokeSchema).max(MM_MAX_STROKES),
  });
  ```
  **Verification:** Valid: 5 strokes with 10+ points each, valid hex colors. Invalid: 6 strokes (exceeds max), stroke with 3 points (below min), point x=500 (out of range), color "#gggggg" (invalid hex).

- [ ] Define `PlaceBidSchema`:
  ```ts
  const PlaceBidSchema = z.object({
    drawingId: z.string().min(1).max(36),
    amount: z.number().int().multipleOf(MM_BID_INCREMENT),
  });
  ```
  **Verification:** Valid: `{ drawingId: "abc", amount: 100 }`. Invalid: `{ amount: 75 }` (not multiple of 50), `{ amount: 0 }`.

---

### 6.3.5 Create Data Loader

- [ ] Create `lib/rmhbox/minimalist-masterpiece/data-loader.ts`
  - [ ] Export `loadPrompts(): DrawingPrompt[]` — reads and parses `prompts.json`, caches as singleton
  - [ ] Export `selectPromptForGame(pool: DrawingPrompt[], usedIds: Set<string>): DrawingPrompt` — selects a random prompt not in `usedIds`
  **Verification:** Unit test: loader caches. Selection excludes used IDs.

---

### 6.3.6 Implement Server Handler

- [ ] Create `server/rmhbox/minigames/minimalist-masterpiece.ts`

#### 6.3.6.1 Type Definitions

- [ ] Define `MMPhase` type:
  ```ts
  type MMPhase = 'PROMPT_REVEAL' | 'DRAWING' | 'GALLERY' | 'AUCTION' | 'RESULTS';
  ```
  **Verification:** Type has exactly 5 values matching spec.

- [ ] Define `PlayerDrawing` type:
  ```ts
  type PlayerDrawing = {
    drawingId: string;
    strokes: Stroke[];
    submittedAt: number | null;
    strokeCount: number;
  };
  ```

- [ ] Define `DrawingBids` type:
  ```ts
  type DrawingBids = {
    drawingId: string;
    totalValue: number;
    bidders: Map<string, number>;   // userId → amount bid
  };
  ```

- [ ] Define `MMRanking` type:
  ```ts
  type MMRanking = {
    drawingId: string;
    artistUserId: string;
    artistUserName: string;
    marketValue: number;
    rank: number;
    points: number;
    strokes: Stroke[];
  };
  ```

- [ ] Define `MinimalistMasterpieceState` type:
  ```ts
  type MinimalistMasterpieceState = {
    prompt: DrawingPrompt;
    phase: MMPhase;
    drawings: Map<string, PlayerDrawing>;
    drawingIdToUserId: Map<string, string>;
    userIdToDrawingId: Map<string, string>;
    playerCurrencies: Map<string, number>;
    bids: Map<string, DrawingBids>;
    marketValues: Map<string, number>;
    rankings: MMRanking[] | null;
    phaseStartedAt: number;
    phaseEndsAt: number;
  };
  ```
  **Verification:** All types compile without errors. Cross-reference against spec §3.4.

#### 6.3.6.2 Class: `MinimalistMasterpieceGame extends BaseMinigame`

- [ ] Constructor: call `super(context)`; load prompts via data loader
  **Verification:** Instantiate class; confirm no errors.

#### 6.3.6.3 State Initialization (`start()`)

- [ ] Select prompt via `selectPromptForGame()`
- [ ] Generate anonymous `drawingId` for each player (e.g., nanoid)
- [ ] Build `drawingIdToUserId` and `userIdToDrawingId` maps (randomized assignment — NOT in player order)
- [ ] Initialize empty `drawings` map with one `PlayerDrawing` per player (empty strokes)
- [ ] Initialize `playerCurrencies` = `MM_STARTING_CURRENCY` for each player
- [ ] Initialize empty `bids` map with one `DrawingBids` per drawing (totalValue=0, empty bidders)
- [ ] Set `phase = 'PROMPT_REVEAL'`
- [ ] Emit `MM_PROMPT` to all: `{ prompt, drawingDurationSeconds: MM_DRAWING_DURATION_SECONDS, maxStrokes: MM_MAX_STROKES, colorPalette: MM_COLOR_PALETTE }`
- [ ] Schedule `startDrawingPhase()` after `MM_PROMPT_REVEAL_SECONDS`
  **Verification:** Unit test with 4 players: 4 drawing IDs generated, maps correct, all currencies = 1000. Prompt event emitted.

#### 6.3.6.4 Phase Management

- [ ] `startDrawingPhase()`:
  - Set `phase = 'DRAWING'`
  - Start `TIMER_TICK` interval (1s)
  - Schedule `endDrawingPhase()` after `MM_DRAWING_DURATION_SECONDS`
  **Verification:** Phase transitions. Timer ticks emit.

- [ ] `endDrawingPhase()`:
  - Stop timer
  - For any player who hasn't submitted, submit their current strokes as-is (even if 0 strokes)
  - Call `startGalleryPhase()`
  **Verification:** Unsubmitted drawings finalized. Gallery starts.

- [ ] `startGalleryPhase()`:
  - Set `phase = 'GALLERY'`
  - Build gallery view: all drawings with anonymous labels ("Artist 1", "Artist 2", ...) and stroke data
  - Emit `MM_GALLERY` to all: `{ drawings: GalleryDrawing[], galleryDurationSeconds: MM_GALLERY_DURATION_SECONDS }`
  - Start `TIMER_TICK` interval
  - Schedule `startAuctionPhase()` after `MM_GALLERY_DURATION_SECONDS`
  **Verification:** Gallery includes all drawings with anonymous labels. Labels are randomized (not correlated with player order).

- [ ] `startAuctionPhase()`:
  - Set `phase = 'AUCTION'`
  - Build auction drawing list per player (mark `isMine` based on `userIdToDrawingId`)
  - Emit `MM_AUCTION_START` to each player individually:
    ```ts
    { drawings: AuctionDrawing[], startingCurrency: MM_STARTING_CURRENCY,
      bidIncrement: MM_BID_INCREMENT, auctionDurationSeconds: MM_AUCTION_DURATION_SECONDS }
    ```
    - Each player's `AuctionDrawing[]` has `isMine = true` for their own drawing
  - Start `TIMER_TICK` interval
  - Schedule `endAuctionPhase()` after `MM_AUCTION_DURATION_SECONDS`
  **Verification:** Each player sees `isMine` on their own drawing. Currency starts at 1000.

- [ ] `endAuctionPhase()`:
  - Stop timer
  - Call `computeResults()`
  **Verification:** Results computed after auction ends.

#### 6.3.6.5 Input Handling — `SUBMIT_DRAWING`

- [ ] Validate phase is `'DRAWING'`; reject if not
- [ ] Parse input through `SubmitDrawingSchema`; reject on validation failure
- [ ] Check player hasn't already submitted; reject if duplicate
- [ ] **Anti-bot validation for each stroke:**
  - [ ] Verify `points.length >= MM_MIN_POINTS_PER_STROKE` (already in schema, but double-check)
  - [ ] Verify time between first and last point timestamps ≥ `MM_MIN_STROKE_DURATION_MS`
  - [ ] Verify `points.length <= MM_MAX_POINTS_PER_STROKE`
  - [ ] Verify `color` is in `MM_COLOR_PALETTE`
- [ ] Store strokes in `drawings` map
- [ ] Emit `MM_DRAWING_SUBMITTED` to all: `{ userId }` (NOT the drawing data — other players can't see during drawing phase)
- [ ] If ALL players have submitted, immediately call `endDrawingPhase()`
  **Verification:** Unit test: valid 5-stroke drawing → accepted. 6-stroke drawing → schema rejects. Stroke with 3 points → schema rejects. Color not in palette → rejected. Anti-bot: stroke with 50ms duration → rejected.

#### 6.3.6.6 Input Handling — `PLACE_BID`

- [ ] Validate phase is `'AUCTION'`; reject if not
- [ ] Parse input through `PlaceBidSchema`; reject on validation failure
- [ ] Validate `drawingId` exists in `drawings` map
- [ ] Check player is NOT bidding on their own drawing (via `drawingIdToUserId`); reject if self-bid
- [ ] Calculate effective amount:
  - If `amount > 0` (adding bid): verify player has sufficient currency (`playerCurrencies[userId] >= amount`); deduct from currency
  - If `amount < 0` (retracting bid): verify player has bid at least `|amount|` on this drawing; refund to currency
- [ ] Update `bids` map: add/subtract from bidder's amount for this drawing; recalculate `totalValue`
- [ ] Emit `MM_BID_UPDATE` to the bidding player ONLY:
  ```ts
  { drawingId, totalValue, myBid: updatedBidAmount, myRemainingCurrency }
  ```
- [ ] Emit `MM_BID_BROADCAST` to ALL: `{ drawingId, totalValue }` (public total value only — NOT who bid)
  **Verification:** Unit test: bid 200 on drawing → currency = 800, totalValue increases. Retract 100 → currency = 900. Self-bid rejected. Insufficient currency rejected. Non-multiple-of-50 rejected.

#### 6.3.6.7 Scoring Computation (`computeResults()`)

- [ ] Calculate `marketValues`: for each drawing, sum all bids (already tracked in `bids` map)
- [ ] Rank drawings by `marketValue` descending
- [ ] Assign points:
  - Rank 1: `MM_RANK_1_POINTS` (500)
  - Rank 2: `MM_RANK_2_POINTS` (350)
  - Rank 3: `MM_RANK_3_POINTS` (250)
  - Rank 4+: `MM_PARTICIPATION_POINTS` (100)
- [ ] Handle ties: tied drawings share the higher rank (both get the higher point value)
- [ ] Compute investment bonuses:
  - Find the drawing with the highest market value
  - For each player who bid on it: `bonusPoints = floor(MM_INVESTMENT_BONUS × (playerBid / totalBid))`
  - Add bonus points to those players' scores
- [ ] Build `MMRanking[]` array
- [ ] De-anonymize: reveal artist identity (drawingId → userId mapping)
- [ ] Emit `MM_RESULTS` to all:
  ```ts
  { rankings: MMRanking[], investmentBonuses: InvestmentBonus[] }
  ```
  **Verification:** Unit test: 4 drawings with market values 500, 300, 300, 100 → ranks 1, 2, 2, 4. Tied drawings both get rank 2 points (350). Investment bonus: player bid 200 of 500 total on top drawing → bonus = floor(50 × 200/500) = 20.

#### 6.3.6.8 `getStateForPlayer(userId)`

- [ ] During PROMPT_REVEAL:
  ```ts
  { prompt, phase, maxStrokes, colorPalette, timeRemaining }
  ```
- [ ] During DRAWING:
  ```ts
  { prompt, phase, myStrokes: Stroke[], myStrokeCount, hasSubmitted, timeRemaining,
    submittedPlayers: string[] }  // who has submitted (not their drawings)
  ```
  - Other players' drawings are NOT included
- [ ] During GALLERY:
  ```ts
  { prompt, phase, drawings: GalleryDrawing[], timeRemaining }
  ```
  - Anonymous labels only — no player identity mapping
- [ ] During AUCTION:
  ```ts
  { prompt, phase, drawings: AuctionDrawing[], myCurrency, timeRemaining }
  ```
  - `isMine` flag on own drawing; `myBidAmount` per drawing; public `currentBidTotal`
  - Other players' individual bids NOT visible (only totals)
- [ ] During RESULTS:
  ```ts
  { prompt, phase, rankings: MMRanking[], investmentBonuses: InvestmentBonus[] }
  ```
  - De-anonymized: artist names revealed
  **Verification:** Unit test: during DRAWING → no other drawings. During GALLERY → anonymous. During AUCTION → own drawing flagged, only totals visible. During RESULTS → fully de-anonymized.

#### 6.3.6.9 `getStateForSpectator()`

- [ ] During DRAWING: sees all players' canvases live (all strokes as they're drawn)
- [ ] During GALLERY: same as player (anonymous)
- [ ] During AUCTION: sees all individual bids (who bid what on which drawing), knows which drawing belongs to which player
- [ ] During RESULTS: same as player
  **Verification:** Spectator sees all canvases during drawing and all individual bids during auction.

#### 6.3.6.10 Join-in-Progress Handling

- [ ] Policy: `spectate_only`
- [ ] Players who join after DRAWING cannot draw; they spectate from GALLERY onward
- [ ] They cannot bid during AUCTION (no currency allocation)
- [ ] Send spectator state on join
  **Verification:** JIP during AUCTION → spectator only, no bidding capability.

#### 6.3.6.11 Reconnection Handling (`handlePlayerReconnect(userId)`)

- [ ] During DRAWING: send current strokes (server has any saved strokes); player can continue drawing
- [ ] During GALLERY/AUCTION: send gallery data and current bid state (their currency, their bids)
- [ ] Stroke data is preserved server-side even if client disconnects mid-draw
  **Verification:** Reconnect during DRAWING → strokes restored. Reconnect during AUCTION → currency and bids restored.

#### 6.3.6.12 Disconnect Handling (`handlePlayerDisconnect(userId)`)

- [ ] Drawing phase: whatever strokes exist are preserved; at phase end, auto-submitted as-is
- [ ] Auction phase: existing bids preserved; currency frozen (can't bid while disconnected)
- [ ] No special cleanup needed
  **Verification:** Disconnect during DRAWING → strokes auto-submitted at phase end. Bids preserved.

#### 6.3.6.13 `computeResults()` and Awards

- [ ] Compute final rankings by market value (descending)
- [ ] Compute awards:
  - [ ] **Minimalist Master** — highest market value (winner); icon: `crown`
  - [ ] **Patron of the Arts** — player who spent the most total coins across all drawings; icon: `banknote`
  - [ ] **One Stroke Wonder** — drawing with highest market value that used ≤ 3 strokes; icon: `star`
  - [ ] **Undervalued Gem** — drawing that received bids from the most different players; icon: `gem`
  - [ ] **Shrewd Investor** — player who earned the highest investment bonus; icon: `trending-up`
- [ ] Return `MinigameResults` with rankings, awards, and `gameSpecificData` containing drawings + bids
  **Verification:** Unit test: scenarios triggering each award → all 5 awards assigned correctly.

#### 6.3.6.14 `buildGameLog()`

- [ ] Maintain an `actionLog: GameLogAction[]` array on the game instance
- [ ] Log `drawing_submitted` action per player drawing (userId, strokes serialized as polyline arrays, strokeCount)
- [ ] Log `bid_placed` action during auction (bidderId, targetDrawingUserId, bidAmount)
- [ ] Log `auction_result` action per drawing (drawingUserId, totalMarketValue, highestBidder, bidCount)
- [ ] In `computeResults()`, build `GameLog` with `initialState` containing prompt text, canvasSize, maxStrokes, startingBudget
- [ ] Include all drawing stroke data in game log for gallery replay
- [ ] Return `GameLog` from `buildGameLog()`
  **Verification:** Unit test: 5-player game, verify all 5 drawings captured in log with stroke data, bids recorded, and auction results present.

---

### 6.3.7 Register Game in Minigame Registry

- [ ] Add entry to `lib/rmhbox/minigame-registry.ts`:
  ```ts
  {
    id: "minimalist-masterpiece",
    displayName: "Minimalist Masterpiece",
    description: "Draw with only 5 strokes, then bid on the art you think is best! The highest market value wins.",
    category: "creative",
    icon: "brush",
    minPlayers: 3,
    maxPlayers: 12,
    estimatedDurationSeconds: 148,
    supportsTeams: false,
    instructionDurationSeconds: 15,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: "spectate_only",
    tags: ["creative", "drawing", "auction", "competitive"],
  }
  ```
  **Verification:** Registry lookup for `"minimalist-masterpiece"` returns correct metadata.

---

### 6.3.8 Build Client Components

#### 6.3.8.1 `components/rmhbox/minigames/minimalist-masterpiece/MinimalistMasterpieceGame.tsx`

- [ ] Phase router — renders based on `phase`
- [ ] Subscribe to all `MM_*` and `TIMER_TICK` events
- [ ] Maintain local state: prompt, phase, strokes, gallery, bids, currency, rankings
- [ ] Handle `MM_PROMPT` → store prompt, transition to prompt reveal
- [ ] Handle `MM_DRAWING_SUBMITTED` → update submitted players list
- [ ] Handle `MM_GALLERY` → store gallery drawings, transition to gallery
- [ ] Handle `MM_AUCTION_START` → store auction data, initialize bid tracking
- [ ] Handle `MM_BID_UPDATE` → update own bid state and currency
- [ ] Handle `MM_BID_BROADCAST` → update public bid totals
- [ ] Handle `MM_RESULTS` → store rankings, trigger reveal animation
- [ ] Conditional rendering:
  - `PROMPT_REVEAL` → prompt card with entrance animation
  - `DRAWING` → `<DrawingCanvas />` + `<ColorPalette />` + `<StrokeCounter />`
  - `GALLERY` → `<GalleryCarousel />`
  - `AUCTION` → `<GalleryCarousel />` + `<AuctionPanel />` per drawing
  - `RESULTS` → `<MarketResultsScreen />`
  **Verification:** Component renders without errors for each phase.

#### 6.3.8.2 `components/rmhbox/minigames/minimalist-masterpiece/DrawingCanvas.tsx`

- [ ] HTML5 `<canvas>` element sized at `MM_CANVAS_SIZE × MM_CANVAS_SIZE` (scaled for display)
- [ ] Pointer/touch event handling:
  - `pointerdown` → start new stroke (if < 5 strokes)
  - `pointermove` → sample points into current stroke array (throttle to ~60fps)
  - `pointerup` → finalize stroke, validate anti-bot requirements client-side
- [ ] Use `perfect-freehand` `getStroke()` to convert raw points into smooth rendered paths
- [ ] Render strokes as SVG `<path>` elements overlaid on canvas (or draw directly on canvas with path data)
- [ ] Support pressure sensitivity where available (fallback `pressure = 1`)
- [ ] Undo last stroke button (removes last stroke, allows re-drawing — total stays ≤ 5)
- [ ] Clear all button (removes all strokes, starts over)
- [ ] Submit button (sends all strokes to server via `SUBMIT_DRAWING` action)
- [ ] Auto-submit when 5th stroke completed (with brief confirmation)
- [ ] Touch-friendly: prevent scroll during drawing, handle multi-touch gracefully (ignore extra fingers)
  **Verification:** Draw 5 strokes → renders smoothly. Undo removes last. Submit sends correct data. Pressure affects stroke width via `perfect-freehand`.

#### 6.3.8.3 `components/rmhbox/minigames/minimalist-masterpiece/ColorPalette.tsx`

- [ ] Horizontal strip of 8 color swatches from `MM_COLOR_PALETTE`
- [ ] Active color has highlight ring
- [ ] Tap to select; updates current drawing color
- [ ] Default: first color (dark navy)
  **Verification:** 8 colors rendered. Selection updates drawing color.

#### 6.3.8.4 `components/rmhbox/minigames/minimalist-masterpiece/StrokeCounter.tsx`

- [ ] Display "3/5 strokes used"
- [ ] Visual indicator (dots or progress bar)
- [ ] Warning when at 4/5 or 5/5
  **Verification:** Counter updates on each stroke. Warning at 4/5.

#### 6.3.8.5 `components/rmhbox/minigames/minimalist-masterpiece/GalleryCarousel.tsx`

- [ ] Scrollable/swipeable gallery of all drawings
- [ ] Desktop: grid layout (2–3 columns)
- [ ] Mobile: horizontal swipeable carousel (one drawing at a time)
- [ ] Each drawing rendered via `<DrawingCard />`
- [ ] Anonymous labels: "Artist 1", "Artist 2", etc.
  **Verification:** Gallery renders all drawings. Mobile swipe works. Labels anonymous.

#### 6.3.8.6 `components/rmhbox/minigames/minimalist-masterpiece/DrawingCard.tsx`

- [ ] Single drawing display with stroke rendering via `perfect-freehand`
- [ ] Anonymous label
- [ ] During AUCTION: show current bid total, bid controls
- [ ] During RESULTS: show artist name, rank, market value, rank badge
- [ ] Highlight for "isMine" (subtle border or badge)
  **Verification:** Renders strokes correctly. Bid info displays during auction. De-anonymized during results.

#### 6.3.8.7 `components/rmhbox/minigames/minimalist-masterpiece/AuctionPanel.tsx`

- [ ] Bidding interface displayed below/beside each drawing card
- [ ] Show current bid total prominently
- [ ] `<BidControls />` with +/- bid buttons
- [ ] Remaining currency display
- [ ] Disabled for own drawing (can't self-bid)
  **Verification:** Bid buttons emit `PLACE_BID`. Disabled on own drawing. Currency updates on bid.

#### 6.3.8.8 `components/rmhbox/minigames/minimalist-masterpiece/BidControls.tsx`

- [ ] "+" button: increase bid by `MM_BID_INCREMENT` (50)
- [ ] "−" button: decrease bid by `MM_BID_INCREMENT` (50, minimum 0)
- [ ] Custom amount input (optional, multiples of 50)
- [ ] "+" disabled when currency = 0
- [ ] "−" disabled when own bid on this drawing = 0
- [ ] Touch-friendly sizing
  **Verification:** Increment/decrement work correctly. Currency constraints enforced.

#### 6.3.8.9 `components/rmhbox/minigames/minimalist-masterpiece/MarketResultsScreen.tsx`

- [ ] Rankings podium showing top 3 drawings with artist reveal
- [ ] Each drawing with market value, rank badge, score
- [ ] Investment bonus callouts for players who earned them
- [ ] De-anonymized: "Artist 1 was [Player Name]!"
- [ ] Framer Motion animations for rank reveals (staggered)
- [ ] canvas-confetti for winner
  **Verification:** Rankings display correctly. De-anonymization correct. Confetti on winner.

---

### 6.3.9 Integration Testing

- [ ] End-to-end test: 4 players → start Minimalist Masterpiece → draw → gallery → auction → results
  - [ ] Verify all players receive same prompt
  - [ ] Verify exactly 5 strokes max enforced (server rejects 6th)
  - [ ] Verify anti-bot validation: strokes need ≥5 points and ≥100ms duration
  - [ ] Verify drawings are anonymous during gallery/auction
  - [ ] Verify self-bidding is impossible
  - [ ] Verify bid increments enforced (multiples of 50)
  - [ ] Verify currency constraints (can't bid more than remaining)
  - [ ] Verify market value ranking and point assignment
  - [ ] Verify investment bonus calculation
  - [ ] Verify de-anonymization during results
  **Verification:** All assertions pass.

- [ ] Anonymity test:
  - [ ] Confirm `drawingIdToUserId` mapping is NOT in any player-facing event
  - [ ] Confirm gallery and auction views use anonymous labels only
  - [ ] Confirm de-anonymization happens ONLY in `MM_RESULTS`
  **Verification:** Network inspector confirms no identity leakage before results.

- [ ] Auction dynamics test:
  - [ ] Player A bids 200 on Drawing 1, 300 on Drawing 2 → currency = 500
  - [ ] Player A retracts 100 from Drawing 1 → currency = 600, Drawing 1 total decreases
  - [ ] Player B bids 500 on Drawing 1 → Drawing 1 total increases
  - [ ] At end: market values computed correctly
  **Verification:** Currency and bid totals match expected values.

- [ ] Empty drawing test: Player doesn't draw → empty drawing entered in auction → likely gets 0 bids → ranks last
  **Verification:** Empty drawing handled gracefully; no errors.

- [ ] Reconnection test: Player disconnects during DRAWING (has 3 strokes), reconnects → strokes restored, can continue
  **Verification:** Strokes preserved and restored.

---

## 6.4 Emoji Cinema

**Game ID:** `emoji-cinema` | **Category:** `word` | **Icon:** `clapperboard`
**Players:** 3–12 | **Duration:** ~180s (up to 6 rounds)

---

### 6.4.1 Install NPM Packages

- [ ] Evaluate emoji picker approach — decide between `emoji-mart` and a custom curated subset:
  - **Option A: `emoji-mart`** (~30KB gzipped) — full-featured emoji picker with search, categories, skin tones
  - **Option B: Custom curated 200-emoji JSON** — minimal bundle, tailored palette excluding letter/flag emojis
  - Recommended: **Option B** for tighter control over allowed emojis and smaller bundle
- [ ] If Option A chosen: install `emoji-mart`
  ```bash
  pnpm add emoji-mart @emoji-mart/data @emoji-mart/react
  ```
- [ ] If Option B chosen: no NPM package needed; create static emoji palette JSON
  **Verification:** Chosen approach works: emoji picker renders, search/filter functional.

---

### 6.4.2 Add Constants to `lib/rmhbox/constants.ts`

- [ ] Add `EC_MAX_ROUNDS = 6` — cap even if more players
- [ ] Add `EC_PRODUCER_ASSIGNMENT_SECONDS = 2` — Producer announcement duration
- [ ] Add `EC_ROUND_DURATION_SECONDS = 45` — emoji construction + guessing duration
- [ ] Add `EC_ROUND_RESULTS_SECONDS = 5` — round results display duration
- [ ] Add `EC_TRANSITION_SECONDS = 1` — brief transition between rounds
- [ ] Add `EC_MAX_EMOJIS = 12` — max emojis the Producer can place per round
- [ ] Add `EC_MAX_GUESSES_PER_PLAYER = 15` — max guesses per audience member per round
- [ ] Add `EC_MAX_GUESS_LENGTH = 200` — max characters per guess
- [ ] Add `EC_FUZZY_MATCH_THRESHOLD = 0.80` — fuse.js threshold for correct guess
- [ ] Add `EC_CLOSE_THRESHOLD = 0.60` — fuse.js threshold for "close" hint
- [ ] Add `EC_MIN_POPULARITY = 40` — minimum movie popularity score for selection
- [ ] Add `EC_PRODUCER_BASE_POINTS = 100` — guaranteed Producer points if someone guesses correctly
- [ ] Add `EC_PRODUCER_SPEED_BONUS = 10` — bonus per second remaining when first correct guess
- [ ] Add `EC_FIRST_GUESS_POINTS = 300` — points for first correct guesser
- [ ] Add `EC_SECOND_GUESS_POINTS = 150` — points for second correct guesser
- [ ] Add `EC_OTHER_GUESS_POINTS = 75` — points for 3rd+ correct guessers
- [ ] Add `EC_PRODUCER_DISCONNECT_WAIT_SECONDS = 10` — wait before skipping Producer's round
- [ ] Add `EC_EMOJI_PALETTE_SIZE = 200` — number of curated emojis in the palette
- [ ] **Verification:** Import all `EC_*` constants; confirm correct types. Confirm `EC_FUZZY_MATCH_THRESHOLD > EC_CLOSE_THRESHOLD`.

---

### 6.4.3 Create Static Data Files

- [ ] Create directory `public/data/rmhbox/emoji-cinema/`
  **Verification:** Directory exists on disk.

- [ ] Create `public/data/rmhbox/emoji-cinema/movies.json` — curated movie database
  - Each entry follows:
    ```ts
    {
      id: string;
      title: string;                     // exact title for matching
      titleNormalized: string;           // lowercase, no articles ("the", "a")
      alternativeTitles: string[];       // accepted alternate titles
      year: number;
      genre: string[];
      difficulty: "easy" | "medium" | "hard";
      popularity: number;                // 1–100 (higher = more well-known)
    }
    ```
  - [ ] Include at least 200 movies
  - [ ] All entries with `popularity >= EC_MIN_POPULARITY` (40)
  - [ ] Balanced difficulty: ≥60 easy, ≥80 medium, ≥50 hard
  - [ ] Cover diverse genres: action, comedy, drama, animation, sci-fi, horror, etc.
  - [ ] Include `alternativeTitles` for movies with common abbreviations or alternate names
  - [ ] `titleNormalized` strips leading "The ", "A ", "An " and lowercases
  - [ ] No duplicate movie `id` values
  **Verification:** Parse JSON; validate all entries; confirm ≥200 movies, all popularity ≥ 40, balanced difficulty, diverse genres.

- [ ] Create `public/data/rmhbox/emoji-cinema/emoji-palette.json` — curated emoji subset (if Option B chosen)
  - Structure:
    ```ts
    {
      categories: Array<{
        name: string;       // "People", "Animals", "Nature", "Food", "Objects", "Symbols", "Activities", "Travel"
        emojis: string[];   // array of emoji characters
      }>
    }
    ```
  - [ ] Total ≈ 200 emojis across 8 categories
  - [ ] **EXCLUDE:** letter emojis (🅰️ 🅱️ etc.), flag emojis, number emojis — prevents spelling out titles
  - [ ] Include diverse selection: emotions, objects, animals, activities, nature, food, symbols
  - [ ] Each emoji is a single grapheme (may be multi-codepoint)
  **Verification:** Parse JSON; confirm ≈200 total emojis, 8 categories. Confirm NO letter/number emojis present.

---

### 6.4.4 Define Zod Validation Schemas

- [ ] Create `lib/rmhbox/emoji-cinema/schemas.ts`

- [ ] Define `AddEmojiSchema`:
  ```ts
  const AddEmojiSchema = z.object({
    emoji: z.string().min(1).max(10),
    position: z.number().int().min(0).max(EC_MAX_EMOJIS - 1),
  });
  ```

- [ ] Define `RemoveEmojiSchema`:
  ```ts
  const RemoveEmojiSchema = z.object({
    position: z.number().int().min(0).max(EC_MAX_EMOJIS - 1),
  });
  ```

- [ ] Define `ReorderEmojiSchema`:
  ```ts
  const ReorderEmojiSchema = z.object({
    fromIndex: z.number().int().min(0).max(EC_MAX_EMOJIS - 1),
    toIndex: z.number().int().min(0).max(EC_MAX_EMOJIS - 1),
  });
  ```

- [ ] Define `SubmitGuessSchema`:
  ```ts
  const SubmitGuessSchema = z.object({
    guess: z.string().min(1).max(EC_MAX_GUESS_LENGTH).transform(s => s.trim()),
  });
  ```
  **Verification:** Valid: `{ emoji: "🦁", position: 0 }`, `{ guess: "The Lion King" }`. Invalid: `{ position: 12 }` (out of range), `{ guess: "" }` (empty).

---

### 6.4.5 Create Data Loader

- [ ] Create `lib/rmhbox/emoji-cinema/data-loader.ts`
  - [ ] Export `loadMovies(): MovieEntry[]` — reads and parses `movies.json`, caches as singleton
  - [ ] Export `loadEmojiPalette(): EmojiPalette` — reads and parses `emoji-palette.json`, caches as singleton
  - [ ] Export `selectMoviesForGame(pool: MovieEntry[], playerCount: number, usedIds: Set<string>): ECRoundData[]`
    - Select `min(playerCount, EC_MAX_ROUNDS)` movies
    - Mix of difficulties
    - Exclude movies with IDs in `usedIds`
    - Return array of `ECRoundData` with movie and assigned Producer per round
  - [ ] Export `validateEmoji(emoji: string, palette: EmojiPalette): boolean` — checks emoji is in the curated palette
  **Verification:** Unit test: loader caches. Selection respects player count cap and exclusions. Emoji validation rejects non-palette emojis.

---

### 6.4.6 Implement Server Handler

- [ ] Create `server/rmhbox/minigames/emoji-cinema.ts`

#### 6.4.6.1 Type Definitions

- [ ] Define `ECPhase` type:
  ```ts
  type ECPhase = 'PRODUCER_ASSIGNMENT' | 'EMOJI_CONSTRUCTION' | 'ROUND_RESULTS' | 'TRANSITION';
  ```
  **Verification:** Type has exactly 4 values matching spec.

- [ ] Define `ECRoundData` type:
  ```ts
  type ECRoundData = {
    movie: MovieEntry;
    producerUserId: string;
  };
  ```

- [ ] Define `ECPlayerGuesses` type:
  ```ts
  type ECPlayerGuesses = {
    userId: string;
    guesses: Array<{
      text: string;
      result: 'correct' | 'close' | 'wrong';
      timestamp: number;
    }>;
  };
  ```

- [ ] Define `CorrectGuesser` type:
  ```ts
  type CorrectGuesser = {
    userId: string;
    userName: string;
    guessText: string;
    timestamp: number;
    rank: number;
  };
  ```

- [ ] Define `EmojiCinemaState` type:
  ```ts
  type EmojiCinemaState = {
    rounds: ECRoundData[];
    currentRound: number;
    totalRounds: number;
    producerOrder: string[];
    phase: ECPhase;
    currentProducerUserId: string;
    currentMovie: MovieEntry;
    emojiSequence: string[];
    guesses: Map<string, ECPlayerGuesses>;
    correctGuessers: CorrectGuesser[];
    closeGuessCount: number;
    playerScores: Map<string, number>;
    phaseStartedAt: number;
    phaseEndsAt: number;
  };
  ```
  **Verification:** All types compile. Cross-reference against spec §4.4.

#### 6.4.6.2 Class: `EmojiCinemaGame extends BaseMinigame`

- [ ] Constructor: call `super(context)`; load movies and emoji palette via data loader
  **Verification:** Instantiate class; confirm no errors.

#### 6.4.6.3 State Initialization (`start()`)

- [ ] Compute `producerOrder`: shuffle player list
- [ ] Compute `totalRounds = Math.min(context.players.length, EC_MAX_ROUNDS)`
- [ ] Select movies via `selectMoviesForGame()` — one per round, assigned to the Producer in rotation
- [ ] Initialize `playerScores` with 0 for all players
- [ ] Set `currentRound = -1`
- [ ] Call `startNextRound()`
  **Verification:** Unit test with 4 players: 4 rounds. With 8 players: 6 rounds (capped). Movies selected, Producer rotation set.

#### 6.4.6.4 Round Lifecycle

- [ ] `startNextRound()`:
  - Increment `currentRound`
  - If `currentRound >= totalRounds`, call `endGame()`; return
  - Set `phase = 'PRODUCER_ASSIGNMENT'`
  - Get `currentProducerUserId` from `producerOrder[currentRound]`
  - Get `currentMovie` from `rounds[currentRound].movie`
  - Reset `emojiSequence = []`, `guesses = new Map()`, `correctGuessers = []`, `closeGuessCount = 0`
  - Emit `EC_PRODUCER_ASSIGNED` to all: `{ round: currentRound + 1, producerUserId, producerName }`
  - Emit `EC_MOVIE_ASSIGNED` to Producer ONLY: `{ movie: currentMovie }` — includes title, year
  - Schedule `startEmojiConstruction()` after `EC_PRODUCER_ASSIGNMENT_SECONDS`
  **Verification:** Unit test: round starts. Producer gets movie; others do NOT. Phase is PRODUCER_ASSIGNMENT.

- [ ] `startEmojiConstruction()`:
  - Set `phase = 'EMOJI_CONSTRUCTION'`
  - Start `TIMER_TICK` interval (1s)
  - Schedule `endRound()` after `EC_ROUND_DURATION_SECONDS`
  **Verification:** Phase transitions. Timer runs.

- [ ] `endRound(reason: 'timeout' | 'guessed')`:
  - Stop timer
  - Compute round scores:
    - If at least one correct guess:
      - Producer: `EC_PRODUCER_BASE_POINTS + EC_PRODUCER_SPEED_BONUS × secondsRemaining`
      - 1st correct guesser: `EC_FIRST_GUESS_POINTS` (300)
      - 2nd correct guesser: `EC_SECOND_GUESS_POINTS` (150)
      - 3rd+ correct guessers: `EC_OTHER_GUESS_POINTS` (75)
    - If no correct guesses (timeout): Producer gets 0
  - Update cumulative `playerScores`
  - Set `phase = 'ROUND_RESULTS'`
  - Emit `EC_ROUND_OVER` to all:
    ```ts
    { movieTitle: currentMovie.title, emojiSequence, correctGuessers,
      producerScore, roundScores: Array<{ userId, userName, score }> }
    ```
  - Schedule `startTransition()` after `EC_ROUND_RESULTS_SECONDS`
  **Verification:** Scores computed correctly. Movie title revealed to all. Rankings by guess timestamp.

- [ ] `startTransition()`:
  - Set `phase = 'TRANSITION'`
  - Check for pending JIP players; add them to audience pool
  - Schedule `startNextRound()` after `EC_TRANSITION_SECONDS`
  **Verification:** JIP handled. Next round starts.

#### 6.4.6.5 Input Handling — `ADD_EMOJI`

- [ ] Validate phase is `'EMOJI_CONSTRUCTION'`; reject if not
- [ ] Validate sender is the current Producer; reject if not
- [ ] Parse through `AddEmojiSchema`; reject on validation failure
- [ ] Validate emoji is in the curated palette via `validateEmoji()`; reject if not
- [ ] Validate `emojiSequence.length < EC_MAX_EMOJIS`; reject if at capacity
- [ ] Insert emoji at specified position (splice into array)
- [ ] Emit `EC_EMOJI_UPDATED` to ALL: `{ emojiSequence }` — live broadcast
  **Verification:** Unit test: Producer adds emoji → broadcast to all. 13th emoji rejected. Non-palette emoji rejected. Non-Producer rejected.

#### 6.4.6.6 Input Handling — `REMOVE_EMOJI`

- [ ] Validate phase is `'EMOJI_CONSTRUCTION'` and sender is Producer
- [ ] Parse through `RemoveEmojiSchema`
- [ ] Validate position is within current sequence bounds
- [ ] Remove emoji at position (splice from array)
- [ ] Emit `EC_EMOJI_UPDATED` to ALL: `{ emojiSequence }`
  **Verification:** Unit test: remove valid position → sequence shrinks. Out-of-bounds position rejected.

#### 6.4.6.7 Input Handling — `REORDER_EMOJI`

- [ ] Validate phase is `'EMOJI_CONSTRUCTION'` and sender is Producer
- [ ] Parse through `ReorderEmojiSchema`
- [ ] Validate both indices are within sequence bounds
- [ ] Perform array reorder (remove from `fromIndex`, insert at `toIndex`)
- [ ] Emit `EC_EMOJI_UPDATED` to ALL: `{ emojiSequence }`
  **Verification:** Reorder works correctly. Out-of-bounds indices rejected.

#### 6.4.6.8 Input Handling — `SUBMIT_GUESS`

- [ ] Validate phase is `'EMOJI_CONSTRUCTION'`; reject if not
- [ ] Validate sender is NOT the current Producer; reject if Producer tries to guess
- [ ] Parse through `SubmitGuessSchema`
- [ ] Check player hasn't exceeded `EC_MAX_GUESSES_PER_PLAYER`; reject if exceeded
- [ ] Initialize `fuse.js` instance for current movie:
  - Fuse list: `[currentMovie.title, currentMovie.titleNormalized, ...currentMovie.alternativeTitles]`
  - Options: `{ threshold: EC_CLOSE_THRESHOLD, includeScore: true }`
- [ ] Normalize guess: trim, lowercase, strip leading articles ("the ", "a ", "an ")
- [ ] Run fuse search against normalized guess
- [ ] Determine result:
  - If best match score ≤ `1 - EC_FUZZY_MATCH_THRESHOLD` (fuse.js uses inverse scoring — lower = better match): **CORRECT**
  - Else if best match score ≤ `1 - EC_CLOSE_THRESHOLD`: **CLOSE**
  - Else: **WRONG**
- [ ] Record guess in `guesses` map
- [ ] Emit `EC_GUESS_RESULT` to guesser ONLY: `{ guess, result }`
- [ ] If CORRECT:
  - Add to `correctGuessers` with timestamp and rank (1st, 2nd, etc.)
  - Emit `EC_CORRECT_GUESS` to ALL: `{ userId, userName, rank }`
  - If this is the first correct guess, start a brief window (3s) for others to also guess, then call `endRound('guessed')`
  - OR immediately end if all audience members have guessed correctly
- [ ] If CLOSE:
  - Increment `closeGuessCount`
  - Emit `EC_CLOSE_GUESS` to ALL: `{ userId, userName }` — NOT the guess text
- [ ] If WRONG:
  - No public broadcast (only `EC_GUESS_COUNT` update)
  - Emit `EC_GUESS_COUNT` to ALL: `{ userId, count }` — how many guesses this player has made
  **Verification:** Unit test: "The Lion King" guessed as "lion king" → CORRECT (normalized). "Simba" → WRONG. "The Loin King" (typo) → CLOSE (fuzzy match between thresholds). Second correct guesser gets rank 2. Guess count tracked. Producer cannot guess.

#### 6.4.6.9 `getStateForPlayer(userId)`

- [ ] If Producer:
  ```ts
  {
    phase, currentRound, totalRounds,
    movieTitle: currentMovie.title,
    movieYear: currentMovie.year,
    emojiSequence,
    timeRemaining,
    correctGuessers,
    closeGuessCount,
    guessCountsPerPlayer: Array<{ userId, userName, count }>,
    scores: Array<{ userId, userName, totalScore }>,
  }
  ```
  - Movie title IS visible to Producer
- [ ] If Audience:
  ```ts
  {
    phase, currentRound, totalRounds,
    producerUserId, producerName,
    emojiSequence,
    timeRemaining,
    myGuesses: Array<{ text, result }>,
    correctGuessers,
    closeGuessCount,
    guessCountsPerPlayer: Array<{ userId, userName, count }>,
    scores: Array<{ userId, userName, totalScore }>,
  }
  ```
  - Movie title is NOT visible
  - Other players' guess text NOT visible (only counts)
- [ ] During ROUND_RESULTS: movie title revealed to all
  **Verification:** Producer gets movie title. Audience does not (until ROUND_RESULTS). Other players' guess text never visible.

#### 6.4.6.10 `getStateForSpectator()`

- [ ] Omniscient view: movie title visible, all guess text from all players visible, emoji sequence visible
- [ ] Full experience: spectators see the movie title and watch guesses roll in — "omniscient director" experience
  **Verification:** Spectator state includes movie title and all guesses.

#### 6.4.6.11 Join-in-Progress Handling

- [ ] Policy: `join_next_subround`
- [ ] JIP players join as audience at the start of the next round (during TRANSITION)
- [ ] They do NOT get a Producer turn unless the rotation hasn't passed them yet
- [ ] If all original players have been Producer, JIP players are audience-only for remaining rounds
- [ ] Send full state on join
  **Verification:** JIP during round 3 → joins audience at round 4. Does not become Producer.

#### 6.4.6.12 Reconnection Handling (`handlePlayerReconnect(userId)`)

- [ ] Producer: receives movie title, current emoji sequence, guess status
- [ ] Audience: receives emoji sequence, own guesses, timer
- [ ] All state preserved server-side
  **Verification:** Producer reconnects → movie title and emoji sequence restored. Audience reconnects → guesses restored.

#### 6.4.6.13 Disconnect Handling (`handlePlayerDisconnect(userId)`)

- [ ] If Producer disconnects:
  - Wait `EC_PRODUCER_DISCONNECT_WAIT_SECONDS` (10s)
  - If not reconnected, skip the round (no points awarded to anyone for this round)
  - Move to next round
- [ ] If audience member disconnects:
  - No impact on round; they miss guessing opportunity
  **Verification:** Producer disconnect → round skipped after 10s. Audience disconnect → no effect.

#### 6.4.6.14 `computeResults()` and Awards

- [ ] Compute final rankings by cumulative `playerScores` (descending)
- [ ] Compute awards:
  - [ ] **Movie Buff** — most correct guesses across all rounds; icon: `film`
  - [ ] **Emoji Picasso** — Producer whose round was guessed the fastest (best emoji description); icon: `palette`
  - [ ] **Stumper** — Producer whose movie was never guessed (timeout); icon: `lock`
  - [ ] **Speed Guesser** — fastest correct guess (earliest timestamp across all rounds); icon: `zap`
  - [ ] **Close but No Cigar** — player with the most "close" guesses that never converted to correct in the same round; icon: `cigarette`
- [ ] Return `MinigameResults` with rankings, awards, and `gameSpecificData` containing rounds summary
  **Verification:** Unit test: scenarios triggering each award → all 5 awards assigned correctly.

#### 6.4.6.15 `buildGameLog()`

- [ ] Maintain an `actionLog: GameLogAction[]` array on the game instance
- [ ] Log `round_start` action when a new Producer is assigned (round, producerUserId, movieTitle)
- [ ] Log `emoji_placed` action for each emoji the Producer adds (emoji, position, emojiSequence snapshot)
- [ ] Log `guess_attempt` action for significant guesses only — close guesses and the correct guess (userId, guessText, result: 'close' | 'correct', matchScore)
- [ ] Log `round_end` action at round completion (round, movieTitle, emojiSequence, correctGuesserId or null, guessCount)
- [ ] In `computeResults()`, build `GameLog` with `initialState` containing total rounds, movie pool difficulty, player list
- [ ] Return `GameLog` from `buildGameLog()`
  **Verification:** Unit test: 4-round game, verify log contains round_start/round_end per round with correct movie titles and emoji sequences.

---

### 6.4.7 Register Game in Minigame Registry

- [ ] Add entry to `lib/rmhbox/minigame-registry.ts`:
  ```ts
  {
    id: "emoji-cinema",
    displayName: "Emoji Cinema",
    description: "Describe movies using only emojis! Race to guess what film the Producer is depicting.",
    category: "word",
    icon: "clapperboard",
    minPlayers: 3,
    maxPlayers: 12,
    estimatedDurationSeconds: 180,
    supportsTeams: false,
    instructionDurationSeconds: 15,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: "join_next_subround",
    tags: ["word", "creative", "speed", "movies", "guessing"],
  }
  ```
  **Verification:** Registry lookup for `"emoji-cinema"` returns correct metadata.

---

### 6.4.8 Build Client Components

#### 6.4.8.1 `components/rmhbox/minigames/emoji-cinema/EmojiCinemaGame.tsx`

- [ ] Phase router — renders based on `phase` and player role (Producer vs Audience)
- [ ] Subscribe to all `EC_*` and `TIMER_TICK` events
- [ ] Maintain local state: round, phase, role, movie (Producer only), emoji sequence, guesses, scores
- [ ] Handle `EC_PRODUCER_ASSIGNED` → update Producer info, reset round state
- [ ] Handle `EC_MOVIE_ASSIGNED` → (Producer only) store movie title
- [ ] Handle `EC_EMOJI_UPDATED` → update emoji sequence display (live)
- [ ] Handle `EC_GUESS_RESULT` → add to own guess history
- [ ] Handle `EC_CLOSE_GUESS` → show "close" notification
- [ ] Handle `EC_CORRECT_GUESS` → show "correct" notification with player name
- [ ] Handle `EC_GUESS_COUNT` → update guess counts
- [ ] Handle `EC_ROUND_OVER` → store results, transition to results view
- [ ] Conditional rendering:
  - `PRODUCER_ASSIGNMENT` → Producer announcement animation
  - `EMOJI_CONSTRUCTION` (Producer) → `<ProducerView />`
  - `EMOJI_CONSTRUCTION` (Audience) → `<AudienceView />`
  - `ROUND_RESULTS` → `<RoundResults />`
  - `TRANSITION` → brief transition screen
  **Verification:** Component renders correctly for both roles in all phases.

#### 6.4.8.2 `components/rmhbox/minigames/emoji-cinema/EmojiKeyboard.tsx`

- [ ] Categorized emoji grid from the curated palette
- [ ] Category tabs/pills for navigation: People, Animals, Nature, Food, Objects, Symbols, Activities, Travel
- [ ] Text search/filter input: typing filters emojis (e.g., "fire" shows 🔥)
- [ ] Tap emoji → emits `ADD_EMOJI` action with current position (append to end)
- [ ] Scrollable grid within each category
- [ ] Touch-friendly emoji sizing (min 40px tap targets)
- [ ] Visual feedback on tap (brief scale animation)
  **Verification:** All 200 emojis render. Category tabs filter correctly. Search filters by keyword. Tap emits correct event.

#### 6.4.8.3 `components/rmhbox/minigames/emoji-cinema/EmojiSentence.tsx`

- [ ] Horizontal display bar showing the current emoji sequence
- [ ] Emojis displayed large (≥32px)
- [ ] Drag-and-drop reordering (emits `REORDER_EMOJI`)
- [ ] Tap to remove (emits `REMOVE_EMOJI`)
- [ ] Counter: "4/12 emojis"
- [ ] Empty state placeholder: "Tap emojis below to describe the movie"
  **Verification:** Emojis render in order. Drag reorder works. Tap to remove works. Counter accurate.

#### 6.4.8.4 `components/rmhbox/minigames/emoji-cinema/GuessInput.tsx`

- [ ] Text input for movie title guesses
- [ ] Submit on Enter key press
- [ ] Clear input after submission
- [ ] Disabled when max guesses reached
- [ ] Remaining guesses counter: "12/15 guesses left"
- [ ] Disabled when player has already guessed correctly
  **Verification:** Submit emits `SUBMIT_GUESS`. Disabled at max guesses. Clears after submit.

#### 6.4.8.5 `components/rmhbox/minigames/emoji-cinema/GuessHistory.tsx`

- [ ] Scrollable list of own guesses with result indicators
- [ ] ✅ Correct (green), 🔥 Close (orange), ❌ Wrong (red/gray)
- [ ] Most recent guess at top
- [ ] Auto-scroll to show newest entry
  **Verification:** History renders with correct indicators. Scrolls on new entry.

#### 6.4.8.6 `components/rmhbox/minigames/emoji-cinema/ProducerView.tsx`

- [ ] Full Producer interface combining:
  - Movie title and year display (prominent, private)
  - `<EmojiSentence />` for the built sequence
  - `<EmojiKeyboard />` for selection
  - Guess activity indicators: "2 guesses so far | 0 close"
  - Timer display
- [ ] NO guess input (Producer can't guess their own movie)
  **Verification:** Movie title visible. Emoji keyboard functional. Guess counts update live.

#### 6.4.8.7 `components/rmhbox/minigames/emoji-cinema/AudienceView.tsx`

- [ ] Audience interface combining:
  - Large emoji sequence display (live-updating as Producer adds emojis)
  - `<GuessInput />`
  - `<GuessHistory />`
  - Producer name and round counter
  - Close/correct notification toasts
  - Timer display
- [ ] NO emoji keyboard (Audience can only guess)
  **Verification:** Emoji sequence updates live. Guess input works. Toasts appear on close/correct events.

#### 6.4.8.8 `components/rmhbox/minigames/emoji-cinema/RoundResults.tsx`

- [ ] Movie title reveal: "The movie was... [Title]! ([Year])"
- [ ] Emoji recap: show the emoji sequence that was built
- [ ] Results table: who guessed correctly, their rank, points earned
- [ ] Producer score display
- [ ] Framer Motion entrance animation (movie poster reveal effect)
  **Verification:** All round data displays correctly. Animation plays.

#### 6.4.8.9 `components/rmhbox/minigames/emoji-cinema/MovieReveal.tsx`

- [ ] Animated movie title reveal component
- [ ] Staggered letter reveal or fade-in effect
- [ ] Emoji sequence displayed below title
- [ ] Year and genre badges
  **Verification:** Animation plays smoothly. Title, year, genre visible.

---

### 6.4.9 Integration Testing

- [ ] End-to-end test: 4 players → start Emoji Cinema → play 4 rounds (each player is Producer once)
  - [ ] Verify each player is Producer exactly once
  - [ ] Verify Producer receives movie title; Audience does NOT
  - [ ] Verify emoji additions are broadcast live to all players
  - [ ] Verify correct guess ends the round (after brief window for others)
  - [ ] Verify fuzzy matching with thresholds (0.80 correct, 0.60 close)
  - [ ] Verify scoring: Producer base + speed bonus, 1st/2nd/other guesser points
  - [ ] Verify Producer cannot guess
  - [ ] Verify max guesses per player enforced
  **Verification:** All assertions pass. Scores match manual calculation.

- [ ] Information masking test:
  - [ ] During EMOJI_CONSTRUCTION: movie title ONLY in Producer's socket events/state
  - [ ] Other players' guess TEXT not in any Audience-facing event (only counts)
  - [ ] Correct answer revealed to all ONLY in `EC_ROUND_OVER`
  **Verification:** Zero movie title leakage to Audience. Zero guess text leakage between players.

- [ ] Fuzzy matching test:
  - [ ] "The Lion King" → "lion king" = CORRECT (normalized)
  - [ ] "The Lion King" → "Loin King" = CLOSE (typo, within 0.60–0.80 range)
  - [ ] "The Lion King" → "Madagascar" = WRONG
  - [ ] "The Lion King" → "The lion king" = CORRECT (case-insensitive)
  - [ ] Alternative title match: if "Avengers: Endgame" has alt title "Avengers Endgame" → "avengers endgame" = CORRECT
  **Verification:** All fuzzy match results match expected outcomes.

- [ ] Anti-cheat test:
  - [ ] Non-palette emoji rejected (if Producer somehow sends one)
  - [ ] Letter emojis (🅰️🅱️) not in palette → can't spell titles
  - [ ] Max 12 emojis enforced
  - [ ] Max 15 guesses enforced
  **Verification:** All anti-cheat measures work.

- [ ] Producer disconnect test: Producer disconnects → round skipped after 10s → next round starts
  **Verification:** Round skipped cleanly. No errors.

- [ ] JIP test: Player joins during round 2 → joins Audience at round 3 → can guess but not be Producer
  **Verification:** JIP player can guess starting round 3.

- [ ] Max rounds cap test: 8 players → only 6 rounds (capped at `EC_MAX_ROUNDS`)
  **Verification:** Only 6 rounds played even with 8 players.

---

## 6.5 Cross-Game Integration Testing

### 6.5.1 Registry Verification

- [ ] Verify all 4 Phase 6 games are registered in the minigame registry
- [ ] Call registry lookup for each: `"fact-or-friction"`, `"undercover-editor"`, `"minimalist-masterpiece"`, `"emoji-cinema"`
- [ ] Confirm all metadata fields are correct (min/max players, JIP policy, etc.)
- [ ] Confirm each handler instantiates without errors using a mock context
  **Verification:** All 4 games registered and instantiable.

### 6.5.2 Random Selection Test

- [ ] Verify random game selection includes Phase 6 games in the pool
- [ ] Run 100 random selections; confirm Phase 6 games appear with expected frequency
- [ ] Verify player count filtering: 3-player lobby should NOT include `"undercover-editor"` (min 4)
  **Verification:** Phase 6 games appear in selection pool. Filtering by player count works.

### 6.5.3 Lifecycle Integration Test

- [ ] For each Phase 6 game: verify full lifecycle through the minigame state machine:
  `WAITING → VOTING → INSTRUCTIONS → PRELOADING → COUNTDOWN → PLAYING → ROUND_RESULTS`
- [ ] Verify transitions trigger at correct times
- [ ] Verify scoring integrates with lobby-level LeaderboardManager
- [ ] Verify awards appear in post-game display
  **Verification:** All lifecycle phases fire in order. Scores and awards propagate to lobby.

### 6.5.4 Sequential Game Test

- [ ] Play Fact or Friction → immediately play Undercover Editor → then Minimalist Masterpiece → then Emoji Cinema in the same lobby
- [ ] Verify state from game 1 does not leak into game 2
- [ ] Verify cumulative lobby scores are correct across all 4 games
- [ ] Verify used question/prompt/keyword/movie IDs carry across games (no repeats)
  **Verification:** Clean state between games. Cumulative scores accurate. No content repeats.

### 6.5.5 Concurrent Lobby Test

- [ ] Two lobbies playing different Phase 6 games simultaneously
- [ ] Verify no state contamination between lobbies
- [ ] Verify broadcasts go only to the correct lobby
  **Verification:** Independent lobbies. No cross-contamination.

### 6.5.6 Spectator Mode Test

- [ ] Spectate each of the 4 Phase 6 games
- [ ] Verify omniscient data in spectator state:
  - FOF: same as player (no privileged info)
  - UE: keyword, editor identity, edits, all votes
  - MM: all drawings live, all individual bids, identity mapping
  - EC: movie title, all guess text
- [ ] Verify spectator cannot send game inputs
  **Verification:** Spectator states are correct and no input accepted.

### 6.5.7 Disconnection and Reconnection Test

- [ ] For each game: disconnect a player mid-game, reconnect within grace period
- [ ] Verify state restores correctly for each game type
- [ ] Verify role-specific state (UE Editor, EC Producer) is preserved
  **Verification:** All reconnection scenarios work. Role-specific data preserved.

### 6.5.8 Phase 5 + Phase 6 Coexistence Test

- [ ] Verify Phase 5 games (Rhyme Time, Undercover Agent, Category Crash, Wiki-Race) still function correctly after Phase 6 deployment
- [ ] Play a mixed session: Phase 5 game → Phase 6 game → Phase 5 game
- [ ] Verify registry correctly contains all 8 games
  **Verification:** No regressions. All 8 games playable in any order.