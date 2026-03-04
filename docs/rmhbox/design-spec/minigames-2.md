# RMHbox — Minigame Design Specifications (Part 2)

> **Version:** 2.0  
> **Last Updated:** 2026-02-27  
> **Status:** Draft  
> **Games Covered:** Fact or Friction, Undercover Editor, Minimalist Masterpiece, Emoji Cinema  
> **Parent Document:** [design-spec-core.md](./design-spec-core.md)

---

## Table of Contents

1. [Fact or Friction](#1-fact-or-friction)
   - [1.15 MinigameRenderer & Client-Server Wiring](#115-minigamerenderer--client-server-wiring)
2. [Undercover Editor](#2-undercover-editor)
   - [2.17 MinigameRenderer & Client-Server Wiring](#217-minigamerenderer--client-server-wiring)
3. [Minimalist Masterpiece](#3-minimalist-masterpiece)
   - [3.14 MinigameRenderer & Client-Server Wiring](#314-minigamerenderer--client-server-wiring)
4. [Emoji Cinema](#4-emoji-cinema)
   - [4.16 MinigameRenderer & Client-Server Wiring](#416-minigamerenderer--client-server-wiring)

---

## 1. Fact or Friction

### 1.1 Overview

| Field | Value |
|---|---|
| **ID** | `fact-or-friction` |
| **Display Name** | Fact or Friction |
| **Category** | `trivia` |
| **Icon** | `flame` (Lucide) |
| **Min Players** | 2 |
| **Max Players** | 16 |
| **Estimated Duration** | 120 seconds |
| **Supports Teams** | No |
| **Join-in-Progress** | `join_next_subround` |
| **Tags** | `['trivia', 'risk', 'speed', 'knowledge']` |

### 1.2 Game Concept

High-stakes trivia where answering wrong costs you. A question appears with a **Point Pot** that starts at a maximum value and rapidly ticks down. Answer correctly early for maximum points, but answer incorrectly and the current pot value is *subtracted* from your score. The tension between speed and caution creates the "friction."

### 1.3 Detailed Mechanics

#### 1.3.1 Round Structure

The game consists of **8 questions** (configurable: `FF_TOTAL_QUESTIONS`). Each question is an independent sub-round.

| Phase | Duration | Description |
|---|---|---|
| Question Reveal | 2s | Question text animates in |
| Answer Phase | 15s | Point Pot ticks down; players answer or pass |
| Answer Reveal | 4s | Correct answer shown, scores update |
| Brief Pause | 1s | Transition to next question |

**Total game time:** ~8 × 22s = ~176s ≈ 3 minutes.

#### 1.3.2 Question Pool

Questions are stored in `data/rmhbox/fact-or-friction/questions.json`. Each question has:

```typescript
interface TriviaQuestion {
  id: string;
  question: string;
  options: string[];             // exactly 4 options (A, B, C, D)
  correctIndex: number;          // 0-3
  category: string;              // e.g., "Science", "History", "Pop Culture"
  difficulty: 'easy' | 'medium' | 'hard';
  source: string;                // attribution / fact-check source
}
```

Question selection per game:
- 3 easy, 3 medium, 2 hard (configurable distribution).
- No duplicate categories in consecutive questions when possible.
- Questions used in the current lobby session are excluded from future rounds.

#### 1.3.3 Point Pot Mechanics

The Point Pot is a **server-authoritative** counter that ticks down:

1. Starts at `FF_POT_START_VALUE` (default: **1000**).
2. Decreases by `FF_POT_TICK_VALUE` (default: **50**) every `FF_POT_TICK_INTERVAL_MS` (default: **500ms**, i.e., 2 ticks/second).
3. Minimum pot value: `FF_POT_MIN_VALUE` (default: **100**). The pot never drops below this.
4. When a player submits an answer, the server records the pot value **at the moment of server receipt** (not client-side clock).

**Time to min pot:** (1000 − 100) / 50 = 18 ticks = 9 seconds. So the pot drains from 1000→100 over 9 seconds, then stays at 100 for the remaining 6 seconds.

#### 1.3.4 Answering

Each question presents 4 multiple-choice options (A, B, C, D).

- **Answer:** Player selects one option. Their answer is locked immediately (no changing).
- **Pass:** Player explicitly clicks "Pass" to skip the question. Score unchanged.
- **No answer (timeout):** If the 15-second timer expires without input, treated as a Pass.

After answering, the player's UI shows a "Locked in at X points" indicator but does NOT reveal whether the answer is correct until the Answer Reveal phase.

#### 1.3.5 Scoring

| Outcome | Score Change |
|---|---|
| Correct answer | `+potValueAtSubmission` |
| Incorrect answer | `-potValueAtSubmission` (the friction!) |
| Pass | 0 |
| Timeout | 0 |

**Difficulty bonus:** Hard questions multiply the pot value by `FF_HARD_MULTIPLIER` (default: **1.5**). Medium questions use `FF_MEDIUM_MULTIPLIER` (default: **1.0**, no change). Easy questions use `FF_EASY_MULTIPLIER` (default: **0.8**).

The effective pot value = `floor(basePotValue × difficultyMultiplier)`.

#### 1.3.6 Score Floor

A player's total score cannot drop below `FF_SCORE_FLOOR` (default: **-500**). This prevents a death spiral where a player is so far behind they can't recover and just stops engaging.

### 1.4 Server-Side State Schema

```typescript
interface FactOrFrictionState {
  questions: TriviaQuestion[];                    // all questions for this game (pre-selected)
  currentQuestionIndex: number;                   // 0-indexed
  totalQuestions: number;
  phase: FFPhase;
  
  // Point Pot (current question)
  potValue: number;                               // current pot value
  potStartedAt: number;                           // timestamp when pot started ticking
  
  // Answers for current question
  playerAnswers: Map<string, PlayerAnswer>;       // userId → answer
  
  // Cumulative scores
  playerScores: Map<string, number>;              // userId → total score
  
  // History of all questions' results (for end-of-game review)
  questionHistory: QuestionResult[];
  
  // Timer
  phaseStartedAt: number;
  phaseEndsAt: number;
}

type FFPhase = 'QUESTION_REVEAL' | 'ANSWER' | 'ANSWER_REVEAL' | 'PAUSE';

interface PlayerAnswer {
  userId: string;
  selectedIndex: number | null;     // null = pass
  potValueAtSubmission: number;     // pot value when answer was received
  submittedAt: number;
  isCorrect: boolean;               // computed server-side
  scoreChange: number;              // +pot or -pot or 0
}

interface QuestionResult {
  questionIndex: number;
  question: TriviaQuestion;
  playerAnswers: PlayerAnswer[];
  fastestCorrectUserId: string | null;
  correctCount: number;
  incorrectCount: number;
  passCount: number;
}
```

### 1.5 WebSocket Event Map

#### Client → Server

| Action | Payload | Description |
|---|---|---|
| `SUBMIT_ANSWER` | `{ selectedIndex: number }` | Select A(0), B(1), C(2), or D(3) |
| `PASS_QUESTION` | `{}` | Explicitly pass on this question |

**Zod schemas:**

```typescript
const SubmitAnswerSchema = z.object({
  selectedIndex: z.number().int().min(0).max(3),
});
```

#### Server → Client (Game Actions)

| Action Type | Payload | Sent To | Description |
|---|---|---|---|
| `FF_QUESTION` | `{ questionIndex: number, question: string, options: string[], category: string, difficulty: string, potStartValue: number, answerDurationSeconds: number }` | All (lobby) | New question revealed |
| `FF_POT_TICK` | `{ potValue: number }` | All (lobby) | Pot value update (every 500ms) |
| `FF_ANSWER_LOCKED` | `{ potValueAtLock: number }` | Answering player only | Confirm answer locked at this pot value |
| `FF_PLAYER_ANSWERED` | `{ userId: string, userName: string }` | All (lobby) | Notification that a player has answered (not WHAT they answered) |
| `FF_ANSWER_REVEAL` | `{ correctIndex: number, correctAnswer: string, playerResults: FFPlayerQuestionResult[] }` | All (lobby) | Correct answer + everyone's results |
| `FF_SCORE_UPDATE` | `{ scores: Array<{ userId: string, userName: string, totalScore: number, scoreChange: number }> }` | All (lobby) | Updated leaderboard after each question |
| `TIMER_START` | `{ totalDuration: number, timeRemaining: number }` | All (lobby) | Emitted at the start of each timed phase (ANSWER) via `broadcastAction` |
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer (every 1s during all timed phases) via `broadcastAction` |
| `MINIGAME_ROUND` | `{ current: number, total: number }` | All (lobby) | Sub-round counter update (e.g. "Question 3/8") via `broadcastAction` |

**`FFPlayerQuestionResult`:**

```typescript
interface FFPlayerQuestionResult {
  userId: string;
  userName: string;
  selectedIndex: number | null;   // null = pass
  selectedAnswer: string | null;
  isCorrect: boolean;
  potValueAtSubmission: number;
  scoreChange: number;            // +X, -X, or 0
}
```

### 1.6 Information Masking

| Data | Player View | Spectator View |
|---|---|---|
| Question + options | Visible | Visible |
| Current pot value | Visible (real-time) | Visible (real-time) |
| Own answer (after locking) | Visible (locked-in indicator) | N/A |
| Other players' answers | **HIDDEN** until reveal | **HIDDEN** until reveal |
| Whether other players have answered | Visible (answered/not indicator) | Visible |
| Correct answer | **HIDDEN** until reveal | **HIDDEN** until reveal |
| Scores | Visible (updated after reveal) | Visible |

**`getStateForPlayer(userId)` during ANSWER phase:**

```typescript
interface FFPlayerState {
  currentQuestionIndex: number;
  totalQuestions: number;
  question: string;
  options: string[];
  category: string;
  difficulty: string;
  phase: FFPhase;
  potValue: number;
  timeRemaining: number;
  
  // My answer (null if not yet answered)
  myAnswer: { selectedIndex: number; potValueAtLock: number } | null;
  myHasPassed: boolean;
  
  // Other players (masked)
  playersAnswered: Array<{ userId: string; userName: string; hasAnswered: boolean }>;
  
  // Scores (cumulative)
  scores: Array<{ userId: string; userName: string; totalScore: number }>;
  
  // Question history (revealed questions only)
  questionHistory: QuestionResult[];
}
```

**spectatorMode:** `'shared-privileged'`

**`getStateForSpectator()` returns:**  
Same as player view. Since correct answers are hidden until reveal for everyone, spectators have no privileged information during the answer phase.

### 1.7 Join-in-Progress Logic

**Policy:** `join_next_subround`

Players who join mid-game are added to the player pool at the start of the next question. They start with 0 points and can earn points from that question onward. They miss previous questions' scores.

**Implementation:** The game checks `pendingPlayers` at the transition from `ANSWER_REVEAL` → `PAUSE` → `QUESTION_REVEAL`. New players are initialized in `playerScores` with 0 and can interact starting from the next `ANSWER` phase.

### 1.8 Reconnection Behavior

On reconnect:
1. Player receives their full state including current question, pot value, their locked answer (if any), and score history.
2. If the ANSWER phase is still active and they haven't answered, they can still answer.
3. If they missed an entire question (disconnected during the question), they score 0 for that question (treated as timeout/pass).

### 1.9 Awards

| Award | Condition | Icon |
|---|---|---|
| Pot Sniper | Answered correctly at the highest pot value (fastest correct answer) | `crosshair` |
| Friction Burn | Lost the most points from incorrect answers | `flame` |
| Cool Head | Passed the most questions (risk-averse play) | `snowflake` |
| Perfect Score | Answered every question correctly | `check-circle` |
| Comeback Kid | Had the biggest single-question positive score swing from negative territory | `trending-up` |

### 1.10 NPM Package Suggestions

No additional packages. The question pool is a static JSON file. The Point Pot is a simple server-side timer.

### 1.11 Client Component Structure

```
components/rmhbox/minigames/fact-or-friction/
  FactOrFrictionGame.tsx       # Main game component, phase router
  PointPotDisplay.tsx          # Animated pot value with fire/drain effect
  QuestionCard.tsx             # Question text + 4 option buttons
  OptionButton.tsx             # A/B/C/D button with lock/correct/wrong states
  ScoreRibbon.tsx              # Running score display with +/- animations
  AnswerReveal.tsx             # Correct answer highlight + player results
```

**Mobile UI layout (ANSWER phase):**

```
┌──────────────────────────────┐
│ Fact or Friction   Q3/8      │
├──────────────────────────────┤
│   🏆 Science │ ⭐ Medium     │
├──────────────────────────────┤
│                              │
│  "What is the chemical       │
│   symbol for Gold?"          │
│                              │
├──────────────────────────────┤
│  🔥 Point Pot: 750 🔥       │  ← Animated, pulsing, shrinking
├──────────────────────────────┤
│  ┌───────────────────────┐   │
│  │  A) Go                │   │  ← Tap to lock in
│  └───────────────────────┘   │
│  ┌───────────────────────┐   │
│  │  B) Au   ✓ LOCKED     │   │  ← Locked state (green border)
│  └───────────────────────┘   │
│  ┌───────────────────────┐   │
│  │  C) Ag                │   │
│  └───────────────────────┘   │
│  ┌───────────────────────┐   │
│  │  D) Gd                │   │
│  └───────────────────────┘   │
├──────────────────────────────┤
│ [Pass]   ⏱ 0:08             │
│ Score: 1,250  │  4/6 answered│
└──────────────────────────────┘
```

### 1.12 Constants

```typescript
export const FF_TOTAL_QUESTIONS = 8;
export const FF_QUESTION_REVEAL_SECONDS = 2;
export const FF_ANSWER_DURATION_SECONDS = 15;
export const FF_ANSWER_REVEAL_SECONDS = 4;
export const FF_PAUSE_SECONDS = 1;

export const FF_POT_START_VALUE = 1000;
export const FF_POT_TICK_VALUE = 50;
export const FF_POT_TICK_INTERVAL_MS = 500;
export const FF_POT_MIN_VALUE = 100;

export const FF_EASY_MULTIPLIER = 0.8;
export const FF_MEDIUM_MULTIPLIER = 1.0;
export const FF_HARD_MULTIPLIER = 1.5;

export const FF_SCORE_FLOOR = -500;

export const FF_QUESTION_DISTRIBUTION = { easy: 3, medium: 3, hard: 2 };
```

### 1.13 Game Settings Schema (§12A)

Host-configurable settings for Fact or Friction. Defined in `MinigameDefinition.settingsSchema`.
Handlers read values via `this.getSetting(key, CONSTANT_DEFAULT)`.

| Key | Type | Label | Description | Default | Constraints |
|---|---|---|---|---|---|
| `totalQuestions` | `integer` | Number of Questions | How many fact/fiction questions to play | `8` | min: 4, max: 12, step: 1 |
| `answerDuration` | `integer` | Answer Duration (seconds) | Time players have to lock in their answer each round | `20` | min: 10, max: 45, step: 5 |
| `potStartValue` | `integer` | Starting Pot Value | Points in the pot at the start of each question | `100` | min: 50, max: 200, step: 25 |
| `enableScoreFloor` | `boolean` | Score Floor | Prevent players from going below 0 points | `true` | — |
| `difficulty` | `select` | Difficulty | Difficulty of the fact/fiction statements | `mixed` | options: `easy`, `medium`, `hard`, `mixed` |

**Constant Mapping:**

| Setting Key | Constant Override | Usage |
|---|---|---|
| `totalQuestions` | `FF_TOTAL_QUESTIONS` | `this.getSetting('totalQuestions', FF_TOTAL_QUESTIONS)` |
| `answerDuration` | `FF_ANSWER_DURATION_SECONDS` | `this.getSetting('answerDuration', FF_ANSWER_DURATION_SECONDS)` |
| `potStartValue` | `FF_POT_START_VALUE` | `this.getSetting('potStartValue', FF_POT_START_VALUE)` |
| `enableScoreFloor` | `FF_SCORE_FLOOR` | If `false`, scores can go negative |
| `difficulty` | `FF_DIFFICULTY` | Filters question set by difficulty tag |

### 1.14 Anti-Cheat Notes

- The correct answer index is NEVER sent to clients until the `ANSWER_REVEAL` phase.
- The pot value is server-authoritative. The client displays the value from the latest `FF_POT_TICK` action and interpolates visually between ticks, but the score is always computed using the server's pot value at receipt time.
- Answer submission time is server-stamped, not client-stamped.
- Each player can only submit one answer per question. Duplicate submissions are silently ignored.

### 1.15 Game History

**Game History Level:** Summary Log

Per-question results are compact and self-explanatory — full action replay isn't needed since the game has no spatial or creative state. The summary captures who answered what, how fast, and the pot dynamics.

#### `initialState`

```typescript
interface FFInitialState {
  totalQuestions: number;
  potStartValue: number;
  potDecayRate: number;
  playerIds: string[];
  categoryPool: string[];           // categories selected for this session
}
```

#### Actions Logged

| Action Type | Payload | Recorded When |
|---|---|---|
| `QUESTION_START` | `{ questionIndex, questionText, options, category, potValue }` | Question is revealed |
| `PLAYER_ANSWER` | `{ userId, selectedIndex, potValueAtSubmission, elapsedMs }` | Player locks in answer |
| `PLAYER_PASS` | `{ userId, elapsedMs }` | Player passes or timer expires |
| `QUESTION_RESULT` | `{ correctIndex, correctCount, incorrectCount, passCount, fastestUserId }` | Answer reveal phase |

#### Replay Value

Review who gambled on high pot values and lost, who was consistently fastest, and how the pot decayed across rounds. Useful for settling "I answered first!" disputes.

> **Note:** The `GameLog` also includes `gameSettings: GameSettingValues` at the top level (per core.md §12A.11), capturing the exact game settings used for this match.

### 1.16 History Display Configuration

**Detail Component:** `FactOrFrictionHistoryDetail`

Renders the expanded game log as a question-by-question breakdown:
- Each question with its options, correct answer highlighted
- Per-player answer indicators (correct/incorrect/timeout)
- Point pot value at each player's submission time
- Running score graph across questions
- Difficulty badge per question (easy/medium/hard)

**Searchable Fields:**

| Field Key | Label | Extraction |
|---|---|---|
| `questions` | Questions | Question text from `question_reveal` actions |
| `categories` | Categories | Question categories from `question_reveal` actions |

**Filterable Fields:**

| Field Key | Label | Type | Details |
|---|---|---|---|
| `difficulty` | Difficulty | select | `easy`, `medium`, `hard` |
| `correctCount` | Questions Correct | range | Number of correct answers by user |

**Summary Extractor:**

```typescript
getSummary: (log) => {
  const questions = log.actions.filter(a => a.type === 'question_reveal');
  return `${questions.length} questions — Trivia challenge`;
}
```

**Component Structure:**

```
FactOrFrictionHistoryDetail.tsx
├── QuestionCard (per question)
│   ├── QuestionText + DifficultyBadge
│   ├── AnswerOptions (correct highlighted, player selections shown)
│   ├── PotValueIndicator (point pot at submission time)
│   └── PlayerAnswerGrid (who answered what)
├── ScoreGraph (running score over questions)
└── Final scores summary
```

### 1.17 MinigameRenderer & Client-Server Wiring

#### MinigameRenderer Registration

The `MinigameRenderer` lazy-loads the Fact or Friction component so it is only bundled when the game is active:

```tsx
const MINIGAME_COMPONENTS = {
  'fact-or-friction': lazy(() => import('./minigames/fact-or-friction/FactOrFrictionGame')),
  // …other minigames
};
```

#### Client-Side Store Integration

The client store listens for server-pushed actions and updates local state accordingly:

```ts
useEffect(() => {
  const handlers: Record<string, (payload: unknown) => void> = {
    FF_QUESTION:      (p) => dispatch({ type: 'FF_QUESTION', payload: p }),
    FF_POT_TICK:      (p) => dispatch({ type: 'FF_POT_TICK', payload: p }),
    FF_ANSWER_LOCKED: (p) => dispatch({ type: 'FF_ANSWER_LOCKED', payload: p }),
    FF_PLAYER_ANSWERED: (p) => dispatch({ type: 'FF_PLAYER_ANSWERED', payload: p }),
    FF_ANSWER_REVEAL: (p) => dispatch({ type: 'FF_ANSWER_REVEAL', payload: p }),
    FF_SCORE_UPDATE:  (p) => dispatch({ type: 'FF_SCORE_UPDATE', payload: p }),
    TIMER_TICK:        (p) => dispatch({ type: 'TIMER_TICK', payload: p }),
  };
  Object.entries(handlers).forEach(([ev, fn]) => socket.on(ev, fn));
  return () => { Object.keys(handlers).forEach((ev) => socket.off(ev)); };
}, [socket, dispatch]);
```

#### Client-Side Input Dispatch

Players submit answers or pass via the socket:

```ts
// Lock in an answer
socket.emit('SUBMIT_ANSWER', { selectedIndex });

// Pass on the current question
socket.emit('PASS_QUESTION', {});
```

#### Server-Side Handler Registration

The server registers the game handler at startup:

```ts
import { FactOrFrictionGame } from './minigames/fact-or-friction/FactOrFrictionGame';

MINIGAME_SERVER_REGISTRY.set('fact-or-friction', FactOrFrictionGame);
```

> **Note:** All server broadcasts use `this.broadcastGameAction()` (the `BaseMinigame` wrapper), not raw `context.broadcastToLobby`.

#### Sound Effect Integration

| Event | Sound | Notes |
|---|---|---|
| Question revealed | `swoosh` | New question card flies in |
| Pot ticking | *(visual only)* | Pot value decreases — no audio cue |
| Answer locked | `click` | Confirms the player's selection |
| Answer reveal (correct) | `scoreDing` | Positive feedback |
| Answer reveal (wrong) | `buzzer` | Negative feedback |
| Score update | `scoreDing` | Points awarded |
| Timer warning | `countdownBeep` | Final seconds of the timer |

#### Spectator Rendering

Spectators see all player answer states (who has answered, but not which option until reveal), the current pot value, and the countdown timer. The component renders a read-only question card without clickable options.

---


## 2. Undercover Editor

### 2.1 Overview

| Field | Value |
|---|---|
| **ID** | `undercover-editor` |
| **Display Name** | Undercover Editor |
| **Category** | `creative` |
| **Icon** | `pencil-line` (Lucide) |
| **Min Players** | 4 |
| **Max Players** | 10 |
| **Estimated Duration** | ~variable (parallel writing, N rounds) |
| **Supports Teams** | No |
| **Join-in-Progress** | `spectate_only` |
| **Tags** | `['creative', 'social-deduction', 'writing', 'strategy']` |

### 2.2 Game Concept

All players write sentences for ALL stories simultaneously each round. Each player is secretly assigned as the "undercover editor" of exactly one other player's story (cyclic assignment). After writing rounds, editors secretly edit their assigned story. Players then review all completed stories and try to match each story with its undercover editor.

### 2.3 Detailed Mechanics

#### 2.3.1 Setup

1. **Story Creation:** One story is created per player (N stories in parallel). Each story has a unique prompt and keyword.
2. **Editor Assignment:** Cyclic assignment — player *i* edits player *(i+1 mod N)*'s story. Each player is the editor of exactly one story and the owner of exactly one story.
3. **Keyword Assignment:** Each story's keyword is sent only to the assigned editor's socket. Keywords are common English words that could plausibly appear in many stories.
4. **Story Prompts:** Each story receives a short prompt to set the theme (e.g., "A detective arrives at an abandoned mansion on a stormy night.").

#### 2.3.2 Phase Structure

| Phase | Duration | Description |
|---|---|---|
| SETUP | instant | Assign roles, create N stories (one per player) |
| WRITE | 45s (configurable) | ALL players write a sentence for each story simultaneously |
| EDIT | 30s (configurable) | ALL editors secretly edit their assigned story simultaneously |
| *(repeat WRITE → EDIT for N rounds)* | | |
| REVIEW | infinite | Players match stories to their editors (host or all-locked-in advances) |
| REVEAL | 10s | Editor assignments, keywords, edits revealed; scores shown |

#### 2.3.3 Write Phase

- All players write a sentence for **each** story simultaneously.
- Sentence constraints: min 10 chars, max 200 chars.
- Players can unsubmit and re-edit within the write timer.
- Write phase ends early **only** when ALL players have submitted for ALL stories.
- If the timer expires without input, the server auto-submits `"..."` (an ellipsis sentence indicating a timeout).

#### 2.3.4 Edit Phase

- Each editor edits their ONE assigned story (one word swap per round).
- The edit UI shows the story with each word as a clickable token. Selecting a word reveals an input field to replace it.
- The edit is applied silently — no other player is notified that an edit occurred.
- The editor can choose to skip editing (`SKIP_EDIT`).
- **Constraints:**
  - Only one word can be changed per round.
  - The replacement word must be a single word (no spaces), maximum 30 characters.
  - Cannot edit a word already edited in a previous round.

#### 2.3.5 Review Phase

- Infinite time — the host advances or all players lock in.
- Players use dropdowns to match each story to its suspected editor.
- Players can save and update their guesses, then "Lock In."
- Host advance or all-locked-in triggers REVEAL.

#### 2.3.6 Reveal Phase

- Editor assignments are revealed.
- Keywords are revealed.
- All edits are highlighted (original → replacement).
- Scores are calculated and displayed.

### 2.4 Server-Side State Schema

```typescript
interface UndercoverEditorState {
  playerIds: string[];
  totalRounds: number;
  currentRound: number;
  phase: UEPhase;
  stories: Map<string, ParallelStory>;
  editorAssignments: Map<string, string>;     // editorId → storyId
  roundSubmissions: Map<string, Map<string, string>>;  // storyId → userId → text
  roundEditsDone: Map<string, boolean>;       // storyId → done?
  matchGuesses: Map<string, Map<string, string>>;  // guesserId → (storyId → editorId)
  matchLockedIn: Set<string>;
  playerScores: Map<string, number>;
  phaseStartedAt: number;
  phaseEndsAt: number;
}

type UEPhase = 'SETUP' | 'WRITE' | 'EDIT' | 'REVIEW' | 'REVEAL';

interface ParallelStory {
  storyId: string;           // same as ownerUserId
  prompt: string;
  ownerUserId: string;
  ownerName: string;
  keyword: string;
  editorUserId: string;
  sentences: StorySentence[];
  edits: WordEdit[];
  editedWordPositions: Set<string>;
  keywordInStory: boolean;
}

interface StorySentence {
  authorUserId: string;
  authorName: string;
  text: string;
  originalText: string;
  turnNumber: number;
  words: string[];
}

interface WordEdit {
  sentenceIndex: number;
  wordIndex: number;
  originalWord: string;
  newWord: string;
  editedOnTurn: number;
}
```

### 2.5 WebSocket Event Map

#### Client → Server

| Action | Payload | Description |
|---|---|---|
| `WRITE_SENTENCE` | `{ storyId: string, text: string }` | Submit a sentence for a specific story |
| `UNSUBMIT_SENTENCE` | `{ storyId: string }` | Retract a submitted sentence |
| `EDIT_WORD` | `{ storyId: string, sentenceIndex: number, wordIndex: number, newWord: string }` | Secretly edit a word in assigned story |
| `SKIP_EDIT` | `{}` | Choose not to edit this round |
| `SUBMIT_MATCHING` | `{ guesses: Record<string, string> }` | Save story-to-editor matching guesses |
| `LOCK_IN_MATCHING` | `{}` | Lock in matching guesses |

**Zod schemas:**

```typescript
const WriteSentenceSchema = z.object({
  storyId: z.string().min(1),
  text: z.string().min(10).max(200),
});

const UnsubmitSentenceSchema = z.object({
  storyId: z.string().min(1),
});

const EditWordSchema = z.object({
  storyId: z.string().min(1),
  sentenceIndex: z.number().int().min(0),
  wordIndex: z.number().int().min(0),
  newWord: z.string().min(1).max(30).regex(/^\S+$/),
});

const SubmitMatchingSchema = z.object({
  guesses: z.record(z.string(), z.string()),
});
```

#### Server → Client (Game Actions)

| Action Type | Payload | Sent To | Description |
|---|---|---|---|
| `UE_GAME_START` | `{ stories: StoryInfo[], players: PlayerInfo[], totalRounds: number }` | All (lobby) | Stories list, players, totalRounds |
| `UE_ROLE_ASSIGNED` | `{ role: 'editor' \| 'writer', assignedStoryId?: string, keyword?: string, storyOwnerName?: string }` | Individual | Role, assignedStoryId, keyword, storyOwnerName (editor fields only for editors) |
| `UE_WRITE_START` | `{ round: number, totalRounds: number, writeDurationSeconds: number }` | All (lobby) | Write phase begins |
| `UE_SENTENCE_CONFIRMED` | `{ storyId: string, text: string }` | Submitting player | Confirms sentence submission |
| `UE_SENTENCE_UNSUBMITTED` | `{ storyId: string }` | Submitting player | Confirms sentence retraction |
| `UE_SUBMISSION_PROGRESS` | `{ progress: Record<string, number>, totalPlayers: number }` | All (lobby) | Per-story submission counts |
| `UE_EDIT_START` | `{ round: number, editDurationSeconds: number }` | All (lobby) | Edit phase begins |
| `UE_EDIT_PROMPT` | `{ story: EditableStory, editDurationSeconds: number }` | Editor only | Prompt editor to make their secret edit |
| `UE_EDIT_CONFIRMED` | `{ storyId: string, story?: EditableStory, skipped?: boolean }` | Editor | Confirms edit or skip |
| `UE_STORIES_UPDATED` | `{ stories: StoryView[] }` | All (lobby) | All story views after edits |
| `UE_REVIEW_START` | `{ stories: StoryView[], players: PlayerInfo[] }` | All (lobby) | Review phase begins |
| `UE_MATCHING_SAVED` | `{ guesses: Record<string, string> }` | Submitting player | Confirms guesses saved |
| `UE_PLAYER_LOCKED_IN` | `{ userId: string, userName: string, lockedInCount: number, totalPlayers: number }` | All (lobby) | A player locked in their guesses |
| `UE_REVEAL` | `{ storyReveals: StoryReveal[], matchResults: MatchResult[], scores: ScoreResult[] }` | All (lobby) | Full reveal |
| `UE_ERROR` | `{ message: string }` | Individual | Error message |
| `TIMER_START` | `{ totalDuration: number, timeRemaining: number }` | All (lobby) | Emitted at the start of each timed phase (WRITE, EDIT) via `broadcastAction` |
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer (every 1s during all timed phases) via `broadcastAction` |
| `MINIGAME_ROUND` | `{ current: number, total: number }` | All (lobby) | Round counter update (e.g. "Round 1/2") via `broadcastAction` |

**Supporting types:**

```typescript
interface StoryInfo {
  storyId: string;
  prompt: string;
  ownerUserId: string;
  ownerName: string;
}

interface PlayerInfo {
  userId: string;
  userName: string;
}

interface StoryView {
  storyId: string;
  ownerName: string;
  prompt: string;
  sentences: StorySentenceView[];
}

interface StorySentenceView {
  authorName: string;
  text: string;
  roundNumber: number;
}

interface EditableStory {
  storyId: string;
  ownerName: string;
  sentences: Array<{
    authorName: string;
    words: Array<{
      word: string;
      index: number;
      sentenceIndex: number;
      isEditable: boolean;          // false if already edited
    }>;
  }>;
}

interface StoryReveal {
  storyId: string;
  ownerUserId: string;
  ownerName: string;
  editorUserId: string;
  editorName: string;
  keyword: string;
  keywordInStory: boolean;
  sentences: StorySentenceView[];
  edits: WordEditView[];
}

interface WordEditView {
  sentenceIndex: number;
  sentenceAuthor: string;
  originalWord: string;
  newWord: string;
  editedOnRound: number;
}

interface MatchResult {
  guesserId: string;
  guesserName: string;
  storyId: string;
  guessedEditorId: string;
  actualEditorId: string;
  isCorrect: boolean;
}

interface ScoreResult {
  userId: string;
  userName: string;
  score: number;
  breakdown: Record<string, number>;
}
```

### 2.6 Information Masking

**This game has critical masking requirements due to the parallel editor assignments.**

| Data | Writer View | Editor View | Spectator View |
|---|---|---|---|
| Keyword | **HIDDEN** until REVEAL | **VISIBLE** (own assigned story only) | **VISIBLE** (all) |
| Editor assignments | **HIDDEN** until REVEAL | Known (self only) | **VISIBLE** (all) |
| Edit history | **HIDDEN** until REVEAL | Own edits only | **VISIBLE** (all) |
| Other players' submissions | **HIDDEN** | **HIDDEN** | **HIDDEN** |
| Match guesses | Own only | Own only | **HIDDEN** |

**spectatorMode:** `'shared-privileged'`

**`getStateForPlayer(userId)` during WRITE phase:**

```typescript
interface UEPlayerWriteState {
  phase: UEPhase;
  currentRound: number;
  totalRounds: number;
  stories: StoryView[];
  timeRemaining: number;
  mySubmissions: Record<string, string>;   // storyId → submitted text (or absent)
  submissionProgress: Record<string, number>;
}
```

**`getStateForPlayer(userId)` for an Editor during EDIT phase:**

```typescript
interface UEEditorEditState extends UEPlayerWriteState {
  editableStory: EditableStory;
  myEdits: WordEdit[];
  keyword: string;
}
```

**`getStateForSpectator()` returns:**
Omniscient view: sees all editor assignments, keywords, edits as they happen, and submission progress. This creates an exciting viewing experience for the audience.

### 2.7 Join-in-Progress Logic

**Policy:** `spectate_only`

Roles, story assignments, and the parallel writing structure are established at game start. Adding a player mid-game would disrupt the editor assignment cycle and story balance.

### 2.8 Reconnection Behavior

On reconnect:
1. Player receives their role, current stories, what round it is, and phase.
2. Editors receive the keyword and their edit history.
3. If the WRITE or EDIT phase is still active, they can still submit.
4. If their turn was auto-completed (timeout), they cannot redo it.

### 2.9 Player Disconnect Mid-Game

- **During EDIT:** Auto-completes the editor's edit (marked as done).
- **During WRITE:** Unanswered defaults to `"..."` at phase end.
- **During REVIEW:** Player's guesses treated as empty.
- If the Editor fully disconnects (grace period expires): the game continues. The editor's edit phases are auto-skipped.
- Minimum players: If players drop below `minPlayers` (4), the game force-ends.

### 2.10 Awards

| Award | Condition | Icon |
|---|---|---|
| Best Detective 🔍 | Most correct editor identifications | `search` |
| Sneakiest Editor 🥷 | Fooled the most players | `mask` |

### 2.11 Client Component Structure

```
components/rmhbox/minigames/undercover-editor/
  UndercoverEditorGame.tsx     # Main game component, phase router
  StoryDisplay.tsx             # Read-only story text
  WriteInput.tsx               # Sentence composition (10-200 chars)
  StoryEditor.tsx              # Word tokens for editor
  MatchingPanel.tsx            # Review phase — story-to-editor matching
  RevealScreen.tsx             # Available but inline reveal used for parallel
  RoleBadge.tsx                # Editor keyword badge
  TurnIndicator.tsx            # Available for future use
```

**Mobile UI layout (WRITE phase):**

```
┌──────────────────────────────┐
│ Undercover Editor  Round 1/2 │
├──────────────────────────────┤
│  ✏️ Writing for all stories  │
│        ⏱ 0:32                │
├──────────────────────────────┤
│                              │
│  📖 Story: Alice's Tale      │
│  Prompt: "A detective..."    │
│                              │
│  > "He found the door ajar   │
│    and stepped inside."      │
│    — Bob (Round 1)           │
│                              │
│  ┌───────────────────────┐   │
│  │ Write your sentence...│   │
│  └───────────────────────┘   │
│  [Submit]  [Unsubmit]        │
│                              │
├──────────────────────────────┤
│  Stories: 2/4 done           │
│ 🔎 You are a Writer          │
│ Score: 0                     │
└──────────────────────────────┘
```

### 2.12 Constants

```typescript
export const UE_MIN_PLAYERS = 4;
export const UE_MAX_PLAYERS = 10;
export const UE_ROTATIONS = 2;                    // number of write-edit rounds
export const UE_WRITE_TIMEOUT_SECONDS = 45;
export const UE_EDIT_TIMEOUT_SECONDS = 30;
export const UE_REVEAL_DURATION = 10;
export const UE_DISCONNECT_WAIT = 15;

export const UE_MIN_SENTENCE_LENGTH = 10;
export const UE_MAX_SENTENCE_LENGTH = 200;
export const UE_MAX_EDIT_WORD_LENGTH = 30;

export const UE_CORRECT_VOTE_BONUS = 100;        // each correct editor match
export const UE_KEYWORD_PROXIMITY_BONUS = 50;     // editor whose keyword appears in story
export const UE_EDITOR_MAJOR_WIN = 600;           // editor not caught
export const UE_EDITOR_LOSS = 50;                 // editor caught
export const UE_WRITER_MAJOR_WIN = 400;           // story owner whose editor fooled people
export const UE_WRITER_LOSS = 50;                 // story owner whose editor was easily caught
```

### 2.13 Game Settings Schema (§12A)

Host-configurable settings for Undercover Editor. Defined in `MinigameDefinition.settingsSchema`.
Handlers read values via `this.getSetting(key, CONSTANT_DEFAULT)`.

| Key | Type | Label | Description | Default | Constraints |
|---|---|---|---|---|---|
| `rotations` | `integer` | Rotations | Number of write-edit rounds | `2` | min: 1, max: 3, step: 1 |
| `writeTimeout` | `integer` | Write Duration (seconds) | Time to write sentences each round | `45` | min: 30, max: 90, step: 5 |
| `editTimeout` | `integer` | Edit Duration (seconds) | Time to edit assigned story each round | `30` | min: 15, max: 60, step: 5 |

> **Note:** The old `accusationDuration` setting is removed since the REVIEW phase is infinite (host or all-locked-in advances).

**Constant Mapping:**

| Setting Key | Constant Override | Usage |
|---|---|---|
| `rotations` | `UE_ROTATIONS` | `this.getSetting('rotations', UE_ROTATIONS)` |
| `writeTimeout` | `UE_WRITE_TIMEOUT_SECONDS` | `this.getSetting('writeTimeout', UE_WRITE_TIMEOUT_SECONDS)` |
| `editTimeout` | `UE_EDIT_TIMEOUT_SECONDS` | `this.getSetting('editTimeout', UE_EDIT_TIMEOUT_SECONDS)` |

### 2.14 Scoring

Scoring is based on matching accuracy during the REVIEW phase:

| Condition | Constant | Points |
|---|---|---|
| Each correct editor match | `UE_CORRECT_VOTE_BONUS` | 100 |
| Editor whose keyword appears in story | `UE_KEYWORD_PROXIMITY_BONUS` | 50 |
| Editor not caught (majority didn't guess correctly) | `UE_EDITOR_MAJOR_WIN` | 600 |
| Editor caught | `UE_EDITOR_LOSS` | 50 |
| Story owner whose editor was sneaky (fooled people) | `UE_WRITER_MAJOR_WIN` | 400 |
| Story owner whose editor was easily caught | `UE_WRITER_LOSS` | 50 |

### 2.15 Game History

**Game History Level:** Full Action Log

Undercover Editor is one of the most replay-worthy games — watching the stories evolve and spotting where each editor's subtle word swaps were hidden is endlessly entertaining. The full action log preserves every submission, edit, and matching result.

#### `initialState`

```typescript
interface UEInitialState {
  stories: Array<{ storyId: string, prompt: string, ownerUserId: string }>;
  editorAssignments: Record<string, string>;   // editorId → storyId
  keywords: Record<string, string>;            // storyId → keyword
  playerIds: string[];
  totalRounds: number;
}
```

#### Actions Logged

| Action Type | Payload | Recorded When |
|---|---|---|
| `ROUND_START` | `{ round, totalRounds }` | Write phase begins |
| `SENTENCE_WRITTEN` | `{ userId, storyId, text }` | Player submits sentence |
| `EDITOR_SWAP` | `{ storyId, sentenceIndex, originalWord, replacementWord, round }` | Editor makes a substitution |
| `EDITOR_SKIP` | `{ storyId, round }` | Editor passes on editing |
| `STORIES_SNAPSHOT` | `{ stories: StoryView[] }` | End of each round — full story state |
| `MATCHING_SUBMITTED` | `{ userId, guesses: Record<string, string> }` | Player submits matching guesses |
| `MATCHING_LOCKED` | `{ userId }` | Player locks in |
| `FINAL_REVEAL` | `{ storyReveals: StoryReveal[], matchResults: MatchResult[], scores: ScoreResult[] }` | Post-game reveal |

#### Replay Value

Step through the stories' evolution round by round. See every word each editor swapped, how the matching guesses compared to reality, and which editors were sneakiest. The `EDITOR_SWAP` entries are especially fun — compare original vs. replacement and judge how subtle each edit was.

> **Note:** The `GameLog` also includes `gameSettings: GameSettingValues` at the top level (per core.md §12A.11), capturing the exact game settings used for this match.

### 2.16 History Display Configuration

**Detail Component:** `UndercoverEditorHistoryDetail`

Renders the expanded game log as a story review:
- All stories with editor word swaps highlighted
- Round-by-round timeline showing who wrote what
- Editor assignment reveal with matching results
- Keyword reveal and whether each keyword appeared in its story
- Score breakdown per player

**Searchable Fields:**

| Field Key | Label | Extraction |
|---|---|---|
| `sentences` | Story Sentences | All sentences from `sentence_written` actions |
| `keywords` | Keywords | The secret keywords from `final_reveal` |

**Filterable Fields:**

| Field Key | Label | Type | Details |
|---|---|---|---|
| `role` | Your Role | select | `editor`, `writer` |
| `correctGuesses` | Correct Matches | range | Number of correct editor identifications |

**Summary Extractor:**

```typescript
getSummary: (log) => {
  const endAction = log.actions.find(a => a.type === 'final_reveal');
  const correct = endAction?.payload.matchResults?.filter((r: any) => r.isCorrect).length ?? 0;
  const total = endAction?.payload.matchResults?.length ?? 0;
  return `${correct}/${total} editors identified — Parallel writing mystery`;
}
```

**Component Structure:**

```
UndercoverEditorHistoryDetail.tsx
├── StoryView (per story with highlighted edits)
├── RoundTimeline (who wrote each sentence per round)
├── MatchingResults (editor identification accuracy)
├── KeywordReveal (keywords + whether they appeared)
└── Final scores summary
```

### 2.17 MinigameRenderer & Client-Server Wiring

#### MinigameRenderer Registration

The `MinigameRenderer` lazy-loads the Undercover Editor component:

```tsx
const MINIGAME_COMPONENTS = {
  'undercover-editor': lazy(() => import('./minigames/undercover-editor/UndercoverEditorGame')),
  // …other minigames
};
```

#### Client-Side Store Integration

The client store listens for server-pushed actions and updates local state accordingly:

```ts
useEffect(() => {
  const handlers: Record<string, (payload: unknown) => void> = {
    UE_GAME_START:           (p) => dispatch({ type: 'UE_GAME_START', payload: p }),
    UE_ROLE_ASSIGNED:        (p) => dispatch({ type: 'UE_ROLE_ASSIGNED', payload: p }),
    UE_WRITE_START:          (p) => dispatch({ type: 'UE_WRITE_START', payload: p }),
    UE_SENTENCE_CONFIRMED:   (p) => dispatch({ type: 'UE_SENTENCE_CONFIRMED', payload: p }),
    UE_SENTENCE_UNSUBMITTED: (p) => dispatch({ type: 'UE_SENTENCE_UNSUBMITTED', payload: p }),
    UE_SUBMISSION_PROGRESS:  (p) => dispatch({ type: 'UE_SUBMISSION_PROGRESS', payload: p }),
    UE_EDIT_START:           (p) => dispatch({ type: 'UE_EDIT_START', payload: p }),
    UE_EDIT_PROMPT:          (p) => dispatch({ type: 'UE_EDIT_PROMPT', payload: p }),
    UE_EDIT_CONFIRMED:       (p) => dispatch({ type: 'UE_EDIT_CONFIRMED', payload: p }),
    UE_STORIES_UPDATED:      (p) => dispatch({ type: 'UE_STORIES_UPDATED', payload: p }),
    UE_REVIEW_START:         (p) => dispatch({ type: 'UE_REVIEW_START', payload: p }),
    UE_MATCHING_SAVED:       (p) => dispatch({ type: 'UE_MATCHING_SAVED', payload: p }),
    UE_PLAYER_LOCKED_IN:     (p) => dispatch({ type: 'UE_PLAYER_LOCKED_IN', payload: p }),
    UE_REVEAL:               (p) => dispatch({ type: 'UE_REVEAL', payload: p }),
    UE_ERROR:                (p) => dispatch({ type: 'UE_ERROR', payload: p }),
    TIMER_TICK:              (p) => dispatch({ type: 'TIMER_TICK', payload: p }),
  };
  Object.entries(handlers).forEach(([ev, fn]) => socket.on(ev, fn));
  return () => { Object.keys(handlers).forEach((ev) => socket.off(ev)); };
}, [socket, dispatch]);
```

#### Client-Side Input Dispatch

Players write sentences, editors edit words or skip, and everyone submits matching guesses:

```ts
// Writer submits a sentence for a story
socket.emit('WRITE_SENTENCE', { storyId, text });

// Writer retracts a submitted sentence
socket.emit('UNSUBMIT_SENTENCE', { storyId });

// Editor swaps a word (Editor only)
socket.emit('EDIT_WORD', { storyId, sentenceIndex, wordIndex, newWord });

// Editor skips editing (Editor only)
socket.emit('SKIP_EDIT', {});

// Save matching guesses
socket.emit('SUBMIT_MATCHING', { guesses });

// Lock in matching guesses
socket.emit('LOCK_IN_MATCHING', {});
```

#### Server-Side Handler Registration

The server registers the game handler at startup:

```ts
import { UndercoverEditorGame } from './minigames/undercover-editor/UndercoverEditorGame';

MINIGAME_SERVER_REGISTRY.set('undercover-editor', UndercoverEditorGame);
```

> **Note:** All server broadcasts use `this.broadcastGameAction()` (the `BaseMinigame` wrapper), not raw `context.broadcastToLobby`.

#### Sound Effect Integration

| Event | Sound | Notes |
|---|---|---|
| Game start | `swoosh` | Intro transition |
| Role assigned | `chime` | Role reveal |
| Write start | `chime` | Writing phase begins |
| Sentence confirmed | `click` | Confirms submission |
| Edit prompt | `chime` | Editor's turn to edit |
| Edit confirmed | `click` | Confirms edit or skip |
| Review start | `swoosh` | Review phase begins |
| Player locked in | `click` | Confirms lock-in |
| Reveal | `victoryFanfare` | Editor identities and edits unveiled |
| Countdown (≤3s) | `countdownBeep` | Final seconds of timed phases |

#### Spectator Rendering

Spectators have an omniscient view — they see all editor assignments, keywords, edits as they happen, and submission progress. The component checks `privateState.isSpectator` and shows full info with `RoleBadge` indicators.

---


## 3. Minimalist Masterpiece

### 3.1 Overview

| Field | Value |
|---|---|
| **ID** | `minimalist-masterpiece` |
| **Display Name** | Minimalist Masterpiece |
| **Category** | `creative` |
| **Icon** | `brush` (Lucide) |
| **Min Players** | 3 |
| **Max Players** | 12 |
| **Estimated Duration** | 180 seconds |
| **Supports Teams** | No |
| **Join-in-Progress** | `spectate_only` |
| **Tags** | `['creative', 'drawing', 'auction', 'competitive']` |

### 3.2 Game Concept

Restricted drawing followed by peer valuation. All players receive the same drawing prompt but are limited to **exactly 5 strokes**. After drawing, an **Auction Phase** follows where players use fake currency to bid on the pieces they think are the best. The artist whose work fetches the highest total "Market Value" wins.

### 3.3 Detailed Mechanics

#### 3.3.1 Game Flow

| Phase | Duration | Description |
|---|---|---|
| Prompt Reveal | 3s | Drawing prompt appears |
| Drawing Phase | 60s | Players draw with 5 strokes |
| Gallery Walk | 15s | View all drawings side by side |
| Auction Phase | 60s | Bid on other players' drawings |
| Results | 10s | Show market values, winner |

**Total game time:** ~148s ≈ 2.5 minutes.

#### 3.3.2 Drawing Prompt

The server selects a prompt from `data/rmhbox/minimalist-masterpiece/prompts.json`:

```typescript
interface DrawingPrompt {
  id: string;
  text: string;                  // e.g., "A house on a hill"
  category: string;              // e.g., "Landscape", "Animal", "Object"
  difficulty: 'easy' | 'medium' | 'hard';
}
```

All players receive the **same prompt** for fair comparison.

#### 3.3.3 Drawing Constraints

- **Exactly 5 strokes.** A stroke is a continuous path from pen-down to pen-up (or finger-down to finger-up on mobile).
- Players can undo a stroke (replaces it, doesn't add a new one — total stays ≤ 5).
- **Canvas size:** 400×400 logical pixels (scaled for display). Coordinate system is 0–400 on both axes.
- **Stroke data:** Each stroke is represented as a polyline with sampled points.
- **Color:** Players can choose from `MM_COLOR_PALETTE` (8 predefined colors). Default: black.
- **Stroke width:** Fixed at `MM_STROKE_WIDTH` (default: 4px). No variation — keeps it minimalist.
- **No fill, no text, no shapes — freehand strokes only.**

```typescript
interface Stroke {
  id: string;                    // unique stroke identifier
  points: Point[];               // sampled points along the stroke
  color: string;                 // hex color from palette
  width: number;                 // stroke width in px
  timestamp: number;             // when the stroke was completed
}

interface Point {
  x: number;                     // 0–400
  y: number;                     // 0–400
  pressure: number;              // 0–1 (from pressure-sensitive input; 1 if unavailable)
}
```

**Anti-bot validation:**
- Each stroke must have at least `MM_MIN_POINTS_PER_STROKE` (default: 5) points.
- Time between first and last point of a stroke must be ≥ `MM_MIN_STROKE_DURATION` (default: 100ms).
- Maximum points per stroke: `MM_MAX_POINTS_PER_STROKE` (default: 500, to prevent DoS).

#### 3.3.4 Drawing Submission

Players' strokes are buffered client-side and submitted as a batch when:
1. All 5 strokes are completed, OR
2. The timer expires (whatever strokes exist are submitted).

The client sends `SUBMIT_DRAWING` with the full stroke data. The server validates and stores it.

Players who disconnect or don't submit anything have an empty drawing (0 strokes). They are still entered into the auction but are unlikely to receive bids.

#### 3.3.5 Gallery Walk

All drawings are displayed in a scrollable gallery. Each drawing is attributed to an anonymous label ("Artist 1," "Artist 2," etc.) — NOT player names. The mapping is randomized.

Players browse the gallery to decide where to bid. On mobile, drawings are shown one at a time in a swipeable carousel.

#### 3.3.6 Auction Phase

Each player receives `MM_STARTING_CURRENCY` (default: **1000 coins**) of fake auction currency.

**Bidding rules:**
- Players can bid on **any drawing except their own.** Self-bidding is impossible (the server knows the mapping).
- A player can distribute their coins across multiple drawings (partial bids).
- Bids are placed in increments of `MM_BID_INCREMENT` (default: **50 coins**).
- Players can increase their bid on a drawing multiple times (additive).
- Players can retract a bid (get coins back) and reallocate.
- **Bids are visible in real-time** to all players. Each drawing shows its current total bid value. This creates competitive bidding dynamics.
- When the timer expires, all bids are finalized.

**Bid action:**

```typescript
interface BidAction {
  drawingId: string;             // anonymous drawing identifier
  amount: number;                // positive = add bid, negative = retract (limited to what you've already bid)
}
```

#### 3.3.7 Scoring

After the auction:

1. **Market Value** = total coins bid on a drawing by ALL other players.
2. Artist ranking is by Market Value (descending).
3. Score conversion:
   - Rank 1: `MM_RANK_1` (default: **500**)
   - Rank 2: `MM_RANK_2` (default: **350**)
   - Rank 3: `MM_RANK_3` (default: **250**)
   - Remaining: `MM_PARTICIPATION` (default: **100**)
4. **Investment bonus:** Players who bid on the highest-valued drawing (correct market prediction) receive `MM_INVESTMENT_BONUS` (default: **50** bonus points) proportional to how much they invested as a fraction of the drawing's total value.

   Formula: `investmentBonus = floor(MM_INVESTMENT_BONUS * (playerBid / totalBid))`

### 3.4 Server-Side State Schema

```typescript
interface MinimalistMasterpieceState {
  prompt: DrawingPrompt;
  phase: MMPhase;
  
  // Drawing data
  drawings: Map<string, PlayerDrawing>;          // keyed by anonymous drawingId
  drawingIdToUserId: Map<string, string>;         // reverse mapping (server-only)
  userIdToDrawingId: Map<string, string>;         // forward mapping (server-only)
  
  // Auction data
  playerCurrencies: Map<string, number>;          // userId → remaining coins
  bids: Map<string, DrawingBids>;                 // drawingId → all bids on it
  
  // Results
  marketValues: Map<string, number>;              // drawingId → total bid value
  rankings: MMRanking[] | null;
  
  // Timer
  phaseStartedAt: number;
  phaseEndsAt: number;
}

type MMPhase = 'PROMPT_REVEAL' | 'DRAWING' | 'GALLERY' | 'AUCTION' | 'RESULTS';

interface PlayerDrawing {
  drawingId: string;                              // anonymous identifier
  strokes: Stroke[];
  submittedAt: number | null;                     // null if not yet submitted
  strokeCount: number;
}

interface DrawingBids {
  drawingId: string;
  totalValue: number;
  bidders: Map<string, number>;                   // userId → amount they bid
}

interface MMRanking {
  drawingId: string;
  artistUserId: string;
  artistUserName: string;
  marketValue: number;
  rank: number;
  points: number;
  strokes: Stroke[];                              // included for results display
}
```

### 3.5 WebSocket Event Map

#### Client → Server

| Action | Payload | Description |
|---|---|---|
| `SUBMIT_DRAWING` | `{ strokes: Stroke[] }` | Submit completed drawing (max 5 strokes) |
| `PLACE_BID` | `{ drawingId: string, amount: number }` | Bid on a drawing (positive = add, negative = retract) |

**Zod schemas:**

```typescript
const StrokeSchema = z.object({
  id: z.string().min(1).max(36),
  points: z.array(z.object({
    x: z.number().min(0).max(400),
    y: z.number().min(0).max(400),
    pressure: z.number().min(0).max(1),
  })).min(5).max(500),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  width: z.number().positive(),
  timestamp: z.number(),
});

const SubmitDrawingSchema = z.object({
  strokes: z.array(StrokeSchema).max(5),
});

const PlaceBidSchema = z.object({
  drawingId: z.string().min(1).max(36),
  amount: z.number().int().multipleOf(50),  // must be in increments of 50
});
```

#### Server → Client (Game Actions)

| Action Type | Payload | Sent To | Description |
|---|---|---|---|
| `MM_PROMPT` | `{ prompt: DrawingPrompt, drawingDurationSeconds: number, maxStrokes: number, colorPalette: string[] }` | All (lobby) | Prompt revealed, drawing begins |
| `MM_DRAWING_SUBMITTED` | `{ userId: string }` | All (lobby) | A player finished their drawing |
| `MM_GALLERY` | `{ drawings: GalleryDrawing[], galleryDurationSeconds: number }` | All (lobby) | Gallery walk begins |
| `MM_AUCTION_START` | `{ drawings: AuctionDrawing[], startingCurrency: number, bidIncrement: number, auctionDurationSeconds: number }` | All (lobby) | Auction begins |
| `MM_BID_UPDATE` | `{ drawingId: string, totalValue: number, myBid: number, myRemainingCurrency: number }` | Each player individually | Bid state updated |
| `MM_BID_BROADCAST` | `{ drawingId: string, totalValue: number }` | All (lobby) | Public bid total update |
| `MM_RESULTS` | `{ rankings: MMRanking[], investmentBonuses: InvestmentBonus[] }` | All (lobby) | Final results |
| `TIMER_START` | `{ totalDuration: number, timeRemaining: number }` | All (lobby) | Emitted at the start of each timed phase (DRAWING, GALLERY, AUCTION) via `broadcastAction` |
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer (every 1s during all timed phases) via `broadcastAction` |

**Supporting types:**

```typescript
interface GalleryDrawing {
  drawingId: string;
  label: string;               // "Artist 1", "Artist 2", etc.
  strokes: Stroke[];
}

interface AuctionDrawing extends GalleryDrawing {
  currentBidTotal: number;
  myBidAmount: number;         // per-player (0 if not bid yet)
  isMine: boolean;             // true if this is the player's own drawing (can't bid)
}

interface InvestmentBonus {
  userId: string;
  userName: string;
  bonusPoints: number;
  investedIn: string;          // drawingId of the highest-valued drawing they invested in
}
```

### 3.6 Information Masking

| Data | Player View | Spectator View |
|---|---|---|
| Drawing prompt | Visible | Visible |
| Own drawing (during drawing) | Visible | N/A (see all drawings) |
| Other drawings (during drawing) | **HIDDEN** | **VISIBLE** (spectators see all canvases live) |
| Gallery (all drawings, anonymous) | Visible | Visible |
| Which drawing is whose | **HIDDEN** until results | **VISIBLE** |
| Bid totals per drawing | Visible (real-time) | Visible |
| Who bid what | **HIDDEN** (only see totals) | **VISIBLE** (see all individual bids) |
| Own remaining currency | Visible | N/A |

**`getStateForPlayer(userId)` during AUCTION:**

```typescript
interface MMPlayerAuctionState {
  prompt: DrawingPrompt;
  phase: 'AUCTION';
  drawings: AuctionDrawing[];
  myCurrency: number;
  timeRemaining: number;
}
```

### 3.7 Join-in-Progress Logic

**Policy:** `spectate_only`

Drawings are created during the drawing phase. New players can't draw after the fact, so they spectate from the gallery phase onward. They can enjoy the auction as spectators but cannot bid.

### 3.8 Reconnection Behavior

On reconnect:
1. During DRAWING: Player receives their stroke-in-progress (server has any previously submitted strokes; client re-renders).
2. During GALLERY/AUCTION: Player receives the gallery data and their current bid state.
3. Stroke data is preserved server-side even if the client disconnects mid-draw.

### 3.9 Awards

| Award | Condition | Icon |
|---|---|---|
| Minimalist Master | Highest market value (winner) | `crown` |
| Patron of the Arts | Player who spent the most total coins across all drawings | `banknote` |
| One Stroke Wonder | The drawing with the single highest-value stroke (subjective — highest market value with ≤ 3 strokes used) | `star` |
| Undervalued Gem | Drawing that received bids from the most different players | `gem` |
| Shrewd Investor | Player who earned the highest investment bonus | `trending-up` |

### 3.10 NPM Package Suggestions

| Package | Purpose | Notes |
|---|---|---|
| `perfect-freehand` | Convert stroke point data into beautiful SVG path commands with variable width and pressure sensitivity | Lightweight (~5KB gzipped), used by Tldraw. Produces smooth, natural-looking strokes from raw point data. Client-side only — used to render strokes. |
| `canvas-confetti` | Confetti animation on winner reveal | Already in core spec dependencies. |

**Drawing tech approach:**
- Client uses an HTML5 `<canvas>` element for the drawing surface.
- Raw input events (pointer/touch) are sampled into `Point[]` arrays.
- `perfect-freehand` processes the points into smooth outline paths for rendering.
- The raw point data (not the rendered path) is sent to the server for storage and replication.
- Other clients (gallery walk, spectator view) receive the raw points and render them identically using `perfect-freehand`.

### 3.11 Client Component Structure

```
components/rmhbox/minigames/minimalist-masterpiece/
  MinimalistMasterpieceGame.tsx  # Main game component, phase router
  DrawingCanvas.tsx              # 5-stroke canvas with undo, color picker
  ColorPalette.tsx               # 8-color selection strip
  StrokeCounter.tsx              # "3/5 strokes used" indicator
  GalleryCarousel.tsx            # Swipeable gallery of all drawings
  DrawingCard.tsx                # Single drawing display with bid info
  AuctionPanel.tsx               # Bidding interface per drawing
  BidControls.tsx                # +/- bid buttons with currency display
  MarketResultsScreen.tsx        # Final rankings with drawing reveals
```

**Mobile UI layout (DRAWING phase):**

```
┌──────────────────────────────┐
│ Minimalist Masterpiece ⏱ 0:42│
├──────────────────────────────┤
│  "Draw: A house on a hill"   │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │                          │ │
│ │                          │ │
│ │    [Drawing Canvas]      │ │  ← Touch/pointer drawing area
│ │       400×400            │ │
│ │                          │ │
│ │                          │ │
│ └──────────────────────────┘ │
├──────────────────────────────┤
│ 🎨 ⚫⬜🔴🟢🔵🟡🟠🟣    │  ← Color palette
│ Strokes: 3/5   [↩ Undo]     │
└──────────────────────────────┘
```

### 3.12 Constants

```typescript
export const MM_PROMPT_REVEAL = 3;
export const MM_DRAWING_DURATION = 60;
export const MM_GALLERY_DURATION = 15;
export const MM_AUCTION_DURATION = 60;
export const MM_RESULTS_DURATION = 10;

export const MM_MAX_STROKES = 5;
export const MM_CANVAS_SIZE = 400;
export const MM_STROKE_WIDTH = 4;
export const MM_MIN_POINTS_PER_STROKE = 5;
export const MM_MAX_POINTS_PER_STROKE = 500;
export const MM_MIN_STROKE_DURATION = 100;

export const MM_COLOR_PALETTE = [
  '#1a1a2e', // dark navy (near-black)
  '#e0e0f0', // off-white
  '#f87171', // red
  '#4ade80', // green
  '#60a5fa', // blue
  '#fbbf24', // yellow
  '#fb923c', // orange
  '#c084fc', // purple
];

export const MM_STARTING_CURRENCY = 1000;
export const MM_BID_INCREMENT = 50;

export const MM_RANK_1 = 500;
export const MM_RANK_2 = 350;
export const MM_RANK_3 = 250;
export const MM_PARTICIPATION = 100;
export const MM_INVESTMENT_BONUS = 50;
```

### 3.13 Game Settings Schema (§12A)

Host-configurable settings for Minimalist Masterpiece. Defined in `MinigameDefinition.settingsSchema`.
Handlers read values via `this.getSetting(key, CONSTANT_DEFAULT)`.

| Key | Type | Label | Description | Default | Constraints |
|---|---|---|---|---|---|
| `drawingDuration` | `integer` | Drawing Duration (seconds) | Time the artist has to draw a single prompt | `45` | min: 20, max: 90, step: 5 |
| `maxStrokes` | `integer` | Max Strokes | Maximum number of brush strokes allowed per drawing | `15` | min: 5, max: 30, step: 5 |
| `auctionDuration` | `integer` | Auction Duration (seconds) | Time for the bidding phase on each artwork | `30` | min: 15, max: 60, step: 5 |
| `startingCurrency` | `integer` | Starting Currency | Amount of currency each player starts with | `500` | min: 200, max: 1000, step: 50 |
| `bidIncrement` | `integer` | Minimum Bid Increment | Minimum amount above the current bid | `25` | min: 10, max: 100, step: 5 |

**Constant Mapping:**

| Setting Key | Constant Override | Usage |
|---|---|---|
| `drawingDuration` | `MM_DRAWING_DURATION` | `this.getSetting('drawingDuration', MM_DRAWING_DURATION)` |
| `maxStrokes` | `MM_MAX_STROKES` | `this.getSetting('maxStrokes', MM_MAX_STROKES)` |
| `auctionDuration` | `MM_AUCTION_DURATION` | `this.getSetting('auctionDuration', MM_AUCTION_DURATION)` |
| `startingCurrency` | `MM_STARTING_CURRENCY` | `this.getSetting('startingCurrency', MM_STARTING_CURRENCY)` |
| `bidIncrement` | `MM_BID_INCREMENT` | `this.getSetting('bidIncrement', MM_BID_INCREMENT)` |

### 3.14 Game History

**Game History Level:** Full Asset Log

The stroke data and auction bids are the heart of Minimalist Masterpiece — revisiting the 5-stroke gallery and seeing who paid what for which artwork makes this log worth keeping in full.

#### `initialState`

```typescript
interface MMInitialState {
  prompt: string;
  maxStrokes: number;
  canvasSize: { width: number; height: number };
  playerIds: string[];
  startingCurrency: number;
  auctionTimeLimitMs: number;
}
```

#### Actions Logged

| Action Type | Payload | Recorded When |
|---|---|---|
| `DRAWING_STROKE` | `{ userId, strokeIndex, points: Array<{ x: number; y: number }>, color, width }` | Player completes a stroke |
| `DRAWING_UNDO` | `{ userId, strokeIndex }` | Player undoes a stroke |
| `DRAWING_SUBMIT` | `{ userId, totalStrokes }` | Player submits final drawing |
| `GALLERY_VIEW` | `{ drawingOrder: string[] }` | Gallery walk begins |
| `AUCTION_BID` | `{ bidderId, drawingOwnerId, amount, previousBid }` | Player places a bid |
| `AUCTION_CLOSE` | `{ drawingOwnerId, winnerId, finalPrice }` | Bidding closes on a piece |
| `MARKET_VALUES` | `{ rankings: Array<{ userId: string; marketValue: number; rank: number }> }` | Final valuations computed |

#### Replay Value

Browse the gallery of 5-stroke creations for each prompt. The auction history shows who valued which art and how bidding wars played out. Compare the minimalist interpretations side-by-side — the constraint makes every stroke meaningful.

> **Note:** The `GameLog` also includes `gameSettings: GameSettingValues` at the top level (per core.md §12A.11), capturing the exact game settings used for this match.

### 3.15 History Display Configuration

**Detail Component:** `MinimalistMasterpieceHistoryDetail`

Renders the expanded game log as a gallery view:
- Thumbnail previews of each player's drawing (rendered from stroke data)
- Prompt text shown alongside each drawing
- Gallery vote results (who voted for whom)
- Auction results with final bid amounts
- Per-player score breakdown (gallery votes + auction bids)

**Searchable Fields:**

| Field Key | Label | Extraction |
|---|---|---|
| `prompts` | Drawing Prompts | All prompt texts from `drawing_start` actions |

**Filterable Fields:**

| Field Key | Label | Type | Details |
|---|---|---|---|
| `auctionWin` | Won Auction | boolean | Whether user won any auction bids |
| `galleryVotes` | Gallery Votes Received | range | Number of votes user's drawing received |

**Summary Extractor:**

```typescript
getSummary: (log) => {
  const prompt = log.actions.find(a => a.type === 'drawing_start');
  return `Prompt: "${prompt?.payload.prompt ?? 'Unknown'}"`;
}
```

**Component Structure:**

```
MinimalistMasterpieceHistoryDetail.tsx
├── GalleryGrid (drawing thumbnails)
│   ├── DrawingCard (stroke render + prompt)
│   └── VoteBadge (gallery votes count)
├── AuctionResults (bids + winners)
└── Final scores summary
```

### 3.16 MinigameRenderer & Client-Server Wiring

#### MinigameRenderer Registration

The `MinigameRenderer` lazy-loads the Minimalist Masterpiece component:

```tsx
const MINIGAME_COMPONENTS = {
  'minimalist-masterpiece': lazy(() => import('./minigames/minimalist-masterpiece/MinimalistMasterpieceGame')),
  // …other minigames
};
```

#### Client-Side Store Integration

The client store listens for server-pushed actions and updates local state accordingly:

```ts
useEffect(() => {
  const handlers: Record<string, (payload: unknown) => void> = {
    MM_PROMPT:             (p) => dispatch({ type: 'MM_PROMPT', payload: p }),
    MM_DRAWING_SUBMITTED:  (p) => dispatch({ type: 'MM_DRAWING_SUBMITTED', payload: p }),
    MM_GALLERY:            (p) => dispatch({ type: 'MM_GALLERY', payload: p }),
    MM_AUCTION_START:      (p) => dispatch({ type: 'MM_AUCTION_START', payload: p }),
    MM_BID_UPDATE:         (p) => dispatch({ type: 'MM_BID_UPDATE', payload: p }),
    MM_BID_BROADCAST:      (p) => dispatch({ type: 'MM_BID_BROADCAST', payload: p }),
    MM_RESULTS:            (p) => dispatch({ type: 'MM_RESULTS', payload: p }),
    TIMER_TICK:            (p) => dispatch({ type: 'TIMER_TICK', payload: p }),
  };
  Object.entries(handlers).forEach(([ev, fn]) => socket.on(ev, fn));
  return () => { Object.keys(handlers).forEach((ev) => socket.off(ev)); };
}, [socket, dispatch]);
```

#### Client-Side Input Dispatch

Players submit drawings and place bids:

```ts
// Submit a completed drawing
socket.emit('SUBMIT_DRAWING', { strokes });   // strokes: Stroke[]

// Place a bid during the auction
socket.emit('PLACE_BID', { drawingId, amount });
```

#### Server-Side Handler Registration

The server registers the game handler at startup:

```ts
import { MinimalistMasterpieceGame } from './minigames/minimalist-masterpiece/MinimalistMasterpieceGame';

MINIGAME_SERVER_REGISTRY.set('minimalist-masterpiece', MinimalistMasterpieceGame);
```

#### Sound Effect Integration

| Event | Sound | Notes |
|---|---|---|
| Prompt revealed | `goFanfare` | Drawing phase begins |
| Drawing submitted | `click` | Confirms submission |
| Gallery shown | `swoosh` | Gallery walk transition |
| Auction start | `goFanfare` | Bidding phase begins |
| Bid placed | `click` | Confirms the bid |
| Bid broadcast (high value) | `scoreDing` | Highlights a significant bid |
| Results | `victoryFanfare` | Final rankings revealed |

#### Spectator Rendering

During the drawing phase, spectators see all players' canvases live. During the auction, they see all bids. The component checks spectator status and renders a multi-canvas gallery view during the drawing phase.

---

## 4. Emoji Cinema

### 4.1 Overview

| Field | Value |
|---|---|
| **ID** | `emoji-cinema` |
| **Display Name** | Emoji Cinema |
| **Category** | `word` |
| **Icon** | `clapperboard` (Lucide) |
| **Min Players** | 3 |
| **Max Players** | 12 |
| **Estimated Duration** | 180 seconds |
| **Supports Teams** | No (rotating Producer role) |
| **Join-in-Progress** | `join_next_subround` |
| **Tags** | `['word', 'creative', 'speed', 'movies', 'guessing']` |

### 4.2 Game Concept

"Reverse Charades" using only emojis. One player (the **Producer**) receives a movie title and must describe it using a restricted emoji-only keyboard. The other players (**Audience**) race to guess the movie title. The Producer earns points based on how quickly the Audience guesses. Roles rotate so each player gets a turn as Producer.

### 4.3 Detailed Mechanics

#### 4.3.1 Round Structure

The game cycles through each player as the Producer. Total rounds = number of players (each player is Producer once).

| Phase | Duration | Description |
|---|---|---|
| Producer Assignment | 2s | Show who the new Producer is |
| Emoji Construction | 45s | Producer places emojis; Audience guesses |
| Round Results | 5s | Reveal answer, show who guessed first |
| Transition | 1s | Next Producer |

**Total game time:** ~players × 53s. For 6 players: ~318s ≈ 5.3 minutes (consider capping at `EC_MAX_ROUNDS`, default: 6 or player count, whichever is smaller).

#### 4.3.2 Movie Selection

Movies come from a curated database (`data/rmhbox/emoji-cinema/movies.json`):

```typescript
interface MovieEntry {
  id: string;
  title: string;                       // exact title for matching
  titleNormalized: string;             // lowercase, no articles, for fuzzy matching
  alternativeTitles: string[];         // accepted alternate titles
  year: number;
  genre: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  popularity: number;                  // 1-100 (higher = more well-known)
}
```

The server selects movies with:
- Popularity ≥ `EC_MIN_POPULARITY` (default: **40**) so players are likely to know the movie.
- A mix of difficulties across rounds.
- No repeats within the lobby session.

For each round, the Producer is shown the movie title. The Audience never sees it until the answer reveal.

#### 4.3.3 Emoji Keyboard

The Producer's input is restricted to an emoji-only keyboard. No text input.

- The emoji palette contains approximately **200 curated emojis** organized into categories (People, Animals, Nature, Food, Objects, Symbols, Activities, Travel).
- The emoji palette is searchable via a text filter (Producer types a keyword to filter emojis, e.g., typing "fire" shows 🔥).
- The keyboard is identical to the search filter used in many emoji pickers — the Producer does NOT type text that the Audience sees. The Audience only sees emojis.

**Producer's display area:**
- A horizontal "emoji sentence" bar at the top where selected emojis appear in order.
- Maximum `EC_MAX_EMOJIS` (default: **12**) emojis per round.
- Emojis can be reordered via drag-and-drop.
- Emojis can be removed (tap to deselect from the sentence).
- As the Producer adds emojis, they are broadcast **live** to the Audience in real-time (the Audience sees emojis appearing one by one as the Producer selects them).

#### 4.3.4 Guessing

The Audience types text guesses in a standard text input:

- Each guess is submitted by pressing Enter.
- The server validates guesses using **fuzzy matching** (`fuse.js` from core spec) against the movie title and alternative titles.
- Match threshold: `EC_FUZZY_MATCH_THRESHOLD` (default: **0.80**).
- A guess that fuzzy-matches is accepted as correct.
- The server responds to each guess with:
  - ✅ **Correct** — the round ends immediately.
  - 🔥 **Close** — fuzzy score is between `EC_CLOSE_THRESHOLD` (0.60) and `EC_FUZZY_MATCH_THRESHOLD` (0.80). Player sees "Close!!" hint but the round continues.
  - ❌ **Wrong** — no match.
- Maximum guesses per player per round: `EC_MAX_GUESSES_PER_PLAYER` (default: **15**).
- Guesses are case-insensitive and trimmed.
- "The" and "A" articles are stripped for matching purposes.

#### 4.3.5 Scoring

| Who | Score | Condition |
|---|---|---|
| Producer | `EC_PRODUCER_BASE` + `EC_PRODUCER_SPEED_BONUS` × secondsRemaining | Someone guesses correctly |
| Producer | 0 | No one guesses correctly (timeout) |
| First correct guesser | `EC_FIRST_GUESS` (default: **300**) | First to guess correctly |
| Second correct guesser | `EC_SECOND_GUESS` (default: **150**) | Second to guess correctly (if multiple guess on the same tick, server uses submission timestamp) |
| Other correct guessers | `EC_OTHER_GUESS` (default: **75**) | |
| Wrong guessers | 0 | No penalty for wrong guesses |

**Producer scoring defaults:**
- `EC_PRODUCER_BASE` = **100** (guaranteed if someone guesses correctly).
- `EC_PRODUCER_SPEED_BONUS` = **10** points × seconds remaining when the first correct guess arrives.
- Maximum Producer score per round: 100 + 10 × 45 = **550**.

#### 4.3.6 Close Guess Broadcast

When any player submits a "Close" guess, the server broadcasts `EC_CLOSE_GUESS` to all players (including the guesser's name but NOT their guess text). This creates tension, "someone is close!" moments.

After the round ends, all guesses are revealed in the round results.

### 4.4 Server-Side State Schema

```typescript
interface EmojiCinemaState {
  rounds: ECRoundData[];                            // pre-selected movies for all rounds
  currentRound: number;                              // 0-indexed
  totalRounds: number;
  producerOrder: string[];                           // userIds in Producer rotation order
  phase: ECPhase;
  
  // Current round state
  currentProducerUserId: string;
  currentMovie: MovieEntry;
  emojiSequence: string[];                           // emojis placed by Producer (live-updated)
  
  // Guesses
  guesses: Map<string, ECPlayerGuesses>;             // userId → their guesses
  correctGuessers: CorrectGuesser[];                 // ordered by time
  closeGuessCount: number;
  
  // Cumulative
  playerScores: Map<string, number>;
  
  // Timer
  phaseStartedAt: number;
  phaseEndsAt: number;
}

type ECPhase = 'PRODUCER_ASSIGNMENT' | 'EMOJI_CONSTRUCTION' | 'ROUND_RESULTS' | 'TRANSITION';

interface ECRoundData {
  movie: MovieEntry;
  producerUserId: string;
}

interface ECPlayerGuesses {
  userId: string;
  guesses: Array<{
    text: string;
    result: 'correct' | 'close' | 'wrong';
    timestamp: number;
  }>;
}

interface CorrectGuesser {
  userId: string;
  userName: string;
  guessText: string;
  timestamp: number;
  rank: number;              // 1 = first, 2 = second, etc.
}
```

### 4.5 WebSocket Event Map

#### Client → Server

| Action | Payload | Who Can Send | Description |
|---|---|---|---|
| `ADD_EMOJI` | `{ emoji: string, position: number }` | Producer only | Add an emoji at a position in the sequence |
| `REMOVE_EMOJI` | `{ position: number }` | Producer only | Remove an emoji from the sequence |
| `REORDER_EMOJI` | `{ fromIndex: number, toIndex: number }` | Producer only | Drag-reorder emojis |
| `SUBMIT_GUESS` | `{ guess: string }` | Audience only | Submit a movie title guess |

**Zod schemas:**

```typescript
const AddEmojiSchema = z.object({
  emoji: z.string().min(1).max(10),      // emoji can be multi-codepoint
  position: z.number().int().min(0).max(11),  // max 12 emojis, 0-indexed
});

const RemoveEmojiSchema = z.object({
  position: z.number().int().min(0).max(11),
});

const ReorderEmojiSchema = z.object({
  fromIndex: z.number().int().min(0).max(11),
  toIndex: z.number().int().min(0).max(11),
});

const SubmitGuessSchema = z.object({
  guess: z.string().min(1).max(200).transform(s => s.trim()),
});
```

#### Server → Client (Game Actions)

| Action Type | Payload | Sent To | Description |
|---|---|---|---|
| `EC_PRODUCER_ASSIGNED` | `{ round: number, producerUserId: string, producerName: string }` | All (lobby) | New Producer announced |
| `EC_MOVIE_ASSIGNED` | `{ movie: MovieEntry }` | Producer only | Secret movie title revealed to Producer |
| `EC_EMOJI_UPDATED` | `{ emojiSequence: string[] }` | All (lobby) | Emoji sequence changed (live) |
| `EC_GUESS_RESULT` | `{ guess: string, result: 'correct' \| 'close' \| 'wrong' }` | Guessing player only | Guess feedback |
| `EC_CLOSE_GUESS` | `{ userId: string, userName: string }` | All (lobby) | Someone's guess was close (not the guess text) |
| `EC_CORRECT_GUESS` | `{ userId: string, userName: string, rank: number }` | All (lobby) | Someone guessed correctly |
| `EC_ROUND_OVER` | `{ movieTitle: string, emojiSequence: string[], correctGuessers: CorrectGuesser[], producerScore: number, roundScores: Array<{ userId: string, userName: string, score: number }> }` | All (lobby) | Round ended (correct guess or timeout) |
| `EC_GUESS_COUNT` | `{ userId: string, count: number }` | All (lobby) | How many guesses a player has made (not the content) |
| `TIMER_START` | `{ totalDuration: number, timeRemaining: number }` | All (lobby) | Emitted at the start of each timed phase (CONSTRUCTION) via `broadcastAction` |
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer (every 1s during all timed phases) via `broadcastAction` |
| `MINIGAME_ROUND` | `{ current: number, total: number }` | All (lobby) | Sub-round counter update (e.g. "Round 2/6") via `broadcastAction` |

### 4.6 Information Masking

| Data | Producer View | Audience View | Spectator View |
|---|---|---|---|
| Movie title | **VISIBLE** | **HIDDEN** until round ends | **VISIBLE** |
| Emoji sequence (live) | Visible (they're building it) | Visible (appears live) | Visible |
| Own guesses | N/A (can't guess) | Visible | N/A |
| Other players' guess text | N/A | **HIDDEN** | **VISIBLE** |
| Close/correct notifications | Visible (notification) | Visible (notification) | Visible |
| Guess counts per player | Visible | Visible | Visible |

**`getStateForPlayer(userId)` when userId is the Producer:**

```typescript
interface ECProducerState {
  phase: ECPhase;
  currentRound: number;
  totalRounds: number;
  movieTitle: string;                    // the secret!
  movieYear: number;
  emojiSequence: string[];
  timeRemaining: number;
  correctGuessers: CorrectGuesser[];
  closeGuessCount: number;
  guessCountsPerPlayer: Array<{ userId: string; userName: string; count: number }>;
  scores: Array<{ userId: string; userName: string; totalScore: number }>;
}
```

**`getStateForPlayer(userId)` when userId is in the Audience:**

```typescript
interface ECAudienceState {
  phase: ECPhase;
  currentRound: number;
  totalRounds: number;
  producerUserId: string;
  producerName: string;
  emojiSequence: string[];
  timeRemaining: number;
  myGuesses: Array<{ text: string; result: 'correct' | 'close' | 'wrong' }>;
  correctGuessers: CorrectGuesser[];
  closeGuessCount: number;
  guessCountsPerPlayer: Array<{ userId: string; userName: string; count: number }>;
  scores: Array<{ userId: string; userName: string; totalScore: number }>;
}
```

**`getStateForSpectator()` returns:**  
Full state including movie title, all guesses from all players, and the emoji sequence. Spectators get the "omniscient director" experience.

### 4.7 Join-in-Progress Logic

**Policy:** `join_next_subround`

Players who join mid-game become spectators until the current round ends. At the start of the next round, they join the Audience pool. They do NOT get a Producer turn unless the game hasn't rotated to them yet and additional rounds remain. If all original players have been Producer, late joiners just participate as Audience for remaining rounds.

### 4.8 Reconnection Behavior

On reconnect:
1. Producer receives the movie title, current emoji sequence, and guess status.
2. Audience receives the emoji sequence, their own guesses so far, and timer.
3. All state is preserved server-side; the client just needs to re-render.

### 4.9 Player Disconnect Mid-Game

- **If the Producer disconnects:** Wait `EC_PRODUCER_DISCONNECT_WAIT` (default: **10s**). If they don't reconnect, the round is skipped (no points awarded for that round). Move to the next round.
- **If an Audience member disconnects:** No impact on the round. They miss their chance to guess.

### 4.10 Awards

| Award | Condition | Icon |
|---|---|---|
| Movie Buff | Most correct guesses across all rounds | `film` |
| Emoji Picasso | Producer whose round was guessed the fastest (best emoji description) | `palette` |
| Stumper | Producer whose movie was never guessed | `lock` |
| Speed Guesser | Fastest correct guess (earliest in any round) | `zap` |
| Close but No Cigar | Player with the most "Close" guesses that never converted to correct | `cigarette` |

### 4.11 NPM Package Suggestions

| Package | Purpose | Notes |
|---|---|---|
| `fuse.js` | Fuzzy string matching for movie title guesses | Already in core spec. Used with threshold 0.80 for correct, 0.60–0.80 for "close." |
| `emoji-mart` | Feature-rich emoji picker component with search, categories, and skin tone support | Well-maintained, React-friendly, used by Slack. ~30KB gzipped. Client-side only. The Producer's emoji keyboard should use this. |

**Alternative to `emoji-mart`:** If bundle size is a concern, use a minimal custom emoji picker with the curated 200-emoji subset. The emojis can be stored as a static JSON array with category labels, and a simple text filter replaces the search functionality. This avoids the full `emoji-mart` bundle.

### 4.12 Client Component Structure

```
components/rmhbox/minigames/emoji-cinema/
  EmojiCinemaGame.tsx            # Main game component, phase router
  EmojiKeyboard.tsx              # Emoji picker (searchable, categorized)
  EmojiSentence.tsx              # Display bar for the emoji sequence (draggable)
  GuessInput.tsx                 # Text input for Audience guesses
  GuessHistory.tsx               # Scrollable list of own guesses with result indicators
  ProducerView.tsx               # Producer's full interface (movie + emoji builder)
  AudienceView.tsx               # Audience's interface (emoji display + guess input)
  RoundResults.tsx               # Movie reveal + scores
  MovieReveal.tsx                # Animated movie title reveal with emoji recap
```

**Mobile UI layout (EMOJI_CONSTRUCTION phase, Audience view):**

```
┌──────────────────────────────┐
│ Emoji Cinema   Round 3/6     │
├──────────────────────────────┤
│  🎬 Alice is the Producer    │
├──────────────────────────────┤
│                              │
│   🦁 👑 🌍 🎵               │  ← Live emoji sequence (grows as Producer adds)
│                              │
├──────────────────────────────┤
│ Your guesses:                │
│  "The Lion King" ✅          │  ← Guess history
│  "Simba" ❌                  │
│  "Madagascar" ❌             │
├──────────────────────────────┤
│ ┌────────────────────┬─────┐ │
│ │ Guess the movie... │  →  │ │  ← Text input
│ └────────────────────┴─────┘ │
│ ⏱ 0:28 │ Score: 450         │
└──────────────────────────────┘
```

**Mobile UI layout (EMOJI_CONSTRUCTION phase, Producer view):**

```
┌──────────────────────────────┐
│ Emoji Cinema   ⏱ 0:35       │
├──────────────────────────────┤
│  🎥 Your Movie:              │
│  "The Lion King" (1994)      │
├──────────────────────────────┤
│  Your emojis:                │
│  🦁 👑 🌍 🎵  [max 12]      │  ← Draggable, tap to remove
├──────────────────────────────┤
│ 🔍 Search emojis...          │
│ ┌──────────────────────────┐ │
│ │ 🦁 🐯 🐱 🐺 🦊 🐻      │ │  ← Emoji grid (scrollable)
│ │ 🐼 🐨 🐵 🐸 🐔 🐧      │ │
│ │ 🐠 🐳 🦈 🐙 🐛 🦋      │ │
│ └──────────────────────────┘ │
├──────────────────────────────┤
│ 2 guesses so far │ 0 close   │
└──────────────────────────────┘
```

### 4.13 Constants

```typescript
export const EC_MAX_ROUNDS = 6;                  // cap even if more players
export const EC_PRODUCER_ASSIGNMENT = 2;
export const EC_ROUND_DURATION = 45;
export const EC_ROUND_RESULTS = 5;
export const EC_TRANSITION = 1;

export const EC_MAX_EMOJIS = 12;
export const EC_MAX_GUESSES_PER_PLAYER = 15;
export const EC_MAX_GUESS_LENGTH = 200;

export const EC_FUZZY_MATCH_THRESHOLD = 0.80;    // correct guess
export const EC_CLOSE_THRESHOLD = 0.60;           // "close" hint
export const EC_MIN_POPULARITY = 40;

export const EC_PRODUCER_BASE = 100;
export const EC_PRODUCER_SPEED_BONUS = 10;
export const EC_FIRST_GUESS = 300;
export const EC_SECOND_GUESS = 150;
export const EC_OTHER_GUESS = 75;

export const EC_PRODUCER_DISCONNECT_WAIT = 10;
export const EC_EMOJI_PALETTE_SIZE = 200;
```

### 4.14 Game Settings Schema (§12A)

Host-configurable settings for Emoji Cinema. Defined in `MinigameDefinition.settingsSchema`.
Handlers read values via `this.getSetting(key, CONSTANT_DEFAULT)`.

| Key | Type | Label | Description | Default | Constraints |
|---|---|---|---|---|---|
| `maxRounds` | `integer` | Number of Rounds | Number of emoji-encoding rounds to play | `4` | min: 2, max: 6, step: 1 |
| `roundDuration` | `integer` | Encoding Duration (seconds) | Time the encoder has to build their emoji sequence | `45` | min: 20, max: 90, step: 5 |
| `maxEmojis` | `integer` | Max Emojis | Maximum number of emojis the encoder can use | `5` | min: 3, max: 8, step: 1 |
| `maxGuessesPerPlayer` | `integer` | Guesses Per Player | Maximum guesses each player can submit per round | `3` | min: 1, max: 5, step: 1 |

**Constant Mapping:**

| Setting Key | Constant Override | Usage |
|---|---|---|
| `maxRounds` | `EC_MAX_ROUNDS` | `this.getSetting('maxRounds', EC_MAX_ROUNDS)` |
| `roundDuration` | `EC_ROUND_DURATION` | `this.getSetting('roundDuration', EC_ROUND_DURATION)` |
| `maxEmojis` | `EC_MAX_EMOJIS` | `this.getSetting('maxEmojis', EC_MAX_EMOJIS)` |
| `maxGuessesPerPlayer` | `EC_MAX_GUESSES_PER_PLAYER` | `this.getSetting('maxGuessesPerPlayer', EC_MAX_GUESSES_PER_PLAYER)` |

### 4.15 Anti-Cheat Notes

- The movie title is ONLY sent to the Producer's socket. Audience players never receive it until `EC_ROUND_OVER`.
- Guess text from other players is never sent to anyone during the guessing phase (only the count and close/correct notifications without the actual text).
- The emoji sequence is broadcast live — no way for the Producer to communicate text, only emojis.
- The curated emoji palette prevents the Producer from using flag emojis or letter emojis (🅰️ 🅱️ etc.) to spell out the title. These are excluded from the palette.
- Maximum `EC_MAX_EMOJIS` prevents emoji spam.
- Maximum `EC_MAX_GUESSES_PER_PLAYER` prevents brute-force guessing.

### 4.16 Game History

**Game History Level:** Summary Log

The emoji sequences and guess highlights are the memorable moments — full keystroke logs of every guess attempt aren't needed. The summary captures each round's composition and the key guessing moments.

#### `initialState`

```typescript
interface ECInitialState {
  totalRounds: number;
  maxEmojis: number;
  maxGuessesPerPlayer: number;
  playerIds: string[];
  moviePool: string[];              // candidate titles for this session
}
```

#### Actions Logged

| Action Type | Payload | Recorded When |
|---|---|---|
| `ROUND_START` | `{ roundNumber, producerUserId, movieTitle }` | Round begins (title logged server-side) |
| `EMOJI_PLACED` | `{ producerUserId, emoji, position, currentSequence: string[] }` | Producer places an emoji |
| `CLOSE_GUESS` | `{ guesserId, guessText, similarity }` | A guess is flagged as close |
| `CORRECT_GUESS` | `{ guesserId, guessText, elapsedMs }` | Someone guesses correctly |
| `ROUND_TIMEOUT` | `{ finalSequence: string[], totalGuesses }` | Round ends with no correct guess |
| `ROUND_RESULT` | `{ movieTitle, emojiSequence: string[], correctGuesserId, producerScore, guesserScores }` | Round scoring summary |

#### Replay Value

See each round's emoji composition alongside the movie title and marvel at how creative (or cryptic) the Producer was. The close-guess log is comedy gold — near-misses and creative interpretations are half the fun.

> **Note:** The `GameLog` also includes `gameSettings: GameSettingValues` at the top level (per core.md §12A.11), capturing the exact game settings used for this match.

### 4.17 History Display Configuration

**Detail Component:** `EmojiCinemaHistoryDetail`

Renders the expanded game log as a round-by-round review:
- Emoji sequence displayed with the target movie title
- Guessing timeline showing each player's guesses and correctness
- Difficulty rating per round
- Creator identity for each emoji sequence
- Score breakdown per round

**Searchable Fields:**

| Field Key | Label | Extraction |
|---|---|---|
| `movieTitles` | Movie Titles | All movie titles from `round_start` actions |
| `guesses` | Guesses | All player guesses from `guess` actions |
| `emojiSequences` | Emoji Sequences | Emoji strings from `emoji_reveal` actions |

**Filterable Fields:**

| Field Key | Label | Type | Details |
|---|---|---|---|
| `wasCreator` | Was Emoji Creator | boolean | Whether user created the emoji sequence |
| `guessedCorrectly` | Guessed Correctly | boolean | Whether user guessed the movie |
| `difficulty` | Difficulty | select | `easy`, `medium`, `hard` |

**Summary Extractor:**

```typescript
getSummary: (log) => {
  const rounds = log.actions.filter(a => a.type === 'round_start');
  return `${rounds.length} rounds — Movie emoji challenge`;
}
```

**Component Structure:**

```
EmojiCinemaHistoryDetail.tsx
├── RoundCard (per round)
│   ├── EmojiSequence (the emoji clue)
│   ├── MovieTitle (correct answer reveal)
│   ├── GuessTimeline (player guesses + timing)
│   └── CreatorBadge (who made the sequence)
└── Final scores summary
```

### 4.18 MinigameRenderer & Client-Server Wiring

#### MinigameRenderer Registration

The `MinigameRenderer` lazy-loads the Emoji Cinema component:

```tsx
const MINIGAME_COMPONENTS = {
  'emoji-cinema': lazy(() => import('./minigames/emoji-cinema/EmojiCinemaGame')),
  // …other minigames
};
```

#### Client-Side Store Integration

The client store listens for server-pushed actions and updates local state accordingly:

```ts
useEffect(() => {
  const handlers: Record<string, (payload: unknown) => void> = {
    EC_PRODUCER_ASSIGNED: (p) => dispatch({ type: 'EC_PRODUCER_ASSIGNED', payload: p }),
    EC_MOVIE_ASSIGNED:    (p) => dispatch({ type: 'EC_MOVIE_ASSIGNED', payload: p }),
    EC_EMOJI_UPDATED:     (p) => dispatch({ type: 'EC_EMOJI_UPDATED', payload: p }),
    EC_GUESS_RESULT:      (p) => dispatch({ type: 'EC_GUESS_RESULT', payload: p }),
    EC_CLOSE_GUESS:       (p) => dispatch({ type: 'EC_CLOSE_GUESS', payload: p }),
    EC_CORRECT_GUESS:     (p) => dispatch({ type: 'EC_CORRECT_GUESS', payload: p }),
    EC_ROUND_OVER:        (p) => dispatch({ type: 'EC_ROUND_OVER', payload: p }),
    EC_GUESS_COUNT:       (p) => dispatch({ type: 'EC_GUESS_COUNT', payload: p }),
    TIMER_TICK:           (p) => dispatch({ type: 'TIMER_TICK', payload: p }),
  };
  Object.entries(handlers).forEach(([ev, fn]) => socket.on(ev, fn));
  return () => { Object.keys(handlers).forEach((ev) => socket.off(ev)); };
}, [socket, dispatch]);
```

#### Client-Side Input Dispatch

The Producer manages the emoji sequence while the Audience submits guesses:

```ts
// Producer adds an emoji (Producer only)
socket.emit('ADD_EMOJI', { emoji, position });

// Producer removes an emoji (Producer only)
socket.emit('REMOVE_EMOJI', { position });

// Producer reorders emojis (Producer only)
socket.emit('REORDER_EMOJI', { fromIndex, toIndex });

// Audience member submits a guess (Audience only)
socket.emit('SUBMIT_GUESS', { guess });
```

#### Server-Side Handler Registration

The server registers the game handler at startup:

```ts
import { EmojiCinemaGame } from './minigames/emoji-cinema/EmojiCinemaGame';

MINIGAME_SERVER_REGISTRY.set('emoji-cinema', EmojiCinemaGame);
```

#### Sound Effect Integration

| Event | Sound | Notes |
|---|---|---|
| Producer assigned | `swoosh` | New round begins |
| Emoji updated | `click` | Emoji placed or removed |
| Close guess | `chime` | A guess was close but not correct |
| Correct guess | `scoreDing` | Someone guessed the movie |
| Round over | `victoryFanfare` | Round scoring summary |
| Timer warning | `countdownBeep` | Final seconds of the timer |

#### Spectator Rendering

Spectators have an omniscient view — they see the movie title, all guesses from all players, and the emoji composition in real-time. The component renders a split view showing the title, the emoji sequence, and a scrolling guess feed.

---

*End of Minigame Specifications Part 2*
