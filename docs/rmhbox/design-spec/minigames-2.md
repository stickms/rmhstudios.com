# RMHbox — Minigame Design Specifications (Part 2)

> **Version:** 1.0  
> **Last Updated:** 2026-02-22  
> **Status:** Draft  
> **Games Covered:** Fact or Friction, Undercover Editor, Minimalist Masterpiece, Emoji Cinema  
> **Parent Document:** [design-spec-core.md](./design-spec-core.md)

---

## Table of Contents

1. [Fact or Friction](#1-fact-or-friction)
2. [Undercover Editor](#2-undercover-editor)
3. [Minimalist Masterpiece](#3-minimalist-masterpiece)
4. [Emoji Cinema](#4-emoji-cinema)

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

The game consists of **8 questions** (configurable: `FOF_TOTAL_QUESTIONS`). Each question is an independent sub-round.

| Phase | Duration | Description |
|---|---|---|
| Question Reveal | 2s | Question text animates in |
| Answer Phase | 15s | Point Pot ticks down; players answer or pass |
| Answer Reveal | 4s | Correct answer shown, scores update |
| Brief Pause | 1s | Transition to next question |

**Total game time:** ~8 × 22s = ~176s ≈ 3 minutes.

#### 1.3.2 Question Pool

Questions are stored in `/public/data/rmhbox/fact-or-friction/questions.json`. Each question has:

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

1. Starts at `FOF_POT_START_VALUE` (default: **1000**).
2. Decreases by `FOF_POT_TICK_VALUE` (default: **50**) every `FOF_POT_TICK_INTERVAL_MS` (default: **500ms**, i.e., 2 ticks/second).
3. Minimum pot value: `FOF_POT_MIN_VALUE` (default: **100**). The pot never drops below this.
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

**Difficulty bonus:** Hard questions multiply the pot value by `FOF_HARD_MULTIPLIER` (default: **1.5**). Medium questions use `FOF_MEDIUM_MULTIPLIER` (default: **1.0**, no change). Easy questions use `FOF_EASY_MULTIPLIER` (default: **0.8**).

The effective pot value = `floor(basePotValue × difficultyMultiplier)`.

#### 1.3.6 Score Floor

A player's total score cannot drop below `FOF_SCORE_FLOOR` (default: **-500**). This prevents a death spiral where a player is so far behind they can't recover and just stops engaging.

### 1.4 Server-Side State Schema

```typescript
interface FactOrFrictionState {
  questions: TriviaQuestion[];                    // all questions for this game (pre-selected)
  currentQuestionIndex: number;                   // 0-indexed
  totalQuestions: number;
  phase: FOFPhase;
  
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

type FOFPhase = 'QUESTION_REVEAL' | 'ANSWER' | 'ANSWER_REVEAL' | 'PAUSE';

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
| `FOF_QUESTION` | `{ questionIndex: number, question: string, options: string[], category: string, difficulty: string, potStartValue: number, answerDurationSeconds: number }` | All (lobby) | New question revealed |
| `FOF_POT_TICK` | `{ potValue: number }` | All (lobby) | Pot value update (every 500ms) |
| `FOF_ANSWER_LOCKED` | `{ potValueAtLock: number }` | Answering player only | Confirm answer locked at this pot value |
| `FOF_PLAYER_ANSWERED` | `{ userId: string, userName: string }` | All (lobby) | Notification that a player has answered (not WHAT they answered) |
| `FOF_ANSWER_REVEAL` | `{ correctIndex: number, correctAnswer: string, playerResults: FOFPlayerQuestionResult[] }` | All (lobby) | Correct answer + everyone's results |
| `FOF_SCORE_UPDATE` | `{ scores: Array<{ userId: string, userName: string, totalScore: number, scoreChange: number }> }` | All (lobby) | Updated leaderboard after each question |
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer (1s intervals during ANSWER phase) |

**`FOFPlayerQuestionResult`:**

```typescript
interface FOFPlayerQuestionResult {
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
interface FOFPlayerState {
  currentQuestionIndex: number;
  totalQuestions: number;
  question: string;
  options: string[];
  category: string;
  difficulty: string;
  phase: FOFPhase;
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
export const FOF_TOTAL_QUESTIONS = 8;
export const FOF_QUESTION_REVEAL_SECONDS = 2;
export const FOF_ANSWER_DURATION_SECONDS = 15;
export const FOF_ANSWER_REVEAL_SECONDS = 4;
export const FOF_PAUSE_SECONDS = 1;

export const FOF_POT_START_VALUE = 1000;
export const FOF_POT_TICK_VALUE = 50;
export const FOF_POT_TICK_INTERVAL_MS = 500;
export const FOF_POT_MIN_VALUE = 100;

export const FOF_EASY_MULTIPLIER = 0.8;
export const FOF_MEDIUM_MULTIPLIER = 1.0;
export const FOF_HARD_MULTIPLIER = 1.5;

export const FOF_SCORE_FLOOR = -500;

export const FOF_QUESTION_DISTRIBUTION = { easy: 3, medium: 3, hard: 2 };
```

### 1.13 Anti-Cheat Notes

- The correct answer index is NEVER sent to clients until the `ANSWER_REVEAL` phase.
- The pot value is server-authoritative. The client displays the value from the latest `FOF_POT_TICK` action and interpolates visually between ticks, but the score is always computed using the server's pot value at receipt time.
- Answer submission time is server-stamped, not client-stamped.
- Each player can only submit one answer per question. Duplicate submissions are silently ignored.

### 1.14 Game History

**Game History Level:** Summary Log

Per-question results are compact and self-explanatory — full action replay isn't needed since the game has no spatial or creative state. The summary captures who answered what, how fast, and the pot dynamics.

#### `initialState`

```typescript
interface FOFInitialState {
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
| **Estimated Duration** | 240 seconds |
| **Supports Teams** | No (1 hidden role vs. group) |
| **Join-in-Progress** | `spectate_only` |
| **Tags** | `['creative', 'social-deduction', 'writing', 'strategy']` |

### 2.2 Game Concept

Collaborative storytelling with a hidden saboteur. Players take turns adding one sentence to a shared story. One player is secretly the **Editor** — they can subtly change one word in any previously written sentence on their turn. The Editor wins if the story ends up containing a secret **Keyword** without the other players catching them. The other players (**Writers**) win if they correctly identify the Editor via a vote.

### 2.3 Detailed Mechanics

#### 2.3.1 Setup

1. **Role Assignment:** One player is randomly chosen as the **Editor**. All other players are **Writers**. Only the Editor knows their role.
2. **Keyword Assignment:** The server selects a secret **Keyword** from a themed word pool. The keyword is sent **only** to the Editor's socket. The keyword is a common English word that could plausibly appear in many stories (e.g., "bridge," "shadow," "crown," "river").
3. **Story Prompt:** A short story prompt is shown to all players to set the theme (e.g., "A detective arrives at an abandoned mansion on a stormy night.").
4. **Turn Order:** Players are placed in a randomized turn order. The Editor is placed randomly within this order (no first or last position to avoid suspicion — position is random but not slot 1 or N).

#### 2.3.2 Turn Structure

Each player takes turns in order. Each turn:

1. **Write Phase** (active player):
   - The active player writes one sentence (min 10 chars, max 200 chars) to append to the story.
   - Time limit: `UE_WRITE_TIMEOUT_SECONDS` (default: **45 seconds**). If exceeded, the server auto-submits "..." (an ellipsis sentence indicating a timeout).

2. **Edit Phase** (Editor only, on Editor's turn):
   - After writing their sentence, the Editor gets an additional **secret action**: they may edit one word in any previous sentence.
   - The edit UI shows the full story with each word as a clickable token. Selecting a word reveals an input field to replace it.
   - The edit is applied silently — no other player is notified that an edit occurred.
   - The Editor can choose NOT to edit on a given turn (risky if the keyword isn't being steered toward).
   - Time limit for editing: `UE_EDIT_TIMEOUT_SECONDS` (default: **30 seconds**). 
   - **Constraints:**
     - Only one word can be changed per turn.
     - The replacement word must be a single word (no spaces).
     - Maximum 30 characters.
     - Cannot edit a word they already edited in a previous turn.
     - Cannot edit their own sentence from the current turn.

3. **Story Update Broadcast:**
   - After the write (and optional edit), the server broadcasts the updated story to all players.
   - **Critical:** The story is broadcast as a whole. Players see the current version of the story but are NOT told which words changed. The edit is seamlessly integrated.
   - A diff-aware reader might notice a change, which adds to the social deduction element.

#### 2.3.3 Game Flow

The game proceeds for `UE_TOTAL_TURNS` (default: **2 full rotations** through the player order, so for 6 players, 12 turns total). After all turns:

1. **Review Phase** (20 seconds):
   - The complete story is displayed.
   - Players re-read it, looking for suspicious word choices or subtle shifts.

2. **Accusation Phase** (30 seconds):
   - Each Writer casts a vote for who they think the Editor is.
   - The Editor also votes (to blend in — they can vote for anyone except themselves).
   - Players can change their vote until the timer expires.

3. **Reveal Phase** (10 seconds):
   - The Editor is revealed.
   - The story is displayed with all edited words highlighted in a different color, showing the original → replacement.
   - The keyword is revealed.

#### 2.3.4 Win Conditions

| Scenario | Winner | Scoring |
|---|---|---|
| Writers correctly identify the Editor (plurality vote) AND the keyword is NOT in the final story | Writers win (major victory) | Writers: `UE_WRITER_MAJOR_WIN` (default: **400** each). Editor: `UE_EDITOR_LOSS` (default: **50**). |
| Writers correctly identify the Editor BUT the keyword IS in the story | Writers win (minor victory — Editor partially succeeded) | Writers: `UE_WRITER_MINOR_WIN` (default: **250** each). Editor: `UE_EDITOR_PARTIAL` (default: **200**). |
| Writers vote for the wrong person AND the keyword IS in the story | Editor wins (major victory) | Editor: `UE_EDITOR_MAJOR_WIN` (default: **600**). Writers: `UE_WRITER_LOSS` (default: **50** each). |
| Writers vote for the wrong person AND the keyword is NOT in the story | Editor wins (minor victory — wasn't caught but also failed objective) | Editor: `UE_EDITOR_MINOR_WIN` (default: **300**). Writers: `UE_WRITER_MINOR_LOSS` (default: **100** each). |
| Vote is a tie (no plurality) | No one is accused; Editor wins by default | Same as "wrong person" scenario. |

#### 2.3.5 Keyword Proximity Bonus

The Editor gets a proximity bonus if the keyword isn't in the final story but a word that is **semantically close** appears:
- Server uses `fuse.js` with a threshold of 0.7 to check if any word in the story fuzzy-matches the keyword.
- If a close match exists: `UE_KEYWORD_PROXIMITY_BONUS` (default: **50**) added to Editor's score.

### 2.4 Server-Side State Schema

```typescript
interface UndercoverEditorState {
  storyPrompt: string;
  keyword: string;                              // secret — only sent to Editor
  editorUserId: string;                         // secret — only known server-side
  turnOrder: string[];                          // userIds in play order
  currentTurnIndex: number;
  totalTurns: number;
  phase: UEPhase;
  
  // Story
  sentences: StorySentence[];
  
  // Editor's edits (tracked for reveal)
  edits: WordEdit[];
  editedWordPositions: Set<string>;             // "sentenceIndex:wordIndex" — prevents re-editing
  
  // Vote
  votes: Map<string, string>;                   // voterId → accusedUserId
  
  // Results
  keywordInStory: boolean;
  editorWasCaught: boolean;
  winner: 'editor' | 'writers';
  
  // Scores
  playerScores: Map<string, number>;
  
  // Timer
  phaseStartedAt: number;
  phaseEndsAt: number;
}

type UEPhase = 'SETUP' | 'WRITE' | 'EDIT' | 'REVIEW' | 'ACCUSATION' | 'REVEAL';

interface StorySentence {
  authorUserId: string;
  authorName: string;
  text: string;                                 // current version (may have been edited)
  originalText: string;                         // original as submitted
  turnNumber: number;
  words: string[];                              // tokenized for editing
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

| Action | Payload | Who Can Send | Description |
|---|---|---|---|
| `WRITE_SENTENCE` | `{ text: string }` | Active turn player | Submit a sentence |
| `EDIT_WORD` | `{ sentenceIndex: number, wordIndex: number, newWord: string }` | Editor (on their turn) | Secretly edit a word |
| `SKIP_EDIT` | `{}` | Editor (on their turn) | Choose not to edit this turn |
| `CAST_ACCUSATION` | `{ targetUserId: string }` | All players (during Accusation) | Vote for the suspected Editor |

**Zod schemas:**

```typescript
const WriteSentenceSchema = z.object({
  text: z.string().min(10).max(200),
});

const EditWordSchema = z.object({
  sentenceIndex: z.number().int().min(0),
  wordIndex: z.number().int().min(0),
  newWord: z.string().min(1).max(30).regex(/^\S+$/),
});

const CastAccusationSchema = z.object({
  targetUserId: z.string().min(1),
});
```

#### Server → Client (Game Actions)

| Action Type | Payload | Sent To | Description |
|---|---|---|---|
| `UE_GAME_START` | `{ storyPrompt: string, turnOrder: PlayerTurnInfo[], totalTurns: number }` | All (lobby) | Game begins |
| `UE_ROLE_ASSIGNED` | `{ role: 'editor' \| 'writer', keyword?: string }` | Each player individually | Role assignment (keyword only for Editor) |
| `UE_TURN_START` | `{ turnNumber: number, activeUserId: string, activeUserName: string, writeDurationSeconds: number }` | All (lobby) | A player's turn begins |
| `UE_SENTENCE_ADDED` | `{ turnNumber: number, authorName: string, sentence: string, fullStory: StorySentenceView[] }` | All (lobby) | New sentence added to story |
| `UE_EDIT_PROMPT` | `{ story: EditableStory, editDurationSeconds: number }` | Editor only | Prompt Editor to make their secret edit |
| `UE_STORY_UPDATED` | `{ fullStory: StorySentenceView[] }` | All (lobby) | Story updated (after edit, silently) |
| `UE_REVIEW_START` | `{ fullStory: StorySentenceView[], reviewDurationSeconds: number }` | All (lobby) | Review phase begins |
| `UE_ACCUSATION_START` | `{ players: Array<{ userId: string, userName: string }>, accusationDurationSeconds: number }` | All (lobby) | Voting phase begins |
| `UE_VOTE_CAST` | `{ voterId: string, hasVoted: boolean }` | All (lobby) | Someone voted (not who for) |
| `UE_REVEAL` | `{ editorUserId: string, editorName: string, keyword: string, keywordInStory: boolean, editorCaught: boolean, edits: WordEditView[], votes: VoteResult[], winner: string, scores: ScoreResult[] }` | All (lobby) | Full reveal |
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer |

**Supporting types:**

```typescript
interface StorySentenceView {
  authorName: string;
  text: string;
  turnNumber: number;
}

interface EditableStory {
  sentences: Array<{
    authorName: string;
    words: Array<{
      word: string;
      index: number;
      sentenceIndex: number;
      isEditable: boolean;          // false if already edited or is current sentence
    }>;
  }>;
}

interface WordEditView {
  sentenceIndex: number;
  sentenceAuthor: string;
  originalWord: string;
  newWord: string;
  editedOnTurn: number;
}

interface VoteResult {
  voterId: string;
  voterName: string;
  accusedUserId: string;
  accusedName: string;
}

interface ScoreResult {
  userId: string;
  userName: string;
  role: 'editor' | 'writer';
  score: number;
  breakdown: Record<string, number>;
}

interface PlayerTurnInfo {
  userId: string;
  userName: string;
  turnNumbers: number[];       // which turns this player has (e.g., [1, 7] for a 6-player 2-rotation game)
}
```

### 2.6 Information Masking

**This game has the most critical masking requirements of all minigames.**

| Data | Writer View | Editor View | Spectator View |
|---|---|---|---|
| Story prompt | Visible | Visible | Visible |
| Role assignment | "You are a Writer" | "You are the Editor. Your keyword is: ____" | See roles of all players |
| Keyword | **HIDDEN** (never revealed until game end) | **VISIBLE** (private) | **VISIBLE** |
| Who the Editor is | **HIDDEN** until reveal | Known (self) | **VISIBLE** |
| Story text (current) | Visible | Visible | Visible |
| Whether an edit occurred this turn | **HIDDEN** | Known (self) | **VISIBLE** (spectators see edits happen) |
| What was edited | **HIDDEN** until reveal | Known (self) | **VISIBLE** (real-time edit tracking) |
| Edit history (all edits) | **HIDDEN** until reveal | Known (own edits) | **VISIBLE** |
| Other players' votes | **HIDDEN** (only whether they voted) | **HIDDEN** (only whether they voted) | **VISIBLE** |

**`getStateForPlayer(userId)` for a Writer:**

```typescript
interface UEWriterState {
  storyPrompt: string;
  myRole: 'writer';
  turnOrder: PlayerTurnInfo[];
  currentTurnIndex: number;
  totalTurns: number;
  phase: UEPhase;
  story: StorySentenceView[];
  isMyTurn: boolean;
  timeRemaining: number;
  // During ACCUSATION:
  myVote: string | null;
  votedPlayers: string[];   // userIds who have voted (not who for)
}
```

**`getStateForPlayer(userId)` for the Editor:**

```typescript
interface UEEditorState extends UEWriterState {
  myRole: 'editor';
  keyword: string;
  myEdits: WordEdit[];
  // During EDIT phase (on their turn):
  editableStory?: EditableStory;
}
```

The server determines which interface to return based on `userId === editorUserId`.

**`getStateForSpectator()` returns:**  
Omniscient view: knows who the Editor is, sees the keyword, sees edits as they happen (highlighted), and sees all votes. This creates an exciting viewing experience for the "couch audience."

### 2.7 Join-in-Progress Logic

**Policy:** `spectate_only`

Roles, turn order, and the story structure are established at game start. Adding a player mid-game would disrupt the turn order and potentially reveal the Editor through behavioral discontinuity.

### 2.8 Reconnection Behavior

On reconnect:
1. Player receives their role, the current story, what turn it is, and phase.
2. Editor receives the keyword and their edit history.
3. If it was the reconnected player's turn and the WRITE/EDIT phase is still active, they can still submit.
4. If their turn was auto-completed (timeout → "..." sentence), they cannot redo it.

### 2.9 Player Disconnect Mid-Game

- If the disconnected player's turn comes up during the grace period:
  - After `UE_DISCONNECT_TURN_WAIT_SECONDS` (default: **15 seconds**, shorter than the write timeout), their turn is auto-completed with a "..." sentence.
  - If they were the Editor, their edit phase is auto-skipped.
- If the Editor fully disconnects (grace period expires):
  - The game continues. The Editor is essentially AFK — they won't make any more edits. At the end, if the keyword isn't in the story, Writers win by default.
  - The game is NOT terminated, since the Writers can still play out the deduction.
- Minimum players: If players drop below `minPlayers` (4), the game force-ends.

### 2.10 Awards

| Award | Condition | Icon |
|---|---|---|
| Master of Disguise | Editor who wasn't caught AND got the keyword in | `mask` |
| Eagle Eye | Writer who correctly voted for the Editor | `eye` |
| Shakespeare | Player who wrote the longest sentence (by word count) | `quill` |
| Smooth Operator | Editor who made the most edits without getting caught | `wand-2` |
| Red Herring | Writer who received the most accusation votes (falsely accused) | `fish` |

### 2.11 NPM Package Suggestions

| Package | Purpose | Notes |
|---|---|---|
| `fuse.js` | Fuzzy keyword matching for proximity bonus | Already in core spec. Used to check if story contains near-matches to the keyword. |

No additional packages. The keyword pool and story prompts are static JSON files.

### 2.12 Client Component Structure

```
components/rmhbox/minigames/undercover-editor/
  UndercoverEditorGame.tsx     # Main game component, phase router
  StoryEditor.tsx              # Editor's secret word-editing UI (word tokens)
  StoryDisplay.tsx             # Read-only story viewer with sentence attribution
  WriteInput.tsx               # Sentence composition input
  AccusationPanel.tsx          # Vote for suspected Editor
  RevealScreen.tsx             # Dramatic reveal with edit highlighting
  RoleBadge.tsx                # Private role indicator (corner of screen)
  TurnIndicator.tsx            # Whose turn it is with avatar
```

**Mobile UI layout (WRITE phase, non-active player):**

```
┌──────────────────────────────┐
│ Undercover Editor   Turn 4/12│
├──────────────────────────────┤
│  ✏️ Alice is writing...      │  ← Turn indicator
│        ⏱ 0:32                │
├──────────────────────────────┤
│                              │
│  "A detective arrives at an  │
│   abandoned mansion on a     │
│   stormy night."             │
│                              │
│  > "He found the door ajar   │
│    and stepped inside."      │
│    — Bob (Turn 1)            │
│                              │
│  > "The floorboards creaked  │
│    beneath his heavy boots." │
│    — You (Turn 2)            │
│                              │
│  > "A shadow moved across    │
│    the hallway."             │
│    — Charlie (Turn 3)        │
│                              │
├──────────────────────────────┤
│ 🔎 You are a Writer          │
│ Score: 0                     │
└──────────────────────────────┘
```

### 2.13 Constants

```typescript
export const UE_MIN_PLAYERS = 4;
export const UE_MAX_PLAYERS = 10;
export const UE_ROTATIONS = 2;                    // each player writes twice
export const UE_WRITE_TIMEOUT_SECONDS = 45;
export const UE_EDIT_TIMEOUT_SECONDS = 30;
export const UE_REVIEW_DURATION_SECONDS = 20;
export const UE_ACCUSATION_DURATION_SECONDS = 30;
export const UE_REVEAL_DURATION_SECONDS = 10;
export const UE_DISCONNECT_TURN_WAIT_SECONDS = 15;

export const UE_MIN_SENTENCE_LENGTH = 10;
export const UE_MAX_SENTENCE_LENGTH = 200;
export const UE_MAX_EDIT_WORD_LENGTH = 30;

export const UE_WRITER_MAJOR_WIN = 400;
export const UE_WRITER_MINOR_WIN = 250;
export const UE_WRITER_LOSS = 50;
export const UE_WRITER_MINOR_LOSS = 100;
export const UE_EDITOR_MAJOR_WIN = 600;
export const UE_EDITOR_MINOR_WIN = 300;
export const UE_EDITOR_PARTIAL = 200;
export const UE_EDITOR_LOSS = 50;
export const UE_KEYWORD_PROXIMITY_BONUS = 50;
export const UE_CORRECT_VOTE_BONUS = 100;        // extra for writers who voted correctly
export const UE_KEYWORD_FUZZY_THRESHOLD = 0.7;
```

### 2.14 Game History

**Game History Level:** Full Action Log

Undercover Editor is one of the most replay-worthy games — watching the story evolve sentence by sentence and spotting where the Editor's subtle word swaps were hidden is endlessly entertaining. The full action log preserves every edit, vote, and reveal.

#### `initialState`

```typescript
interface UEInitialState {
  storyTitle: string;
  originalStory: string[];          // original sentences
  keyword: string;
  editorUserId: string;
  writerUserIds: string[];
  turnsPerRound: number;
}
```

#### Actions Logged

| Action Type | Payload | Recorded When |
|---|---|---|
| `TURN_START` | `{ turnNumber, activeUserId, sentenceIndex }` | Writer/Editor turn begins |
| `WORD_ADDED` | `{ userId, sentenceIndex, word }` | Writer adds a word |
| `EDITOR_SWAP` | `{ sentenceIndex, originalWord, replacementWord, position }` | Editor makes a substitution |
| `EDITOR_SKIP` | `{ sentenceIndex }` | Editor passes on editing |
| `STORY_SNAPSHOT` | `{ sentences: string[] }` | End of each round — full story state |
| `ACCUSATION_VOTE` | `{ voterId, suspectedUserId }` | Writer casts accusation vote |
| `VOTE_RESULT` | `{ votes: Record<string, string[]>, editorCaught: boolean }` | Voting concludes (`votes`: suspectedUserId → voterIds) |
| `FINAL_REVEAL` | `{ editorUserId, keyword, allSwaps: EditorSwap[] }` | Post-game reveal |

#### Replay Value

Step through the story's evolution turn by turn. See every word the Editor swapped, whether anyone noticed, and how close the accusation votes were. The `EDITOR_SWAP` entries are especially fun — compare original vs. replacement and judge how sneaky each edit was.

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

The server selects a prompt from `/public/data/rmhbox/minimalist-masterpiece/prompts.json`:

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
- Time between first and last point of a stroke must be ≥ `MM_MIN_STROKE_DURATION_MS` (default: 100ms).
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
   - Rank 1: `MM_RANK_1_POINTS` (default: **500**)
   - Rank 2: `MM_RANK_2_POINTS` (default: **350**)
   - Rank 3: `MM_RANK_3_POINTS` (default: **250**)
   - Remaining: `MM_PARTICIPATION_POINTS` (default: **100**)
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
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer |

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
export const MM_PROMPT_REVEAL_SECONDS = 3;
export const MM_DRAWING_DURATION_SECONDS = 60;
export const MM_GALLERY_DURATION_SECONDS = 15;
export const MM_AUCTION_DURATION_SECONDS = 60;
export const MM_RESULTS_DURATION_SECONDS = 10;

export const MM_MAX_STROKES = 5;
export const MM_CANVAS_SIZE = 400;
export const MM_STROKE_WIDTH = 4;
export const MM_MIN_POINTS_PER_STROKE = 5;
export const MM_MAX_POINTS_PER_STROKE = 500;
export const MM_MIN_STROKE_DURATION_MS = 100;

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

export const MM_RANK_1_POINTS = 500;
export const MM_RANK_2_POINTS = 350;
export const MM_RANK_3_POINTS = 250;
export const MM_PARTICIPATION_POINTS = 100;
export const MM_INVESTMENT_BONUS = 50;
```

### 3.13 Game History

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

Movies come from a curated database (`/public/data/rmhbox/emoji-cinema/movies.json`):

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
| Producer | `EC_PRODUCER_BASE_POINTS` + `EC_PRODUCER_SPEED_BONUS` × secondsRemaining | Someone guesses correctly |
| Producer | 0 | No one guesses correctly (timeout) |
| First correct guesser | `EC_FIRST_GUESS_POINTS` (default: **300**) | First to guess correctly |
| Second correct guesser | `EC_SECOND_GUESS_POINTS` (default: **150**) | Second to guess correctly (if multiple guess on the same tick, server uses submission timestamp) |
| Other correct guessers | `EC_OTHER_GUESS_POINTS` (default: **75**) | |
| Wrong guessers | 0 | No penalty for wrong guesses |

**Producer scoring defaults:**
- `EC_PRODUCER_BASE_POINTS` = **100** (guaranteed if someone guesses correctly).
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
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer |

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

- **If the Producer disconnects:** Wait `EC_PRODUCER_DISCONNECT_WAIT_SECONDS` (default: **10s**). If they don't reconnect, the round is skipped (no points awarded for that round). Move to the next round.
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
export const EC_PRODUCER_ASSIGNMENT_SECONDS = 2;
export const EC_ROUND_DURATION_SECONDS = 45;
export const EC_ROUND_RESULTS_SECONDS = 5;
export const EC_TRANSITION_SECONDS = 1;

export const EC_MAX_EMOJIS = 12;
export const EC_MAX_GUESSES_PER_PLAYER = 15;
export const EC_MAX_GUESS_LENGTH = 200;

export const EC_FUZZY_MATCH_THRESHOLD = 0.80;    // correct guess
export const EC_CLOSE_THRESHOLD = 0.60;           // "close" hint
export const EC_MIN_POPULARITY = 40;

export const EC_PRODUCER_BASE_POINTS = 100;
export const EC_PRODUCER_SPEED_BONUS = 10;
export const EC_FIRST_GUESS_POINTS = 300;
export const EC_SECOND_GUESS_POINTS = 150;
export const EC_OTHER_GUESS_POINTS = 75;

export const EC_PRODUCER_DISCONNECT_WAIT_SECONDS = 10;
export const EC_EMOJI_PALETTE_SIZE = 200;
```

### 4.14 Anti-Cheat Notes

- The movie title is ONLY sent to the Producer's socket. Audience players never receive it until `EC_ROUND_OVER`.
- Guess text from other players is never sent to anyone during the guessing phase (only the count and close/correct notifications without the actual text).
- The emoji sequence is broadcast live — no way for the Producer to communicate text, only emojis.
- The curated emoji palette prevents the Producer from using flag emojis or letter emojis (🅰️ 🅱️ etc.) to spell out the title. These are excluded from the palette.
- Maximum `EC_MAX_EMOJIS` prevents emoji spam.
- Maximum `EC_MAX_GUESSES_PER_PLAYER` prevents brute-force guessing.

### 4.15 Game History

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

---

*End of Minigame Specifications Part 2*
