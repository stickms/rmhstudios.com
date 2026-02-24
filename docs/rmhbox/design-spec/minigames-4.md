# RMHbox — Minigame Design Specifications (Part 4)

> **Version:** 1.0  
> **Last Updated:** 2026-02-22  
> **Status:** Draft  
> **Games Covered:** Identity Crisis, Ranking File, Pixel Pushers, Scroll Soul  
> **Parent Document:** [design-spec-core.md](./design-spec-core.md)

---

## Table of Contents

1. [Identity Crisis](#1-identity-crisis)
   - [1.14 MinigameRenderer & Client-Server Wiring](#114-minigamerenderer--client-server-wiring)
2. [Ranking File](#2-ranking-file)
   - [2.14 MinigameRenderer & Client-Server Wiring](#214-minigamerenderer--client-server-wiring)
3. [Pixel Pushers](#3-pixel-pushers)
   - [3.15 MinigameRenderer & Client-Server Wiring](#315-minigamerenderer--client-server-wiring)
4. [Scroll Soul](#4-scroll-soul)
   - [4.15 MinigameRenderer & Client-Server Wiring](#415-minigamerenderer--client-server-wiring)

---

## 1. Identity Crisis

### 1.1 Overview

| Field | Value |
|---|---|
| **ID** | `identity-crisis` |
| **Display Name** | Identity Crisis |
| **Category** | `social` |
| **Icon** | `user-question` (Lucide) |
| **Min Players** | 3 |
| **Max Players** | 10 |
| **Estimated Duration** | 180 seconds |
| **Supports Teams** | No |
| **Join-in-Progress** | `spectate_only` |
| **Tags** | `['social', 'deduction', 'competitive', 'knowledge']` |

### 1.2 Game Concept

Social deduction where the only person who doesn't know who you are is *you*. Every player is assigned a famous person/character. You can see everyone else's identity, but yours is hidden. Players take turns asking the group a Yes/No question about themselves. The group votes "Yes," "No," or "Maybe." Identify yourself in the fewest questions to win.

### 1.3 Detailed Mechanics

#### 1.3.1 Game Flow

| Phase | Duration | Description |
|---|---|---|
| Assignment Reveal | 5s | Players see everyone else's identities (but not their own) |
| Question Rounds | Variable (see below) | Players take turns asking questions |
| Final Guesses | 30s | Everyone submits their best guess |
| Results | 10s | Reveal all identities and show scores |

**Question rounds structure:**
- Players take turns in a randomized order.
- Each player gets `IC_QUESTIONS_PER_PLAYER` (default: **3**) turns to ask a question across the game.
- Total question rounds = `playerCount × IC_QUESTIONS_PER_PLAYER`.
- After all question rounds are complete, the Final Guess phase begins.

#### 1.3.2 Identity Assignment

Identities are drawn from `data/rmhbox/identity-crisis/identities.json`:

```typescript
interface Identity {
  id: string;
  name: string;                       // e.g., "Albert Einstein"
  category: string;                   // e.g., "Scientist", "Musician", "Fictional", "Historical"
  difficulty: 'easy' | 'medium' | 'hard';
  hints: string[];                    // optional backup hints if game is stalling
}
```

**Assignment rules:**
- The server draws `playerCount` identities from the pool without replacement.
- For the first game in a session, prefer `easy` difficulty. Subsequent games escalate.
- Identities should be diverse in category — avoid assigning multiple identities from the same category (e.g., not two musicians) to reduce confusion.
- Each player's identity is stored server-side. No player ever receives their own identity.

#### 1.3.3 Question Phase

On a player's turn:

1. **Ask phase** (`IC_ASK`, default: **20s**): The active player types a Yes/No question about themselves (e.g., "Am I a real person?" or "Am I known for music?"). The question is sent to the server.
2. **Vote phase** (`IC_VOTE`, default: **15s**): All OTHER players see the question and vote: "Yes," "No," or "Maybe." Voting is simultaneous — no one can see others' votes until all votes are in (or the timer expires).
3. **Results reveal** (3s): The aggregate vote result is shown to everyone:
   - The majority answer is displayed prominently.
   - Vote breakdown (e.g., "Yes: 4, No: 1, Maybe: 0") is shown.
   - Individual vote attribution is **HIDDEN** — players don't see who voted what.

**If a player doesn't ask a question (timeout):** Their turn is skipped. They still have their remaining turns.

**"Maybe" vote purpose:** For ambiguous questions ("Am I funny?"), players can express uncertainty without committing. If "Maybe" wins the plurality, it's displayed as the result. This adds strategy — players asking vague questions get unhelpful answers.

#### 1.3.4 Guess Phase (Optional Early Guess)

At any point during the game (not just the Final Guess phase), a player may submit an early guess via `IC_EARLY_GUESS`. This is a strategic risk/reward:

- **Correct early guess:** Massive bonus points (`IC_EARLY_GUESS_BONUS`, scaled by how many questions remain).
- **Incorrect early guess:** The player is **eliminated** from asking further questions (but stays in the game to vote on others' questions). They get one final guess in the Final Guess phase with no bonus.

This creates tension: confident players are tempted to guess early for bonus points, but a wrong guess is devastating.

#### 1.3.5 Final Guess Phase

After all question rounds:

1. Every player who hasn't already guessed correctly submits their best guess.
2. Guessing is done via a text input with fuzzy matching against the identity name.
3. The server uses `fuse.js` for matching with a threshold of `IC_GUESS_MATCH_THRESHOLD` (default: **0.3**, very forgiving — "einstein" matches "Albert Einstein").
4. Players have `IC_FINAL_GUESS` (default: **30s**) to submit.

#### 1.3.6 Scoring

| Event | Points |
|---|---|
| Correct final guess | `IC_CORRECT_GUESS` (default: **200**) |
| Early guess bonus (correct) | `IC_EARLY_GUESS_BONUS_BASE` × `questionsRemaining / totalQuestions` (default: **300** × ratio) |
| Incorrect early guess penalty | `IC_EARLY_GUESS_PENALTY` (default: **-100**) |
| Asking questions efficiently (fewer questions asked overall) | `IC_EFFICIENCY_BONUS` (default: **20** per unused question slot) |
| Voting accuracy (voted correctly with the majority on others' questions) | `IC_VOTING_ACCURACY_BONUS` (default: **5** per vote matching the "true" answer — yes/no determined by the actual identity) |

**Voting accuracy explained:** After the game, the server retroactively evaluates each vote. For example, if Alice's identity is "Albert Einstein" and someone asked "Am I a scientist?", the true answer is "Yes." Players who voted "Yes" get `IC_VOTING_ACCURACY_BONUS` per correct vote. This rewards knowledge and engagement even when it's not your turn.

### 1.4 Server-Side State Schema

```typescript
interface IdentityCrisisState {
  phase: ICPhase;
  
  // Identities
  identityAssignments: Map<string, Identity>;       // userId → assigned identity (NEVER sent to the assigned player)
  
  // Question tracking
  questionOrder: string[];                           // userId turn order
  currentQuestionRound: number;                      // 0-indexed, cycles through questionOrder
  questionsAsked: ICQuestion[];
  questionsPerPlayer: Map<string, number>;           // userId → questions asked so far
  maxQuestionsPerPlayer: number;
  
  // Voting
  currentVotes: Map<string, ICVote> | null;          // userId → vote for current question
  
  // Guessing
  earlyGuesses: Map<string, ICGuessResult>;          // userId → { guess, correct, round }
  finalGuesses: Map<string, ICGuessResult>;
  eliminatedFromQuestions: Set<string>;               // userIds who guessed wrong early
  
  // Timer
  phaseStartedAt: number;
  phaseEndsAt: number;
  
  // Scores
  playerScores: Map<string, number>;
}

type ICPhase = 'ASSIGNMENT_REVEAL' | 'ASK' | 'VOTE' | 'VOTE_RESULTS' | 'FINAL_GUESS' | 'RESULTS';

interface ICQuestion {
  askerId: string;
  askerName: string;
  questionText: string;
  roundNumber: number;
  voteResult: { yes: number; no: number; maybe: number } | null;
  majorityAnswer: 'yes' | 'no' | 'maybe' | null;
  trueAnswer: 'yes' | 'no' | 'maybe';             // determined post-game
}

type ICVote = 'yes' | 'no' | 'maybe';

interface ICGuessResult {
  userId: string;
  guess: string;
  correct: boolean;
  matchScore: number;                                // fuse.js match score
  roundGuessed: number;                              // which round they guessed on (-1 for final)
}
```

### 1.5 WebSocket Event Map

#### Client → Server

| Action | Payload | Who Can Send | Description |
|---|---|---|---|
| `IC_ASK_QUESTION` | `{ question: string }` | Active asker only | Submit a yes/no question |
| `IC_VOTE` | `{ vote: 'yes' \| 'no' \| 'maybe' }` | Non-askers during VOTE | Vote on the current question |
| `IC_EARLY_GUESS` | `{ guess: string }` | Any player (not eliminated) outside of VOTE/ASK phases | Submit an early identity guess |
| `IC_FINAL_GUESS` | `{ guess: string }` | Any player during FINAL_GUESS | Submit final guess |

**Zod schemas:**

```typescript
const ICQuestionSchema = z.object({
  question: z.string().min(3).max(200).trim(),
});

const ICVoteSchema = z.object({
  vote: z.enum(['yes', 'no', 'maybe']),
});

const ICGuessSchema = z.object({
  guess: z.string().min(1).max(100).trim(),
});
```

#### Server → Client (Game Actions)

| Action Type | Payload | Sent To | Description |
|---|---|---|---|
| `IC_IDENTITIES_REVEAL` | `{ otherPlayers: Array<{ userId: string, userName: string, identity: string }> }` | Each player individually | Everyone else's identities (own excluded) |
| `IC_TURN_START` | `{ askerId: string, askerName: string, askerIdentity: string, questionNumber: number, totalQuestions: number, askDurationSeconds: number }` | All EXCEPT the asker | The asker's turn begins (includes asker's identity so voters know the truth) |
| `IC_TURN_START_SELF` | `{ questionNumber: number, totalQuestions: number, askDurationSeconds: number }` | Asker only | It's your turn (NO identity info) |
| `IC_QUESTION_ASKED` | `{ question: string, askerId: string, askerName: string }` | All (lobby) | Question submitted, voting opens |
| `IC_VOTE_RECEIVED` | `{ votesReceived: number, totalVoters: number }` | All (lobby) | Anonymous vote progress |
| `IC_VOTE_RESULTS` | `{ question: string, votes: { yes: number, no: number, maybe: number }, majorityAnswer: string }` | All (lobby) | Vote result revealed |
| `IC_EARLY_GUESS_ATTEMPT` | `{ userId: string, userName: string }` | All (lobby) | Someone is attempting an early guess (not the guess itself) |
| `IC_EARLY_GUESS_RESULT` | `{ userId: string, userName: string, correct: boolean }` | All (lobby) | Early guess outcome (no identity reveal if wrong) |
| `IC_EARLY_GUESS_CORRECT` | `{ userId: string, userName: string, identity: string, questionsRemaining: number, bonusPoints: number }` | All (lobby) | Correct early guess — identity revealed |
| `IC_FINAL_GUESS_PHASE` | `{ durationSeconds: number }` | All (lobby) | Final guess phase begins |
| `IC_RESULTS` | `{ reveals: ICReveal[], finalRankings: ICFinalRanking[] }` | All (lobby) | Final results and identity reveals |
| `TIMER_START` | `{ totalDuration: number, timeRemaining: number }` | All (lobby) | Emitted at the start of each timed phase (ASK, VOTE, FINAL_GUESS) via `broadcastAction` |
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer (every 1s during all timed phases) via `broadcastAction` |
| `MINIGAME_ROUND` | `{ current: number, total: number }` | All (lobby) | Sub-round counter update (e.g. "Question 3/12") via `broadcastAction` |

**Supporting types:**

```typescript
interface ICReveal {
  userId: string;
  userName: string;
  identity: string;
  guessedCorrectly: boolean;
  guess: string | null;
  questionsAsked: number;
  wasEarlyGuesser: boolean;
}

interface ICFinalRanking {
  userId: string;
  userName: string;
  totalScore: number;
  rank: number;
  guessedCorrectly: boolean;
  questionsUsed: number;
  votingAccuracyPct: number;
}
```

### 1.6 Information Masking

| Data | Player View | Spectator View |
|---|---|---|
| Own identity | **HIDDEN** (NEVER sent) | **VISIBLE** |
| Other players' identities | Visible | Visible |
| Current question | Visible (when asked) | Visible |
| Individual votes (who voted what) | **HIDDEN** (only aggregates shown) | **HIDDEN** (same — keeps it fair) |
| Vote aggregates | Visible after voting ends | Visible |
| Early guess text | **HIDDEN** from others (only shown as correct/incorrect) | **VISIBLE** |
| Scores | Visible | Visible |
| Question history | Visible | Visible |
| Asker's identity (during voting) | Visible to VOTERS (they know who the asker "is") | Visible |
| Asker's identity (to asker) | **HIDDEN** | N/A |

**CRITICAL MASKING — `IC_TURN_START` vs `IC_TURN_START_SELF`:**

The most important masking rule: when it's Player A's turn to ask, the server sends TWO different events:
- **To Player A:** `IC_TURN_START_SELF` — contains NO identity info. Player A must not know who they are.
- **To everyone else:** `IC_TURN_START` — contains `askerIdentity` so voters can truthfully answer "Am I a scientist?" (they know if Player A is Einstein or not).

This is the core mechanic of the entire game. If this masking fails, the game breaks.

**`getStateForPlayer(userId)` during VOTE:**

```typescript
interface ICPlayerVoteState {
  phase: 'VOTE';
  currentQuestion: { text: string; askerId: string; askerName: string };
  askerIdentity: string;                // ONLY sent if userId !== askerId
  myVote: ICVote | null;                // if I've already voted
  votesReceived: number;
  totalVoters: number;
  timeRemaining: number;
  questionHistory: Array<{
    question: string;
    askerName: string;
    result: { yes: number; no: number; maybe: number };
  }>;
  myQuestionsRemaining: number;
  otherPlayersIdentities: Array<{ userId: string; userName: string; identity: string }>;
  // Note: own identity NEVER included
}
```

**`getStateForSpectator()` returns:**  
Full state including all identities (including the asker's), all votes, and all guesses. Spectators get a "god view" and can enjoy watching players struggle to figure out their identity.

### 1.7 Join-in-Progress Logic

**Policy:** `spectate_only`

Identities are assigned at game start and the question order is pre-determined. A late joiner wouldn't have an identity and would disrupt the turn order. They spectate.

### 1.8 Reconnection Behavior

On reconnect:
1. Player receives: all other players' identities (NOT their own), question history with vote results, their remaining question count, current phase state.
2. If it was their turn to ask and the ASK timer is still active, they can submit a question.
3. If they were in the VOTE phase, they can still vote.
4. Their identity is preserved — they never see it.

### 1.9 Awards

| Award | Condition | Icon |
|---|---|---|
| Self-Aware | Guessed correctly first (earliest in the game) | `eye` |
| Master of Disguise | Last person to guess correctly (or didn't guess at all) | `ghost` |
| Philosopher | Asked the most insightful questions (most "Yes" or "No" consensus votes — least "Maybe") | `brain` |
| Crowd Pleaser | Highest voting accuracy (voted with the truth the most) | `check-circle` |
| Bold Move | Made an early guess (regardless of outcome) | `zap` |

### 1.10 NPM Package Suggestions

| Package | Purpose | Notes |
|---|---|---|
| `fuse.js` | Fuzzy matching for identity guesses | Already in the project. Match threshold 0.3 for forgiving guess matching. |

### 1.11 Client Component Structure

```
components/rmhbox/minigames/identity-crisis/
  IdentityCrisisGame.tsx         # Main game component, phase router
  IdentityCard.tsx               # Shows a player's identity (for others)
  HiddenIdentityCard.tsx         # "???" card for own identity
  QuestionInput.tsx              # Text input for asking a question
  VotePanel.tsx                  # Yes / No / Maybe vote buttons
  VoteResultBar.tsx              # Horizontal bar showing vote distribution
  QuestionHistory.tsx            # Scrollable list of past Q&A
  GuessInput.tsx                 # Identity guess text input with autocomplete
  IdentityReveal.tsx             # Dramatic reveal animation at end
```

**Mobile UI layout (VOTE phase):**

```
┌──────────────────────────────┐
│ Identity Crisis      ⏱ 12s   │
├──────────────────────────────┤
│ 🎤 Alice asks:               │
│ ┌──────────────────────────┐ │
│ │ "Am I known for music?"  │ │
│ └──────────────────────────┘ │
│                              │
│ You know Alice is:           │
│ ┌──────────────────────────┐ │
│ │   🎵 Freddie Mercury     │ │  ← You see who Alice is
│ └──────────────────────────┘ │
├──────────────────────────────┤
│  ┌──────┐ ┌──────┐ ┌──────┐ │
│  │  YES │ │  NO  │ │MAYBE │ │  ← Vote buttons
│  └──────┘ └──────┘ └──────┘ │
├──────────────────────────────┤
│ Votes: 3/5 received          │
├──────────────────────────────┤
│ You are: ❓❓❓               │
│ Questions left: 2            │
└──────────────────────────────┘
```

### 1.12 Constants

```typescript
export const IC_QUESTIONS_PER_PLAYER = 3;
export const IC_ASK = 20;
export const IC_VOTE = 15;
export const IC_VOTE_RESULTS = 3;
export const IC_ASSIGNMENT_REVEAL = 5;
export const IC_FINAL_GUESS = 30;
export const IC_RESULTS = 10;

export const IC_CORRECT_GUESS = 200;
export const IC_EARLY_GUESS_BONUS_BASE = 300;
export const IC_EARLY_GUESS_PENALTY = -100;
export const IC_EFFICIENCY_BONUS = 20;
export const IC_VOTING_ACCURACY_BONUS = 5;

export const IC_GUESS_MATCH_THRESHOLD = 0.3;       // fuse.js threshold (lower = more forgiving)
export const IC_MAX_QUESTION_LENGTH = 200;
export const IC_MAX_GUESS_LENGTH = 100;
```

### 1.13 Game Settings Schema (§12A)

Host-configurable settings for Identity Crisis. Defined in `MinigameDefinition.settingsSchema`.
Handlers read values via `this.getSetting(key, CONSTANT_DEFAULT)`.

| Key | Type | Label | Description | Default | Constraints |
|---|---|---|---|---|---|
| `questionsPerPlayer` | `integer` | Questions Per Player | Number of "Who am I?" questions each player answers about | `3` | min: 2, max: 5, step: 1 |
| `askDuration` | `integer` | Ask Duration (seconds) | Time for the subject to ask a yes/no question | `30` | min: 15, max: 60, step: 5 |
| `voteDuration` | `integer` | Vote Duration (seconds) | Time for others to vote on the yes/no question | `15` | min: 10, max: 30, step: 5 |
| `finalGuessDuration` | `integer` | Final Guess Duration (seconds) | Time for the subject to guess their identity | `30` | min: 15, max: 60, step: 5 |
| `enableEarlyGuess` | `boolean` | Early Guess | Allow the subject to guess their identity before all questions are used | `true` | — |

**Constant Mapping:**

| Setting Key | Constant Override | Usage |
|---|---|---|
| `questionsPerPlayer` | `IC_QUESTIONS_PER_PLAYER` | `this.getSetting('questionsPerPlayer', IC_QUESTIONS_PER_PLAYER)` |
| `askDuration` | `IC_ASK_DURATION` | `this.getSetting('askDuration', IC_ASK_DURATION)` |
| `voteDuration` | `IC_VOTE_DURATION` | `this.getSetting('voteDuration', IC_VOTE_DURATION)` |
| `finalGuessDuration` | `IC_FINAL_GUESS_DURATION` | `this.getSetting('finalGuessDuration', IC_FINAL_GUESS_DURATION)` |
| `enableEarlyGuess` | `IC_ENABLE_EARLY_GUESS` | If `false`, the subject must use all questions |

### 1.14 Game History

**Game History Level:** Full Action Log

Identity Crisis is a social deduction game where the entire experience is built on dialogue — questions, votes, and guesses. Every action is small, text-based, and meaningful. The full Q&A log lets players relive how they (or others) narrowed down identities, making this one of the most replay-worthy formats.

**`initialState`**

```typescript
interface ICGameHistoryInit {
  identityPool: string;                              // identity pack ID used
  identityAssignments: Array<{
    userId: string;
    assignedIdentity: string;
  }>;
  questionOrder: string[];                           // turn order for asking
  maxQuestionsPerPlayer: number;
}
```

**Actions Logged**

| Action Type | Payload | Recorded When |
|---|---|---|
| `question_asked` | `{ askerId, questionText, roundNumber }` | Player submits a question |
| `vote_cast` | `{ voterId, vote: 'yes' \| 'no' \| 'maybe' }` | Each player votes on current question |
| `vote_result` | `{ yes, no, maybe, majorityAnswer }` | Voting phase closes |
| `early_guess` | `{ userId, guess, correct, matchScore, roundNumber }` | Player attempts an early guess |
| `final_guess` | `{ userId, guess, correct, matchScore }` | Player submits final guess |
| `identity_reveal` | `{ userId, assignedIdentity, guessedCorrectly }` | Results phase reveals all identities |

**Replay Value:** The social deduction aspect makes this a strong candidate for full logging. Players can review the Q&A transcript to see how answers led them toward (or away from) the correct identity, compare voting patterns, and spot the moment the penny dropped.

> **Note:** The `GameLog` also includes `gameSettings: GameSettingValues` at the top level (per core.md §12A.11), capturing the exact game settings used for this match.

### 1.15 History Display Configuration

**Detail Component:** `IdentityCrisisHistoryDetail`

Renders the expanded game log as a question-and-guess review:
- Identity assignments revealed (who was assigned whom)
- Question timeline with vote breakdowns (yes/no/maybe)
- Early guess attempts with outcomes (correct/incorrect)
- Final guess results
- Voting accuracy scores

**Searchable Fields:**

| Field Key | Label | Extraction |
|---|---|---|
| `identities` | Identities | All identity names from `assignment` actions |
| `questions` | Questions Asked | All question texts from `question_asked` actions |

**Filterable Fields:**

| Field Key | Label | Type | Details |
|---|---|---|---|
| `guessedCorrectly` | Guessed Own Identity | boolean | Whether user correctly identified themselves |
| `madeEarlyGuess` | Made Early Guess | boolean | Whether user attempted an early guess |
| `identityCategory` | Identity Category | select | Scientist, Musician, Fictional, Historical, etc. |

**Summary Extractor:**

```typescript
getSummary: (log) => {
  const correct = log.actions.filter(a => a.type === 'final_guess' && a.payload.correct);
  return `${correct.length}/${log.players.length} correct guesses — Identity deduction`;
}
```

**Component Structure:**

```
IdentityCrisisHistoryDetail.tsx
├── IdentityReveal (who was assigned whom)
├── QuestionTimeline (ordered questions + vote results)
│   ├── QuestionEntry (question text + asker)
│   └── VoteBreakdown (yes/no/maybe counts)
├── GuessResults (early + final guesses)
└── Final scores summary
```

### 1.16 MinigameRenderer & Client-Server Wiring

#### 1.16.1 MinigameRenderer Registration

```tsx
// In MinigameRenderer component map
const minigameComponents = {
  'identity-crisis': lazy(() => import('./minigames/identity-crisis/IdentityCrisisGame')),
  // ...other minigames
};
```

#### 1.16.2 Client-Side Store Integration

```tsx
useEffect(() => {
  const handlers: Record<string, (payload: any) => void> = {
    IC_IDENTITIES_REVEAL: (p) => setIdentities(p.identities),
    IC_TURN_START: (p) => setTurn({ ...p, isSelf: false }),
    IC_TURN_START_SELF: (p) => setTurn({ ...p, isSelf: true }),
    IC_QUESTION_ASKED: (p) => setCurrentQuestion(p.question),
    IC_VOTE_RECEIVED: (p) => updateVoteCount(p),
    IC_VOTE_RESULTS: (p) => setVoteResults(p),
    IC_EARLY_GUESS_RESULT: (p) => setGuessResult(p),
    IC_EARLY_GUESS_CORRECT: (p) => handleEarlyGuessCorrect(p),
    IC_FINAL_GUESS_PHASE: () => setPhase('final-guess'),
    IC_RESULTS: (p) => setResults(p),
    TIMER_TICK: (p) => setTimeRemaining(p.remaining),
  };

  Object.entries(handlers).forEach(([action, handler]) =>
    socket.on(action, handler)
  );
  return () => {
    Object.keys(handlers).forEach((action) => socket.off(action));
  };
}, [socket]);
```

#### 1.16.3 Client-Side Input Dispatch

```tsx
// Ask a question (during your turn)
socket.emit('IC_ASK_QUESTION', { question });

// Vote on the current question
socket.emit('IC_VOTE', { vote }); // vote: 'yes' | 'no' | 'maybe'

// Attempt an early guess (before final phase)
socket.emit('IC_EARLY_GUESS', { guess });

// Submit final guess (during final guess phase)
socket.emit('IC_FINAL_GUESS', { guess });
```

#### 1.16.4 Server-Side Handler Registration

```typescript
// In server/rmhbox/minigames/identity-crisis
import { IdentityCrisisGame } from './minigames/identity-crisis/IdentityCrisisGame';

MINIGAME_SERVER_REGISTRY.set('identity-crisis', IdentityCrisisGame);
```

#### 1.16.5 Sound Effect Integration

| Event | Sound | Notes |
|---|---|---|
| Identities revealed | `swoosh` | All players see their assigned pool |
| Turn start | `chime` | New question round begins |
| Question asked | `click` | Asker submits their question |
| Vote received | `click` | Each vote is acknowledged |
| Vote results | `swoosh` | Aggregated results displayed |
| Early guess correct | `scoreDing` | Player guessed their identity early |
| Early guess wrong | `buzzer` | Incorrect early guess |
| Final guess phase | `goFanfare` | Transition to final guessing round |
| Results reveal | `victoryFanfare` | All identities and scores shown |

#### 1.16.6 Spectator Rendering

Spectators are **omniscient** — they see ALL identities (including the asking player's) and all votes in real-time. The component checks spectator status and shows full identity cards for all players.

> **Note:** Critical information masking: the server sends `IC_TURN_START` (with identity) to all voters but `IC_TURN_START_SELF` (without identity) to the asker. The client component must render accordingly.

---

## 2. Ranking File

### 2.1 Overview

| Field | Value |
|---|---|
| **ID** | `ranking-file` |
| **Display Name** | Ranking File |
| **Category** | `social` |
| **Icon** | `list-ordered` (Lucide) |
| **Min Players** | 3 |
| **Max Players** | 16 |
| **Estimated Duration** | 120 seconds |
| **Supports Teams** | No |
| **Join-in-Progress** | `join_next_subround` |
| **Tags** | `['social', 'opinion', 'competitive', 'light']` |

### 2.2 Game Concept

A game of finding "common ground." Players are presented with 5 items from a category (e.g., "Fast Food Chains": McDonald's, Burger King, Wendy's, Chick-fil-A, Taco Bell) and must rank them 1–5. Scoring is based on how closely your ranking matches the **lobby average** — the player with the most "consensus" taste wins. It's not about having the "right" opinion, it's about being the most average.

### 2.3 Detailed Mechanics

#### 2.3.1 Round Structure

The game consists of `RF_TOTAL_ROUNDS` (default: **5**) rounds, each with a different category.

| Phase | Duration | Description |
|---|---|---|
| Category Reveal | 3s | Show category name and the 5 items |
| Ranking Phase | 25s | Players drag-and-drop to rank items 1–5 |
| Lock-In | 3s | Final chance to confirm/adjust |
| Results Reveal | 8s | Show the global average, how each player ranked, and scores |
| Next Round Transition | 2s | Prepare next category |

**Total time per round:** ~41s. 5 rounds = ~205s ≈ 3.4 minutes. Can be reduced to 3 rounds for shorter sessions.

#### 2.3.2 Category & Item Selection

Categories come from `data/rmhbox/ranking-file/categories.json`:

```typescript
interface RankingCategory {
  id: string;
  name: string;                         // e.g., "Fast Food Chains"
  items: string[];                      // exactly 5 items to rank
  emoji: string;                        // category emoji 🍔
  difficulty: 'easy' | 'medium' | 'hard';   // how subjective the ranking is
}
```

**Example categories:**
- 🍔 Fast Food Chains: McDonald's, Burger King, Wendy's, Chick-fil-A, Taco Bell
- 🎬 90s Movies: Titanic, Pulp Fiction, The Matrix, Forrest Gump, Jurassic Park
- 🎵 Music Genres: Pop, Rock, Hip-Hop, Country, Jazz
- 🏖️ Vacation Types: Beach, Mountain, City, Road Trip, Staycation
- 🐕 Pets: Dog, Cat, Fish, Hamster, Parrot

The server picks `RF_TOTAL_ROUNDS` categories without replacement, avoiding repeats.

#### 2.3.3 Ranking Input

Players rank the 5 items from 1 (best/top) to 5 (worst/bottom):
- **Desktop:** Drag-and-drop reordering in a vertical list.
- **Mobile:** Drag-and-drop with touch support, or tap to swap positions.
- Items start in a random order (shuffled per player so there's no positional bias).
- The player submits their final ranking when they're satisfied, or it auto-submits when the timer expires.

**Default ranking:** If a player doesn't submit (timeout without any interaction), they are assigned a random ranking. If they partially interacted (moved at least one item), their current arrangement is submitted.

#### 2.3.4 Consensus Calculation

After all players submit rankings, the server computes the **Global Average Ranking** for each item:

```typescript
function computeAverageRanking(
  submissions: Map<string, number[]>     // userId → [rank1, rank2, rank3, rank4, rank5] (positions for items 0-4)
): number[] {
  const itemCount = 5;
  const playerCount = submissions.size;
  const averages: number[] = [];
  
  for (let item = 0; item < itemCount; item++) {
    let sum = 0;
    for (const ranking of submissions.values()) {
      sum += ranking[item];
    }
    averages.push(sum / playerCount);
  }
  
  return averages;  // e.g., [1.4, 3.2, 2.8, 1.2, 4.4] — average rank for each item
}
```

The Global Average determines the "consensus" ordering.

#### 2.3.5 Scoring

Each player's score for a round is based on how closely their ranking matches the Global Average:

**Distance calculation:**  
For each item (i), compute `|playerRank[i] - averageRank[i]|`. Sum across all 5 items to get the **Total Distance**.

```typescript
function computeDistance(playerRanking: number[], averageRanking: number[]): number {
  return playerRanking.reduce((sum, rank, i) => sum + Math.abs(rank - averageRanking[i]), 0);
}
```

**Maximum possible distance** for 5 items ranked 1–5: theoretically ~12 (if perfectly inverted from the average).

**Scoring formula:**

```typescript
const maxDistance = 12;  // theoretical max deviation
const distance = computeDistance(playerRanking, averageRanking);
const normalizedScore = Math.max(0, 1 - (distance / maxDistance));  // 0–1
const roundScore = Math.round(normalizedScore * RF_MAX_ROUND);
```

| Distance | Approximate Score (with max 200) |
|---|---|
| 0.0 (perfect match) | 200 |
| 2.0 | 167 |
| 4.0 | 133 |
| 6.0 | 100 |
| 8.0 | 67 |
| 12.0 (worst case) | 0 |

**Exact match bonus:** If a player's ranking perfectly matches the Global Average ordering (same ordinal rank for every item), they get `RF_EXACT_MATCH_BONUS` (default: **100**).

**Bold outlier bonus:** If a player's ranking is the MOST different from the average (highest distance among all players), they get a small consolation `RF_OUTLIER_BONUS` (default: **25**) — a "you're unique!" award.

#### 2.3.6 Results Display

After scoring:
1. The Global Average ranking is shown as a bar chart (each item's average position).
2. Each player's ranking is shown side-by-side.
3. Items where a player deviated significantly from the average are highlighted.
4. The "most consensus" and "most unique" players for that round are called out.
5. Running cumulative scores are displayed.

### 2.4 Server-Side State Schema

```typescript
interface RankingFileState {
  currentRound: number;                              // 1-indexed
  totalRounds: number;
  phase: RFPhase;
  
  // Current category
  currentCategory: RankingCategory | null;
  
  // Submissions
  submissions: Map<string, number[]>;                // userId → ranking array [1-5 for items 0-4]
  hasSubmitted: Map<string, boolean>;
  
  // Computed results (after ranking phase)
  averageRanking: number[] | null;
  roundResults: RFRoundResult[];
  
  // Cumulative
  playerScores: Map<string, number>;
  
  // Timer
  phaseStartedAt: number;
  phaseEndsAt: number;
}

type RFPhase = 'CATEGORY_REVEAL' | 'RANKING' | 'LOCK_IN' | 'RESULTS_REVEAL' | 'TRANSITION' | 'GAME_OVER';

interface RFRoundResult {
  roundNumber: number;
  category: RankingCategory;
  averageRanking: number[];
  consensusOrder: number[];                          // item indices sorted by average rank
  playerResults: RFPlayerResult[];
}

interface RFPlayerResult {
  userId: string;
  userName: string;
  ranking: number[];
  distance: number;
  roundScore: number;
  isExactMatch: boolean;
  isOutlier: boolean;
}
```

### 2.5 WebSocket Event Map

#### Client → Server

| Action | Payload | Description |
|---|---|---|
| `RF_SUBMIT_RANKING` | `{ ranking: number[] }` | Submit ranking [1-5] for each of the 5 items |
| `RF_UPDATE_RANKING` | `{ ranking: number[] }` | Update ranking before lock-in (optional, for live preview) |

**Zod schemas:**

```typescript
const RFSubmitSchema = z.object({
  ranking: z.array(z.number().int().min(1).max(5)).length(5)
    .refine(
      (arr) => new Set(arr).size === 5,
      'Ranking must contain each position 1-5 exactly once'
    ),
});
```

#### Server → Client (Game Actions)

| Action Type | Payload | Sent To | Description |
|---|---|---|---|
| `RF_CATEGORY_REVEAL` | `{ round: number, totalRounds: number, category: RankingCategory, rankingDurationSeconds: number }` | All (lobby) | New category presented |
| `RF_SUBMISSION_COUNT` | `{ submitted: number, total: number }` | All (lobby) | Progress of submissions |
| `RF_LOCK_IN_PHASE` | `{ lockInSeconds: number }` | All (lobby) | Lock-in begins |
| `RF_ROUND_RESULTS` | `{ averageRanking: number[], consensusOrder: Array<{ item: string, avgRank: number }>, playerResults: RFPlayerResult[], mostConsensus: { userId: string, userName: string }, mostUnique: { userId: string, userName: string } }` | All (lobby) | Round results |
| `RF_GAME_OVER` | `{ finalRankings: RFFinalRanking[], categoryResults: RFRoundResult[] }` | All (lobby) | Game complete |
| `TIMER_START` | `{ totalDuration: number, timeRemaining: number }` | All (lobby) | Emitted at the start of each timed phase (RANKING, LOCK_IN) via `broadcastAction` |
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer (every 1s during all timed phases) via `broadcastAction` |
| `MINIGAME_ROUND` | `{ current: number, total: number }` | All (lobby) | Sub-round counter update (e.g. "Round 2/5") via `broadcastAction` |

**Supporting types:**

```typescript
interface RFFinalRanking {
  userId: string;
  userName: string;
  rank: number;
  totalScore: number;
  averageDistance: number;
  exactMatches: number;
  outlierRounds: number;
}
```

### 2.6 Information Masking

| Data | Player View | Spectator View |
|---|---|---|
| Category + items | Visible | Visible |
| Own ranking (during ranking) | Visible | N/A |
| Other players' rankings (during ranking) | **HIDDEN** | **VISIBLE** (see live rankings) |
| Submission status (who submitted) | Visible (count only, not identity) | Visible (who submitted) |
| Global average (during ranking) | **HIDDEN** | **HIDDEN** (no spoilers) |
| Global average (during results) | Visible | Visible |
| All players' rankings (during results) | Visible | Visible |
| Scores | Visible | Visible |

**`getStateForPlayer(userId)` during RANKING:**

```typescript
interface RFPlayerRankingState {
  phase: 'RANKING';
  round: number;
  totalRounds: number;
  category: { name: string; items: string[]; emoji: string };
  myRanking: number[] | null;         // my current ranking
  hasSubmitted: boolean;
  submittedCount: number;
  totalPlayers: number;
  timeRemaining: number;
  scores: Array<{ userId: string; userName: string; totalScore: number }>;
}
```

**Critical:** No player sees anyone else's ranking during the ranking phase. This preserves independent choices. If players could see others' rankings, they'd converge on the same answer, defeating the purpose.

### 2.7 Join-in-Progress Logic

**Policy:** `join_next_subround`

Each round is independent — a new category with no dependence on previous rounds. A late joiner can participate in the next round after the current one completes.

**On join:**
1. Player sees the current round's results (or waits for results phase to end).
2. They're included in the next round's ranking phase.
3. They start with 0 cumulative score.

### 2.8 Reconnection Behavior

On reconnect:
1. If in RANKING/LOCK_IN phase: Player can submit/update their ranking.
2. If they previously submitted, their ranking is preserved.
3. Cumulative scores are maintained.

### 2.9 Awards

| Award | Condition | Icon |
|---|---|---|
| Basic | Closest total ranking to the lobby average (winner) | `users` |
| Trendsetter | Most outlier rounds (most unique taste) | `snowflake` |
| Mind Meld | Most exact matches with the average | `brain` |
| Consistent | Lowest variance in distance across rounds | `ruler` |
| Hot Take | Single round with the highest distance from average | `flame` |

### 2.10 NPM Package Suggestions

| Package | Purpose | Notes |
|---|---|---|
| `@dnd-kit/core` + `@dnd-kit/sortable` | Drag-and-drop ranking UI on the client | Lightweight, accessible, supports touch. Already commonly used in React DnD scenarios. |

### 2.11 Client Component Structure

```
components/rmhbox/minigames/ranking-file/
  RankingFileGame.tsx            # Main game component, phase router
  CategoryReveal.tsx             # Animated category + items display
  RankingList.tsx                # Drag-and-drop sortable list (5 items)
  RankingItem.tsx                # Individual item in the ranking (draggable)
  ResultsComparison.tsx          # Side-by-side view of all rankings vs average
  AverageRankingChart.tsx        # Bar chart showing average positions
  DistanceIndicator.tsx          # Visual showing how close to average
```

**Mobile UI layout (RANKING phase):**

```
┌──────────────────────────────┐
│ Ranking File  Round 2/5  ⏱18s│
├──────────────────────────────┤
│ 🍔 Rank these Fast Food      │
│    Chains from Best to Worst  │
├──────────────────────────────┤
│ Drag to reorder:             │
│ ┌────────────────────────┐   │
│ │ 1. 🏆 Chick-fil-A      │ ≡ │  ← Drag handle
│ ├────────────────────────┤   │
│ │ 2. 🥈 McDonald's       │ ≡ │
│ ├────────────────────────┤   │
│ │ 3. 🥉 Wendy's          │ ≡ │
│ ├────────────────────────┤   │
│ │ 4.    Taco Bell         │ ≡ │
│ ├────────────────────────┤   │
│ │ 5.    Burger King       │ ≡ │
│ └────────────────────────┘   │
├──────────────────────────────┤
│     [ 🔒 Lock In Ranking ]   │
│   3/6 players submitted      │
└──────────────────────────────┘
```

### 2.12 Constants

```typescript
export const RF_TOTAL_ROUNDS = 5;
export const RF_ITEMS_PER_CATEGORY = 5;

export const RF_CATEGORY_REVEAL = 3;
export const RF_RANKING = 25;
export const RF_LOCK_IN = 3;
export const RF_RESULTS = 8;
export const RF_TRANSITION = 2;

export const RF_MAX_ROUND = 200;
export const RF_EXACT_MATCH_BONUS = 100;
export const RF_OUTLIER_BONUS = 25;
export const RF_MAX_THEORETICAL_DISTANCE = 12;
```

### 2.13 Game Settings Schema (§12A)

Host-configurable settings for Ranking File. Defined in `MinigameDefinition.settingsSchema`.
Handlers read values via `this.getSetting(key, CONSTANT_DEFAULT)`.

| Key | Type | Label | Description | Default | Constraints |
|---|---|---|---|---|---|
| `totalRounds` | `integer` | Number of Rounds | How many ranking rounds to play | `4` | min: 2, max: 6, step: 1 |
| `rankingDuration` | `integer` | Ranking Duration (seconds) | Time to arrange items in order | `45` | min: 20, max: 90, step: 5 |
| `itemsPerCategory` | `integer` | Items Per Category | Number of items to rank in each round | `5` | min: 3, max: 7, step: 1 |
| `enableOutlierBonus` | `boolean` | Outlier Bonus | Award bonus points for correctly placing the hardest item | `true` | — |

**Constant Mapping:**

| Setting Key | Constant Override | Usage |
|---|---|---|
| `totalRounds` | `RF_TOTAL_ROUNDS` | `this.getSetting('totalRounds', RF_TOTAL_ROUNDS)` |
| `rankingDuration` | `RF_RANKING_DURATION` | `this.getSetting('rankingDuration', RF_RANKING_DURATION)` |
| `itemsPerCategory` | `RF_ITEMS_PER_CATEGORY` | `this.getSetting('itemsPerCategory', RF_ITEMS_PER_CATEGORY)` |
| `enableOutlierBonus` | `RF_OUTLIER_BONUS` | If `false`, no bonus for hardest item |

### 2.14 Game History

**Game History Level:** Summary Log

Ranking File generates interesting data — every player's subjective ranking vs. the group consensus — but the core interaction (drag items into order) doesn't produce granular actions worth replaying frame-by-frame. A per-round summary captures the meaningful comparisons and debate-worthy disagreements without bloating the log.

**`initialState`**

```typescript
interface RFGameHistoryInit {
  categoryPack: string;                              // category pack ID used
  totalRounds: number;
  itemsPerRound: number;
  playerCount: number;
}
```

**Actions Logged**

| Action Type | Payload | Recorded When |
|---|---|---|
| `round_start` | `{ roundNumber, category, items: string[] }` | New round begins |
| `ranking_submitted` | `{ userId, submittedOrder: string[] }` | Player locks in their ranking |
| `round_result` | `{ consensusRanking: string[], playerScores: Array<{ userId, distance, points, exactMatches }> }` | Round scoring completes |
| `outlier_awarded` | `{ userId, category, outlierItem, deviation }` | Player earns outlier bonus |
| `game_complete` | `{ finalStandings: Array<{ userId, totalPoints, roundBreakdown: number[] }> }` | All rounds finished |

**Replay Value:** Comparing how players ranked the same items reveals taste differences and unexpected consensus. The round-by-round breakdown fuels post-game arguments about whether pizza truly belongs above tacos.

> **Note:** The `GameLog` also includes `gameSettings: GameSettingValues` at the top level (per core.md §12A.11), capturing the exact game settings used for this match.

### 2.15 History Display Configuration

**Detail Component:** `RankingFileHistoryDetail`

Renders the expanded game log as a per-round ranking comparison:
- Category and items shown for each round
- Consensus ranking vs. each player's ranking (visual diff)
- Distance scores per player per round
- Exact match bonuses and outlier bonuses highlighted
- Per-round score breakdown

**Searchable Fields:**

| Field Key | Label | Extraction |
|---|---|---|
| `categories` | Categories | Category names from `round_start` actions |
| `items` | Items Ranked | Item names from `round_start` actions |

**Filterable Fields:**

| Field Key | Label | Type | Details |
|---|---|---|---|
| `exactMatches` | Exact Matches | range | Number of items ranked in exact consensus position |
| `wasOutlier` | Was Outlier | boolean | Whether user had the most unique ranking |
| `roundCount` | Rounds Played | range | Number of rounds |

**Summary Extractor:**

```typescript
getSummary: (log) => {
  const rounds = log.actions.filter(a => a.type === 'round_start');
  const categories = rounds.map(r => r.payload.category).join(', ');
  return `${rounds.length} rounds — ${categories}`;
}
```

**Component Structure:**

```
RankingFileHistoryDetail.tsx
├── RoundCard (per round)
│   ├── CategoryHeader (category name)
│   ├── RankingComparison (consensus vs. player rankings)
│   ├── DistanceScores (Manhattan distance visualization)
│   └── BonusBadges (exact match, outlier)
└── Final scores summary
```

### 2.16 MinigameRenderer & Client-Server Wiring

#### 2.16.1 MinigameRenderer Registration

```tsx
// In MinigameRenderer component map
const minigameComponents = {
  'ranking-file': lazy(() => import('./minigames/ranking-file/RankingFileGame')),
  // ...other minigames
};
```

#### 2.16.2 Client-Side Store Integration

```tsx
useEffect(() => {
  const handlers: Record<string, (payload: any) => void> = {
    RF_CATEGORY_REVEAL: (p) => setCategory(p),
    RF_SUBMISSION_COUNT: (p) => setSubmissionCount(p.count),
    RF_LOCK_IN_PHASE: () => setPhase('lock-in'),
    RF_ROUND_RESULTS: (p) => setRoundResults(p),
    RF_GAME_OVER: (p) => setResults(p),
    TIMER_TICK: (p) => setTimeRemaining(p.remaining),
  };

  Object.entries(handlers).forEach(([action, handler]) =>
    socket.on(action, handler)
  );
  return () => {
    Object.keys(handlers).forEach((action) => socket.off(action));
  };
}, [socket]);
```

#### 2.16.3 Client-Side Input Dispatch

```tsx
// Submit final ranking (array of 5 unique numbers 1-5)
socket.emit('RF_SUBMIT_RANKING', { ranking });

// Optional: send live preview as player reorders
socket.emit('RF_UPDATE_RANKING', { ranking });
```

#### 2.16.4 Server-Side Handler Registration

```typescript
// In server/rmhbox/minigames/ranking-file
import { RankingFileGame } from './minigames/ranking-file/RankingFileGame';

MINIGAME_SERVER_REGISTRY.set('ranking-file', RankingFileGame);
```

#### 2.16.5 Sound Effect Integration

| Event | Sound | Notes |
|---|---|---|
| Category revealed | `goFanfare` | New category and items shown |
| Submission count update | *(silent)* | Progress indicator only |
| Lock-in phase | `swoosh` | Final chance to submit ranking |
| Round results | `victoryFanfare` | Consensus ranking and scores shown |
| Game over | `victoryFanfare` | Final standings revealed |
| Timer warning | `countdownBeep` | Time running low to submit |

#### 2.16.6 Spectator Rendering

During the ranking phase, spectators see submission progress (who submitted, not the rankings). During results, spectators see all rankings and the average. The component renders a read-only CategoryReveal without drag-and-drop interaction.

> **Note:** Uses `@dnd-kit/core` and `@dnd-kit/sortable` for drag-and-drop ranking on the client. Items start in random order (shuffled per player to prevent positional bias).

---

## 3. Pixel Pushers

### 3.1 Overview

| Field | Value |
|---|---|
| **ID** | `pixel-pushers` |
| **Display Name** | Pixel Pushers |
| **Category** | `action` |
| **Icon** | `move` (Lucide) |
| **Min Players** | 2 |
| **Max Players** | 8 |
| **Estimated Duration** | 120 seconds |
| **Supports Teams** | Yes (entire group is one team) |
| **Join-in-Progress** | `join_immediately` |
| **Tags** | `['action', 'physics', 'cooperative', 'coordination']` |

### 3.2 Game Concept

Collaborative physics-based navigation. Players control colored circles ("Pushers") on a 2D canvas. A neutral "Physics Ball" sits on the field. The team must physically bump into the ball to push it through a series of waypoints or into a goal zone. Every `PP_POLARITY_INTERVAL` (default: **10 seconds**), one player's "Polarity" flips — they begin *attracting* the ball like a magnet instead of pushing it, forcing the team to adapt their formation.

### 3.3 Detailed Mechanics

#### 3.3.1 Game Flow

| Phase | Duration | Description |
|---|---|---|
| Level Preview | 3s | Show the maze/course layout |
| Active Phase | 90s (or until goal reached) | Players move and push the ball |
| Level Complete | 3s | Celebrate, show stats |
| Next Level / Game Over | 2s | Load next level or show final results |

The game has `PP_TOTAL_LEVELS` (default: **3**) levels of increasing complexity.

#### 3.3.2 The Canvas

The game field is a 2D canvas (`PP_CANVAS_WIDTH` × `PP_CANVAS_HEIGHT`, default: **600 × 400** logical pixels).

Elements on the canvas:
- **Pushers** (player-controlled circles): Radius `PP_PUSHER_RADIUS` (default: **15px**). Each player has a unique color.
- **Physics Ball** (the target): Radius `PP_BALL_RADIUS` (default: **20px**). Neutral gray color.
- **Walls**: Static rectangular obstacles forming maze corridors.
- **Goal Zone**: A highlighted rectangular area. Getting the ball into this zone completes the level.
- **Waypoints** (optional, for extra points): Intermediate target areas the ball must pass through in order.

#### 3.3.3 Player Movement

Players move their Pusher using:
- **Desktop:** Arrow keys or WASD for continuous movement.
- **Mobile:** Virtual joystick (on-screen touch joystick in the bottom-left corner).

Movement is continuous (not grid-based):
- The client sends `PP_MOVE` actions at `PP_MOVE_INPUT_RATE` (default: **15** Hz — 15 times per second).
- Each input contains a **direction vector** (normalized) and whether the player is pressing move or idle.
- Server applies movement: `position += direction × PP_PUSHER_SPEED × deltaTime`.
- `PP_PUSHER_SPEED` (default: **3** pixels per tick at 30 ticks/second).

**Wall collision:** Pushers cannot pass through walls. The server resolves wall collisions using AABB (axis-aligned bounding box) checks. The pusher is pushed back to the nearest valid position.

#### 3.3.4 Ball Physics

The Physics Ball follows simplified 2D physics:

```typescript
interface BallPhysics {
  position: { x: number; y: number };
  velocity: { vx: number; vy: number };
  radius: number;
  friction: number;                      // 0.97 — velocity damping per tick
  mass: number;                          // 1.0 (for collision response)
}
```

**Pusher → Ball collision (push):**
When a pusher overlaps with the ball:
1. Compute the collision normal (ball center - pusher center, normalized).
2. Apply impulse to the ball along the normal: `impulse = PP_PUSH_FORCE × overlap`.
3. `ball.velocity += impulse / ball.mass`.
4. Separate the ball from the pusher (resolve overlap).

```typescript
const PP_PUSH_FORCE = 0.8;         // impulse magnitude
const PP_BALL_FRICTION = 0.97;     // velocity damping per tick
const PP_BALL_MAX_SPEED = 8;       // max velocity magnitude
```

**Wall collision (ball):** Same as pusher — AABB collision, velocity component perpendicular to wall is negated (bounce), with a coefficient of restitution `PP_BALL_WALL_RESTITUTION` (default: **0.6**).

**Ball-to-ball:** There's only one ball, so no ball-ball collisions.

#### 3.3.5 Polarity Flip (The Twist)

Every `PP_POLARITY_INTERVAL` (default: **10s**), the server randomly selects one player to have their polarity **flipped**:

**Normal polarity (Push):** The pusher pushes the ball away on collision (standard physics).

**Flipped polarity (Attract):** The pusher continuously attracts the ball when within `PP_ATTRACT_RADIUS` (default: **80px**):
- An attractive force is applied each tick: `force = PP_ATTRACT_FORCE / (distance²)` (inverse-square, capped at `PP_MAX_ATTRACT_FORCE`).
- The ball accelerates toward the attracted player.
- On direct contact, the ball "sticks" briefly and then releases with reduced velocity.

**Polarity flip rules:**
- Only ONE player has flipped polarity at a time.
- When a new player's polarity flips, the previous player's polarity returns to normal.
- The player whose polarity flips receives a prominent visual indicator (pulsing red aura, "MAGNET!" label).
- A 3-second countdown warning precedes each polarity flip: `PP_POLARITY_WARNING`.
- The flipped player cannot disable the attraction — they must physically move away from the ball to avoid pulling it off course.

**Strategy:** The attracted player should move AWAY from the ball's path so the attraction doesn't interfere. If they're between the ball and the goal, the attraction actually helps! Players must constantly reposition based on current polarity assignments.

#### 3.3.6 Waypoints

Some levels have ordered waypoints:
- The ball must pass through waypoints in sequence (1 → 2 → 3 → Goal).
- Each waypoint is a circular zone (radius `PP_WAYPOINT_RADIUS`, default: **30px**).
- When the ball enters a waypoint zone, it's marked as "reached" and the next waypoint activates.
- Waypoints give bonus points when reached.
- Skipping waypoints: If the ball enters waypoint 3 before 2, it doesn't count — only the next sequential waypoint is active.

#### 3.3.7 Scoring

| Event | Points |
|---|---|
| Level completed | `PP_LEVEL_COMPLETE_BONUS` (default: **200** per player) |
| Waypoint reached | `PP_WAYPOINT` (default: **50** per player) |
| Time bonus (level completion) | `PP_TIME_BONUS_PER_SECOND` × seconds remaining (default: **3** × remaining) |
| Most pushes (MVP pusher) | `PP_MVP_BONUS` (default: **75**) |
| Handling polarity well (moved away from ball during attraction, ball didn't deviate more than threshold) | `PP_POLARITY_CONTROL_BONUS` (default: **50** per polarity flip handled well) |
| Level failed (time ran out) | 0 (no penalty, continue to next level) |

#### 3.3.8 Level Design

Levels are defined in `data/rmhbox/pixel-pushers/levels.json`:

```typescript
interface PPLevel {
  id: string;
  name: string;                         // "The Corridor", "The Maze", "The Gauntlet"
  walls: Array<{ x: number; y: number; width: number; height: number }>;
  ballStart: { x: number; y: number };
  goalZone: { x: number; y: number; width: number; height: number };
  waypoints: Array<{ x: number; y: number; order: number }>;
  playerStartPositions: Array<{ x: number; y: number }>;
  difficulty: 'easy' | 'medium' | 'hard';
}
```

### 3.4 Server-Side State Schema

```typescript
interface PixelPushersState {
  currentLevel: number;                              // 0-indexed
  totalLevels: number;
  phase: PPPhase;
  
  // Canvas
  canvasWidth: number;
  canvasHeight: number;
  
  // Level layout
  currentLevelData: PPLevel;
  walls: Array<{ x: number; y: number; width: number; height: number }>;
  goalZone: { x: number; y: number; width: number; height: number };
  waypoints: PPWaypoint[];
  nextWaypointIndex: number;
  
  // Ball
  ball: BallPhysics;
  
  // Players
  pushers: Map<string, PusherState>;
  
  // Polarity
  polarityFlippedUserId: string | null;
  nextPolarityFlipAt: number;
  
  // Scoring
  playerScores: Map<string, number>;
  levelStartedAt: number;
  
  // Timer
  phaseStartedAt: number;
  phaseEndsAt: number;
}

type PPPhase = 'LEVEL_PREVIEW' | 'ACTIVE' | 'LEVEL_COMPLETE' | 'GAME_OVER';

interface PusherState {
  userId: string;
  position: { x: number; y: number };
  color: string;
  polarity: 'push' | 'attract';
  moveDirection: { x: number; y: number } | null;   // current input direction
  pushCount: number;                                 // times they've pushed the ball
}

interface PPWaypoint {
  x: number;
  y: number;
  order: number;
  reached: boolean;
}
```

### 3.5 WebSocket Event Map

#### Client → Server

| Action | Payload | Description |
|---|---|---|
| `PP_MOVE` | `{ dx: number, dy: number }` | Movement direction vector (normalized, or {0,0} for idle) |

**Zod schema:**

```typescript
const PPMoveSchema = z.object({
  dx: z.number().min(-1).max(1),
  dy: z.number().min(-1).max(1),
});
```

Note: Movement input is sent at fixed intervals (~15Hz). The server applies movement every tick.

#### Server → Client (Game Actions)

| Action Type | Payload | Sent To | Description |
|---|---|---|---|
| `PP_LEVEL_START` | `{ level: number, levelName: string, layout: PPLevelLayout, activeDurationSeconds: number }` | All (lobby) | Level begins |
| `PP_STATE_UPDATE` | `{ ball: { x, y, vx, vy }, pushers: Array<{ userId, x, y, polarity }> }` | All (lobby) | Full state snapshot (broadcast at 15Hz — every other simulation tick) |
| `PP_PUSH_EVENT` | `{ userId: string, userName: string, impulse: { x: number, y: number } }` | All (lobby) | Visual feedback when a player pushes the ball |
| `PP_POLARITY_WARNING` | `{ targetUserId: string, targetUserName: string, secondsUntilFlip: number }` | All (lobby) | Polarity flip incoming |
| `PP_POLARITY_FLIP` | `{ userId: string, userName: string, newPolarity: 'attract' }` | All (lobby) | A player's polarity has flipped |
| `PP_POLARITY_RESTORE` | `{ userId: string, userName: string }` | All (lobby) | Previous player's polarity restored to push |
| `PP_WAYPOINT_REACHED` | `{ waypointOrder: number, nextWaypointOrder: number \| null }` | All (lobby) | Ball passed through a waypoint |
| `PP_LEVEL_COMPLETE` | `{ timeMs: number, waypointsReached: number, totalWaypoints: number }` | All (lobby) | Level completed! |
| `PP_LEVEL_FAILED` | `{ reason: 'TIMEOUT' }` | All (lobby) | Level time ran out |
| `PP_GAME_OVER` | `{ finalRankings: PPFinalRanking[], levelsCompleted: number, totalPushes: number }` | All (lobby) | Game over |
| `TIMER_START` | `{ totalDuration: number, timeRemaining: number }` | All (lobby) | Emitted at the start of each ACTIVE phase via `broadcastAction` |
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer (every 1s during all timed phases) via `broadcastAction` |
| `MINIGAME_ROUND` | `{ current: number, total: number }` | All (lobby) | Sub-round counter update (e.g. "Level 2/3") via `broadcastAction` |

**Supporting types:**

```typescript
interface PPLevelLayout {
  walls: Array<{ x: number; y: number; width: number; height: number }>;
  goalZone: { x: number; y: number; width: number; height: number };
  waypoints: Array<{ x: number; y: number; order: number }>;
  ballStart: { x: number; y: number };
  playerStartPositions: Array<{ x: number; y: number }>;
}

interface PPFinalRanking {
  userId: string;
  userName: string;
  rank: number;
  totalScore: number;
  totalPushes: number;
  polarityFlipsHandled: number;
}
```

### 3.6 Information Masking

Pixel Pushers is a cooperative game with full shared visibility — no information masking is needed during gameplay. Every player sees the same canvas in real-time.

| Data | Player View | Spectator View |
|---|---|---|
| Ball position & velocity | Visible | Visible |
| All pusher positions | Visible | Visible |
| Polarity states (who is attracting) | Visible | Visible |
| Maze/wall layout | Visible | Visible |
| Waypoints & goal | Visible | Visible |
| Individual push counts | **HIDDEN** until results | **VISIBLE** |
| Scores | Visible (cumulative) | Visible |

**`getStateForPlayer(userId)`:**

```typescript
interface PPPlayerActiveState {
  phase: 'ACTIVE';
  level: number;
  ball: { x: number; y: number };
  pushers: Array<{ userId: string; userName: string; x: number; y: number; color: string; polarity: 'push' | 'attract' }>;
  waypoints: Array<{ x: number; y: number; order: number; reached: boolean }>;
  goalZone: { x: number; y: number; width: number; height: number };
  timeRemaining: number;
  myUserId: string;                    // so the client knows which pusher is "me"
}
```

### 3.7 Join-in-Progress Logic

**Policy:** `join_immediately`

This is one of the rare games that supports immediate joining:
1. The new player is assigned a **Pusher** at a valid spawn position (not inside a wall, away from the ball).
2. Their state is added to the simulation immediately.
3. They receive the current level layout and begin moving.
4. Key assignments and polarity flip rotation include them from the next cycle.

**Why this works:** The game is cooperative, not turn-based. Adding a player doesn't disrupt existing gameplay — it just adds another pusher to the field. More players can be helpful.

**No retroactive scoring:** The joining player starts at 0 score. They can earn points from the current level onward (prorated for time already elapsed).

### 3.8 Reconnection Behavior

On reconnect:
1. Player receives the current canvas state (ball, all pushers, walls, waypoints).
2. Their pusher is wherever they left it (position preserved).
3. If their polarity was flipped, it's still flipped.
4. They can immediately start moving again.

### 3.9 Player Disconnect Mid-Game

- Disconnected player's pusher becomes **frozen** (stops moving, still has collision).
- If their polarity was "attract," the attraction persists from their frozen position — this can be problematic. After the grace period, if they don't reconnect:
  - Their polarity is restored to "push" (frozen pusher becomes obstacle only).
  - Their pusher fades to transparent (becoming ghost — no collision) after 10s, to prevent permanently blocking a corridor.

### 3.10 Awards

| Award | Condition | Icon |
|---|---|---|
| Heavy Hitter | Most ball pushes across all levels | `hand-fist` |
| Gravity Master | Handled polarity attraction best (moved away from ball path during attraction — proximity-based calculation) | `magnet` |
| Goal Scorer | Pushed the ball into the goal zone (last touch before goal) | `target` |
| Speed Demon | Level completed fastest | `zap` |
| Wall Flower | Spent the most time near walls (least effective positioning, humorous) | `flower` |

### 3.11 NPM Package Suggestions

No external physics engine needed. The physics are simplified:
- Circle-circle collision detection (ball vs pushers): standard distance check.
- Circle-AABB collision (pushers/ball vs walls): straightforward.
- Velocity damping, impulse application, inverse-square attraction: basic math.

The entire physics simulation is ~100 lines of TypeScript. Using a full physics engine would add unnecessary bundle size and complexity for this level of physics.

### 3.12 Client Component Structure

```
components/rmhbox/minigames/pixel-pushers/
  PixelPushersGame.tsx           # Main game component, phase router
  GameCanvas.tsx                 # HTML5 Canvas renderer (walls, ball, pushers, waypoints, goal)
  VirtualJoystick.tsx            # Mobile touch joystick
  PolarityIndicator.tsx          # "MAGNET!" pulsing indicator on attracted player
  WaypointMarker.tsx             # Waypoint circle with order number
  LevelComplete.tsx              # Level success animation
  PixelPushersResults.tsx        # Final results with push counts
```

**Mobile UI layout (ACTIVE phase):**

```
┌──────────────────────────────┐
│ Pixel Pushers Lvl 2  ⏱ 1:05  │
├──────────────────────────────┤
│                              │
│ ┌─────────────────────────┐  │
│ │ █████████ ██████████████│  │  ← Walls
│ │         ○           ███│  │  ← ○ = Ball
│ │  🔴      ████          │  │  ← 🔴 = You (pushing)
│ │         ████    ②      │  │  ← ② = Waypoint 2
│ │ ████            🟡     │  │  ← 🟡 = Other player
│ │         🔵(MAGNET!)    │  │  ← 🔵 = Attracted player
│ │ █████                  │  │
│ │              ┌─────┐   │  │
│ │              │GOAL │   │  │  ← Goal zone
│ │              └─────┘   │  │
│ └─────────────────────────┘  │
│                              │
│  ┌─────┐  Waypoints: 1/3 ✓  │
│  │  🕹️  │  Next polarity: 4s │  ← Virtual joystick
│  └─────┘                     │
└──────────────────────────────┘
```

### 3.13 Constants

```typescript
export const PP_TOTAL_LEVELS = 3;
export const PP_CANVAS_WIDTH = 600;
export const PP_CANVAS_HEIGHT = 400;

export const PP_LEVEL_PREVIEW = 3;
export const PP_ACTIVE_DURATION = 90;
export const PP_LEVEL_COMPLETE = 3;

export const PP_PUSHER_RADIUS = 15;
export const PP_BALL_RADIUS = 20;
export const PP_PUSHER_SPEED = 3;                   // pixels per tick
export const PP_PUSH_FORCE = 0.8;
export const PP_BALL_FRICTION = 0.97;
export const PP_BALL_MAX_SPEED = 8;
export const PP_BALL_WALL_RESTITUTION = 0.6;

export const PP_POLARITY_INTERVAL = 10;
export const PP_POLARITY_WARNING = 3;
export const PP_ATTRACT_RADIUS = 80;
export const PP_ATTRACT_FORCE = 200;                // numerator in inverse-square law
export const PP_MAX_ATTRACT_FORCE = 2.0;            // clamp per tick

export const PP_WAYPOINT_RADIUS = 30;
export const PP_MOVE_INPUT_RATE = 15;               // Hz
export const PP_SIMULATION_TICK = 33;            // ~30 ticks/second
export const PP_STATE_BROADCAST_RATE = 15;          // Hz (every other tick)

export const PP_LEVEL_COMPLETE_BONUS = 200;
export const PP_WAYPOINT = 50;
export const PP_TIME_BONUS_PER_SECOND = 3;
export const PP_MVP_BONUS = 75;
export const PP_POLARITY_CONTROL_BONUS = 50;
```

### 3.14 Game Settings Schema (§12A)

Host-configurable settings for Pixel Pushers. Defined in `MinigameDefinition.settingsSchema`.
Handlers read values via `this.getSetting(key, CONSTANT_DEFAULT)`.

| Key | Type | Label | Description | Default | Constraints |
|---|---|---|---|---|---|
| `totalLevels` | `integer` | Number of Levels | How many cooperative pixel-art levels to complete | `3` | min: 2, max: 5, step: 1 |
| `activeDuration` | `integer` | Active Duration (seconds) | Time limit per level | `90` | min: 45, max: 180, step: 15 |
| `enablePolarityFlip` | `boolean` | Polarity Flip | Enable the mechanic where push/pull controls invert periodically | `true` | — |
| `polarityInterval` | `integer` | Polarity Interval (seconds) | How often the polarity flips | `15` | min: 8, max: 30, step: 1 |

**Constant Mapping:**

| Setting Key | Constant Override | Usage |
|---|---|---|
| `totalLevels` | `PP_TOTAL_LEVELS` | `this.getSetting('totalLevels', PP_TOTAL_LEVELS)` |
| `activeDuration` | `PP_ACTIVE_DURATION` | `this.getSetting('activeDuration', PP_ACTIVE_DURATION)` |
| `enablePolarityFlip` | `PP_ENABLE_POLARITY_FLIP` | If `false`, polarity never flips |
| `polarityInterval` | `PP_POLARITY_INTERVAL` | `this.getSetting('polarityInterval', PP_POLARITY_INTERVAL)` |

### 3.15 Game History

**Game History Level:** Minimal Log

Pixel Pushers is a real-time cooperative physics game running at 30 ticks/second — logging every position update would produce massive payloads with little replay value. Instead, only milestone events (level completions, waypoints, polarity flips) are captured, giving a clear picture of team progression without the noise.

**`initialState`**

```typescript
interface PPGameHistoryInit {
  levelSequence: string[];                           // ordered level layout IDs
  totalLevels: number;
  playerCount: number;
  initialPolarity: Record<string, 'positive' | 'negative'>;  // userId → starting polarity
}
```

**Actions Logged**

| Action Type | Payload | Recorded When |
|---|---|---|
| `level_start` | `{ levelIndex, layoutId, timeLimit }` | Team begins a level |
| `waypoint_hit` | `{ userId, waypointId, elapsed }` | Player reaches a waypoint |
| `polarity_flip` | `{ targetUserId, flippedBy: 'server' \| 'obstacle', newPolarity, elapsed }` | Player's polarity is inverted |
| `level_complete` | `{ levelIndex, completionTime, waypointsCollected, timeBonus }` | All players reach the exit |
| `level_failed` | `{ levelIndex, reason: 'timeout' \| 'all_eliminated', elapsed }` | Team fails a level |
| `game_complete` | `{ levelsCleared, totalTime, mvpUserId, playerStats: Array<{ userId, waypointsHit, flipsReceived }> }` | Run ends |

**Replay Value:** The log shows team coordination through level-by-level progression. Polarity flip events highlight the cooperative chaos, and completion times let teams compare runs and track improvement.

> **Note:** The `GameLog` also includes `gameSettings: GameSettingValues` at the top level (per core.md §12A.11), capturing the exact game settings used for this match.

### 3.16 History Display Configuration

**Detail Component:** `PixelPushersHistoryDetail`

Renders the expanded game log as an arena replay summary:
- Arena layout with block positions and polarity states
- Goal zone completion status
- Per-player push contributions
- Polarity toggle timeline
- Score breakdown per goal zone

**Searchable Fields:**

| Field Key | Label | Extraction |
|---|---|---|
| `playerNames` | Player Names | All player names from the game log |

**Filterable Fields:**

| Field Key | Label | Type | Details |
|---|---|---|---|
| `blocksScored` | Blocks Scored | range | Number of blocks user pushed into correct goals |
| `polarityToggles` | Polarity Toggles | range | Number of polarity toggles by user |

**Summary Extractor:**

```typescript
getSummary: (log) => {
  const scored = log.actions.filter(a => a.type === 'block_scored');
  return `${scored.length} blocks scored — Physics puzzle`;
}
```

**Component Structure:**

```
PixelPushersHistoryDetail.tsx
├── ArenaView (block positions + polarity colors)
├── GoalZoneStatus (completion per zone)
├── PlayerContributions (pushes per player)
├── PolarityTimeline (toggle events)
└── Final scores summary
```

### 3.17 MinigameRenderer & Client-Server Wiring

#### 3.17.1 MinigameRenderer Registration

```tsx
// In MinigameRenderer component map
const minigameComponents = {
  'pixel-pushers': lazy(() => import('./minigames/pixel-pushers/PixelPushersGame')),
  // ...other minigames
};
```

#### 3.17.2 Client-Side Store Integration

```tsx
useEffect(() => {
  const handlers: Record<string, (payload: any) => void> = {
    PP_LEVEL_START: (p) => initLevel(p),
    PP_STATE_UPDATE: (p) => applyServerState(p),
    PP_PUSH_EVENT: (p) => showPushEffect(p),
    PP_POLARITY_WARNING: (p) => setPolarityWarning(p),
    PP_POLARITY_FLIP: (p) => flipPolarity(p),
    PP_POLARITY_RESTORE: (p) => restorePolarity(p),
    PP_WAYPOINT_REACHED: (p) => collectWaypoint(p),
    PP_LEVEL_COMPLETE: (p) => setLevelComplete(p),
    PP_LEVEL_FAILED: (p) => setLevelFailed(p),
    PP_GAME_OVER: (p) => setResults(p),
    TIMER_TICK: (p) => setTimeRemaining(p.remaining),
  };

  Object.entries(handlers).forEach(([action, handler]) =>
    socket.on(action, handler)
  );
  return () => {
    Object.keys(handlers).forEach((action) => socket.off(action));
  };
}, [socket]);
```

#### 3.17.3 Client-Side Input Dispatch

```tsx
// Movement input (normalized direction vector, sent at ~15Hz via throttled interval)
socket.emit('PP_MOVE', { dx, dy });
```

#### 3.17.4 Server-Side Handler Registration

```typescript
// In server/rmhbox/minigames/pixel-pushers
import { PixelPushersGame } from './minigames/pixel-pushers/PixelPushersGame';

MINIGAME_SERVER_REGISTRY.set('pixel-pushers', PixelPushersGame);
```

#### 3.17.5 Sound Effect Integration

| Event | Sound | Notes |
|---|---|---|
| Level start | `goFanfare` | Team begins a new level |
| Push event | `click` | Player pushes the ball |
| Polarity warning | `countdownBeep` | Polarity flip is imminent |
| Polarity flip | `swoosh` | Player's polarity is inverted |
| Waypoint reached | `scoreDing` | Player collects a waypoint |
| Level complete | `victoryFanfare` | All players reach the exit |
| Level failed | `buzzer` | Team fails the level |
| Game over | `victoryFanfare` | Run ends, final scores shown |

#### 3.17.6 Spectator Rendering

Spectators see the same cooperative view as players — all pusher positions, ball trajectory, and polarity indicators are visible. The component renders the GameCanvas with all entities but disables the VirtualJoystick input.

> **Note:** State updates broadcast at 15Hz. Client-side rendering uses requestAnimationFrame to interpolate positions between server updates for smooth 60fps animation. Physics is server-authoritative — the client does NOT simulate physics.

---

## 4. Scroll Soul

### 4.1 Overview

| Field | Value |
|---|---|
| **ID** | `scroll-soul` |
| **Display Name** | Scroll Soul |
| **Category** | `action` |
| **Icon** | `scroll` (Lucide) |
| **Min Players** | 2 |
| **Max Players** | 16 |
| **Estimated Duration** | 90 seconds |
| **Supports Teams** | No |
| **Join-in-Progress** | `spectate_only` |
| **Tags** | `['action', 'survival', 'competitive', 'reflexes']` |

### 4.2 Game Concept

A vertical scrolling survival game themed as a chaotic webpage. Players control an avatar that must stay within "Safe Zones" as the viewport automatically scrolls. The page is littered with hazards: "Lava" borders at the top and bottom edges, ad pop-ups that must be dismissed, and moving obstacles. Fake ads block the screen and must be "closed" by clicking the X before they push the avatar into the lava. Last player surviving wins.

### 4.3 Detailed Mechanics

#### 4.3.1 Game Flow

The game is a continuous survival experience with no discrete rounds.

| Phase | Duration | Description |
|---|---|---|
| Countdown | 3s | "3... 2... 1... SCROLL!" |
| Survival Phase | Up to 90s | Survive as long as possible |
| Game Over | 5s | Show rankings and stats |

#### 4.3.2 The Scrolling Viewport

The game world is a tall vertical page (height: effectively infinite, procedurally generated). The viewport auto-scrolls **upward** at an increasing speed:

- **Starting scroll speed:** `SC_BASE_SCROLL_SPEED` (default: **1.5** pixels/tick).
- **Speed increase:** Every `SC_SPEED_INCREASE_INTERVAL` (default: **5000ms** = 5 seconds), speed increases by `SC_SPEED_INCREASE_AMOUNT` (default: **0.2** pixels/tick).
- **Max scroll speed:** `SC_MAX_SCROLL_SPEED` (default: **5.0** pixels/tick).

The viewport is `SC_VIEWPORT_WIDTH` × `SC_VIEWPORT_HEIGHT` (default: **400 × 600** logical pixels).

**Lava zones:** The top and bottom `SC_LAVA_HEIGHT` (default: **40px**) pixels of the viewport are "lava." If a player's avatar touches or enters the lava zone, they take damage and are eliminated after `SC_LAVA_ELIMINATION` (default: **500ms**) of continuous contact.

#### 4.3.3 Safe Zones

The procedurally generated page contains **Safe Zone platforms** — rectangular areas where the avatar can safely rest. These scroll with the page:

```typescript
interface SafeZone {
  id: string;
  x: number;
  y: number;                            // world-space y coordinate
  width: number;
  height: number;
  type: 'platform' | 'moving' | 'shrinking';
}
```

**Safe Zone types:**
| Type | Behavior |
|---|---|
| `platform` | Static — scrolls with the page. Standard safe area. |
| `moving` | Moves horizontally (oscillates between two x-bounds) while scrolling vertically. |
| `shrinking` | Gets narrower over time (width decreases by `SC_SHRINK_RATE` per second). Disappears when width < `SC_MIN_ZONE_WIDTH`. |

**Generation rules:**
- New safe zones are generated ahead of the scroll position, ensuring there's always at least one reachable zone in the viewport.
- Gap between zones: `SC_ZONE_GAP_MIN`–`SC_ZONE_GAP_MAX` (default: **80–200px** vertical gap).
- Zone width: `SC_ZONE_WIDTH_MIN`–`SC_ZONE_WIDTH_MAX` (default: **80–300px**).
- Zone height: fixed at `SC_ZONE_HEIGHT` (default: **30px**).
- As the game progresses, zones become narrower, gaps become larger, and `moving`/`shrinking` types become more frequent.

#### 4.3.4 Player Avatar Movement

Players control a small avatar (square, `SC_AVATAR_SIZE` × `SC_AVATAR_SIZE`, default: **20 × 20px**):

- **Horizontal movement:** Arrow keys / swipe left-right. Speed: `SC_AVATAR_SPEED_X` (default: **4** pixels/tick).
- **Vertical movement:** The avatar does NOT auto-scroll with the viewport. Instead, the avatar is affected by **gravity**: `SC_GRAVITY` (default: **0.3** pixels/tick² downward acceleration).
- **Jump:** Tap / press up / swipe up to jump. Jump gives an upward velocity of `SC_JUMP_VELOCITY` (default: **-7** pixels/tick, negative = upward). The player can only jump when standing on a Safe Zone platform.
- **Landing:** When the avatar lands on a Safe Zone (collision from above), the avatar rests on it and can jump again.
- **Falling through:** The avatar passes through Safe Zones from below or the sides — only top-surface collisions count as landing.

This creates a platformer experience: players must continuously jump upward to stay within the viewport as it scrolls, using Safe Zones as stepping stones. Fall too low = lava. Jump too high with no platform = lava at the top (or fall back down).

#### 4.3.5 Fake Ads (The Twist)

Periodically, "Fake Ads" appear overlaying the game viewport:

```typescript
interface FakeAd {
  id: string;
  type: 'banner' | 'popup' | 'video';
  x: number;                           // position on screen
  y: number;
  width: number;
  height: number;
  closeButtonPosition: { x: number; y: number; size: number };
  spawnedAt: number;
  expiresAt: number;                    // auto-disappears after this time
  effect: AdEffect;
}

type AdEffect = 
  | 'obscure'                            // blocks vision (player can't see behind the ad)
  | 'push'                               // physically pushes the avatar in a direction
  | 'slow'                               // reduces avatar movement speed while active
  | 'invert';                            // inverts movement controls while active
```

**Ad spawn frequency:**
- Starts at `SC_AD_INTERVAL_MIN` (default: **8000ms**) and decreases to `SC_AD_INTERVAL_MAX_FREQUENCY` (default: **3000ms**) over the game duration.
- Maximum of `SC_MAX_CONCURRENT_ADS` (default: **3**) on screen at once.

**Closing ads:**
- Each ad has a small "X" close button. The player must **tap/click the X** to dismiss it.
- The close button position varies per ad (different corners, sometimes tiny, sometimes offset).
- Some ads have a **fake X** that doesn't work — the real X is elsewhere. (Indicated by `SC_FAKE_X_CHANCE`, default: **0.2** = 20% of ads).
- Ads that aren't closed expire after `SC_AD_DURATION` (default: **5000ms**) but their effects persist for the full duration.

**Ad effects:**
| Effect | Impact |
|---|---|
| `obscure` | A large banner covers part of the viewport. Player can't see Safe Zones behind it. |
| `push` | The ad generates a physical force pushing the avatar toward the lava. Direction is random (but weighted toward the nearest lava zone). |
| `slow` | Avatar movement speed halved while this ad is active. |
| `invert` | Left = right, up = down while this ad is active. |

Closing an ad immediately removes its effect.

**Ad types (visual variety):**
| Type | Visual | Close Button |
|---|---|---|
| `banner` | Horizontal strip across viewport | Small X in corner |
| `popup` | Centered rectangular overlay with "CONGRATULATIONS!" text | X in top-right (sometimes fake) |
| `video` | "Skip ad in 3... 2... 1..." that auto-closes but blocks input until the skip button appears after 2s | Skip button that appears after delay |

#### 4.3.6 Server-Side vs Client-Side Physics

**Server-authoritative approach:**
- The server runs the physics simulation at `SC_SIMULATION_TICK` (default: **33ms**, ~30Hz).
- The server generates Safe Zones, spawns ads, and tracks avatar positions.
- The client sends input (movement direction, jump, ad close).
- The server broadcasts consolidated state updates at `SC_STATE_BROADCAST_RATE` (default: **15Hz**).
- The client does **client-side prediction** for smooth visuals but reconciles with server state.

This prevents cheating (e.g., teleporting, ignoring gravity, auto-closing ads).

#### 4.3.7 Elimination

A player is eliminated when:
1. Their avatar is in the lava zone (top or bottom) for `SC_LAVA_ELIMINATION` (default: **500ms** continuous contact). Brief touches don't kill immediately — the avatar flashes red as a warning.
2. Their avatar falls off-screen below the viewport.

On elimination:
- The player becomes a spectator.
- Their rank is recorded (last eliminated = best rank).
- A dramatic "GAME OVER" animation plays for that player.

**Last player standing wins.** If all remaining players die simultaneously, they share the same rank.

#### 4.3.8 Scoring

| Event | Points |
|---|---|
| Survival time | `SC_SURVIVAL_PER_SECOND` (default: **10** per second alive) |
| Closing an ad | `SC_AD_CLOSE` (default: **25**) |
| Closing an ad with a fake X (found the real X) | `SC_FAKE_AD_CLOSE_BONUS` (default: **50** bonus) |
| Reaching a new "height milestone" (every `SC_HEIGHT_MILESTONE_INTERVAL` pixels scrolled) | `SC_HEIGHT_MILESTONE` (default: **30**) |
| Last player standing bonus | `SC_WINNER_BONUS` (default: **200**) |
| Placement bonus | `SC_PLACEMENT` × (totalPlayers − rank + 1) (default: **15** × placement) |

### 4.4 Server-Side State Schema

```typescript
interface ScrollSoulState {
  phase: SCPhase;
  
  // World generation
  scrollOffset: number;                             // current world-y of viewport top (increases over time)
  scrollSpeed: number;                              // current pixels/tick
  safeZones: SafeZone[];                            // all generated zones (pruned as they scroll off-screen)
  generatedUpTo: number;                            // world-y up to which zones have been generated
  
  // Players
  playerStates: Map<string, SCPlayerState>;
  eliminatedPlayers: string[];                      // userIds in elimination order (first eliminated first)
  
  // Ads
  activeAds: FakeAd[];
  adSpawnTimer: number;                             // ms until next ad spawns
  
  // Timer
  gameStartedAt: number;
  gameDuration: number;
}

type SCPhase = 'COUNTDOWN' | 'SURVIVAL' | 'GAME_OVER';

interface SCPlayerState {
  userId: string;
  position: { x: number; y: number };               // world-space coordinates
  velocity: { vx: number; vy: number };
  isOnPlatform: boolean;
  currentPlatformId: string | null;
  isInLava: boolean;
  lavaContactStartedAt: number | null;
  isEliminated: boolean;
  eliminatedAt: number | null;
  rank: number | null;
  
  // Active ad effects
  activeEffects: Set<AdEffect>;
  
  // Input state (latest from client)
  moveDirection: number;                             // -1 (left), 0 (none), 1 (right)
  jumpRequested: boolean;
  
  // Stats
  survivalTimeMs: number;
  adsClosed: number;
  heightReached: number;
  totalScore: number;
}
```

### 4.5 WebSocket Event Map

#### Client → Server

| Action | Payload | Description |
|---|---|---|
| `SC_INPUT` | `{ moveX: number, jump: boolean }` | Movement input (-1/0/1 for direction, jump flag) |
| `SC_CLOSE_AD` | `{ adId: string, clickX: number, clickY: number }` | Attempt to close an ad at the click position |

**Zod schemas:**

```typescript
const SCInputSchema = z.object({
  moveX: z.number().int().min(-1).max(1),
  jump: z.boolean(),
});

const SCCloseAdSchema = z.object({
  adId: z.string(),
  clickX: z.number(),
  clickY: z.number(),
});
```

#### Server → Client (Game Actions)

| Action Type | Payload | Sent To | Description |
|---|---|---|---|
| `SC_COUNTDOWN` | `{ seconds: number }` | All (lobby) | Countdown before start |
| `SC_GAME_START` | `{ viewportWidth: number, viewportHeight: number, initialZones: SafeZone[] }` | All (lobby) | Game has started |
| `SC_STATE_UPDATE` | `{ scrollOffset: number, scrollSpeed: number, players: SCPlayerSnapshot[], newZones: SafeZone[], removedZoneIds: string[] }` | All (lobby) | State snapshot (15Hz) |
| `SC_AD_SPAWN` | `{ ad: FakeAd }` | All (lobby) | New ad appeared |
| `SC_AD_CLOSED` | `{ adId: string, userId: string, userName: string }` | All (lobby) | An ad was closed |
| `SC_AD_EXPIRED` | `{ adId: string }` | All (lobby) | An ad expired (auto-removed) |
| `SC_AD_CLOSE_FAILED` | `{ adId: string, reason: 'FAKE_X' \| 'MISS' }` | Clicking player only | Failed to close ad (hit fake X or missed) |
| `SC_LAVA_WARNING` | `{ userId: string }` | Affected player only | You're touching lava! |
| `SC_PLAYER_ELIMINATED` | `{ userId: string, userName: string, survivalTimeMs: number, rank: number }` | All (lobby) | Player eliminated |
| `SC_HEIGHT_MILESTONE` | `{ userId: string, userName: string, height: number }` | All (lobby) | Height milestone reached |
| `SC_GAME_OVER` | `{ finalRankings: SCFinalRanking[] }` | All (lobby) | Game over |
| `TIMER_START` | `{ totalDuration: number, timeRemaining: number }` | All (lobby) | Emitted at the start of the SURVIVAL phase via `broadcastAction` |
| `TIMER_TICK` | `{ timeRemaining: number }` | All (lobby) | Standard timer (every 1s during survival) via `broadcastAction` |

**Supporting types:**

```typescript
interface SCPlayerSnapshot {
  userId: string;
  x: number;
  y: number;
  isOnPlatform: boolean;
  isInLava: boolean;
  isEliminated: boolean;
  activeEffects: AdEffect[];
}

interface SCFinalRanking {
  userId: string;
  userName: string;
  rank: number;
  totalScore: number;
  survivalTimeMs: number;
  adsClosed: number;
  heightReached: number;
}
```

### 4.6 Information Masking

This game has minimal masking — all players see the same scrolling page with all Safe Zones, ads, and avatars visible.

| Data | Player View | Spectator View |
|---|---|---|
| Scrolling viewport | Visible | Visible |
| All player positions | Visible | Visible |
| Safe Zones | Visible | Visible |
| Ads | Visible (affect all players individually — each ad affects everyone) | Visible |
| Own active effects | Visible (UI indicator) | N/A |
| Other players' active effects | Visible (visual indicators on their avatars) | Visible |
| Scores | Own score visible; others' scores **HIDDEN** until game over | All scores visible |
| Elimination order | Visible | Visible |

**`getStateForPlayer(userId)` during SURVIVAL:**

```typescript
interface SCPlayerSurvivalState {
  phase: 'SURVIVAL';
  scrollOffset: number;
  scrollSpeed: number;
  myPosition: { x: number; y: number };
  myVelocity: { vx: number; vy: number };
  myIsOnPlatform: boolean;
  myActiveEffects: AdEffect[];
  myScore: number;
  
  otherPlayers: Array<{ userId: string; userName: string; x: number; y: number; isEliminated: boolean; activeEffects: AdEffect[] }>;
  
  safeZones: SafeZone[];                             // only zones within viewport ± buffer
  activeAds: FakeAd[];
  eliminatedPlayers: Array<{ userId: string; userName: string; rank: number }>;
  
  timeElapsed: number;
}
```

**Note:** Safe Zones are only sent for the area within and slightly ahead/behind the viewport (a buffer zone of `SC_ZONE_BUFFER_PX`, default: **200px**). This prevents clients from seeing the entire level layout ahead of time (mild anti-cheat).

### 4.7 Join-in-Progress Logic

**Policy:** `spectate_only`

The game is a survival gauntlet. A player joining mid-game would spawn in an increasingly hostile environment without benefit of the ramp-up period. They spectate.

### 4.8 Reconnection Behavior

On reconnect:
1. If still alive: Player receives their current position, velocity, active ads, and active effects. Their avatar maintains its last position (which may have dropped toward lava due to gravity during disconnection).
2. If eliminated during disconnection (gravity pulled them into lava): They reconnect as a spectator with their elimination rank.
3. The natural penalty for disconnection (gravity continues without input) is sufficient — no artificial punishment needed.

### 4.9 Awards

| Award | Condition | Icon |
|---|---|---|
| Scroll Master | Last player standing (winner) | `crown` |
| Ad Blocker | Closed the most ads | `shield` |
| Daredevil | Spent the most time near lava without dying | `flame` |
| Mountaineer | Reached the highest height milestone | `mountain` |
| Untouchable | Never got hit by an ad effect (closed all ads immediately or was never targeted) | `sparkles` |

### 4.10 NPM Package Suggestions

No additional packages. The game is a server-side physics simulation (gravity, collision detection with platforms, rectangular overlap for lava/ads) with a client-side renderer.

**Optional consideration:**

| Package | Purpose | Notes |
|---|---|---|
| `seedrandom` | Deterministic procedural generation of Safe Zones | Ensures the server and any potential client-side prediction generate the same zone layout from a seed. Lightweight (~2KB). |

### 4.11 Client Component Structure

```
components/rmhbox/minigames/scroll-soul/
  ScrollSoulGame.tsx             # Main game component, phase router
  ScrollCanvas.tsx               # HTML5 Canvas renderer (the scrolling page)
  SafeZonePlatform.tsx           # Platform with web-page themed styling
  PlayerAvatar.tsx               # Player square with color + effects
  FakeAdOverlay.tsx              # Ad popup (obscure/push/slow/invert)
  AdCloseButton.tsx              # The X button (real and fake variants)
  LavaZone.tsx                   # Red gradient danger zone at top/bottom
  EliminationAnimation.tsx       # "GAME OVER" dramatic death animation
  ScrollSoulResults.tsx          # Final rankings with stats
```

**Mobile UI layout (SURVIVAL phase):**

```
┌──────────────────────────────┐
│ 🔥🔥🔥 LAVA ZONE 🔥🔥🔥    │  ← Top lava (40px)
├──────────────────────────────┤
│                              │
│        ┌────────────┐        │
│        │ Safe Zone  │        │  ← Platform
│        └────────────┘        │
│                              │
│    🟢                        │  ← Other player (jumping)
│                              │
│  ┌──────────────────────┐    │
│  │ Safe Zone (big)      │    │  ← Wide platform
│  └──────────┬───────────┘    │
│    🔴       │        ┌────┐  │  ← 🔴 = You (on platform)
│             │  ┌──[X]│    │  │  ← Fake ad popup!
│  ┌────┐     │  │FREE │    │  │
│  │plat│     │  │iPHON│    │  │
│  └────┘     │  └─────┘    │  │
│             │              │  │
├──────────────────────────────┤
│ 🔥🔥🔥 LAVA ZONE 🔥🔥🔥    │  ← Bottom lava (40px)
├──────────────────────────────┤
│ ⏱ 42s  │  Score: 580  │↑ 12│  ← Timer, score, height
└──────────────────────────────┘
```

### 4.12 Constants

```typescript
export const SC_VIEWPORT_WIDTH = 400;
export const SC_VIEWPORT_HEIGHT = 600;
export const SC_LAVA_HEIGHT = 40;
export const SC_AVATAR_SIZE = 20;

export const SC_COUNTDOWN = 3;
export const SC_MAX_SURVIVAL = 90;
export const SC_GAME_OVER = 5;

export const SC_BASE_SCROLL_SPEED = 1.5;            // pixels/tick
export const SC_SPEED_INCREASE_INTERVAL = 5000;
export const SC_SPEED_INCREASE_AMOUNT = 0.2;
export const SC_MAX_SCROLL_SPEED = 5.0;

export const SC_GRAVITY = 0.3;                      // pixels/tick² (downward)
export const SC_JUMP_VELOCITY = -7;                  // pixels/tick (upward)
export const SC_AVATAR_SPEED_X = 4;                  // pixels/tick
export const SC_LAVA_ELIMINATION = 500;

export const SC_ZONE_GAP_MIN = 80;
export const SC_ZONE_GAP_MAX = 200;
export const SC_ZONE_WIDTH_MIN = 80;
export const SC_ZONE_WIDTH_MAX = 300;
export const SC_ZONE_HEIGHT = 30;
export const SC_MIN_ZONE_WIDTH = 20;                 // shrinking zones disappear below this
export const SC_SHRINK_RATE = 10;                    // pixels/second width reduction
export const SC_ZONE_BUFFER_PX = 200;                // send zones this many px outside viewport

export const SC_AD_INTERVAL_MIN = 8000;
export const SC_AD_INTERVAL_MAX_FREQUENCY = 3000;
export const SC_MAX_CONCURRENT_ADS = 3;
export const SC_AD_DURATION = 5000;
export const SC_FAKE_X_CHANCE = 0.2;                 // 20% of ads have a fake X

export const SC_SIMULATION_TICK = 33;
export const SC_STATE_BROADCAST_RATE = 15;           // Hz

export const SC_SURVIVAL_PER_SECOND = 10;
export const SC_AD_CLOSE = 25;
export const SC_FAKE_AD_CLOSE_BONUS = 50;
export const SC_HEIGHT_MILESTONE_INTERVAL = 500;     // every 500px scrolled
export const SC_HEIGHT_MILESTONE = 30;
export const SC_WINNER_BONUS = 200;
export const SC_PLACEMENT = 15;
```

### 4.13 Game Settings Schema (§12A)

Host-configurable settings for Scroll Soul. Defined in `MinigameDefinition.settingsSchema`.
Handlers read values via `this.getSetting(key, CONSTANT_DEFAULT)`.

| Key | Type | Label | Description | Default | Constraints |
|---|---|---|---|---|---|
| `maxSurvival` | `integer` | Max Survival Time (seconds) | Maximum round length before the game ends | `120` | min: 60, max: 240, step: 15 |
| `baseScrollSpeed` | `float` | Base Scroll Speed | Starting scroll speed multiplier | `1.0` | min: 0.5, max: 2.0, step: 0.1 |
| `maxScrollSpeed` | `float` | Max Scroll Speed | Maximum scroll speed reached at end of round | `3.0` | min: 1.5, max: 5.0, step: 0.5 |
| `maxConcurrentAds` | `integer` | Max Concurrent Pop-ups | Maximum number of fake ads/pop-ups on screen at once | `3` | min: 1, max: 5, step: 1 |
| `fakeXChance` | `float` | Fake X Chance (%) | Probability that a pop-up close button is a fake X | `0.3` | min: 0.0, max: 0.8, step: 0.1 |
| `enableAds` | `boolean` | Pop-up Ads | Enable the fake ad/pop-up obstacle mechanic | `true` | — |

**Constant Mapping:**

| Setting Key | Constant Override | Usage |
|---|---|---|
| `maxSurvival` | `SC_MAX_SURVIVAL` | `this.getSetting('maxSurvival', SC_MAX_SURVIVAL)` |
| `baseScrollSpeed` | `SC_BASE_SCROLL_SPEED` | `this.getSetting('baseScrollSpeed', SC_BASE_SCROLL_SPEED)` |
| `maxScrollSpeed` | `SC_MAX_SCROLL_SPEED` | `this.getSetting('maxScrollSpeed', SC_MAX_SCROLL_SPEED)` |
| `maxConcurrentAds` | `SC_MAX_CONCURRENT_ADS` | `this.getSetting('maxConcurrentAds', SC_MAX_CONCURRENT_ADS)` |
| `fakeXChance` | `SC_FAKE_X_CHANCE` | `this.getSetting('fakeXChance', SC_FAKE_X_CHANCE)` |
| `enableAds` | `SC_ENABLE_ADS` | If `false`, no pop-up obstacles appear |

### 4.14 Anti-Cheat Notes

- **Server-authoritative physics:** All position updates, gravity, and platform collisions are computed server-side. The client only sends input direction and jump requests.
- **Ad close validation:** The server checks if the click position (`clickX`, `clickY`) is within the actual close button bounds (not the fake X). This prevents bots from auto-closing ads.
- **Input rate limiting:** Max input rate of 15Hz per player. Excessive input is throttled.
- **Zone visibility:** Only zones within the viewport + buffer are sent to clients, preventing pre-planning or automated navigation.
- **Gravity cannot be disabled client-side:** Since the server applies gravity, a hacked client that ignores gravity would desynchronize and be corrected by server state updates.

### 4.15 Game History

**Game History Level:** Minimal Log

Scroll Soul is a real-time survival game where moment-to-moment movement doesn't translate well to a replay log. What matters is the elimination story — who died, when, how, and who outlasted everyone. Capturing elimination milestones and key hazard interactions keeps the log compact and narratively complete.

**`initialState`**

```typescript
interface SCGameHistoryInit {
  playerCount: number;
  initialScrollSpeed: number;
  adFrequencyBase: number;                           // starting ad interval in ms
  obstacleLayoutSeed: number;                        // seed for procedural generation
}
```

**Actions Logged**

| Action Type | Payload | Recorded When |
|---|---|---|
| `ad_spawned` | `{ targetUserId, adType, elapsed }` | Ad popup appears on a player's screen |
| `ad_dismissed` | `{ userId, elapsed, dismissTime, usedFakeX: boolean }` | Player closes an ad |
| `player_eliminated` | `{ userId, survivalTime, cause: 'lava' \| 'ad' \| 'obstacle', scrollSpeedAtDeath, placement }` | Player is eliminated |
| `speed_milestone` | `{ newSpeed, elapsed, playersRemaining }` | Scroll speed crosses a threshold |
| `game_complete` | `{ winnerId, finalSurvivalTime, eliminationOrder: Array<{ userId, survivalTime, cause }>, adStats: Array<{ userId, adsEncountered, adsDismissed }> }` | Last player standing or time expires |

**Replay Value:** The elimination timeline tells the full story — rising scroll speed, cascading deaths, and the final survivor. Ad stats add a comedic layer, showing who struggled with the fake close buttons.

> **Note:** The `GameLog` also includes `gameSettings: GameSettingValues` at the top level (per core.md §12A.11), capturing the exact game settings used for this match.

### 4.16 History Display Configuration

**Detail Component:** `ScrollSoulHistoryDetail`

Renders the expanded game log as a platformer run summary:
- Distance traveled visualization
- Platform collection highlights
- Voting decision timeline (left/right/straight)
- Difficulty scaling graph
- Near-miss and combo streak indicators

**Searchable Fields:**

| Field Key | Label | Extraction |
|---|---|---|
| `playerNames` | Player Names | All player names from the game log |

**Filterable Fields:**

| Field Key | Label | Type | Details |
|---|---|---|---|
| `distanceTraveled` | Distance Traveled | range | Total pixels scrolled |
| `combos` | Combo Streaks | range | Longest combo streak |
| `platformsCollected` | Platforms Collected | range | Number of bonus platforms collected |

**Summary Extractor:**

```typescript
getSummary: (log) => {
  const endAction = log.actions.find(a => a.type === 'game_end');
  const distance = endAction?.payload.distanceTraveled ?? 0;
  return `Distance: ${distance}px — Platformer survival`;
}
```

**Component Structure:**

```
ScrollSoulHistoryDetail.tsx
├── DistanceBar (total distance visualization)
├── VotingTimeline (jump direction decisions)
├── DifficultyGraph (difficulty over time)
├── ComboHighlights (streak moments)
└── Final scores summary
```

### 4.17 MinigameRenderer & Client-Server Wiring

#### 4.17.1 MinigameRenderer Registration

```tsx
// In MinigameRenderer component map
const minigameComponents = {
  'scroll-soul': lazy(() => import('./minigames/scroll-soul/ScrollSoulGame')),
  // ...other minigames
};
```

#### 4.17.2 Client-Side Store Integration

```tsx
useEffect(() => {
  const handlers: Record<string, (payload: any) => void> = {
    SC_COUNTDOWN: (p) => setCountdown(p.count),
    SC_GAME_START: () => setPhase('playing'),
    SC_STATE_UPDATE: (p) => applyServerState(p),
    SC_AD_SPAWN: (p) => addAd(p),
    SC_AD_CLOSED: (p) => removeAd(p.adId),
    SC_AD_EXPIRED: (p) => expireAd(p.adId),
    SC_AD_CLOSE_FAILED: (p) => shakeAd(p.adId),
    SC_LAVA_WARNING: (p) => setLavaWarning(p),
    SC_PLAYER_ELIMINATED: (p) => eliminatePlayer(p),
    SC_HEIGHT_MILESTONE: (p) => showMilestone(p),
    SC_GAME_OVER: (p) => setResults(p),
    TIMER_TICK: (p) => setTimeRemaining(p.remaining),
  };

  Object.entries(handlers).forEach(([action, handler]) =>
    socket.on(action, handler)
  );
  return () => {
    Object.keys(handlers).forEach((action) => socket.off(action));
  };
}, [socket]);
```

#### 4.17.3 Client-Side Input Dispatch

```tsx
// Movement input (sent continuously on input change)
socket.emit('SC_INPUT', { moveX, jump }); // moveX: -1|0|1, jump: boolean

// Close an ad popup
socket.emit('SC_CLOSE_AD', { adId, clickX, clickY });
```

#### 4.17.4 Server-Side Handler Registration

```typescript
// In server/rmhbox/minigames/scroll-soul
import { ScrollSoulGame } from './minigames/scroll-soul/ScrollSoulGame';

MINIGAME_SERVER_REGISTRY.set('scroll-soul', ScrollSoulGame);
```

#### 4.17.5 Sound Effect Integration

| Event | Sound | Notes |
|---|---|---|
| Countdown | `countdownBeep` | Pre-game countdown ticks |
| Game start | `goFanfare` | Scrolling begins |
| Ad spawn | `chime` | Ad popup appears on player's screen |
| Ad closed | `click` | Player successfully dismisses ad |
| Ad close failed (fake X) | `buzzer` | Player clicked a decoy close button |
| Lava warning | `buzzer` | Lava is approaching the player |
| Player eliminated | `buzzer` | Player falls into lava or is eliminated |
| Height milestone | `scoreDing` | Player reaches a new height threshold |
| Game over | `victoryFanfare` | Last player standing or time expires |

#### 4.17.6 Spectator Rendering

Spectators see all players' positions on a shared scrolling viewport with all ads visible (including which player each ad targets). The component renders the full ScrollCanvas with all player avatars but disables movement input.

> **Note:** Scroll Soul uses a hybrid rendering approach — the server sends state updates at 15Hz, but the client renders at 60fps using client-side prediction for the local player's movement (gravity, jump). Server corrections are smoothly interpolated to prevent visual jitter. Fake ad close-button validation is server-side to prevent bot auto-closing.

---

*End of Minigame Specifications Part 4*
